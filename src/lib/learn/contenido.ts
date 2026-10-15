import type { ContenidoTrack, Dia, DiaLeccion, Ejercicio, Track, Vocabulario } from "./tipos";

// El contenido de cada materia vive en un JSON aparte (src/content/learn) y se
// descarga recién al abrir Snoopy Learn: la página de la mascota no carga más.
// Para sumar días (hasta 100) basta con agregarlos al JSON.

const cache = new Map<Track, Promise<ContenidoTrack>>();

export function cargarTrack(track: Track): Promise<ContenidoTrack> {
  let p = cache.get(track);
  if (!p) {
    p = (
      track === "english"
        ? import("@/content/learn/english.json")
        : import("@/content/learn/laboratory.json")
    ).then((m) => (m.default ?? m) as unknown as ContenidoTrack);
    p.catch(() => cache.delete(track));
    cache.set(track, p);
  }
  return p;
}

export const TOTAL_DIAS = 100;

/* ---------------- Pasos de una sesión (uno por pantalla) ---------------- */

export type Paso =
  | { tipo: "vocab"; key: string; vocab: Vocabulario; n: number; de: number }
  | { tipo: "ejercicio"; key: string; ej: Ejercicio; repaso?: boolean };

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
    .flatMap((d) => d.exercises.map((ej, i) => ({ ej, key: `t-${d.day_id}-${i}` })));
  return mezclar(pool)
    .slice(0, diaTest.total_questions)
    .map(({ ej, key }) => ({ tipo: "ejercicio" as const, key, ej: barajar(ej) }));
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

/* ---------------- Revisión del contenido (para pruebas) ---------------- */

export function problemasDeContenido(c: ContenidoTrack): string[] {
  const errores: string[] = [];
  const ids = new Set<number>();
  for (const d of c.days) {
    const donde = `${c.track} día ${d.day_id}`;
    if (ids.has(d.day_id)) errores.push(`${donde}: día repetido`);
    ids.add(d.day_id);
    if (d.track !== c.track) errores.push(`${donde}: mezcla materias (${d.track})`);
    if (d.day_type === "test") {
      const lecciones = c.days.filter(
        (x) => x.day_type === "lesson" && d.reviews_days.includes(x.day_id),
      );
      if (lecciones.length === 0) errores.push(`${donde}: el test no tiene días para repasar`);
      continue;
    }
    if (d.lesson.vocabulary.length === 0) errores.push(`${donde}: sin vocabulario`);
    d.exercises.forEach((ej, i) => {
      const e = `${donde} ejercicio ${i + 1}`;
      if (
        ej.type === "multiple_choice" &&
        !(ej.correct_index >= 0 && ej.correct_index < ej.options.length)
      )
        errores.push(`${e}: correct_index fuera de rango`);
      if (ej.type === "fill_blank") {
        if (!ej.sentence.includes("___")) errores.push(`${e}: falta ___ en la frase`);
        if (!ej.options.includes(ej.correct))
          errores.push(`${e}: la respuesta no está entre las opciones`);
      }
      if (ej.type === "word_order") {
        const a = [...ej.words].map(normalizar).sort().join("|");
        const b = ej.correct.split(" ").map(normalizar).sort().join("|");
        if (a !== b) errores.push(`${e}: las palabras no forman la respuesta`);
      }
      if (ej.type === "word_match" && ej.pairs.length < 2) errores.push(`${e}: pocas parejas`);
    });
  }
  return errores;
}
