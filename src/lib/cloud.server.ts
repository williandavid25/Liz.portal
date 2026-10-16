import postgres from "postgres";
import type { CloudStore } from "./cloud";
import type { StickerEnNota } from "./stickers";

// Todo lo que toca Postgres y Supabase Storage vive aparte, en un archivo *.server.ts: así
// TanStack Start nunca lo mete en el bundle del navegador. Antes esto vivía
// junto con las funciones de servidor en cloud.ts y `postgres` (que usa
// `Buffer`, propio de Node) terminaba también en el JS del cliente,
// rompiendo la página entera con "Uncaught ReferenceError: Buffer is not
// defined" en cuanto cargaba.

const DEFAULT_SUPABASE_URL =
  "postgres://postgres.qgucscghlnjlikvvuxpe:O3wHDmlZdfLtkOCB@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qgucscghlnjlikvvuxpe.supabase.co";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFndWNzY2dobG5qbGlrdnZ1eHBlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTYxNTkzOCwiZXhwIjoyMTA1MTkxOTM4fQ.K5ETNSNu72ABwPLfER9Ff0a54RWCPnhRllrgGme6gYc";

function getDbUrl(): string {
  if (
    !process.env.POSTGRES_URL &&
    !process.env.POSTGRES_URL_NON_POOLING &&
    !process.env.POSTGRES_PRISMA_URL &&
    typeof process.loadEnvFile === "function"
  ) {
    try {
      process.loadEnvFile();
    } catch {
      /* sin archivo .env: se usan las variables del entorno */
    }
  }
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_POSTGRES_URL ||
    (process.env.POSTGRES_HOST && process.env.POSTGRES_PASSWORD
      ? `postgres://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:5432/${process.env.POSTGRES_DATABASE || "postgres"}?sslmode=require`
      : "") ||
    DEFAULT_SUPABASE_URL
  );
}

let sql: ReturnType<typeof postgres> | null = null;
// En Vercel la función se "congela" entre una petición y otra. La conexión
// abierta queda muerta del otro lado y la siguiente consulta esperaba para
// siempre (por eso las notas se quedaban "reintentando"). Dos defensas:
// 1. Si la conexión lleva un rato sin usarse, se descarta y se abre otra.
// 2. Ninguna consulta espera más de LIMITE_CONSULTA_MS: se corta, se cierra la
//    conexión y la siguiente usa una nueva.
const LIMITE_CONSULTA_MS = 7_000;
const CONEXION_VIEJA_MS = 8_000;
let ultimoUso = 0;
let sqlSeguro: ReturnType<typeof postgres> | null = null;

function conLimite(base: ReturnType<typeof postgres>): ReturnType<typeof postgres> {
  const limitar = <T>(q: PromiseLike<T> & { cancel?: () => void }): Promise<T> => {
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_, rechazar) => {
      reloj = setTimeout(() => {
        try {
          q.cancel?.();
        } catch {
          /* ya terminó */
        }
        if (sql === base) void resetDb();
        rechazar(new Error("La base de datos no respondió a tiempo."));
      }, LIMITE_CONSULTA_MS);
    });
    return Promise.race([Promise.resolve(q), limite]).finally(() => clearTimeout(reloj));
  };
  const envuelto = ((primero: unknown, ...resto: unknown[]) => {
    const r = (base as unknown as (...a: unknown[]) => unknown)(primero, ...resto);
    // Solo las consultas (plantillas `...`) llevan límite; `sql(ids)` o
    // `sql.json(x)` son fragmentos y pasan igual.
    const esConsulta = Array.isArray(primero) && "raw" in (primero as object);
    return esConsulta ? limitar(r as PromiseLike<unknown>) : r;
  }) as unknown as ReturnType<typeof postgres>;
  return Object.assign(envuelto, {
    json: base.json.bind(base),
    end: base.end.bind(base),
    unsafe: (...a: Parameters<typeof base.unsafe>) => limitar(base.unsafe(...a)),
  }) as ReturnType<typeof postgres>;
}

