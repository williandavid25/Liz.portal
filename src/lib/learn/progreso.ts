import { useSyncExternalStore } from "react";
import type { EstadoLearn, Premio, ProgresoTrack, Track } from "./tipos";

// Reglas de racha, corazones y premios (según streak_system.json). Son
// funciones puras sobre el estado: la tienda de abajo solo las guarda y avisa.
// Cada materia lleva su propia racha y sus propios corazones (no se mezclan);
// las gemas y las insignias son de la persona.

export const TRACKS: Track[] = ["english", "laboratory"];
export const CORAZONES_MAX = 5;
export const RECARGA_MS = 30 * 60_000;
export const COSTO_ESCUDO = 10;
export const MAX_ESCUDOS = 2;
export const COSTO_REPARAR = 30;
export const METAS = [7, 14, 30, 50, 100] as const;
export const PREMIOS_META: Record<number, { gemas: number; insignia: string }> = {
  7: { gemas: 15, insignia: "One Week Warrior" },
  14: { gemas: 20, insignia: "Two Weeks Strong" },
  30: { gemas: 40, insignia: "Monthly Master" },
  50: { gemas: 80, insignia: "Fifty Days of Fire" },
  100: { gemas: 150, insignia: "Century Snoopy Champion" },
};
const XP_PERFECTO = 5;
const XP_REPASO = 5;

/* ---------------- Fechas locales ---------------- */

/** Fecha local del celular (la racha se reinicia a medianoche local). */
export function fechaLocal(ts = Date.now()): string {
  const d = new Date(ts);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Días de calendario entre dos fechas YYYY-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  const ms = (f: string) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

function sumarDias(f: string, n: number): string {
  const [y, m, d] = f.split("-").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, d! + n));
  return x.toISOString().slice(0, 10);
}

/* ---------------- Estado ---------------- */

export function trackInicial(ahora = Date.now()): ProgresoTrack {
  return {
    dia: 1,
    completados: [],
    testsAprobados: [],
    testsIntentados: [],
    racha: 0,
    mejorRacha: 0,
    ultimoDia: null,
    corazones: CORAZONES_MAX,
    corazonesDesde: ahora,
    escudos: 0,
    xp: 0,
    metas: [],
  };
}

export function estadoInicial(ahora = Date.now()): EstadoLearn {
  return {
    version: 1,
    gemas: 0,
    insignias: [],
    tracks: { english: trackInicial(ahora), laboratory: trackInicial(ahora) },
  };
}

/** Completa campos faltantes (versiones viejas o datos dañados). */
export function normalizar(raw: unknown, ahora = Date.now()): EstadoLearn {
  const base = estadoInicial(ahora);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<EstadoLearn>;
  const tracks = { ...base.tracks };
  for (const t of TRACKS) {
    const v = r.tracks?.[t];
    if (v && typeof v === "object") tracks[t] = { ...trackInicial(ahora), ...v };
  }
  return {
    version: 1,
    gemas: typeof r.gemas === "number" ? r.gemas : 0,
    insignias: Array.isArray(r.insignias) ? r.insignias : [],
    tracks,
  };
}

/* ---------------- Corazones ---------------- */

export function corazonesActuales(
  t: ProgresoTrack,
  ahora = Date.now(),
): { corazones: number; proximoEnMs: number | null } {
  if (t.corazones >= CORAZONES_MAX) return { corazones: CORAZONES_MAX, proximoEnMs: null };
  const transcurrido = Math.max(0, ahora - t.corazonesDesde);
  const ganados = Math.floor(transcurrido / RECARGA_MS);
  const corazones = Math.min(CORAZONES_MAX, t.corazones + ganados);
  if (corazones >= CORAZONES_MAX) return { corazones, proximoEnMs: null };
  return { corazones, proximoEnMs: RECARGA_MS - (transcurrido % RECARGA_MS) };
}

/** Deja guardadas las recargas que ya ocurrieron. */
export function aplicarRecarga(t: ProgresoTrack, ahora = Date.now()): ProgresoTrack {
  if (t.corazones >= CORAZONES_MAX) return { ...t, corazonesDesde: ahora };
  const ganados = Math.floor(Math.max(0, ahora - t.corazonesDesde) / RECARGA_MS);
  if (ganados === 0) return t;
  const corazones = Math.min(CORAZONES_MAX, t.corazones + ganados);
  return {
    ...t,
    corazones,
    corazonesDesde: corazones >= CORAZONES_MAX ? ahora : t.corazonesDesde + ganados * RECARGA_MS,
  };
}

