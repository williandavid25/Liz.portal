import { db } from "./cloud.server";

// Respaldo en la nube de lo que cada celular guarda solo en el teléfono
// (Snoopy y Snoopy Learn), uno por persona. Si se reinstala la app o se borran
// los datos del navegador, se recupera desde aquí.

export type Dueno = "liz" | "david";
export type DatosRespaldo = Record<string, string>;

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await db()`
    create table if not exists respaldos (
      dueno text primary key,
      datos jsonb not null,
      actualizado bigint not null
    )
  `;
  tablaLista = true;
}

export async function leerRespaldo(
  dueno: Dueno,
): Promise<{ datos: DatosRespaldo; actualizado: number } | null> {
  await asegurarTabla();
  const [fila] = await db()`select datos, actualizado from respaldos where dueno = ${dueno}`;
  if (!fila) return null;
  const datos = typeof fila.datos === "string" ? JSON.parse(fila.datos) : fila.datos;
  return { datos: datos as DatosRespaldo, actualizado: Number(fila.actualizado) };
}

export async function guardarRespaldo(dueno: Dueno, datos: DatosRespaldo, actualizado: number) {
  await asegurarTabla();
  const sqlc = db();
  // Solo pisa el respaldo si lo que llega es más nuevo.
  await sqlc`
    insert into respaldos (dueno, datos, actualizado)
    values (${dueno}, ${sqlc.json(datos)}, ${actualizado})
    on conflict (dueno) do update
      set datos = excluded.datos, actualizado = excluded.actualizado
      where respaldos.actualizado <= excluded.actualizado
  `;
}