export function db() {
  const ahora = Date.now();
  if (sql && ahora - ultimoUso > CONEXION_VIEJA_MS) {
    // Probablemente estuvo congelada: no se reutiliza.
    const vieja = sql;
    sql = null;
    sqlSeguro = null;
    void vieja.end({ timeout: 0 }).catch(() => {});
  }
  ultimoUso = ahora;
  if (!sql || !sqlSeguro) {
    const url = getDbUrl();
    sql = postgres(url, {
      ssl: "require",
      max: 1,
      idle_timeout: 5,
      max_lifetime: 60,
      connect_timeout: 6,
      prepare: false, // Requerido para Supabase Transaction Pooler (puerto 6543)
    });
    sqlSeguro = conLimite(sql);
  }
  return sqlSeguro;
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db()`
    create table if not exists app_store (
      id int primary key default 1,
      data jsonb not null default '{}'::jsonb
    )
  `;
  tableReady = true;
}

// Las fotos que subes como archivo se guardan en Supabase Storage o en esta tabla
// de respaldo; se sirven de vuelta por /api/files/$id.
let filesTableReady = false;
async function ensureFilesTable() {
  if (filesTableReady) return;
  await db()`
    create table if not exists app_files (
      id text primary key,
      content_type text not null,
      data bytea not null,
      created_at timestamptz not null default now()
    )
  `;
  filesTableReady = true;
}

/**
 * Agrega una columna solo si falta. "alter table" bloquea la tabla aunque la
 * columna ya exista, y se ejecutaba en cada arranque del servidor.
 */
async function agregarColumna(tabla: string, columna: string, tipo: "text" | "bigint" | "jsonb") {
  const existe = await db()`
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = ${tabla} and column_name = ${columna}
  `;
  if (existe.length > 0) return;
  await db().unsafe(`alter table ${tabla} add column if not exists ${columna} ${tipo}`);
}

