import { useCallback, useEffect, useRef, useState } from "react";

// Estado de la mascota virtual. Se guarda en este dispositivo y sigue
// "viviendo" con la app cerrada: al volver se calcula cuánto bajaron las
// barras según el tiempo que pasó.

export interface Mascota {
  nombre: string;
  comida: number;
  felicidad: number;
  higiene: number;
  energia: number;
  durmiendo: boolean;
  ts: number; // última vez que se actualizó
}

const KEY = "liz-mascota";

export const MASCOTA_INICIAL: Mascota = {
  nombre: "Zoe",
  comida: 75,
  felicidad: 92,
  higiene: 60,
  energia: 90,
  durmiendo: false,
  ts: 0,
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Cuánto cambia cada barra por minuto. */
function avanzar(m: Mascota, ahora: number): Mascota {
  if (!m.ts) return { ...m, ts: ahora };
  // Tope de 3 días para no dejarla en cero de golpe tras mucho tiempo.
  const min = Math.min((ahora - m.ts) / 60000, 60 * 24 * 3);
  if (min <= 0) return m;
  const n = { ...m, ts: ahora };
  if (m.durmiendo) {
    n.energia = clamp(m.energia + 1.5 * min);
    n.comida = clamp(m.comida - 0.1 * min);
    n.higiene = clamp(m.higiene - 0.05 * min);
    n.felicidad = clamp(m.felicidad - 0.03 * min);
    if (n.energia >= 100) n.durmiendo = false; // se despierta solita al descansar
  } else {
    n.comida = clamp(m.comida - 0.2 * min);
    n.higiene = clamp(m.higiene - 0.12 * min);
    n.energia = clamp(m.energia - 0.16 * min);
    const descuidada = n.comida < 25 || n.higiene < 25 || n.energia < 25;
    n.felicidad = clamp(m.felicidad - (descuidada ? 0.25 : 0.08) * min);
  }
  return n;
}

function leer(): Mascota {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...MASCOTA_INICIAL, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return MASCOTA_INICIAL;
}

export function useMascota() {
  const [m, setM] = useState<Mascota>(MASCOTA_INICIAL);
  const [listo, setListo] = useState(false);
  const despertoSola = useRef(false);

  const guardar = (n: Mascota) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(n));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const n = avanzar(leer(), Date.now());
    setM(n);
    guardar(n);
    setListo(true);
    const id = window.setInterval(() => {
      setM((prev) => {
        const n = avanzar(prev, Date.now());
        if (prev.durmiendo && !n.durmiendo) despertoSola.current = true;
        guardar(n);
        return n;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const cambiar = useCallback((f: (m: Mascota) => Partial<Mascota>) => {
    setM((prev) => {
      const base = avanzar(prev, Date.now());
      const n = { ...base, ...f(base) };
      n.comida = clamp(n.comida);
      n.felicidad = clamp(n.felicidad);
      n.higiene = clamp(n.higiene);
      n.energia = clamp(n.energia);
      guardar(n);
      return n;
    });
  }, []);

  /** true una sola vez cuando se despertó sola mientras mirabas. */
  const consumirDesperto = useCallback(() => {
    const v = despertoSola.current;
    despertoSola.current = false;
    return v;
  }, []);

  return { m, listo, cambiar, consumirDesperto };
}
