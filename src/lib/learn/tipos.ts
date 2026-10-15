// Snoopy Learn: tipos del contenido (siguen la estructura de day_lesson.json /
// day_test.json) y del progreso guardado en cada celular.

export type Track = "english" | "laboratory";

export interface Vocabulario {
  term: string;
  translation: string;
  audio_key?: string;
  example_en?: string;
  example_es?: string;
}

export type Ejercicio =
  | {
      type: "multiple_choice";
      question: string;
      options: string[];
      correct_index: number;
      explanation?: string;
    }
  | {
      type: "fill_blank";
      sentence: string; // con ___ donde va la respuesta
      correct: string;
      options: string[]; // se elige tocando (escribir en el celular frustra)
      hint?: string;
      explanation?: string;
    }
  | {
      type: "word_match";
      pairs: [string, string][];
    }
  | {
      type: "word_order";
      words: string[];
      correct: string;
      translation?: string;
    };

interface DiaBase {
  day_id: number;
  track: Track;
  phase: number;
  phase_name: string;
  title: string;
  subtitle?: string;
  snoopy_tip?: string;
}

export interface DiaLeccion extends DiaBase {
  day_type: "lesson";
  xp_reward: number;
  hearts_cost_per_error: number;
  lesson: {
    vocabulary: Vocabulario[];
    grammar_note?: string;
    culture_note?: string;
  };
  exercises: Ejercicio[];
}

export interface DiaTest extends DiaBase {
  day_type: "test";
  reviews_days: number[];
  total_questions: number;
  pass_score_pct: number;
  reward_first_try: { xp: number; badge: string | null; gems: number };
  reward_retry: { xp: number; badge: string | null; gems?: number };
}

export type Dia = DiaLeccion | DiaTest;

export interface ContenidoTrack {
  track: Track;
  nombre: string;
  /** Lengua en la que se pronuncian los términos (lector de voz). */
  voz?: string;
  days: Dia[];
}

/* ---------------- Progreso (se guarda en el celular) ---------------- */

export interface ProgresoTrack {
  /** Próximo día a hacer (1..100). */
  dia: number;
  completados: number[];
  /** Tests ya aprobados (para dar el premio "primer intento" una sola vez). */
  testsAprobados: number[];
  testsIntentados: number[];
  racha: number;
  mejorRacha: number;
  /** Último día (fecha local YYYY-MM-DD) en que completó una lección. */
  ultimoDia: string | null;
  corazones: number;
  /** Momento desde el que se cuentan las recargas de corazones. */
  corazonesDesde: number;
  escudos: number;
  xp: number;
  /** Metas de racha ya premiadas (7, 14, 30, 50, 100…). */
  metas: number[];
  /**
   * Cómo le va con cada pregunta (clave = "día-índice"): aciertos, fallos y
   * última vez que la vio. Con esto se arma el repaso inteligente del día.
   */
  items: Record<string, { a: number; f: number; u: number }>;
  /** Último día (fecha local) en que hizo el repaso del día. */
  ultimoRepaso: string | null;
}

export interface EstadoLearn {
  version: 1;
  gemas: number;
  insignias: string[];
  tracks: Record<Track, ProgresoTrack>;
}

export interface Premio {
  xp: number;
  gemas: number;
  insignias: string[];
  corazonExtra: boolean;
  rachaAntes: number;
  rachaDespues: number;
  metaAlcanzada: number | null;
  aprobado: boolean;
}
