import { useSyncExternalStore } from "react";
import { borrarNotas, enviarNota, listarNotas, type NotaEnviada, type NotaSnoopy } from "./cloud";
import { getDeviceId } from "./dispositivo";

// Notas de Snoopy en el navegador: una sola lista compartida por toda la app
// (el menú muestra un puntito y la página de la mascota muestra el sobre), con
// una sola consulta cada 20 s y solo mientras la app está a la vista.
//
// Son temporales: al abrir una nota queda anotada como "leída" en este celular,
// y al cerrarla se borra de la nube. Si se corta el internet o se cierra la app
// con la nota abierta, el borrado se reintenta en la próxima revisión.

const POLL_MS = 15_000;
const LEIDAS_KEY = "liz-notas-leidas";
// Notas escritas que todavía no llegaron al servidor (sin conexión o lento):
// se guardan aquí y se reenvían solas, sin duplicarse.
const COLA_KEY = "liz-notas-por-enviar";
const LIMITE_ENVIO_MS = 12_000;
const REINTENTO_MS = 8_000;
const VACIO: NotaSnoopy[] = [];
const SIN_ENVIADAS: NotaEnviada[] = [];

let notas: NotaSnoopy[] = VACIO;
// Notas que mandó este celular: enviada → entregada → leída.
let enviadas: NotaEnviada[] = SIN_ENVIADAS;
let enviadasServidor: NotaEnviada[] = SIN_ENVIADAS;

interface PorEnviar {
  id: string;
  texto: string;
  emoji?: string;
  createdAt: number;
  fallos: number;
}
let cola: PorEnviar[] = leerCola();
const listeners = new Set<() => void>();
let intervalo: number | null = null;
let enCurso: Promise<void> | null = null;

function leerLeidas(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LEIDAS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarLeidas(ids: string[]) {
  try {
    if (ids.length === 0) localStorage.removeItem(LEIDAS_KEY);
    else localStorage.setItem(LEIDAS_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* almacenamiento bloqueado */
  }
}

function leerCola(): PorEnviar[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLA_KEY) || "[]");
    return Array.isArray(v) ? (v as PorEnviar[]) : [];
  } catch {
    return [];
  }
}

function guardarCola() {
  try {
    if (cola.length === 0) localStorage.removeItem(COLA_KEY);
    else localStorage.setItem(COLA_KEY, JSON.stringify(cola));
  } catch {
    /* almacenamiento bloqueado */
  }
}

/** Número de notas sin leer en el ícono de la app (Android y iPhone instalados). */
function actualizarInsignia(n: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (n > 0) nav.setAppBadge?.(n).catch(() => {});
  else {
    nav.clearAppBadge?.().catch(() => {});
    // Ya no hay notas por leer: se quita también el aviso del celular.
    navigator.serviceWorker?.ready
      .then((r) => r.getNotifications({ tag: "notas" }))
      .then((ns) => ns.forEach((x) => x.close()))
      .catch(() => {});
  }
}

function publicar(next: NotaSnoopy[]) {
  const igual = next.length === notas.length && next.every((n, i) => n.id === notas[i]?.id);
  if (igual) return;
  notas = next.length === 0 ? VACIO : next;
  actualizarInsignia(notas.length);
  for (const fn of listeners) fn();
}

const firma = (xs: NotaEnviada[]) =>
  xs
    .map((n) => `${n.id}:${n.pendiente ?? ""}:${n.entregadaAt ? 1 : 0}:${n.leidaAt ? 1 : 0}`)
    .join("|");

/** Lo que ve quien envía: primero las que van en camino, luego las del servidor. */
function recalcularEnviadas() {
  const enCamino: NotaEnviada[] = cola.map((c) => ({
    id: c.id,
    emoji: c.emoji,
    createdAt: c.createdAt,
    pendiente: c.fallos > 0 ? "error" : "enviando",
  }));
  const ids = new Set(enCamino.map((n) => n.id));
  const next = [...enCamino.reverse(), ...enviadasServidor.filter((n) => !ids.has(n.id))].slice(
    0,
    5,
  );
  if (firma(next) === firma(enviadas)) return;
  enviadas = next.length === 0 ? SIN_ENVIADAS : next;
  for (const fn of listeners) fn();
}

function publicarEnviadas(next: NotaEnviada[]) {
  enviadasServidor = next;
  recalcularEnviadas();
}

/* ---------------- Envío (instantáneo para quien escribe) ---------------- */

