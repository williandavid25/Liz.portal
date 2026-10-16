// Datos y lógica pura del piano: canciones, notas, dificultades, calificación y
// guardado en localStorage. Sin React, para poder probarlo aparte.

export interface Tile {
  /** Columna 0..3 */
  c: number;
  /** Tiempo (beat) en que la nota llega a la línea. */
  b: number;
  /** Nombre de la nota, p. ej. "C#5". */
  n: string;
  /** Duración en tiempos. */
  d: number;
}

export interface Cancion {
  id: string;
  titulo: string;
  artista: string;
  bpm: number;
  tiles: Tile[];
  /** Nota elegida por columna en el editor (opcional). */
  notasCol?: string[];
}

export const COLORES = ["#00eeff", "#ff00cc", "#aa00ff", "#00ff88"] as const;

export interface Dificultad {
  nombre: string;
  /** Segundos que tarda una ficha en caer hasta la línea. */
  viaje: number;
  /** Ventanas de acierto en ms. */
  perfect: number;
  good: number;
}

export const DIFICULTADES: readonly Dificultad[] = [
  { nombre: "Fácil", viaje: 2.8, perfect: 120, good: 220 },
  { nombre: "Normal", viaje: 2.0, perfect: 80, good: 160 },
  { nombre: "Difícil", viaje: 1.4, perfect: 55, good: 110 },
  { nombre: "Experto", viaje: 0.95, perfect: 35, good: 75 },
];

/** Segundos de espera antes de que la primera nota llegue a la línea. */
export const ENTRADA = 1.8;
/** Altura de la línea de golpe (fracción del alto). */
export const LINEA = 0.83;

// ---------------------------------------------------------------- notas

