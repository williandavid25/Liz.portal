import { useSyncExternalStore } from "react";
import { queuePendingAjustes, saveAjustes, type Ajustes } from "./cloud";
import { PORTADA_DEFAULT } from "./portadas";

// Ajustes del inicio compartidos por toda la app: se guardan en este
// dispositivo (para que se apliquen al instante al abrir) y en la nube (para
// que el otro celular vea la misma portada).

const KEY = "liz-ajustes";

export const AJUSTES_DEFAULT: Ajustes = {
  portada: PORTADA_DEFAULT,
  mostrarGalaxia: true,
  mostrarOceano: true,
};

let state: Ajustes = AJUSTES_DEFAULT;
let loadedLocal = false;
const listeners = new Set<() => void>();

function normalize(a: Partial<Ajustes> | null | undefined): Ajustes {
  return { ...AJUSTES_DEFAULT, ...(a ?? {}) };
}

function loadLocal() {
  if (loadedLocal || typeof window === "undefined") return;
  loadedLocal = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = normalize(JSON.parse(raw));
  } catch {
    /* ignore */
  }
}

function commit(next: Ajustes) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  loadLocal();
  return state;
}

export function useAjustes(): Ajustes {
  return useSyncExternalStore(subscribe, getSnapshot, () => AJUSTES_DEFAULT);
}

/** Cambia uno o más ajustes y los sube a la nube (o los deja pendientes sin conexión). */
export function setAjustes(patch: Partial<Ajustes>) {
  loadLocal();
  const next = { ...state, ...patch };
  commit(next);
  saveAjustes({ data: next })
    .then((r) => {
      if (!r.ok) queuePendingAjustes(next);
    })
    .catch(() => queuePendingAjustes(next));
}

/** Aplica los ajustes que vienen de la nube (fuente de verdad entre celulares). */
export function hydrateAjustes(remote: Partial<Ajustes> | undefined) {
  if (!remote) return;
  loadLocal();
  const next = normalize(remote);
  if (JSON.stringify(next) !== JSON.stringify(state)) commit(next);
}