export function perderCorazon(t: ProgresoTrack, ahora = Date.now()): ProgresoTrack {
  const r = aplicarRecarga(t, ahora);
  if (r.corazones <= 0) return r;
  return {
    ...r,
    corazones: r.corazones - 1,
    // Si estaba lleno, la recarga empieza a contar desde ahora.
    corazonesDesde: r.corazones >= CORAZONES_MAX ? ahora : r.corazonesDesde,
  };
}

function ganarCorazon(t: ProgresoTrack, ahora: number): ProgresoTrack {
  const r = aplicarRecarga(t, ahora);
  if (r.corazones >= CORAZONES_MAX) return r;
  const corazones = r.corazones + 1;
  return { ...r, corazones, corazonesDesde: corazones >= CORAZONES_MAX ? ahora : r.corazonesDesde };
}

/* ---------------- Racha ---------------- */

export interface InfoRacha {
  /** La racha que se muestra (0 si se rompió). */
  racha: number;
  hechaHoy: boolean;
  /** Aún no hizo la tarea de hoy y tiene racha que perder. */
  enRiesgo: boolean;
  /** Ayer no hubo lección pero un escudo la protege. */
  protegida: boolean;
  rota: boolean;
  /** Se rompió ayer: se puede reparar hoy con gemas (ventana de 24 h). */
  reparable: boolean;
}

export function infoRacha(t: ProgresoTrack, hoy = fechaLocal()): InfoRacha {
  const nada = {
    hechaHoy: false,
    enRiesgo: false,
    protegida: false,
    rota: false,
    reparable: false,
  };
  if (!t.ultimoDia || t.racha === 0) return { racha: 0, ...nada };
  const gap = diasEntre(t.ultimoDia, hoy);
  if (gap <= 0) return { racha: t.racha, ...nada, hechaHoy: true };
  if (gap === 1) return { racha: t.racha, ...nada, enRiesgo: true };
  if (gap === 2 && t.escudos > 0)
    return { racha: t.racha, ...nada, enRiesgo: true, protegida: true };
  return { racha: 0, ...nada, rota: true, reparable: gap === 2 };
}

/* ---------------- Completar un día ---------------- */

export interface Resultado {
  dia: number;
  esTest: boolean;
  aciertos: number;
  total: number;
  errores: number;
  /** Para tests: porcentaje mínimo para aprobar. */
  pasoPct?: number;
  xpLeccion?: number;
  premioTest?: {
    primero: { xp: number; badge: string | null; gems: number };
    repetido: { xp: number; badge: string | null; gems?: number };
  };
}

export function completarDia(
  estado: EstadoLearn,
  track: Track,
  r: Resultado,
  ahora = Date.now(),
): { estado: EstadoLearn; premio: Premio } {
  const hoy = fechaLocal(ahora);
  let t = aplicarRecarga(estado.tracks[track], ahora);
  let gemas = estado.gemas;
  const insignias = [...estado.insignias];
  const nuevasInsignias: string[] = [];
  const darInsignia = (n: string | null | undefined) => {
    if (n && !insignias.includes(n)) {
      insignias.push(n);
      nuevasInsignias.push(n);
    }
  };

  const pct = r.total > 0 ? (r.aciertos / r.total) * 100 : 0;
  const aprobado = !r.esTest || pct >= (r.pasoPct ?? 70);
  const repaso = t.completados.includes(r.dia);
  let xp = 0;
  let gemasGanadas = 0;
  let corazonExtra = false;

  if (r.esTest) {
    const primeraVez = !t.testsIntentados.includes(r.dia);
    t = { ...t, testsIntentados: [...new Set([...t.testsIntentados, r.dia])] };
    if (aprobado && !t.testsAprobados.includes(r.dia)) {
      const p = primeraVez ? r.premioTest?.primero : r.premioTest?.repetido;
      xp += p?.xp ?? 25;
      gemasGanadas += p?.gems ?? 0;
      darInsignia(p?.badge);
      t = { ...t, testsAprobados: [...t.testsAprobados, r.dia] };
    } else if (aprobado) {
      xp += XP_REPASO;
    }
  } else if (repaso) {
    // Repasar una lección ya hecha devuelve un corazón (gain_on_review_old_lesson).
    xp += XP_REPASO;
    t = ganarCorazon(t, ahora);
    corazonExtra = true;
  } else {
    xp += r.xpLeccion ?? 10;
    gemasGanadas += 1;
    if (r.errores === 0) {
      xp += XP_PERFECTO;
      gemasGanadas += 1;
      if (t.corazones < CORAZONES_MAX) {
        t = ganarCorazon(t, ahora);
        corazonExtra = true;
      }
    }
  }

  // Avanza al día siguiente solo si completó el día actual (y aprobó si es test).
  if (aprobado && !t.completados.includes(r.dia)) {
    t = { ...t, completados: [...t.completados, r.dia].sort((a, b) => a - b) };
  }
  if (aprobado && r.dia >= t.dia) t = { ...t, dia: r.dia + 1 };

  // Racha: cuenta el primer día completado (lección o test aprobado) de cada fecha.
  const rachaAntes = infoRacha(t, hoy).racha;
  let rachaDespues = rachaAntes;
  let metaAlcanzada: number | null = null;
  if (aprobado && t.ultimoDia !== hoy) {
    const gap = t.ultimoDia ? diasEntre(t.ultimoDia, hoy) : Infinity;
    let racha: number;
    let escudos = t.escudos;
    if (gap === 1) racha = t.racha + 1;
    else if (gap === 2 && escudos > 0) {
      escudos -= 1;
      racha = t.racha + 1;
    } else racha = 1;
    rachaDespues = racha;
    t = { ...t, racha, escudos, ultimoDia: hoy, mejorRacha: Math.max(t.mejorRacha, racha) };
    for (const m of METAS) {
      if (racha >= m && !t.metas.includes(m)) {
        t = { ...t, metas: [...t.metas, m] };
        const p = PREMIOS_META[m];
        if (p) {
          gemasGanadas += p.gemas;
          darInsignia(p.insignia);
        }
        metaAlcanzada = m;
      }
    }
  }

  t = { ...t, xp: t.xp + xp };
  gemas += gemasGanadas;
  return {
    estado: { ...estado, gemas, insignias, tracks: { ...estado.tracks, [track]: t } },
    premio: {
      xp,
      gemas: gemasGanadas,
      insignias: nuevasInsignias,
      corazonExtra,
      rachaAntes,
      rachaDespues,
      metaAlcanzada,
      aprobado,
    },
  };
}

