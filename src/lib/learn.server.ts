import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "./cloud.server";
import { ModuloZ, armarModulo, fase } from "./learn/armar";
import type { ContenidoTrack, Dia, DiaLeccion, Track } from "./learn/tipos";
import english from "../content/learn/english.json";
import englishM2 from "../content/learn/english-m2.json";
import laboratory from "../content/learn/laboratory.json";
import laboratoryM2 from "../content/learn/laboratory-m2.json";

// Snoopy Learn en la nube: módulos nuevos que llegan sin publicar la app.
// - Generación automática (opción B): cuando a alguien le quedan menos de 7
//   días por delante, Claude escribe una semana nueva (6 lecciones + test).
//   Pasa la misma revisión automática que el contenido escrito a mano y queda
//   PENDIENTE hasta que alguien la aprueba dentro de la app.
// - Los módulos escritos a mano (opción A) viajan dentro de la app.

const MODULOS_APP: Record<Track, ContenidoTrack[]> = {
  english: [english, englishM2] as unknown as ContenidoTrack[],
  laboratory: [laboratory, laboratoryM2] as unknown as ContenidoTrack[],
};
const DIAS_POR_DELANTE = 7;
const MODELO = "claude-opus-5-5";

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await db()`
    create table if not exists learn_modulos (
      id text primary key,
      track text not null,
      desde int not null,
      hasta int not null,
      titulo text not null,
      estado text not null,
      fuente text not null,
      dias jsonb not null,
      creado timestamptz not null default now()
    )
  `;
  tablaLista = true;
}

export interface ModuloNube {
  id: string;
  track: Track;
  desde: number;
  hasta: number;
  titulo: string;
  estado: "pendiente" | "publicado";
  fuente: string;
  dias: Dia[];
  creado: string;
}

function fila(r: Record<string, unknown>): ModuloNube {
  const dias = typeof r.dias === "string" ? JSON.parse(r.dias) : r.dias;
  return {
    id: r.id as string,
    track: r.track as Track,
    desde: Number(r.desde),
    hasta: Number(r.hasta),
    titulo: r.titulo as string,
    estado: r.estado as ModuloNube["estado"],
    fuente: r.fuente as string,
    dias: dias as Dia[],
    creado: new Date(r.creado as string).toISOString(),
  };
}

/** Días publicados en la nube para una materia (se suman a los de la app). */
export async function diasPublicados(track: Track): Promise<Dia[]> {
  await asegurarTabla();
  const rows = await db()`
    select * from learn_modulos where track = ${track} and estado = 'publicado' order by desde
  `;
  return rows.flatMap((r) => fila(r).dias);
}

export async function modulosPendientes(): Promise<ModuloNube[]> {
  await asegurarTabla();
  const rows = await db()`select * from learn_modulos where estado = 'pendiente' order by creado`;
  return rows.map(fila);
}

export async function revisarModulo(id: string, accion: "aprobar" | "descartar"): Promise<boolean> {
  await asegurarTabla();
  const rows =
    accion === "aprobar"
      ? await db()`update learn_modulos set estado = 'publicado' where id = ${id} and estado = 'pendiente' returning id`
      : await db()`delete from learn_modulos where id = ${id} and estado = 'pendiente' returning id`;
  return rows.length > 0;
}

export const generadorActivo = () => !!process.env.ANTHROPIC_API_KEY;

/* ---------------- Generación con Claude ---------------- */

const GUIA: Record<Track, string> = {
  english: `Materia: INGLÉS para una hispanohablante de Ecuador que trabaja en el área de la salud / laboratorio clínico.
- Las preguntas y explicaciones van en español; lo que está en inglés dentro de una pregunta en español va entre comillas simples ('Good morning').
- vocabulary: term en inglés, translation en español, example_en en inglés y example_es en español.
- fill_blank: la frase (sentence) en inglés con ___ donde va la respuesta.
- word_order: words son las palabras en inglés desordenadas que forman exactamente "correct"; translation es la frase en español.
- Del día 50 en adelante, incluye cada vez más inglés clínico y de laboratorio (muestras, resultados, conversación con pacientes).`,
  laboratory: `Materia: LABORATORIO CLÍNICO, en español, para una persona que trabaja o estudia en laboratorio clínico en Ecuador.
- Exactitud ante todo: usa solo datos estándar y verificables (CLSI, OMS, manuales de laboratorio clínico). Si das rangos de referencia, aclara en grammar_note que varían según el laboratorio. No inventes datos ni des indicaciones de tratamiento.
- vocabulary: term es el concepto, translation es su explicación corta en español; example_en y example_es pueden ir vacíos ("").
- word_order: words son las palabras en español desordenadas que forman exactamente "correct"; translation puede ir vacío ("").
- Temas sugeridos según el avance: hematología, química clínica, inmunología, microbiología, parasitología, uroanálisis, coagulación, banco de sangre, control de calidad, bioseguridad, gestión de muestras, casos clínicos sencillos.`,
};

