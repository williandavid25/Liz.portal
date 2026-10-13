import { db } from "./cloud.server";

// Todo lo necesario para que los avisos lleguen con la app CERRADA:
//
// 1. Claves VAPID: si no están en las variables del proyecto, se generan una
//    sola vez y se guardan en la base (antes faltaban y ningún celular llegaba
//    a suscribirse, por eso nunca sonaba nada con la app cerrada).
// 2. Estado de Snoopy en el servidor: cada celular sube sus barras y el
//    servidor calcula cómo van bajando, igual que la app.
// 3. Un reloj en la base (pg_cron de Supabase) llama cada 5 minutos a
//    /api/avisos-tick, que manda los avisos de Snoopy que correspondan.

/* ---------------- Configuración guardada en la base ---------------- */

let configReady = false;
async function ensureConfigTable() {
  if (configReady) return;
  await db()`
    create table if not exists app_config (
      key text primary key,
      value text not null
    )
  `;
  configReady = true;
}

export async function getConfig(key: string): Promise<string | null> {
  await ensureConfigTable();
  const rows = await db()`select value from app_config where key = ${key}`;
  return (rows[0]?.value as string | undefined) ?? null;
}

async function setConfig(key: string, value: string) {
  await ensureConfigTable();
  await db()`
    insert into app_config (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value
  `;
}

/** Guarda solo si no existe; devuelve el valor que quedó (evita carreras). */
async function setConfigOnce(key: string, value: string): Promise<string> {
  await ensureConfigTable();
  await db()`insert into app_config (key, value) values (${key}, ${value}) on conflict (key) do nothing`;
  return (await getConfig(key)) ?? value;
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/* ---------------- Claves VAPID ---------------- */

export interface VapidKeys {
  publicKey: string;
  privateKey: string; // "d" del JWK (base64url)
}

let vapidCache: VapidKeys | null = null;

export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (vapidCache) return vapidCache;
  const envPublic = process.env["VAPID_PUBLIC_KEY"];
  const envPrivate = process.env["VAPID_PRIVATE_JWK"];
  if (envPublic && envPrivate) {
    try {
      const d = (JSON.parse(envPrivate) as { d?: string }).d;
      if (d) return (vapidCache = { publicKey: envPublic, privateKey: d });
    } catch {
      /* clave del entorno mal escrita: se usa la de la base */
    }
  }
  try {
    const saved = await getConfig("vapid");
    if (saved) return (vapidCache = JSON.parse(saved) as VapidKeys);
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    if (!jwk.d) throw new Error("La clave privada generada no trae 'd'.");
    const nuevo = JSON.stringify({ publicKey, privateKey: jwk.d } satisfies VapidKeys);
    return (vapidCache = JSON.parse(await setConfigOnce("vapid", nuevo)) as VapidKeys);
  } catch (e) {
    console.error("No se pudieron preparar las claves de avisos:", e);
    return null;
  }
}

/* ---------------- Estado de Snoopy por celular ---------------- */

type StatKey = "hambre" | "felicidad" | "higiene" | "energia";
type Stats = Record<StatKey, number>;

export interface EstadoMascota {
  device: string;
  nombre: string;
  stats: Stats;
  statUpdatedAt: Record<StatKey, number>;
  dormido: boolean;
  avisos: boolean;
  /** Minutos de Date#getTimezoneOffset() del celular (para las horas de comida). */
  tz: number;
}

