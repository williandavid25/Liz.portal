import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Dia } from "./learn/tipos";
import { IDS_COLOR } from "./colores-nota";
import {
  GROSOR_MAX,
  GROSOR_MIN,
  MAX_PUNTOS,
  MAX_TRAZOS,
  PATRON_TINTA,
  puntosDe,
  type Trazo,
} from "./dibujo";
import {
  ANCHO_MAX,
  ANCHO_MIN,
  MAX_BYTES_STICKER,
  MAX_STICKERS_NOTA,
  type Sticker,
  type StickerEnNota,
} from "./stickers";

// Almacenamiento en la nube:
// - Cartas, fotos (metadatos), eventos y música: una sola fila en Postgres
//   (Supabase), como un documento JSON. Se eligió Postgres para esto porque
//   la tienda de Vercel Blob que se usaba antes agotó su límite mensual de
//   "operaciones avanzadas" (listados) del plan gratuito y quedó bloqueada
//   hasta que se reinicie o se pague un plan superior; Postgres no tiene ese
//   límite para este uso tan liviano.
// - Las imágenes/audio que subes como archivo siguen yendo a Vercel Blob
//   (`fotos/...`, `musica/...`): si esa tienda sigue bloqueada, subir un
//   archivo nuevo falla igual, pero pegar un link (foto o música) no depende
//   de eso.
//
// La implementación real de Postgres vive en cloud.server.ts (nunca se
// importa fuera de un .handler de createServerFn), para que ese código —y la
// librería `postgres`, que usa cosas propias de Node como `Buffer`— nunca
// termine en el JS que baja al navegador.

export interface SavedLetter {
  id: string;
  title: string;
  text: string;
  date: string;
  format?: string; // id del formato de papel elegido (ver LETTER_FORMATS en bienvenida.tsx)
  createdAt?: number; // cuándo se creó (para notificar de cartas nuevas)
  updatedAt?: number; // cuándo se guardó por última vez (nueva o editada)
}
export interface PhotoMeta {
  id: string;
  url: string; // imagen a mostrar (miniatura o foto)
  date: number;
  link?: string; // si existe, al tocar abre este enlace (ej. álbum de Google Fotos)
}
// "once": fecha exacta (YYYY-MM-DD) · "monthly": se repite cada mes en el día indicado (1-31)
// "yearly": se repite cada año en el mes y día indicados (MM-DD)
export interface CalendarEvent {
  id: string;
  title: string;
  type: "once" | "monthly" | "yearly";
  date: string;
  note?: string;
  special?: boolean;
  createdAt: number;
}
// Ajustes del inicio: qué portada se proyecta y qué secciones se muestran.
export interface Ajustes {
  portada: string; // id de la plantilla (ver src/lib/portadas.ts)
  portadaUrl?: string; // video propio cuando portada === "personalizada"
  mostrarGalaxia: boolean;
  mostrarOceano: boolean;
}
export interface CloudStore {
  cartas: SavedLetter[];
  fotos: PhotoMeta[];
  eventos: CalendarEvent[];
  musica?: string; // única canción de fondo elegida ahora mismo (opcional); subir una nueva reemplaza esta
  ajustes?: Ajustes;
}

const letterSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(300),
  text: z.string().max(100_000),
  date: z.string().max(100),
  format: z.string().max(100).optional(),
  createdAt: z.number().finite().optional(),
  updatedAt: z.number().finite().optional(),
});
const photoSchema = z.object({
  id: z.string().min(1).max(200),
  url: z.string().url().or(z.string().startsWith("/")),
  date: z.number().finite(),
  link: z.string().url().optional(),
});
const eventSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  type: z.enum(["once", "monthly", "yearly"]),
  date: z.string().max(30),
  note: z.string().max(2_000).optional(),
  special: z.boolean().optional(),
  createdAt: z.number().finite(),
});
const ajustesSchema = z.object({
  portada: z.string().min(1).max(100),
  portadaUrl: z.string().url().optional(),
  mostrarGalaxia: z.boolean(),
  mostrarOceano: z.boolean(),
});
const musicSchema = z.string().trim().max(2_000);

