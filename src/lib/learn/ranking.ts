import { useSyncExternalStore } from "react";
import { TRACKS, fechaLocal, infoRacha } from "./progreso";
import type { EstadoLearn, ProgresoTrack, Track } from "./tipos";

// Ranking de Snoopy Learn: cada persona se une con su nombre y una foto, y su
// avance (XP, día, racha) se sube a la nube para compararse con quien usa el
// otro celular. El perfil vive en este celular; la nube solo guarda la copia
// que ven los demás.

export interface AvanceTrack {
  xp: number;
  dia: number;
  completados: number;
  racha: number;
  mejorRacha: number;
  ultimoDia: string | null;
  escudos: number;
}

export interface AvanceRanking {
  english: AvanceTrack;
  laboratory: AvanceTrack;
  gemas: number;
  insignias: number;
}

export interface FilaRanking {
  nombre: string;
  foto: string | null;
  avance: AvanceRanking;
  actualizado: number;
  esTu: boolean;
}

export type VistaRanking = Track | "general";

/* ---------------- Niveles ---------------- */

/** XP total para llegar al nivel n: 0, 50, 150, 300, 500… (cada nivel pide 50 más). */
const xpParaNivel = (n: number) => 25 * n * (n - 1);

export function nivelDe(xp: number): { nivel: number; desde: number; hasta: number; pct: number } {
  let nivel = 1;
  while (xpParaNivel(nivel + 1) <= xp) nivel++;
  const desde = xpParaNivel(nivel);
  const hasta = xpParaNivel(nivel + 1);
  return { nivel, desde, hasta, pct: Math.min(100, ((xp - desde) / (hasta - desde)) * 100) };
}

export function avanceDe(e: EstadoLearn): AvanceRanking {
  const de = (t: ProgresoTrack): AvanceTrack => ({
    xp: t.xp,
    dia: t.dia,
    completados: t.completados.length,
    racha: t.racha,
    mejorRacha: t.mejorRacha,
    ultimoDia: t.ultimoDia,
    escudos: t.escudos,
  });
  return {
    english: de(e.tracks.english),
    laboratory: de(e.tracks.laboratory),
    gemas: e.gemas,
    insignias: e.insignias.length,
  };
}

/** Racha que se ve hoy (la guardada puede estar vieja si no volvió a entrar). */
export function rachaHoy(a: AvanceTrack, hoy = fechaLocal()): number {
  return infoRacha(a as unknown as ProgresoTrack, hoy).racha;
}

/** Lo que se compara en cada pestaña del ranking. */
export function puntaje(a: AvanceRanking, vista: VistaRanking, hoy = fechaLocal()) {
  const tracks = vista === "general" ? TRACKS : [vista];
  const sumar = (f: (t: AvanceTrack) => number) => tracks.reduce((s, t) => s + f(a[t]), 0);
  return {
    xp: sumar((t) => t.xp),
    completados: sumar((t) => t.completados),
    dia: vista === "general" ? Math.max(a.english.dia, a.laboratory.dia) : a[vista].dia,
    racha: Math.max(...tracks.map((t) => rachaHoy(a[t], hoy))),
  };
}

/** Ordena por XP; empata por lecciones hechas y luego por racha. */
export function ordenar(filas: FilaRanking[], vista: VistaRanking): FilaRanking[] {
  const hoy = fechaLocal();
  return [...filas].sort((x, y) => {
    const a = puntaje(x.avance, vista, hoy);
    const b = puntaje(y.avance, vista, hoy);
    return b.xp - a.xp || b.completados - a.completados || b.racha - a.racha;
  });
}

/* ---------------- Perfil de este celular ---------------- */

export interface PerfilRanking {
  nombre: string;
  foto: string | null;
}

const KEY = "snoopy-learn-perfil";
let perfil: PerfilRanking | null | undefined;
const oyentes = new Set<() => void>();

function cargar(): PerfilRanking | null {
  if (perfil !== undefined) return perfil;
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null") as PerfilRanking | null;
    perfil = p && typeof p.nombre === "string" && p.nombre.trim() ? p : null;
  } catch {
    perfil = null;
  }
  return perfil;
}

export function leerPerfil(): PerfilRanking | null {
  return cargar();
}

export function guardarPerfil(p: PerfilRanking | null) {
  perfil = p;
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento bloqueado: sigue en memoria */
  }
  for (const fn of oyentes) fn();
}

function suscribir(fn: () => void) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function usePerfil(): PerfilRanking | null {
  return useSyncExternalStore(suscribir, cargar, () => null);
}
