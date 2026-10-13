import { useSyncExternalStore } from "react";
import { borrarNotas, enviarNota, listarNotas, type NotaSnoopy } from "./cloud";
import { getDeviceId } from "./dispositivo";

// Notas de Snoopy en el navegador: una sola lista compartida por toda la app
// (el menú muestra un puntito y la página de la mascota muestra el sobre), con
// una sola consulta cada 20 s y solo mientras la app está a la vista.
//
// Son temporales: al abrir una nota queda anotada como "leída" en este celular,
// y al cerrarla se borra de la nube. Si se corta el internet o se cierra la app
// con la nota abierta, el borrado se reintenta en la próxima revisión.

const POLL_MS = 20_000;
const LEIDAS_KEY = "liz-notas-leidas";
const VACIO: NotaSnoopy[] = [];

let notas: NotaSnoopy[] = VACIO;
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

function publicar(next: NotaSnoopy[]) {
  const igual = next.length === notas.length && next.every((n, i) => n.id === notas[i]?.id);
  if (igual) return;
  notas = next.length === 0 ? VACIO : next;
  for (const fn of listeners) fn();
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
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

const alVolver = () => {
  if (!document.hidden) void refrescarNotas();
};
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
    navigator.serviceWorker?.addEventListener("message", alMensajeSW);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      if (intervalo !== null) window.clearInterval(intervalo);
      intervalo = null;
      document.removeEventListener("visibilitychange", alVolver);
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

export async function mandarNota(texto: string, emoji?: string) {
  return enviarNota({ data: { de: getDeviceId(), texto, emoji } });
}