/** Carga cartas + fotos desde la nube. */
export const loadStore = createServerFn({ method: "GET" }).handler(async () => {
  const { readStore } = await import("./cloud.server");
  return await readStore();
});

type LoadedStore = Awaited<ReturnType<typeof loadStore>>;
let sharedLoad: { at: number; p: Promise<LoadedStore> } | null = null;

/**
 * Igual que loadStore, pero si varias partes de la página la piden casi al
 * mismo tiempo (menú, campanita, la página abierta) se hace una sola consulta
 * a la base en vez de tres.
 */
export function loadStoreShared(maxAgeMs = 4000): Promise<LoadedStore> {
  const now = Date.now();
  if (sharedLoad && now - sharedLoad.at < maxAgeMs) return sharedLoad.p;
  const p = loadStore();
  sharedLoad = { at: now, p };
  p.catch(() => {
    if (sharedLoad?.p === p) sharedLoad = null;
  });
  return p;
}

/**
 * Lee la miniatura de vista previa (og:image) de un enlace (ej. álbum de Google
 * Fotos). Se hace en el servidor para evitar el bloqueo CORS del navegador.
 */
export const resolvePreview = createServerFn({ method: "POST" })
  .validator((url: string) => url)
  .handler(async ({ data }) => {
    try {
      const res = await fetch(data, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });
      const html = await res.text();
      const pick = (prop: string) =>
        html.match(
          new RegExp(
            `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
            "i",
          ),
        )?.[1] ||
        html.match(
          new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
            "i",
          ),
        )?.[1] ||
        null;
      return { thumbnail: pick("og:image"), title: pick("og:title") };
    } catch {
      return { thumbnail: null as string | null, title: null as string | null };
    }
  });

/** Clave pública para que el navegador pueda suscribirse a los avisos. */
export const getPushKey = createServerFn({ method: "GET" }).handler(async () => {
  const { getVapidKeys } = await import("./avisos.server");
  return { key: (await getVapidKeys())?.publicKey ?? null };
});

const deviceSchema = z.string().min(8).max(100);

const statsSchema = z.object({
  hambre: z.number().finite(),
  felicidad: z.number().finite(),
  higiene: z.number().finite(),
  energia: z.number().finite(),
});

/** Sube el estado de Snoopy de este celular para avisar con la app cerrada. */
export const guardarEstadoMascota = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        device: deviceSchema,
        nombre: z.string().max(40),
        stats: statsSchema,
        statUpdatedAt: statsSchema,
        dormido: z.boolean(),
        avisos: z.boolean(),
        tz: z.number().int().min(-900).max(900),
        aprender: z
          .object({
            racha: z.number().int().min(0).max(10_000),
            ultimoDia: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable(),
            empezado: z.boolean(),
            // Día al que llegó en cada materia (para generar contenido a tiempo).
            dias: z
              .object({ english: z.number().int().min(1), laboratory: z.number().int().min(1) })
              .optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { guardarEstado } = await import("./avisos.server");
      await guardarEstado(data);
      return { ok: true };
    } catch (e) {
      console.error("No se pudo guardar el estado de la mascota:", e);
      return { ok: false };
    }
  });

/**
 * Deja listo el envío de avisos con la app cerrada: claves y el reloj que
 * revisa a Snoopy cada 5 minutos (se programa solo, desde el sitio publicado).
 */
export const prepararAvisos = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    const { asegurarReloj, getVapidKeys } = await import("./avisos.server");
    const claves = await getVapidKeys();
    const reloj = await asegurarReloj(getRequestUrl({ xForwardedHost: true }).origin);
    return { ok: !!claves, reloj };
  } catch (e) {
    console.error("No se pudieron preparar los avisos:", e);
    return { ok: false, reloj: false };
  }
});

/**
 * Ubicación aproximada (por la conexión) para el clima cuando el celular no da
 * la ubicación exacta. En Vercel viene en las cabeceras; si no, se consulta
 * un servicio gratuito por IP.
 */
export const ubicacionAproximada = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
    const lat = Number(getRequestHeader("x-vercel-ip-latitude"));
    const lon = Number(getRequestHeader("x-vercel-ip-longitude"));
    const ciudad = getRequestHeader("x-vercel-ip-city");
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
      return {
        latitude: lat,
        longitude: lon,
        label: ciudad ? decodeURIComponent(ciudad) : "Tu zona",
      };
    }
    const ip = getRequestIP({ xForwardedFor: true });
    const privada =
      !ip || /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fe80|::ffff:127)/.test(ip);
    const res = await fetch(`https://ipwho.is/${privada ? "" : encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(4000),
    });
    const j = (await res.json()) as {
      success?: boolean;
      latitude?: number;
      longitude?: number;
      city?: string;
    };
    if (j.success && typeof j.latitude === "number" && typeof j.longitude === "number") {
      return { latitude: j.latitude, longitude: j.longitude, label: j.city || "Tu zona" };
    }
  } catch (e) {
    console.warn("No se pudo estimar la ubicación:", e);
  }
  return null;
});

