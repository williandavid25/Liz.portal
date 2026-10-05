import { createServerFn } from "@tanstack/react-start";

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
  return { key: process.env["VAPID_PUBLIC_KEY"] ?? null };
});

/** Guarda la "dirección" de avisos de este celular. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .validator((sub: { endpoint: string }) => sub)
  .handler(async ({ data }) => {
    try {
      const { savePushSub } = await import("./cloud.server");
      await savePushSub(data);
      return { ok: true };
    } catch (e) {
      console.error("No se pudo guardar la suscripción de avisos:", e);
      return { ok: false };
    }
  });

/** Guarda la lista de cartas (conserva fotos, eventos y música existentes). */
export const saveCartas = createServerFn({ method: "POST" })
  .validator((cartas: SavedLetter[]) => cartas)
  .handler(async ({ data }) => {
    const { patchStore } = await import("./cloud.server");
    try {
      const { cartas: previas } = await patchStore({ cartas: data });
      // Aviso al otro celular solo por cartas realmente nuevas.
      const antes = new Set(previas.map((c) => c.id));
      const nuevas = data.filter((c) => !antes.has(c.id));
      if (nuevas.length > 0) {
        const { sendPushToAll } = await import("./push.server");
        const carta = nuevas[nuevas.length - 1]!;
        await sendPushToAll({
          title: "💌 Nueva carta para ti",
          body: carta.title || "Alguien te escribió una carta",
          url: `/bienvenida?open=${carta.id}`,
          tag: carta.id,
        });
      }
      return { ok: true };
    } catch (e) {
      console.error("No se pudieron guardar las cartas:", e);
      return { ok: false };
    }
  });


/** Guarda la lista de fotos (conserva cartas, eventos y música existentes). */
export const saveFotos = createServerFn({ method: "POST" })
  .validator((fotos: PhotoMeta[]) => fotos)
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
  .validator((eventos: CalendarEvent[]) => eventos)
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
  .validator((musica: string) => musica)
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
  .validator((ajustes: Ajustes) => ajustes)
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
      const storageUrl = await uploadToSupabaseStorage(
        filename,
        file.type || "image/jpeg",
        bytes,
      );
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
      const storageUrl = await uploadToSupabaseStorage(
        filename,
        file.type || "audio/mpeg",
        bytes,
      );
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
