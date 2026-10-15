import type { ContenidoTrack } from "./tipos";

// Revisión del contenido (sin dependencias: se usa en la app, en las pruebas
// y en el servidor antes de guardar módulos generados).

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ'\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