// La suscripción completa: sin `keys` el servidor no puede cifrar el aviso.
// (Antes el esquema solo pedía `endpoint` y zod descartaba las claves, así que
// los avisos reales nunca llegaban.)
const pushSubSchema = z.object({
  endpoint: z.string().url().max(2_000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
});

/** Guarda la "dirección" de avisos de este celular. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .validator((input: { sub: unknown; device?: string }) =>
    z.object({ sub: pushSubSchema, device: deviceSchema.optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { savePushSub } = await import("./cloud.server");
      await savePushSub(
        { ...data.sub, expirationTime: data.sub.expirationTime ?? null },
        data.device,
      );
      return { ok: true };
    } catch (e) {
      console.error("No se pudo guardar la suscripción de avisos:", e);
      return { ok: false };
    }
  });

/* ---------------- Snoopy Learn: módulos en la nube ---------------- */

/* ---------------- Respaldo de cada celular (Snoopy y Learn) ---------------- */

const duenoSchema = z.enum(["liz", "david"]);
const datosRespaldoSchema = z
  .record(z.string().max(60), z.string().max(300_000))
  .refine((d) => Object.keys(d).length <= 10, "Demasiadas claves");

/** Lee el respaldo de una persona (null si todavía no hay). */
export const leerRespaldoFn = createServerFn({ method: "GET" })
  .validator((dueno: "liz" | "david") => duenoSchema.parse(dueno))
  .handler(async ({ data }) => {
    try {
      const { leerRespaldo } = await import("./respaldos.server");
      const { reintentar } = await import("./cloud.server");
      return { ok: true, respaldo: await reintentar(() => leerRespaldo(data)) };
    } catch (e) {
      console.error("No se pudo leer el respaldo:", e);
      return { ok: false, respaldo: null };
    }
  });

export const guardarRespaldoFn = createServerFn({ method: "POST" })
  .validator(
    (input: { dueno: "liz" | "david"; datos: Record<string, string>; actualizado: number }) =>
      z
        .object({
          dueno: duenoSchema,
          datos: datosRespaldoSchema,
          actualizado: z.number().int().min(0),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { guardarRespaldo } = await import("./respaldos.server");
      const { reintentar } = await import("./cloud.server");
      await reintentar(() => guardarRespaldo(data.dueno, data.datos, data.actualizado));
      return { ok: true };
    } catch (e) {
      console.error("No se pudo guardar el respaldo:", e);
      return { ok: false };
    }
  });

const trackSchema = z.enum(["english", "laboratory"]);

/** Días publicados en la nube para una materia (se suman a los de la app). */
export const modulosLearn = createServerFn({ method: "GET" })
  .validator((track: "english" | "laboratory") => trackSchema.parse(track))
  .handler(async ({ data }) => {
    try {
      const { diasPublicados } = await import("./learn.server");
      const { reintentar } = await import("./cloud.server");
      return { ok: true, dias: (await reintentar(() => diasPublicados(data))) as Dia[] };
    } catch (e) {
      console.error("No se pudieron leer los módulos:", e);
      return { ok: false, dias: [] as Dia[] };
    }
  });

/** Módulos nuevos esperando aprobación (y si la generación automática está activa). */
export const pendientesLearn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { modulosPendientes, generadorActivo } = await import("./learn.server");
    return { ok: true, activo: await generadorActivo(), modulos: await modulosPendientes() };
  } catch (e) {
    console.error("No se pudieron leer los módulos pendientes:", e);
    return { ok: false, activo: false, modulos: [] };
  }
});