export function comprarEscudo(estado: EstadoLearn, track: Track): EstadoLearn | null {
  const t = estado.tracks[track];
  if (estado.gemas < COSTO_ESCUDO || t.escudos >= MAX_ESCUDOS) return null;
  return {
    ...estado,
    gemas: estado.gemas - COSTO_ESCUDO,
    tracks: { ...estado.tracks, [track]: { ...t, escudos: t.escudos + 1 } },
  };
}

/** Se rompió ayer: con gemas vuelve como si ayer hubiera practicado. */
export function repararRacha(
  estado: EstadoLearn,
  track: Track,
  hoy = fechaLocal(),
): EstadoLearn | null {
  const t = estado.tracks[track];
  if (!infoRacha(t, hoy).reparable || estado.gemas < COSTO_REPARAR) return null;
  return {
    ...estado,
    gemas: estado.gemas - COSTO_REPARAR,
    tracks: { ...estado.tracks, [track]: { ...t, ultimoDia: sumarDias(hoy, -1) } },
  };
}

/* ---------------- Tienda compartida (pantalla de Learn y Snoopy) ---------------- */

const KEY = "snoopy-learn-v1";
let estado: EstadoLearn | null = null;
const oyentes = new Set<() => void>();

function cargar(): EstadoLearn {
  if (estado) return estado;
  try {
    estado = normalizar(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    estado = estadoInicial();
  }
  return estado;
}

export function leerLearn(): EstadoLearn {
  return cargar();
}

export function guardarLearn(next: EstadoLearn) {
  estado = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento lleno o bloqueado: sigue en memoria */
  }
  for (const fn of oyentes) fn();
}

function suscribir(fn: () => void) {
  oyentes.add(fn);
  const alCambiarEnOtraPestana = (e: StorageEvent) => {
    if (e.key === KEY) {
      estado = null;
      fn();
    }
  };
  window.addEventListener("storage", alCambiarEnOtraPestana);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener("storage", alCambiarEnOtraPestana);
  };
}

const VACIO = estadoInicial(0);
export function useLearn(): EstadoLearn {
  return useSyncExternalStore(suscribir, cargar, () => VACIO);
}

/** Resumen para Snoopy y para el aviso diario del servidor. */
export function resumenLearn(e: EstadoLearn, hoy = fechaLocal()) {
  const infos = TRACKS.map((t) => ({ track: t, ...infoRacha(e.tracks[t], hoy) }));
  return {
    racha: Math.max(...infos.map((i) => i.racha)),
    hechaHoy: infos.some((i) => i.hechaHoy),
    empezado: TRACKS.some((t) => e.tracks[t].completados.length > 0),
    ultimoDia:
      TRACKS.map((t) => e.tracks[t].ultimoDia)
        .filter((x): x is string => !!x)
        .sort()
        .pop() ?? null,
  };
}
