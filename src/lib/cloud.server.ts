import postgres from "postgres";
import type { CloudStore } from "./cloud";

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
    } catch {}
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
function db() {
  if (!sql) {
    const url = getDbUrl();
    sql = postgres(url, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // Requerido para Supabase Transaction Pooler (puerto 6543)
    });
  }
  return sql;
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
  subsTableReady = true;
}

async function resetDb() {
  if (sql) {
    try {
      await sql.end({ timeout: 1 }).catch(() => {});
    } catch {}
  }
  sql = null;
  tableReady = false;
  filesTableReady = false;
  subsTableReady = false;
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

export async function savePushSub(sub: { endpoint: string }): Promise<void> {
  try {
    await ensureSubsTable();
    const sqlc = db();
    await sqlc`
      insert into push_subs (endpoint, sub) values (${sub.endpoint}, ${sqlc.json(sub as never)})
      on conflict (endpoint) do update set sub = excluded.sub
    `;
  } catch (err) {
    console.error("Error saving push sub:", err);
    await resetDb();
  }
}

export async function listPushSubs(): Promise<unknown[]> {
  try {
    await ensureSubsTable();
    const rows = await db()`select sub from push_subs`;
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

/**
 * Sube un archivo directamente a Supabase Storage (bucket 'fotos').
 * Devuelve la URL pública directa si tiene éxito, o null si falla.
 */
export async function uploadToSupabaseStorage(
  filename: string,
  contentType: string,
  bytes: Uint8Array
): Promise<string | null> {
  try {
    const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/fotos/${cleanName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: bytes as unknown as BodyInit,
      }
    );
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
export async function getFile(id: string): Promise<{ contentType: string; data: Uint8Array } | null> {
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