export const revisarModuloLearn = createServerFn({ method: "POST" })
  .validator((input: { id: string; accion: "aprobar" | "descartar" }) =>
    z
      .object({ id: z.string().min(1).max(120), accion: z.enum(["aprobar", "descartar"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { revisarModulo } = await import("./learn.server");
      return { ok: await revisarModulo(data.id, data.accion) };
    } catch (e) {
      console.error("No se pudo revisar el módulo:", e);
      return { ok: false };
    }
  });

/** Guarda la clave gratis de Google Gemini para que la IA escriba lecciones. */
export const claveIaLearn = createServerFn({ method: "POST" })
  .validator((clave: string) => z.string().trim().min(20).max(200).parse(clave))
  .handler(async ({ data }) => {
    try {
      const { guardarClaveGemini } = await import("./learn.server");
      return await guardarClaveGemini(data);
    } catch (e) {
      console.error("No se pudo guardar la clave de la IA:", e);
      return { ok: false, detalle: "No se pudo guardar" };
    }
  });

/* ---------------- Stickers de las notitas ---------------- */

/** Colección de stickers (la misma en los dos celulares). */
export const listarStickersFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { listarStickers } = await import("./stickers.server");
    const { reintentar } = await import("./cloud.server");
    return { ok: true, stickers: await reintentar(() => listarStickers()) };
  } catch (e) {
    console.error("No se pudieron leer los stickers:", e);
    return { ok: false, stickers: [] as Sticker[] };
  }
});

