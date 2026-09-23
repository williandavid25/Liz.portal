import postgres from "postgres";
import type { CloudStore } from "./cloud";

// Todo lo que toca Postgres vive aparte, en un archivo *.server.ts: así
// TanStack Start nunca lo mete en el bundle del navegador. Antes esto vivía
// junto con las funciones de servidor en cloud.ts y `postgres` (que usa
// `Buffer`, propio de Node) terminaba también en el JS del cliente,
// rompiendo la página entera con "Uncaught ReferenceError: Buffer is not
// defined" en cuanto cargaba.

function getDbUrl(): string | undefined {
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
    process.env.POSTGRES_PRISMA_URL
  );
}

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    const url = getDbUrl();
    if (!url) throw new Error("No hay POSTGRES_URL configurada");
    sql = postgres(url, { ssl: "require", max: 1 });
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

// Las fotos que subes como archivo (ya comprimidas a menos de ~1MB antes de
// llegar aquí) se guardan directo en esta tabla mientras Vercel Blob siga
// bloqueado; se sirven de vuelta por /api/files/$id.
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

const EMPTY: CloudStore = { cartas: [], fotos: [], eventos: [] };

/** Lee el store desde Postgres. `configured` indica si la nube está activa. */
export async function readStore(): Promise<CloudStore & { configured: boolean }> {
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
      cartas: data.cartas ?? [],
      fotos: data.fotos ?? [],
      eventos: data.eventos ?? [],
      musica: data.musica,
      configured: true,
    };
  } catch (err) {
    console.error("Error reading store from Postgres:", err);
    return { ...EMPTY, configured: false };
  }
}

export async function writeStore(store: CloudStore): Promise<void> {
  await ensureTable();
  const sqlc = db();
  await sqlc`
    insert into app_store (id, data) values (1, ${sqlc.json(store as never)})
    on conflict (id) do update set data = excluded.data
  `;
}

export async function savePushSub(sub: { endpoint: string }): Promise<void> {
  await ensureSubsTable();
  const sqlc = db();
  await sqlc`
    insert into push_subs (endpoint, sub) values (${sub.endpoint}, ${sqlc.json(sub as never)})
    on conflict (endpoint) do update set sub = excluded.sub
  `;
}

export async function listPushSubs(): Promise<unknown[]> {
  await ensureSubsTable();
  const rows = await db()`select sub from push_subs`;
  return rows.map((r) => {
    const s = r.sub as unknown;
    return typeof s === "string" ? JSON.parse(s) : s;
  });
}

export async function deletePushSub(endpoint: string): Promise<void> {
  await ensureSubsTable();
  await db()`delete from push_subs where endpoint = ${endpoint}`;
}


export async function saveFileBytes(contentType: string, bytes: Uint8Array): Promise<string> {
  await ensureFilesTable();
  const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  await db()`
    insert into app_files (id, content_type, data)
    values (${id}, ${contentType}, ${bytes})
  `;
  return id;
}

/** Usado por la ruta /api/files/$id para servir de vuelta una foto guardada. */
export async function getFile(id: string): Promise<{ contentType: string; data: Uint8Array } | null> {
  await ensureFilesTable();
  const rows = await db()`select content_type, data from app_files where id = ${id}`;
  if (!rows.length) return null;
  return { contentType: rows[0].content_type as string, data: rows[0].data as Uint8Array };
}
