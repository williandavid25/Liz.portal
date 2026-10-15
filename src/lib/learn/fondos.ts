import type { Track } from "./tipos";

// Fondos de Snoopy Learn: AVIF (más liviano) con respaldo WebP, en tres
// tamaños. Se precargan en segundo plano mientras se está en la página de la
// mascota, así al tocar "Aprender" ya están listos.

export const ANCHOS_FONDO = [828, 1242, 1656] as const;
const VERSION = "v2"; // cambiar si se reemplazan las fotos (se cachean por un año)

export const ARCHIVO_FONDO: Record<Track, string> = {
  english: "ingles",
  laboratory: "laboratorio",
};

export function srcsetFondo(track: Track, formato: "avif" | "webp"): string {
  const base = `/learn/fondos/${ARCHIVO_FONDO[track]}-${VERSION}`;
  return ANCHOS_FONDO.map((w) => `${base}-${w}.${formato} ${w}w`).join(", ");
}

export const srcFondo = (track: Track, formato: "avif" | "webp") =>
  `/learn/fondos/${ARCHIVO_FONDO[track]}-${VERSION}-1242.${formato}`;

// ¿El celular entiende AVIF? (una imagen AVIF diminuta de prueba)
const AVIF_PRUEBA =
  "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAHQAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAYQENBpMhAYAAAAQACwE1ZkMYAETh8g";
let soportaAvif: Promise<boolean> | null = null;
export function avifDisponible(): Promise<boolean> {
  if (!soportaAvif) {
    soportaAvif = new Promise((ok) => {
      if (typeof Image === "undefined") return ok(false);
      const img = new Image();
      img.onload = () => ok(img.width > 0);
      img.onerror = () => ok(false);
      img.src = AVIF_PRUEBA;
    });
  }
  return soportaAvif;
}

const precargados = new Set<string>();

/** Descarga y decodifica el fondo de una materia (la versión justa para la pantalla). */
export async function precargarFondo(track: Track): Promise<void> {
  if (typeof Image === "undefined") return;
  const formato = (await avifDisponible()) ? "avif" : "webp";
  const clave = `${track}-${formato}`;
  if (precargados.has(clave)) return;
  precargados.add(clave);
  const img = new Image();
  img.decoding = "async";
  // Mismo srcset y sizes que el <picture> de la pantalla: el navegador elige
  // exactamente el mismo archivo y luego lo toma de la caché.
  img.sizes = "100vw";
  img.srcset = srcsetFondo(track, formato);
  img.src = srcFondo(track, formato);
  try {
    await img.decode();
  } catch {
    /* sin conexión: se intentará al abrir */
    precargados.delete(clave);
  }
}

/** La materia que se abrió la última vez primero, después la otra. */
export async function precargarFondos(): Promise<void> {
  let primera: Track = "english";
  try {
    if (localStorage.getItem("snoopy-learn-track") === "laboratory") primera = "laboratory";
  } catch {
    /* ignorar */
  }
  await precargarFondo(primera);
  await precargarFondo(primera === "english" ? "laboratory" : "english");
}