/** Sube una imagen y la agrega a la colección (conserva la transparencia). */
export const agregarStickerFn = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (
      !(file instanceof File) ||
      !file.type.startsWith("image/") ||
      file.size > MAX_BYTES_STICKER
    ) {
      return { ok: false, sticker: null as Sticker | null };
    }
    try {
      const { uploadToSupabaseStorage, saveFileBytes } = await import("./cloud.server");
      const { guardarSticker } = await import("./stickers.server");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext =
        file.type
          .split("/")[1]
          ?.replace("jpeg", "jpg")
          .replace(/[^a-z0-9]/g, "") || "png";
      const id = `sticker-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const url =
        (await uploadToSupabaseStorage(`${id}.${ext}`, file.type, bytes)) ??
        `/api/files/${await saveFileBytes(file.type, bytes)}`;
      const sticker = { id, url };
      await guardarSticker(sticker);
      return { ok: true, sticker: sticker as Sticker | null };
    } catch (e) {
      console.error("No se pudo agregar el sticker:", e);
      return { ok: false, sticker: null as Sticker | null };
    }
  });

export const borrarStickerFn = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().min(1).max(120).parse(id))
  .handler(async ({ data }) => {
    try {
      const { borrarSticker } = await import("./stickers.server");
      return { ok: await borrarSticker(data) };
    } catch (e) {
      console.error("No se pudo borrar el sticker:", e);
      return { ok: false };
    }
  });

/* ---------------- Notas de Snoopy (temporales) ---------------- */

export interface NotaSnoopy {
  id: string;
  de: string;
  texto: string;
  emoji?: string;
  /** Color del post-it (ver src/lib/colores-nota.ts). */
  color?: string;
  /** Stickers pegados en la nota (posición relativa al post-it). */
  stickers?: StickerEnNota[];
  /** Firma o dibujo a mano (posición relativa a la cara del cuadro). */
  trazos?: Trazo[];
  /** Color de las letras (#rrggbb; sin él, negro). */
  tinta?: string;
  createdAt: number;
}

export const NOTA_MAX = 500;

/** Lo que ve quien envía: si la nota llegó al otro celular y si ya se leyó. */
export interface NotaEnviada {
  id: string;
  emoji?: string;
  createdAt: number;
  entregadaAt?: number;
  leidaAt?: number;
  /** Solo en el celular que la escribió: todavía va en camino al servidor. */
  pendiente?: "enviando" | "error";
}

/** Snoopy lleva una nota al otro celular (y le manda un aviso). */
export const enviarNota = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id?: string;
      de: string;
      texto: string;
      emoji?: string;
      color?: string;
      stickers?: StickerEnNota[];
      trazos?: Trazo[];
      tinta?: string;
    }) =>
      z
        .object({
          // Lo crea el celular: si un reintento llega dos veces, no se duplica.
          id: z
            .string()
            .regex(/^[A-Za-z0-9-]{6,80}$/)
            .optional(),
          de: deviceSchema,
          texto: z.string().trim().max(NOTA_MAX),
          emoji: z.string().max(16).optional(),
          color: z.enum(IDS_COLOR).optional(),
          stickers: z
            .array(
              z.object({
                // Solo imágenes de la colección (Supabase o archivos propios).
                u: z
                  .string()
                  .max(500)
                  .refine(
                    (u) =>
                      u.startsWith("/api/files/") ||
                      /^https:\/\/[a-z0-9.-]+\.supabase\.co\//.test(u),
                  ),
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                w: z.number().min(ANCHO_MIN).max(ANCHO_MAX),
                r: z.number().min(-720).max(720),
              }),
            )
            .max(MAX_STICKERS_NOTA)
            .optional(),
          trazos: z
            .array(
              z.object({
                g: z.number().min(GROSOR_MIN).max(GROSOR_MAX),
                p: z
                  .array(z.number().int().min(0).max(1000))
                  .min(2)
                  .max(MAX_PUNTOS * 2)
                  .refine((p) => p.length % 2 === 0),
                c: z.string().regex(PATRON_TINTA).optional(),
              }),
            )
            .max(MAX_TRAZOS)
            .refine((t) => puntosDe(t) <= MAX_PUNTOS)
            .optional(),
          tinta: z.string().regex(PATRON_TINTA).optional(),
        })
        .refine(
          (n) => n.texto.length > 0 || (n.stickers?.length ?? 0) > 0 || (n.trazos?.length ?? 0) > 0,
          "Nota vacía",
        )
        .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { insertNota, reintentar } = await import("./cloud.server");
      const nota: NotaSnoopy = {
        id: data.id ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        de: data.de,
        texto: data.texto,
        emoji: data.emoji,
        color: data.color,
        stickers: data.stickers,
        trazos: data.trazos,
        tinta: data.tinta,
        createdAt: Date.now(),
      };
      await reintentar(() => insertNota(nota));
      // El contenido no va en el aviso: se lee solo dentro de la app, y luego se borra.
      const { sendPushToAll } = await import("./push.server");
      const { sent } = await sendPushToAll(
        {
          title: "🐶 Snoopy te trae una nota",
          body: "Ábrela y léela antes de que se borre 💌",
          url: `/mascota?nota=${nota.id}`,
          tag: `nota-${nota.id}`,
        },
        { exceptDevice: data.de },
      ).catch(() => ({ sent: 0 }));
      return { ok: true, avisos: sent };
    } catch (e) {
      console.error("No se pudo enviar la nota:", e);
      return { ok: false, avisos: 0 };
    }
  });

/** Notas recibidas sin leer y el estado de las que este celular envió. */
export const listarNotas = createServerFn({ method: "GET" })
  .validator((device: string) => deviceSchema.parse(device))
  .handler(async ({ data }) => {
    try {
      const { listNotasPara, listNotasEnviadas, reintentar } = await import("./cloud.server");
      // En serie: con una sola conexión, en paralelo solo se haría cola.
      const notas = await reintentar(() => listNotasPara(data));
      const enviadas = await reintentar(() => listNotasEnviadas(data));
      return { ok: true, notas: notas as NotaSnoopy[], enviadas: enviadas as NotaEnviada[] };
    } catch (e) {
      console.error("No se pudieron leer las notas:", e);
      return { ok: false, notas: [] as NotaSnoopy[], enviadas: [] as NotaEnviada[] };
    }
  });

/**
 * Notas leídas y cerradas: se borra su texto para siempre y se le avisa a
 * quien la mandó (aunque tenga la app cerrada).
 */
export const borrarNotas = createServerFn({ method: "POST" })
  .validator((ids: string[]) => z.array(z.string().min(1).max(200)).max(50).parse(ids))
  .handler(async ({ data }) => {
    try {
      const { marcarNotasLeidas, reintentar } = await import("./cloud.server");
      const leidas = await reintentar(() => marcarNotasLeidas(data));
      if (leidas.length > 0) {
        const { sendPushToAll } = await import("./push.server");
        await Promise.all(
          leidas.map((n) =>
            sendPushToAll(
              {
                title: "💜 Leyó tu nota",
                body: "Snoopy entregó tu nota y ya la leyeron.",
                url: "/mascota",
                tag: `leida-${n.id}`,
              },
              { onlyDevice: n.de },
            ).catch(() => ({ sent: 0 })),
          ),
        );
      }
      return { ok: true };
    } catch (e) {
      console.error("No se pudieron borrar las notas:", e);
      return { ok: false };
    }
  });

/**
 * Guarda la lista de cartas (conserva fotos, eventos y música existentes).
 * Acepta la lista sola o `{ cartas, de }` para no avisarle a quien la escribió.
 */
export const saveCartas = createServerFn({ method: "POST" })
  .validator((input: SavedLetter[] | { cartas: SavedLetter[]; de?: string }) => {
    const cartas = z.array(letterSchema).max(500);
    const parsed = Array.isArray(input)
      ? { cartas: cartas.parse(input) }
      : z.object({ cartas, de: deviceSchema.optional() }).parse(input);
    return parsed as { cartas: SavedLetter[]; de?: string };
  })
  .handler(async ({ data: { cartas: data, de } }) => {
    const { patchStore } = await import("./cloud.server");
    try {
      const { cartas: previas } = await patchStore({ cartas: data });
      // Aviso al otro celular solo por cartas realmente nuevas.
      const antes = new Set(previas.map((c) => c.id));
      const nuevas = data.filter((c) => !antes.has(c.id));
      if (nuevas.length > 0) {
        const { sendPushToAll } = await import("./push.server");
        const carta = nuevas[nuevas.length - 1]!;
        await sendPushToAll(
          {
            title: "💌 Nueva carta para ti",
            body: carta.title || "Alguien te escribió una carta",
            url: `/bienvenida?open=${carta.id}`,
            tag: carta.id,
          },
          { exceptDevice: de },
        ).catch((e) => console.error("No se pudo avisar de la carta nueva:", e));
      }
      return { ok: true };
    } catch (e) {
      console.error("No se pudieron guardar las cartas:", e);
      return { ok: false };
    }
  });

/** Guarda la lista de fotos (conserva cartas, eventos y música existentes). */
export const saveFotos = createServerFn({ method: "POST" })
  .validator((fotos: PhotoMeta[]) => z.array(photoSchema).max(500).parse(fotos) as PhotoMeta[])
  .handler(async ({ data }) => {
    const { patchStore } = await import("./cloud.server");
    try {
      await patchStore({ fotos: data });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** Guarda la lista de fechas importantes (conserva cartas, fotos y música existentes). */
export const saveEventos = createServerFn({ method: "POST" })
  .validator(
    (eventos: CalendarEvent[]) => z.array(eventSchema).max(500).parse(eventos) as CalendarEvent[],
  )
  .handler(async ({ data }) => {
    const { patchStore } = await import("./cloud.server");
    try {
      await patchStore({ eventos: data });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** Guarda la única canción de fondo actual (reemplaza la anterior; conserva todo lo demás). */
export const saveMusica = createServerFn({ method: "POST" })
  .validator((musica: string) => musicSchema.parse(musica))
  .handler(async ({ data }) => {
    const { patchStore } = await import("./cloud.server");
    try {
      await patchStore({ musica: data });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** Guarda los ajustes del inicio (portada y secciones visibles). */
export const saveAjustes = createServerFn({ method: "POST" })
  .validator((ajustes: Ajustes) => ajustesSchema.parse(ajustes) as Ajustes)
  .handler(async ({ data }) => {
    const { patchStore } = await import("./cloud.server");
    try {
      await patchStore({ ajustes: data });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** Sube una imagen a la nube y devuelve su URL pública (o null si falla). */
export const uploadImage = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (!(file instanceof File)) return { url: null as string | null };
    try {
      const { uploadToSupabaseStorage, saveFileBytes } = await import("./cloud.server");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = (file.name || "foto.jpg").split(".").pop() || "jpg";
      const filename = `foto-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

      // 1. Intentar primero en Supabase Storage (rápido y con CDN público)
      const storageUrl = await uploadToSupabaseStorage(filename, file.type || "image/jpeg", bytes);
      if (storageUrl) return { url: storageUrl };

      // 2. Respaldo: guardar en tabla app_files de Postgres
      const id = await saveFileBytes(file.type || "image/jpeg", bytes);
      return { url: `/api/files/${id}` as string | null };
    } catch (e) {
      console.error("No se pudo guardar la foto:", e);
      return { url: null as string | null };
    }
  });