const SEMITONO: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 440. Acepta sostenidos (#) y bemoles (b). Devuelve null si no es válida. */
export function frecuencia(nota: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(nota.trim());
  if (!m) return null;
  const alter = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const midi = (Number(m[3]) + 1) * 12 + SEMITONO[m[1]] + alter;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOMBRES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Notas disponibles en el editor: C3 … B6. */
export const NOTAS_EDITOR: readonly string[] = [3, 4, 5, 6].flatMap((o) =>
  NOMBRES.map((n) => `${n}${o}`),
);
export const NOTAS_COL_DEFECTO = ["C4", "E4", "G4", "C5"];

// ---------------------------------------------------------------- canciones de ejemplo

/** "b/nota/d b/nota/d …" con columnas en ciclo 0,1,2,3,0,… (como el original). */
function ciclo(texto: string): Tile[] {
  return texto
    .trim()
    .split(/\s+/)
    .map((tok, i) => {
      const [b, n, d] = tok.split("/");
      return { c: i % 4, b: Number(b), n, d: Number(d) };
    });
}

function base(id: string, titulo: string, artista: string, bpm: number, notas: string): Cancion {
  return { id, titulo, artista, bpm, tiles: ciclo(notas) };
}

export const CANCIONES_BASE: readonly Cancion[] = [
  base(
    "b0",
    "Twinkle Twinkle",
    "Trad.",
    108,
    `0/C4/.9 1/C4/.9 2/G4/.9 3/G4/.9 4/A4/.9 5/A4/.9 6/G4/1.9 8/F4/.9 9/F4/.9 10/E4/.9
     11/E4/.9 12/D4/.9 13/D4/.9 14/C4/1.9 16/G4/.9 17/G4/.9 18/F4/.9 19/F4/.9 20/E4/.9
     21/E4/.9 22/D4/1.9 24/G4/.9 25/G4/.9 26/F4/.9 27/F4/.9 28/E4/.9 29/E4/.9 30/D4/1.9
     32/C4/.9 33/C4/.9 34/G4/.9 35/G4/.9 36/A4/.9 37/A4/.9 38/G4/1.9 40/F4/.9 41/F4/.9
     42/E4/.9 43/E4/.9 44/D4/.9 45/D4/.9 46/C4/1.9`,
  ),
  base(
    "b1",
    "Ode to Joy",
    "Beethoven",
    108,
    `0/E4/.9 1/E4/.9 2/F4/.9 3/G4/.9 4/G4/.9 5/F4/.9 6/E4/.9 7/D4/.9 8/C4/.9 9/C4/.9
     10/D4/.9 11/E4/.9 12/E4/1.4 13.5/D4/.5 14/D4/1.9
     16/E4/.9 17/E4/.9 18/F4/.9 19/G4/.9 20/G4/.9 21/F4/.9 22/E4/.9 23/D4/.9 24/C4/.9
     25/C4/.9 26/D4/.9 27/E4/.9 28/D4/1.4 29.5/C4/.5 30/C4/1.9`,
  ),
  base(
    "b2",
    "Happy Birthday",
    "Trad.",
    96,
    `.5/G4/.4 1/G4/.9 2/A4/.9 3/G4/.9 4/C5/.9 5/B4/1.4 6.5/G4/.4 7/G4/.9 8/A4/.9 9/G4/.9
     10/D5/.9 11/C5/1.4 12.5/G4/.4 13/G4/.9 14/G5/.9 15/E5/.9 16/C5/.9 17/B4/.9 18/A4/.9
     19.5/F5/.4 20/F5/.9 21/E5/.9 22/C5/.9 23/D5/.9 24/C5/1.9`,
  ),
  base(
    "b3",
    "Für Elise",
    "Beethoven",
    132,
    `0/E5/.4 .5/D#5/.4 1/E5/.4 1.5/D#5/.4 2/E5/.4 2.5/B4/.4 3/D5/.4 3.5/C5/.4 4/A4/.9
     5.5/C4/.4 6/E4/.4 6.5/A4/.4 7/B4/.9 8.5/E4/.4 9/G#4/.4 9.5/B4/.4 10/C5/.9 11.5/E4/.4
     12/E5/.4 12.5/D#5/.4 13/E5/.4 13.5/D#5/.4 14/E5/.4 14.5/B4/.4 15/D5/.4 15.5/C5/.4
     16/A4/.9`,
  ),
  base(
    "b4",
    "Canon in D",
    "Pachelbel",
    72,
    `0/D5/.9 1/A4/.9 2/B4/.9 3/F#4/.9 4/G4/.9 5/D4/.9 6/G4/.9 7/A4/.9 8/D5/.4 8.5/E5/.4
     9/F#5/.4 9.5/G5/.4 10/A5/.4 10.5/G5/.4 11/F#5/.4 11.5/E5/.4 12/F#5/.4 12.5/E5/.4
     13/D5/.4 13.5/C#5/.4 14/D5/.4 14.5/A4/.4 15/B4/.4 15.5/G4/.4 16/A4/.9 17/E4/.9
     18/F#4/.9 19/D4/.9`,
  ),
  base(
    "b5",
    "River Flows in You",
    "Yiruma",
    84,
    `0/A4/.4 .5/B4/.4 1/E5/.9 2/D5/.4 2.5/C#5/.4 3/B4/.9 4/A4/.4 4.5/B4/.4 5/C#5/.4
     5.5/E5/.4 6/A5/.9 7/G#5/.4 7.5/F#5/.4 8/E5/.9 9/D5/.4 9.5/C#5/.4 10/B4/.9 11/A4/.9
     12/E5/.4 12.5/F#5/.4 13/G#5/.4 13.5/A5/.4 14/B5/.9 15/A5/.4 15.5/G#5/.4 16/F#5/.9
     17/E5/.9 18/D5/.9 19/C#5/.9`,
  ),
  base(
    "b6",
    "Someone Like You",
    "Adele",
    68,
    `0/A4/.9 1/E4/.9 2/C#5/.9 3/D5/.9 4/A4/.9 5/E4/.9 6/C#5/.9 7/B4/.9 8/F#4/.9 9/A4/.9
     10/C#5/.9 11/D5/.9 12/E5/.9 13/D5/.9 14/C#5/.9 15/B4/.9 16/A4/1.4 17.5/E5/.4
     18/D5/.4 18.5/C#5/.4 19/B4/.9 20/A4/1.9`,
  ),
  base(
    "b7",
    "La Vie en Rose",
    "Édith Piaf",
    90,
    `0/G4/.4 .5/A4/.4 1/C5/.9 2/A4/.4 2.5/C5/.4 3/E5/.9 4/D5/.4 4.5/C5/.4 5/B4/.9 6/G4/.4
     6.5/A4/.4 7/C5/.9 8/G4/.9 9/E4/.9 10/G4/.4 10.5/A4/.4 11/C5/.9 12/A4/.4 12.5/C5/.4
     13/E5/.9 14/C5/.4 14.5/B4/.4 15/A4/.9 16/G4/1.9`,
  ),
  base(
    "b8",
    "Pirates of Caribbean",
    "Zimmer",
    144,
    `0/A4/.4 .5/A4/.4 1/B4/.4 1.5/C5/.4 2/D5/.4 2.5/D5/.4 3/C5/.4 3.5/B4/.4 4/A4/.9
     5/G4/.4 5.5/A4/.4 6/G4/.4 6.5/F#4/.4 7/E4/.9 8/A4/.4 8.5/A4/.4 9/B4/.4 9.5/C5/.4
     10/D5/.4 10.5/D5/.4 11/C5/.4 11.5/B4/.4 12/C5/.9 13/G4/.4 13.5/A4/.4 14/B4/.4
     14.5/C5/.4 15/A4/.9 16/E5/.4 16.5/D5/.4 17/C5/.4 17.5/B4/.4 18/A4/1.9`,
  ),
  base(
    "b9",
    "Despacito",
    "Luis Fonsi",
    89,
    `0/B4/.4 .5/G#4/.4 1/E4/.4 2/B4/.4 2.5/G#4/.4 3/E4/.4 4/A4/.4 4.5/F#4/.4 5/D4/.4
     6/A4/.4 6.5/F#4/.4 7/D4/.4 8/G#4/.4 8.5/E4/.4 9/B3/.4 9.5/G#4/.4 10/E4/.4 10.5/B3/.4
     11/F#4/.4 11.5/D4/.4 12/A3/.4 12.5/F#4/.4 13/D4/.4 13.5/A3/.4 14/E4/.9 15/B3/.9
     16/B4/1.9`,
  ),
];

// ---------------------------------------------------------------- calificación

export interface Stats {
  puntos: number;
  comboMax: number;
  perfect: number;
  good: number;
  miss: number;
  total: number;
}

export function precision(s: Stats): number {
  return s.total > 0 ? (s.perfect + s.good * 0.5) / s.total : 0;
}

export type Nota = "S" | "A" | "B" | "C" | "D";

export function calificar(s: Stats): Nota {
  const p = precision(s);
  if (p >= 0.95) return "S";
  if (p >= 0.85) return "A";
  if (p >= 0.7) return "B";
  if (p >= 0.5) return "C";
  return "D";
}

export function puntosPerfect(combo: number) {
  return 300 + Math.min(combo, 50) * 8;
}
export function puntosGood(combo: number) {
  return 100 + Math.min(combo, 20) * 4;
}

// ---------------------------------------------------------------- guardado

export const CLAVE_CANCIONES = "liz-piano-canciones";
const CLAVE_RECORDS = "liz-piano-records";

function esTile(x: unknown): x is Tile {
  if (!x || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.c === "number" &&
    t.c >= 0 &&
    t.c <= 3 &&
    typeof t.b === "number" &&
    Number.isFinite(t.b) &&
    typeof t.n === "string" &&
    frecuencia(t.n) !== null &&
    typeof t.d === "number" &&
    Number.isFinite(t.d)
  );
}

function esCancion(x: unknown): x is Cancion {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.titulo === "string" &&
    typeof s.artista === "string" &&
    typeof s.bpm === "number" &&
    s.bpm > 0 &&
    Array.isArray(s.tiles) &&
    s.tiles.every(esTile)
  );
}

const copiaBase = (): Cancion[] =>
  CANCIONES_BASE.map((c) => ({ ...c, tiles: c.tiles.map((t) => ({ ...t })) }));

/** Lee la biblioteca. La primera vez (o si está dañada) usa las de ejemplo. */
export function cargarCanciones(): Cancion[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_CANCIONES);
    if (crudo === null) return copiaBase();
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return copiaBase();
    return datos.filter(esCancion);
  } catch {
    return copiaBase();
  }
}

