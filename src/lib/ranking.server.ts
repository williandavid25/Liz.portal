import { db } from "./cloud.server";
import type { AvanceRanking, FilaRanking } from "./learn/ranking";

// Ranking de Snoopy Learn: cada celular que se une guarda aquí su nombre, su
// foto y un resumen de su avance (XP, día, racha) en cada materia. Es aparte
// del progreso real, que sigue viviendo en el celular.

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await db()`
    create table if not exists learn_ranking (
      device text primary key,
      nombre text not null,
      foto text,
      avance jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  tablaLista = true;
}

export async function guardarEnRanking(p: {
  device: string;
  nombre: string;
  foto: string | null;
  avance: AvanceRanking;
}): Promise<void> {
  await asegurarTabla();
  const sqlc = db();
  await sqlc`
    insert into learn_ranking (device, nombre, foto, avance, updated_at)
    values (${p.device}, ${p.nombre}, ${p.foto}, ${sqlc.json(p.avance as never)}, now())
    on conflict (device) do update set
      nombre = excluded.nombre, foto = excluded.foto, avance = excluded.avance, updated_at = now()
  `;
}

/** Todos los participantes; `esTu` marca al celular que pregunta (sin exponer ids). */
export async function leerRanking(device: string): Promise<FilaRanking[]> {
  await asegurarTabla();
  const rows = await db()`
    select device, nombre, foto, avance, updated_at from learn_ranking
    order by updated_at desc limit 50
  `;
  return rows.map((r) => ({
    nombre: r.nombre as string,
    foto: (r.foto as string | null) ?? null,
    avance: (typeof r.avance === "string" ? JSON.parse(r.avance) : r.avance) as AvanceRanking,
    actualizado: new Date(r.updated_at as string).getTime(),
    esTu: r.device === device,
  }));
}

export async function salirDelRanking(device: string): Promise<void> {
  await asegurarTabla();
  await db()`delete from learn_ranking where device = ${device}`;
}