/** Sube un archivo de audio a la nube y devuelve su URL pública (o null si falla). */
export const uploadAudio = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (!(file instanceof File)) return { url: null as string | null };
    try {
      const { uploadToSupabaseStorage, saveFileBytes } = await import("./cloud.server");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = (file.name || "audio.mp3").split(".").pop() || "mp3";
      const filename = `audio-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

      // 1. Intentar primero en Supabase Storage (soporta hasta 50MB)
      const storageUrl = await uploadToSupabaseStorage(filename, file.type || "audio/mpeg", bytes);
      if (storageUrl) return { url: storageUrl };

      // 2. Respaldo: guardar en tabla app_files de Postgres
      const id = await saveFileBytes(file.type || "audio/mpeg", bytes);
      return { url: `/api/files/${id}` as string | null };
    } catch (e) {
      console.error("No se pudo guardar el audio:", e);
      return { url: null as string | null };
    }
  });

// La música se sube directo del navegador a Vercel Blob (ver
// src/routes/api/blob-upload.ts), no por una función de servidor: un archivo
// de varios MB pasando entero por el servidor fallaba o se colgaba.

// --- Sincronización pendiente (para poder guardar sin conexión) ---
// Si guardar en la nube falla (sin internet, o la nube caída un momento), el
// cambio ya quedó en el espejo local (localStorage) pero no llegó a la nube.
// Se anota aquí para reintentarlo solo, en cuanto vuelva la conexión.
const PENDING_KEY = "birthday-pending-sync";

interface PendingSync {
  cartas?: SavedLetter[];
  fotos?: PhotoMeta[];
  eventos?: CalendarEvent[];
  musica?: string;
  ajustes?: Ajustes;
}

function readPending(): PendingSync {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePending(next: PendingSync) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(next));
}

export function queuePendingCartas(cartas: SavedLetter[]) {
  writePending({ ...readPending(), cartas });
}
export function queuePendingFotos(fotos: PhotoMeta[]) {
  writePending({ ...readPending(), fotos });
}
export function queuePendingEventos(eventos: CalendarEvent[]) {
  writePending({ ...readPending(), eventos });
}
export function queuePendingMusica(musica: string) {
  writePending({ ...readPending(), musica });
}
export function queuePendingAjustes(ajustes: Ajustes) {
  writePending({ ...readPending(), ajustes });
}

/** Reintenta subir a la nube lo que quedó pendiente por falta de conexión. */
export async function flushPendingSync(): Promise<void> {
  const pending = readPending();
  if (pending.cartas) {
    const r = await saveCartas({ data: pending.cartas }).catch(() => ({ ok: false }));
    if (r.ok) delete pending.cartas;
  }
  if (pending.fotos) {
    const r = await saveFotos({ data: pending.fotos }).catch(() => ({ ok: false }));
    if (r.ok) delete pending.fotos;
  }
  if (pending.eventos) {
    const r = await saveEventos({ data: pending.eventos }).catch(() => ({ ok: false }));
    if (r.ok) delete pending.eventos;
  }
  if (pending.musica !== undefined) {
    const r = await saveMusica({ data: pending.musica }).catch(() => ({ ok: false }));
    if (r.ok) delete pending.musica;
  }
  if (pending.ajustes) {
    const r = await saveAjustes({ data: pending.ajustes }).catch(() => ({ ok: false }));
    if (r.ok) delete pending.ajustes;
  }
  writePending(pending);
}
