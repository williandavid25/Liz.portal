import { z } from "zod/v4";
import { problemasDeContenido } from "./validar.ts";
import type { Dia, DiaLeccion, DiaTest, Track } from "./tipos";

// Parte "pura" de la generación con IA: el esquema que debe cumplir la
// respuesta de Claude y el armado + revisión del módulo. Sin SDK ni base de
// datos, para poder probarla sin la API.

const PreguntaZ = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    question: z.string(),
    options: z.array(z.string()),
    correct_index: z.number().int(),
    explanation: z.string(),
  }),
  z.object({
    type: z.literal("fill_blank"),
    sentence: z.string(),
    correct: z.string(),
    options: z.array(z.string()),
    explanation: z.string(),
  }),
  z.object({
    type: z.literal("word_match"),
    pairs: z.array(z.object({ a: z.string(), b: z.string() })),
  }),
  z.object({
    type: z.literal("word_order"),
    words: z.array(z.string()),
    correct: z.string(),
    translation: z.string(),
  }),
]);

const LeccionZ = z.object({
  title: z.string(),
  subtitle: z.string(),
  snoopy_tip: z.string(),
  vocabulary: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      example_en: z.string(),
      example_es: z.string(),
    }),
  ),
  grammar_note: z.string(),
  exercises: z.array(PreguntaZ),
});

export const ModuloZ = z.object({
  titulo_modulo: z.string(),
  lecciones: z.array(LeccionZ),
});

export function fase(dia: number): { phase: number; phase_name: string } {
  if (dia <= 25) return { phase: 1, phase_name: "Fundamentos" };
  if (dia <= 50) return { phase: 2, phase_name: "Intermedio" };
  if (dia <= 75) return { phase: 3, phase_name: "Avanzado" };
  if (dia <= 100) return { phase: 4, phase_name: "Experto" };
  return { phase: 5, phase_name: "Modo 2.0" };
}

export type ModuloGenerado = z.infer<typeof ModuloZ>;

/** Convierte la respuesta en días de la app y la revisa. */
export function armarModulo(
  track: Track,
  desde: number,
  salida: ModuloGenerado,
): { dias: Dia[]; problemas: string[] } {
  const { phase, phase_name } = fase(desde);
  const lecciones: DiaLeccion[] = salida.lecciones.slice(0, 6).map((l, i) => ({
    day_id: desde + i,
    track,
    phase,
    phase_name,
    day_type: "lesson",
    title: l.title,
    subtitle: l.subtitle,
    snoopy_tip: l.snoopy_tip,
    xp_reward: 10,
    hearts_cost_per_error: 1,
    lesson: {
      vocabulary: l.vocabulary.map((v) => ({
        term: v.term,
        translation: v.translation,
        ...(v.example_en ? { example_en: v.example_en } : {}),
        ...(v.example_es ? { example_es: v.example_es } : {}),
      })),
      grammar_note: l.grammar_note,
    },
    exercises: l.exercises.map((e) => {
      if (e.type === "word_match")
        return { type: e.type, pairs: e.pairs.map((p) => [p.a, p.b] as [string, string]) };
      if (e.type === "word_order")
        return {
          type: e.type,
          words: e.words,
          correct: e.correct,
          ...(e.translation ? { translation: e.translation } : {}),
        };
      return e;
    }),
  }));
  const semana = Math.ceil((desde + 6) / 7);
  const test: DiaTest = {
    day_id: desde + 6,
    track,
    phase,
    phase_name,
    day_type: "test",
    title: `TEST ${semana} — Snoopy Challenge`,
    subtitle: `Repaso de la semana ${semana}`,
    snoopy_tip: "Snoopy dice: '¡Una pregunta a la vez, tú puedes!'",
    reviews_days: lecciones.map((l) => l.day_id),
    total_questions: 10,
    pass_score_pct: 70,
    reward_first_try: {
      xp: 50,
      badge: `${track === "english" ? "" : "Lab "}Week ${semana} Champion`,
      gems: 5,
    },
    reward_retry: { xp: 25, badge: null },
  };
  const dias: Dia[] = [...lecciones, test];

  const problemas =
    lecciones.length === 6
      ? problemasDeContenido({ track, nombre: "", days: dias })
      : ["no llegaron 6 lecciones"];
  return { dias, problemas };
}
