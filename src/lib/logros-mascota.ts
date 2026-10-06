// Logros y racha de días cuidando a la mascota.

export interface Contadores {
  alimentar: number;
  banar: number;
  dormir: number;
  pasear: number;
  caricias: number;
  charlas: number;
}

export interface Progreso {
  contadores: Contadores;
  /** Días seguidos con al menos un cuidado. */
  racha: number;
  mejorRacha: number;
  /** Último día con cuidados, "AAAA-MM-DD" en hora local. */
  ultimoDia: string | null;
  logros: string[];
}

export const PROGRESO_INICIAL: Progreso = {
  contadores: { alimentar: 0, banar: 0, dormir: 0, pasear: 0, caricias: 0, charlas: 0 },
  racha: 0,
  mejorRacha: 0,
  ultimoDia: null,
  logros: [],
};

export interface Logro {
  id: string;
  emoji: string;
  titulo: string;
  desc: string;
  /** Lo que dice la mascota al desbloquearlo. */
  mensaje: string;
  meta: number;
  valor: (p: Progreso, bienestar: number) => number;
}

export const LOGROS: Logro[] = [
  {
    id: "primer-bocado",
    emoji: "🍖",
    titulo: "Primer bocado",
    desc: "Dale de comer por primera vez",
    mensaje: "¡Gracias por la comida! Ya sé que me vas a cuidar 💛",
    meta: 1,
    valor: (p) => p.contadores.alimentar,
  },
  {
    id: "racha-3",
    emoji: "🔥",
    titulo: "Tres días juntos",
    desc: "Cuídalo 3 días seguidos",
    mensaje: "¡Tres días seguidos conmigo! Me haces muy feliz 🔥",
    meta: 3,
    valor: (p) => p.mejorRacha,
  },
  {
    id: "burbujas",
    emoji: "🫧",
    titulo: "Burbujas",
    desc: "Báñalo 10 veces",
    mensaje: "Huelo a flores gracias a ti 🌸",
    meta: 10,
    valor: (p) => p.contadores.banar,
  },
  {
    id: "suenos",
    emoji: "🌙",
    titulo: "Dulces sueños",
    desc: "Hazlo dormir 10 veces",
    mensaje: "Contigo duermo tranquilito 🌙",
    meta: 10,
    valor: (p) => p.contadores.dormir,
  },
  {
    id: "charla",
    emoji: "🎤",
    titulo: "Buena conversación",
    desc: "Háblale 5 veces",
    mensaje: "Me encanta escuchar tu voz 🎤💛",
    meta: 5,
    valor: (p) => p.contadores.charlas,
  },
  {
    id: "perfecto",
    emoji: "✨",
    titulo: "Bienestar perfecto",
    desc: "Llega a 100% de bienestar",
    mensaje: "¡Me siento perfecto! Eres la mejor ✨",
    meta: 100,
    valor: (_p, b) => b,
  },
  {
    id: "racha-7",
    emoji: "💛",
    titulo: "Una semana juntos",
    desc: "Cuídalo 7 días seguidos",
    mensaje: "Una semana cuidándome. Gracias por quererme tanto 💛",
    meta: 7,
    valor: (p) => p.mejorRacha,
  },
  {
    id: "explorador",
    emoji: "🌳",
    titulo: "Explorador",
    desc: "Sal a pasear 15 veces",
    mensaje: "Cada paseo contigo es mi favorito 🌳",
    meta: 15,
    valor: (p) => p.contadores.pasear,
  },
  {
    id: "chef",
    emoji: "👩‍🍳",
    titulo: "Chef de Snoopy",
    desc: "Dale de comer 25 veces",
    mensaje: "Cocinas con amor, se nota 😋",
    meta: 25,
    valor: (p) => p.contadores.alimentar,
  },
  {
    id: "mimos",
    emoji: "💕",
    titulo: "Lluvia de mimos",
    desc: "Acarícialo 50 veces",
    mensaje: "Nunca me canso de tus mimos 💕",
    meta: 50,
    valor: (p) => p.contadores.caricias,
  },
  {
    id: "racha-30",
    emoji: "🏆",
    titulo: "Un mes de amor",
    desc: "Cuídalo 30 días seguidos",
    mensaje: "Un mes entero juntos. Eres mi persona favorita 🏆",
    meta: 30,
    valor: (p) => p.mejorRacha,
  },
];

export const diaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ayer = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return diaLocal(d);
};

/** Suma un cuidado y actualiza la racha de días. */
export function registrarCuidado(p: Progreso, k: keyof Contadores): Progreso {
  const hoy = diaLocal();
  let racha = p.racha;
  if (p.ultimoDia !== hoy) racha = p.ultimoDia === ayer() ? p.racha + 1 : 1;
  return {
    ...p,
    racha,
    mejorRacha: Math.max(p.mejorRacha, racha),
    ultimoDia: hoy,
    contadores: { ...p.contadores, [k]: p.contadores[k] + 1 },
  };
}

/** La racha que sigue viva (si no la cuidó ayer ni hoy, se cortó). */
export function rachaActual(p: Progreso): number {
  return p.ultimoDia === diaLocal() || p.ultimoDia === ayer() ? p.racha : 0;
}