let mascotaReady = false;
async function ensureMascotaTable() {
  if (mascotaReady) return;
  await db()`
    create table if not exists mascota_estado (
      device text primary key,
      estado jsonb not null,
      alertas jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;
  mascotaReady = true;
}

export async function guardarEstado(e: EstadoMascota) {
  await ensureMascotaTable();
  const sqlc = db();
  await sqlc`
    insert into mascota_estado (device, estado, updated_at)
    values (${e.device}, ${sqlc.json(e as never)}, now())
    on conflict (device) do update set estado = excluded.estado, updated_at = now()
  `;
}

// Mismas reglas que MascotaGame.tsx.
const STAT_TICK_MS = 30_000;
const DECAY: Stats = { hambre: 1, felicidad: 2, higiene: 1, energia: 2 };
const UMBRAL_AVISO = 50;
const PAUSA_AVISO_MS = 4 * 60 * 60_000;
const COMIDAS = [
  { hora: 8, nombre: "desayuno" },
  { hora: 13, nombre: "almuerzo" },
  { hora: 19, nombre: "merienda" },
] as const;
const FRASES: Partial<Record<StatKey, string>> = {
  hambre: "Tengo hambre… 🍖",
  higiene: "Necesito un baño… 🛁",
  energia: "Tengo mucho sueño… 😴",
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function statsAhora(e: EstadoMascota, ahora: number): Stats {
  const out = { ...e.stats };
  for (const k of Object.keys(DECAY) as StatKey[]) {
    const ticks = Math.floor(Math.max(0, ahora - (e.statUpdatedAt[k] ?? ahora)) / STAT_TICK_MS);
    out[k] = clamp(e.dormido && k === "energia" ? out[k] + ticks : out[k] - ticks * DECAY[k]);
  }
  return out;
}

/** Revisa cada Snoopy y manda los avisos que tocan. Lo llama el reloj cada 5 min. */
export async function revisarAvisos(): Promise<{ revisados: number; enviados: number }> {
  await ensureMascotaTable();
  const { sendPushToAll } = await import("./push.server");
  const rows = await db()`select device, estado, alertas from mascota_estado`;
  const ahora = Date.now();
  let enviados = 0;

  for (const row of rows) {
    const e = row.estado as EstadoMascota;
    if (!e?.avisos) continue;
    const alertas = { ...(row.alertas as Record<string, number | string>) };
    const stats = statsAhora(e, ahora);
    const textos: string[] = [];

    for (const k of ["hambre", "higiene", "energia"] as const) {
      if (k === "energia" && e.dormido) continue;
      if (stats[k] >= UMBRAL_AVISO) continue;
      if (ahora - Number(alertas[k] ?? 0) < PAUSA_AVISO_MS) continue;
      alertas[k] = ahora;
      textos.push(FRASES[k]!);
    }

    // Hora local del celular para el desayuno, almuerzo y merienda.
    const local = new Date(ahora - (e.tz ?? 0) * 60_000);
    const comida = COMIDAS.find((c) => c.hora === local.getUTCHours());
    if (comida) {
      const clave = `${local.toISOString().slice(0, 10)}-${comida.hora}`;
      if (alertas.comida !== clave) {
        alertas.comida = clave;
        textos.unshift(`Es hora del ${comida.nombre}. Tengo hambre 🍖`);
      }
    }

    if (textos.length === 0) continue;
    const { sent } = await sendPushToAll(
      {
        title: `${e.nombre || "Snoopy"} te necesita 🐶`,
        body: textos.join(" · "),
        url: "/mascota",
        tag: "mascota",
      },
      { onlyDevice: e.device },
    ).catch(() => ({ sent: 0 }));
    enviados += sent;
    await db()`update mascota_estado set alertas = ${db().json(alertas as never)} where device = ${e.device}`;
  }
  await setConfig("tick_ultimo", new Date(ahora).toISOString()).catch(() => {});
  return { revisados: rows.length, enviados };
}

/* ---------------- Reloj (pg_cron) ---------------- */

export async function tickToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return setConfigOnce("tick_token", b64url(bytes.buffer as ArrayBuffer));
}

/**
 * Programa (una vez por dominio) la llamada cada 5 minutos a /api/avisos-tick.
 * El dominio sale del propio sitio publicado; en local o en vistas previas no
 * se toca nada.
 */
export async function asegurarReloj(origenPeticion: string): Promise<boolean> {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  let origen: URL;
  try {
    origen = new URL(prod ? `https://${prod}` : origenPeticion);
  } catch {
    return false;
  }
  const host = origen.hostname;
  if (
    origen.protocol !== "https:" ||
    host === "localhost" ||
    /^(127\.|10\.|192\.168\.)/.test(host) ||
    host.includes("preview") ||
    host.endsWith("lovableproject.com")
  ) {
    return false;
  }
  const url = `${origen.origin}/api/avisos-tick`;
  if ((await getConfig("tick_url")) === url) return true;

  const token = await tickToken();
  const sqlc = db();
  try {
    await sqlc`create extension if not exists pg_net`;
    await sqlc`create extension if not exists pg_cron`;
    await sqlc`select cron.unschedule(jobid) from cron.job where jobname = 'liz-avisos'`;
    const headers = JSON.stringify({ "Content-Type": "application/json", "x-liz-tick": token });
    await sqlc`
      select cron.schedule(
        'liz-avisos',
        '*/5 * * * *',
        format(
          'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 25000)',
          ${url}::text, ${headers}::text, '{}'::text
        )
      )
    `;
    await setConfig("tick_url", url);
    console.log("Reloj de avisos programado:", url);
    return true;
  } catch (e) {
    console.error("No se pudo programar el reloj de avisos (pg_cron):", e);
    return false;
  }
}