export function guardarCanciones(lista: Cancion[]) {
  try {
    window.localStorage.setItem(CLAVE_CANCIONES, JSON.stringify(lista));
  } catch {
    /* sin espacio o modo privado: seguimos en memoria */
  }
}

/** Devuelve la lista con las canciones de ejemplo que falten añadidas al final. */
export function restaurarBase(lista: Cancion[]): Cancion[] {
  const ids = new Set(lista.map((c) => c.id));
  return [...lista, ...copiaBase().filter((c) => !ids.has(c.id))];
}

type Records = Record<string, number>;

export function cargarRecords(): Records {
  try {
    const datos: unknown = JSON.parse(window.localStorage.getItem(CLAVE_RECORDS) ?? "{}");
    return datos && typeof datos === "object" ? (datos as Records) : {};
  } catch {
    return {};
  }
}

export const claveRecord = (id: string, dif: number) => `${id}:${dif}`;

/** Guarda el puntaje si supera el récord. Devuelve true si es nuevo récord. */
export function registrarRecord(id: string, dif: number, puntos: number): boolean {
  const r = cargarRecords();
  const k = claveRecord(id, dif);
  if (puntos <= 0 || (r[k] ?? 0) >= puntos) return false;
  r[k] = puntos;
  try {
    window.localStorage.setItem(CLAVE_RECORDS, JSON.stringify(r));
  } catch {
    /* ignorar */
  }
  return true;
}

/** Duración en segundos de la canción (hasta que suena la última nota). */
export function duracion(c: Cancion): number {
  const spb = 60 / c.bpm;
  return c.tiles.reduce((m, t) => Math.max(m, (t.b + t.d) * spb), 0);
}

export function nuevoId() {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