const REGLAS = `Reglas de formato (obligatorias, la app las revisa):
- Exactamente 6 lecciones. Cada lección: 4 vocabulary y exactamente 5 exercises, en este orden de tipos: multiple_choice, fill_blank, multiple_choice, word_match, word_order.
- multiple_choice: exactamente 4 options sin repetir; correct_index de 0 a 3; explanation breve.
- fill_blank: sentence contiene ___ una sola vez; exactamente 3 options; correct es exactamente una de las options.
- word_match: exactamente 4 parejas {a, b} cortas, sin repetir.
- word_order: 3 a 7 palabras; al unirlas con espacios forman exactamente "correct" (sin signos de puntuación).
- Una sola respuesta correcta posible en cada pregunta. Frases cortas, para leer en un celular.
- snoopy_tip empieza con "Snoopy dice:" y es una frase breve y tierna.
- Temas nuevos: no repitas ninguno de los títulos que ya existen.`;

/** Escribe una semana nueva con Claude y la deja pendiente de aprobación. */
export async function generarModulo(track: Track): Promise<{ ok: boolean; detalle: string }> {
  if (!generadorActivo()) return { ok: false, detalle: "Falta ANTHROPIC_API_KEY" };
  await asegurarTabla();

  const existentes = await todosLosDias(track);
  const ultimo = Math.max(0, ...existentes.map((d) => d.day_id));
  const desde = ultimo + 1;
  const titulos = existentes.map((d) => `${d.day_id}. ${d.title}`).join("\n");
  const ejemplo = existentes.find((d): d is DiaLeccion => d.day_type === "lesson");
  const { phase, phase_name } = fase(desde);

  const client = new Anthropic();
  // Si el modelo rechaza la solicitud, el servidor reintenta solo en otro
  // modelo (respaldo automático, fallbacks "default").
  const respuesta = await client.beta.messages.parse({
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "high", format: zodOutputFormat(ModuloZ) },
    system:
      "Eres una profesora experta que escribe lecciones cortas para Snoopy Learn, una app de micro-lecciones (una pregunta por pantalla). Escribes contenido correcto, claro y motivador.",
    messages: [
      {
        role: "user",
        content: `${GUIA[track]}

Escribe la semana que va del día ${desde} al ${desde + 5} (fase ${phase}: ${phase_name}). El día ${desde + 6} será un test automático con estas lecciones.

${REGLAS}

Títulos que ya existen (no los repitas):
${titulos}

Ejemplo de una lección existente, como referencia de estilo y nivel:
${JSON.stringify(ejemplo ?? {}, null, 1)}`,
      },
    ],
  });

  if (respuesta.stop_reason === "refusal")
    return { ok: false, detalle: "El modelo rechazó la solicitud" };
  const salida = respuesta.parsed_output;
  if (!salida)
    return { ok: false, detalle: `Respuesta sin JSON válido (${respuesta.stop_reason})` };

  const { dias, problemas } = armarModulo(track, desde, salida);
  if (problemas.length > 0) {
    console.error("Módulo generado descartado:", problemas);
    return { ok: false, detalle: `No pasó la revisión: ${problemas.slice(0, 3).join("; ")}` };
  }

  const id = `${track}-${desde}-${Date.now()}`;
  const sqlc = db();
  await sqlc`
    insert into learn_modulos (id, track, desde, hasta, titulo, estado, fuente, dias)
    values (${id}, ${track}, ${desde}, ${desde + 6}, ${salida.titulo_modulo}, 'pendiente', 'ia', ${sqlc.json(dias as never)})
  `;
  return { ok: true, detalle: `Módulo ${id} (días ${desde}-${desde + 6}) listo para revisar` };
}

async function todosLosDias(track: Track): Promise<Dia[]> {
  const app = MODULOS_APP[track].flatMap((m) => m.days);
  const rows = await db()`select dias from learn_modulos where track = ${track}`;
  const nube = rows.flatMap(
    (r) => (typeof r.dias === "string" ? JSON.parse(r.dias) : r.dias) as Dia[],
  );
  return [...app, ...nube].sort((a, b) => a.day_id - b.day_id);
}

/**
 * Lo llama el reloj una vez al día: si a alguien le quedan menos de 7 días por
 * delante en una materia y no hay nada esperando aprobación, genera una semana.
 */
export async function generarSiHaceFalta(): Promise<string[]> {
  if (!generadorActivo()) return ["Generación apagada: falta ANTHROPIC_API_KEY"];
  await asegurarTabla();
  const informe: string[] = [];
  const estados = await db()`select estado from mascota_estado`.catch(() => []);
  for (const track of ["english", "laboratory"] as const) {
    const pendientes =
      await db()`select 1 from learn_modulos where track = ${track} and estado = 'pendiente'`;
    if (pendientes.length > 0) {
      informe.push(`${track}: hay un módulo esperando aprobación`);
      continue;
    }
    const total = Math.max(0, ...(await todosLosDias(track)).map((d) => d.day_id));
    const avance = Math.max(
      1,
      ...estados.map((r) => {
        const e = (typeof r.estado === "string" ? JSON.parse(r.estado) : r.estado) as {
          aprender?: { dias?: Partial<Record<Track, number>> };
        };
        return Number(e?.aprender?.dias?.[track] ?? 1);
      }),
    );
    if (total - avance >= DIAS_POR_DELANTE) {
      informe.push(`${track}: hay ${total - avance + 1} días por delante, no hace falta`);
      continue;
    }
    try {
      const r = await generarModulo(track);
      informe.push(`${track}: ${r.detalle}`);
    } catch (e) {
      console.error("No se pudo generar el módulo:", e);
      informe.push(
        `${track}: error al generar (${e instanceof Error ? e.message : "desconocido"})`,
      );
    }
  }
  return informe;
}