// Suscripciones de avisos (push): cada celular que acepta recibir avisos
// guarda aquí su "dirección" de notificaciones.
let subsTableReady = false;
async function ensureSubsTable() {
  if (subsTableReady) return;
  await db()`
    create table if not exists push_subs (
      endpoint text primary key,
      sub jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
  // Qué celular es cada suscripción: así un aviso no le llega a quien lo mandó.
  await agregarColumna("push_subs", "device", "text");
  subsTableReady = true;
}

// Notas de Snoopy: mensajes cortos de un celular al otro. Son temporales: se
// borran apenas la otra persona las lee y las cierra (y, por si nadie las abre,
// a los 7 días).
const NOTA_VIDA_MS = 7 * 24 * 60 * 60 * 1000;
let notasTableReady = false;
async function ensureNotasTable() {
  if (notasTableReady) return;
  await db()`
    create table if not exists notas_snoopy (
      id text primary key,
      de text not null,
      texto text not null,
      emoji text,
      created_at bigint not null
    )
  `;
  // Para que quien la envía sepa que llegó al otro celular y que se leyó.
  await agregarColumna("notas_snoopy", "entregada_at", "bigint");
  await agregarColumna("notas_snoopy", "leida_at", "bigint");
  await agregarColumna("notas_snoopy", "color", "text");
  await agregarColumna("notas_snoopy", "stickers", "jsonb");
  notasTableReady = true;
}
// Lo que queda de una nota leída (sin texto) se guarda un día para avisar.
const LEIDA_VIDA_MS = 24 * 60 * 60 * 1000;

export async function resetDb() {
  // Se suelta la conexión al instante: la siguiente consulta usa una nueva.
  const vieja = sql;
  sql = null;
  sqlSeguro = null;
  tableReady = false;
  filesTableReady = false;
  subsTableReady = false;
  notasTableReady = false;
  if (vieja) await vieja.end({ timeout: 0 }).catch(() => {});
}

/** Repite una vez con conexión nueva si la primera vez la base no respondió. */
export async function reintentar<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn("Reintentando con conexión nueva:", e instanceof Error ? e.message : e);
    await resetDb();
    return await fn();
  }
}

const EMPTY: CloudStore = { cartas: [], fotos: [], eventos: [] };

/** Lee el store desde Postgres. `configured` indica si la nube está activa. */
export async function readStore(): Promise<CloudStore & { configured: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureTable();
      const rows = await db()`select data from app_store where id = 1`;
      // Históricamente el JSON se guardó doblemente codificado (como texto
      // dentro del jsonb). Por eso las cartas y fotos "desaparecieron": se
      // leía una cadena en vez de un objeto. Aceptamos ambas formas.
      let raw: unknown = rows[0]?.data ?? {};
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          raw = {};
        }
      }
      const data = (raw ?? {}) as Partial<CloudStore>;
      return {
        ...data,
        cartas: data.cartas ?? [],
        fotos: data.fotos ?? [],
        eventos: data.eventos ?? [],
        musica: data.musica,
        configured: true,
      };
    } catch (err) {
      console.error(`Error reading store from Postgres (attempt ${attempt + 1}):`, err);
      await resetDb();
      if (attempt === 1) {
        return { ...EMPTY, configured: false };
      }
    }
  }
  return { ...EMPTY, configured: false };
}

export async function writeStore(store: CloudStore): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureTable();
      const sqlc = db();
      await sqlc`
        insert into app_store (id, data) values (1, ${sqlc.json(store as never)})
        on conflict (id) do update set data = excluded.data
      `;
      return;
    } catch (err) {
      console.error(`Error writing store to Postgres (attempt ${attempt + 1}):`, err);
      await resetDb();
      if (attempt === 1) throw err;
    }
  }
}

/**
 * Cambia solo una parte del store y conserva todo lo demás (cartas, fotos,
 * ajustes...). Si no se pudo leer la base, NO escribe: guardar encima de una
 * lectura fallida dejaría todo lo demás vacío. Devuelve el store anterior.
 */
export async function patchStore(patch: Partial<CloudStore>): Promise<CloudStore> {
  const { configured, ...prev } = await readStore();
  if (!configured) throw new Error("La nube no respondió; no se guarda para no perder datos.");
  await writeStore({ ...prev, ...patch });
  return prev;
}

export async function savePushSub(
  sub: { endpoint: string } & Record<string, unknown>,
  device?: string,
): Promise<void> {
  try {
    await ensureSubsTable();
    const sqlc = db();
    await sqlc`
      insert into push_subs (endpoint, sub, device)
      values (${sub.endpoint}, ${sqlc.json(sub as never)}, ${device ?? null})
      on conflict (endpoint) do update set sub = excluded.sub, device = excluded.device
    `;
  } catch (err) {
    console.error("Error saving push sub:", err);
    await resetDb();
  }
}

/** Suscripciones de avisos: sin el celular que envía, o solo las de un celular. */
export async function listPushSubs(
  opts: { exceptDevice?: string; onlyDevice?: string } = {},
): Promise<unknown[]> {
  try {
    await ensureSubsTable();
    const rows = opts.onlyDevice
      ? await db()`select sub from push_subs where device = ${opts.onlyDevice}`
      : opts.exceptDevice
        ? await db()`select sub from push_subs where device is distinct from ${opts.exceptDevice}`
        : await db()`select sub from push_subs`;
    return rows.map((r) => {
      const s = r.sub as unknown;
      return typeof s === "string" ? JSON.parse(s) : s;
    });
  } catch (err) {
    console.error("Error listing push subs:", err);
    await resetDb();
    return [];
  }
}

export async function deletePushSub(endpoint: string): Promise<void> {
  try {
    await ensureSubsTable();
    await db()`delete from push_subs where endpoint = ${endpoint}`;
  } catch (err) {
    console.error("Error deleting push sub:", err);
    await resetDb();
  }
}

export interface NotaRow {
  id: string;
  de: string;
  texto: string;
  emoji?: string;
  color?: string;
  stickers?: StickerEnNota[];
  createdAt: number;
}

export async function insertNota(nota: NotaRow): Promise<void> {
  await ensureNotasTable();
  const sqlc = db();
  await sqlc`
    insert into notas_snoopy (id, de, texto, emoji, color, stickers, created_at)
    values (${nota.id}, ${nota.de}, ${nota.texto}, ${nota.emoji ?? null}, ${nota.color ?? null},
      ${nota.stickers?.length ? sqlc.json(nota.stickers as never) : null}, ${nota.createdAt})
    on conflict (id) do nothing
  `;
}

/** Notas que le llegaron a este celular (las que mandó el otro), más viejas primero. */
export async function listNotasPara(device: string): Promise<NotaRow[]> {
  await ensureNotasTable();
  const ahora = Date.now();
  // Limpieza: las que nadie abrió en 7 días y las marcas de "leída" de ayer.
  await db()`
    delete from notas_snoopy
    where created_at < ${ahora - NOTA_VIDA_MS} or leida_at < ${ahora - LEIDA_VIDA_MS}
  `;
  const rows = await db()`
    select id, de, texto, emoji, color, stickers, created_at from notas_snoopy
    where de <> ${device} and leida_at is null
    order by created_at asc
    limit 20
  `;
  // Ya están en este celular: quedan como "entregadas".
  const ids = rows.map((r) => r.id as string);
  if (ids.length > 0) {
    const sqlc = db();
    await sqlc`
      update notas_snoopy set entregada_at = ${ahora}
      where id in ${sqlc(ids)} and entregada_at is null
    `;
  }
  return rows.map((r) => ({
    id: r.id as string,
    de: r.de as string,
    texto: r.texto as string,
    emoji: (r.emoji as string | null) ?? undefined,
    color: (r.color as string | null) ?? undefined,
    stickers: ((typeof r.stickers === "string" ? JSON.parse(r.stickers) : r.stickers) ??
      undefined) as StickerEnNota[] | undefined,
    createdAt: Number(r.created_at),
  }));
}

export interface NotaEnviadaRow {
  id: string;
  emoji?: string;
  createdAt: number;
  entregadaAt?: number;
  leidaAt?: number;
}

/** Estado de las notas que mandó este celular (sin el texto). */
export async function listNotasEnviadas(device: string): Promise<NotaEnviadaRow[]> {
  await ensureNotasTable();
  const rows = await db()`
    select id, emoji, created_at, entregada_at, leida_at from notas_snoopy
    where de = ${device} and leida_at is null
    order by created_at desc
    limit 20
  `;
  return rows.map((r) => ({
    id: r.id as string,
    emoji: (r.emoji as string | null) ?? undefined,
    createdAt: Number(r.created_at),
    entregadaAt: r.entregada_at == null ? undefined : Number(r.entregada_at),
    leidaAt: r.leida_at == null ? undefined : Number(r.leida_at),
  }));
}

/**
 * Nota leída y cerrada: se borra por completo de la base. Devuelve quién la
 * envió para avisarle con una notificación (sin guardar nada).
 */
export async function marcarNotasLeidas(
  ids: string[],
): Promise<Array<{ id: string; de: string; emoji?: string }>> {
  if (ids.length === 0) return [];
  await ensureNotasTable();
  const sqlc = db();
  // Leída y cerrada: se borra por completo, no queda ningún registro.
  const rows = await sqlc`
    delete from notas_snoopy
    where id in ${sqlc(ids)}
    returning id, de, emoji
  `;
  return rows.map((r) => ({
    id: r.id as string,
    de: r.de as string,
    emoji: (r.emoji as string | null) ?? undefined,
  }));
}

/**
 * Sube un archivo directamente a Supabase Storage (bucket 'fotos').
 * Devuelve la URL pública directa si tiene éxito, o null si falla.
 */
export async function uploadToSupabaseStorage(
  filename: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<string | null> {
  try {
    const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/fotos/${cleanName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) {
      console.warn("Supabase storage upload failed with status:", res.status);
      return null;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/fotos/${cleanName}`;
  } catch (err) {
    console.warn("Supabase storage upload error:", err);
    return null;
  }
}

export async function saveFileBytes(contentType: string, bytes: Uint8Array): Promise<string> {
  try {
    await ensureFilesTable();
    const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    await db()`
      insert into app_files (id, content_type, data)
      values (${id}, ${contentType}, ${bytes})
    `;
    return id;
  } catch (err) {
    console.error("Error saving file bytes to Postgres:", err);
    await resetDb();
    throw err;
  }
}

/** Usado por la ruta /api/files/$id para servir de vuelta una foto guardada en base de datos. */
export async function getFile(
  id: string,
): Promise<{ contentType: string; data: Uint8Array } | null> {
  try {
    await ensureFilesTable();
    const rows = await db()`select content_type, data from app_files where id = ${id}`;
    if (!rows.length) return null;
    return { contentType: rows[0].content_type as string, data: rows[0].data as Uint8Array };
  } catch (err) {
    console.error("Error getting file from Postgres:", err);
    await resetDb();
    return null;
  }
}
