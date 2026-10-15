import type {
  ContenidoTrack,
  Dia,
  DiaLeccion,
  Ejercicio,
  ProgresoTrack,
  Track,
  Vocabulario,
} from "./tipos";

// El contenido de cada materia se arma con tres fuentes:
// 1. Módulos incluidos en la app (src/content/learn/*.json): el 1 y los que
//    se van escribiendo y revisando a mano.
// 2. Módulos nuevos guardados en la nube (generados y aprobados en la app):
//    llegan sin publicar una versión nueva.
// 3. Si la nube no responde, la última copia guardada en el celular.
// Todo se descarga recién al abrir Snoopy Learn.

const MODULOS_APP: Record<Track, () => Promise<ContenidoTrack[]>> = {
  english: () =>
    Promise.all([
      import("@/content/learn/english.json"),
      import("@/content/learn/english-m2.json"),
    ]).then((ms) => ms.map((m) => (m.default ?? m) as unknown as ContenidoTrack)),
  laboratory: () =>
    Promise.all([
      import("@/content/learn/laboratory.json"),
      import("@/content/learn/laboratory-m2.json"),
    ]).then((ms) => ms.map((m) => (m.default ?? m) as unknown as ContenidoTrack)),
};

const claveNube = (t: Track) => `snoopy-learn-nube-${t}`;

function leerNube(t: Track): Dia[] {
  try {
    const v = JSON.parse(localStorage.getItem(claveNube(t)) || "[]");
    return Array.isArray(v) ? (v as Dia[]) : [];
  } catch {
    return [];
  }
}

async function traerNube(t: Track): Promise<Dia[] | null> {
  const { modulosLearn } = await import("@/lib/cloud");
  const r = await Promise.race([
    modulosLearn({ data: t }),
    new Promise<null>((ok) => setTimeout(() => ok(null), 4000)),
  ]).catch(() => null);
  if (!r || !r.ok) return null;
  try {
    localStorage.setItem(claveNube(t), JSON.stringify(r.dias));
  } catch {
    /* sin espacio */
  }
  return r.dias as Dia[];
}

/** Une los módulos por número de día (si se repite, gana el de la app). */
export function unirModulos(track: Track, base: ContenidoTrack[], extra: Dia[]): ContenidoTrack {
  const porDia = new Map<number, Dia>();
  for (const m of base) for (const d of m.days) porDia.set(d.day_id, d);
  for (const d of extra) if (d.track === track && !porDia.has(d.day_id)) porDia.set(d.day_id, d);
  return { ...base[0]!, days: [...porDia.values()].sort((a, b) => a.day_id - b.day_id) };
}

const cache = new Map<Track, Promise<ContenidoTrack>>();

/**
 * Contenido al instante: módulos de la app + la última copia de la nube
 * guardada en el celular (sin esperar internet). Con `refrescar` se consulta
 * la nube primero (por ejemplo, después de aprobar un módulo).
 */
export function cargarTrack(track: Track, refrescar = false): Promise<ContenidoTrack> {
  let p = refrescar ? undefined : cache.get(track);
  if (!p) {
    p = (async () => {
      const base = await MODULOS_APP[track]();
      const nube = refrescar ? ((await traerNube(track)) ?? leerNube(track)) : leerNube(track);
      return unirModulos(track, base, nube);
    })();
    p.catch(() => cache.delete(track));
    cache.set(track, p);
  }
  return p;
}

/** Revisa la nube en segundo plano; devuelve el contenido solo si cambió. */
export async function actualizarDesdeNube(track: Track): Promise<ContenidoTrack | null> {
  const antes = JSON.stringify(leerNube(track).map((d) => d.day_id));
  const nube = await traerNube(track);
  if (!nube || JSON.stringify(nube.map((d) => d.day_id)) === antes) return null;
  const actualizado = unirModulos(track, await MODULOS_APP[track](), nube);
  cache.set(track, Promise.resolve(actualizado));
  return actualizado;
}

export const TOTAL_DIAS = 100;

/* ---------------- Pasos de una sesión (uno por pantalla) ---------------- */

export type Paso =
  | { tipo: "vocab"; key: string; vocab: Vocabulario; n: number; de: number }
  | {
      tipo: "ejercicio";
      key: string;
      ej: Ejercicio;
      repaso?: boolean;
      /** Pregunta original ("día-índice"): para recordar cómo le fue. */
      ref?: string;
    };

function mezclar<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Cambia el orden de las opciones (sin perder cuál es la correcta). */
export function barajar(ej: Ejercicio): Ejercicio {
  switch (ej.type) {
    case "multiple_choice": {
      const correcta = ej.options[ej.correct_index]!;
      const options = mezclar(ej.options);
      return { ...ej, options, correct_index: options.indexOf(correcta) };
    }
    case "fill_blank":
      return { ...ej, options: mezclar(ej.options) };
    case "word_order": {
      // Que nunca aparezca ya ordenada.
      let words = mezclar(ej.words);
      for (let i = 0; i < 4 && words.join(" ") === ej.correct; i++) words = mezclar(ej.words);
      return { ...ej, words };
    }
    case "word_match":
      return ej;
  }
}