type Resultado = { ok: boolean; avisos: number };
const resultados = new Map<string, Resultado>();
let corrida: Promise<void> = Promise.resolve();
let reintento: number | null = null;

function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tardó demasiado")), ms)),
  ]);
}

async function enviarCola() {
  let fallo = false;
  for (const item of [...cola]) {
    const r = await conLimite(
      enviarNota({
        data: { id: item.id, de: getDeviceId(), texto: item.texto, emoji: item.emoji },
      }),
      LIMITE_ENVIO_MS,
    ).catch(() => null);
    if (r?.ok) {
      cola = cola.filter((c) => c.id !== item.id);
      resultados.set(item.id, { ok: true, avisos: r.avisos });
    } else {
      item.fallos += 1;
      resultados.set(item.id, { ok: false, avisos: 0 });
      fallo = true;
    }
    guardarCola();
    recalcularEnviadas();
    if (fallo) break; // sin conexión: se reintenta todo luego, en orden
  }
  if (fallo && reintento === null) {
    reintento = window.setTimeout(() => {
      reintento = null;
      void procesarCola();
    }, REINTENTO_MS);
  }
  if (!fallo) void refrescarNotas();
}

function procesarCola(): Promise<void> {
  if (cola.length === 0) return corrida;
  corrida = corrida.then(enviarCola, enviarCola);
  return corrida;
}

async function borrarPendientes() {
  const pendientes = leerLeidas();
  if (pendientes.length === 0) return;
  const r = await borrarNotas({ data: pendientes }).catch(() => ({ ok: false }));
  if (r.ok) guardarLeidas(leerLeidas().filter((id) => !pendientes.includes(id)));
}

/** Consulta la nube ya mismo (también la usa el aviso que llega con la app abierta). */
export function refrescarNotas(): Promise<void> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    await borrarPendientes();
    const r = await listarNotas({ data: getDeviceId() }).catch(() => null);
    if (!r?.ok) return;
    const ocultas = new Set(leerLeidas());
    publicar(r.notas.filter((n) => !ocultas.has(n.id)));
    publicarEnviadas(r.enviadas);
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

const alVolver = () => {
  if (document.hidden) return;
  void refrescarNotas();
  void procesarCola();
};
const alConectarse = () => void procesarCola();
const alMensajeSW = (e: MessageEvent) => {
  if ((e.data as { tipo?: string } | null)?.tipo === "nota") void refrescarNotas();
};

function suscribir(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    void refrescarNotas();
    intervalo = window.setInterval(() => {
      if (!document.hidden) void refrescarNotas();
    }, POLL_MS);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectarse);
    navigator.serviceWorker?.addEventListener("message", alMensajeSW);
    // Notas que quedaron sin enviar la última vez.
    recalcularEnviadas();
    void procesarCola();
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      if (intervalo !== null) window.clearInterval(intervalo);
      intervalo = null;
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectarse);
      navigator.serviceWorker?.removeEventListener("message", alMensajeSW);
    }
  };
}

/** Notas que el otro celular le mandó a este y que aún no se leyeron. */
export function useNotasRecibidas(): NotaSnoopy[] {
  return useSyncExternalStore(
    suscribir,
    () => notas,
    () => VACIO,
  );
}

/** Estado de las notas que mandó este celular (la más nueva primero). */
export function useNotasEnviadas(): NotaEnviada[] {
  return useSyncExternalStore(
    suscribir,
    () => enviadas,
    () => SIN_ENVIADAS,
  );
}

/** Al abrirla: queda marcada en este celular (si se cierra la app, igual se borra). */
export function abrirNota(id: string) {
  const leidas = leerLeidas();
  if (!leidas.includes(id)) guardarLeidas([...leidas, id]);
}

/** Al cerrarla: desaparece al instante y se borra de la nube. */
export async function cerrarNota(id: string): Promise<void> {
  abrirNota(id);
  publicar(notas.filter((n) => n.id !== id));
  await borrarPendientes();
}

/**
 * Deja la nota en camino al instante (quien escribe no espera) y la envía en
 * segundo plano. La promesa avisa cómo terminó el primer intento; si falló,
 * se sigue reintentando sola.
 */
export async function mandarNota(texto: string, emoji?: string): Promise<Resultado> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  cola = [...cola, { id, texto, emoji, createdAt: Date.now(), fallos: 0 }];
  guardarCola();
  recalcularEnviadas();
  await procesarCola();
  return resultados.get(id) ?? { ok: false, avisos: 0 };
}
