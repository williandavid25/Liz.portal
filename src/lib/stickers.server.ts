import { db } from "./cloud.server";
import type { Sticker } from "./stickers";

// Colección de stickers compartida por los dos celulares. Las imágenes viven
// en Supabase Storage (o en la tabla de archivos de respaldo); aquí solo se
// guarda la lista.

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await db()`
    create table if not exists stickers (
      id text primary key,
      url text not null,
      creado timestamptz not null default now()
    )
  `;
  tablaLista = true;
}

export async function listarStickers(): Promise<Sticker[]> {
  await asegurarTabla();
  const rows = await db()`select id, url from stickers order by creado desc limit 300`;
  return rows.map((r) => ({ id: r.id as string, url: r.url as string }));
}

export async function guardarSticker(s: Sticker): Promise<void> {
  await asegurarTabla();
  await db()`insert into stickers (id, url) values (${s.id}, ${s.url}) on conflict (id) do nothing`;
}

export async function borrarSticker(id: string): Promise<boolean> {
  await asegurarTabla();
  const rows = await db()`delete from stickers where id = ${id} returning id`;
  return rows.length > 0;
}