export function pasosLeccion(dia: DiaLeccion, conVocabulario = true): Paso[] {
  const vocab: Paso[] = conVocabulario
    ? dia.lesson.vocabulary.map((v, i) => ({
        tipo: "vocab",
        key: `v-${dia.day_id}-${i}`,
        vocab: v,
        n: i + 1,
        de: dia.lesson.vocabulary.length,
      }))
    : [];
  const ejercicios: Paso[] = dia.exercises.map((ej, i) => ({
    tipo: "ejercicio",
    key: `e-${dia.day_id}-${i}`,
    ref: `${dia.day_id}-${i}`,
    ej: barajar(ej),
  }));
  return [...vocab, ...ejercicios];
}

/** Test: N preguntas al azar de los días que repasa (sin mezclar materias). */
export function pasosTest(
  contenido: ContenidoTrack,
  diaTest: Extract<Dia, { day_type: "test" }>,
): Paso[] {
  const pool = contenido.days
    .filter(
      (d): d is DiaLeccion => d.day_type === "lesson" && diaTest.reviews_days.includes(d.day_id),
    )
    .flatMap((d) =>
      d.exercises.map((ej, i) => ({ ej, key: `t-${d.day_id}-${i}`, ref: `${d.day_id}-${i}` })),
    );
  return mezclar(pool)
    .slice(0, diaTest.total_questions)
    .map(({ ej, key, ref }) => ({ tipo: "ejercicio" as const, key, ref, ej: barajar(ej) }));
}

/* ---------------- Repaso inteligente del día ---------------- */

export const PREGUNTAS_REPASO = 5;

/**
 * Siempre hay tarea: con lo ya aprendido se eligen las preguntas que más
 * cuestan (más fallos), las que hace más tiempo no ve y algunas al azar
 * (repetición espaciada).
 */
export function pasosRepasoDiario(
  c: ContenidoTrack,
  t: ProgresoTrack,
  n = PREGUNTAS_REPASO,
  ahora = Date.now(),
): Paso[] {
  const pool = c.days
    .filter((d): d is DiaLeccion => d.day_type === "lesson" && t.completados.includes(d.day_id))
    .flatMap((d) => d.exercises.map((ej, i) => ({ ej, ref: `${d.day_id}-${i}` })));
  const conPuntaje = pool.map((x) => {
    const s = t.items[x.ref];
    const dias = s ? (ahora - s.u) / 86_400_000 : 0;
    const puntaje = s ? s.f * 3 - s.a + Math.min(dias, 14) / 2 : 4; // nunca vista: prioridad media
    return { ...x, puntaje: puntaje + Math.random() * 1.5 };
  });
  return mezclar(conPuntaje.sort((a, b) => b.puntaje - a.puntaje).slice(0, n)).map(
    ({ ej, ref }) => ({
      tipo: "ejercicio" as const,
      key: `r-${ref}`,
      ref,
      ej: barajar(ej),
    }),
  );
}

/** El "día" del repaso (número 0: no es un día del camino). */
export function diaRepaso(track: Track): DiaLeccion {
  return {
    day_id: 0,
    track,
    phase: 0,
    phase_name: "Repaso",
    day_type: "lesson",
    title: "Repaso del día",
    subtitle: "Lo que más te cuesta, para que no se olvide",
    snoopy_tip: "Snoopy dice: 'Repasar es el secreto de los campeones.'",
    xp_reward: 10,
    hearts_cost_per_error: 0,
    lesson: { vocabulary: [] },
    exercises: [],
  };
}

/* ---------------- Corrección ---------------- */

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ'\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function respuestaCorrecta(ej: Ejercicio): string {
  switch (ej.type) {
    case "multiple_choice":
      return ej.options[ej.correct_index] ?? "";
    case "fill_blank":
      return ej.correct;
    case "word_order":
      return ej.correct;
    case "word_match":
      return ej.pairs.map(([a, b]) => `${a} = ${b}`).join(" · ");
  }
}

export function esCorrecta(ej: Ejercicio, respuesta: string | number | string[]): boolean {
  switch (ej.type) {
    case "multiple_choice":
      return respuesta === ej.correct_index;
    case "fill_blank":
      return typeof respuesta === "string" && normalizar(respuesta) === normalizar(ej.correct);
    case "word_order":
      return Array.isArray(respuesta) && normalizar(respuesta.join(" ")) === normalizar(ej.correct);
    case "word_match":
      // Se corrige pareja por pareja en la pantalla; al terminar siempre está bien.
      return true;
  }
}

export { problemasDeContenido } from "./validar.ts";
