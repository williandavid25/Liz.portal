// Quién usa este celular. Cada persona se registra escribiendo su nombre; con
// ese nombre se guarda en la nube su respaldo de Snoopy y Snoopy Learn. Si se
// cambia de celular o se reinstala la app, escribiendo el mismo nombre se
// recupera todo.
//
// La llave en la nube es el nombre "normalizado" (minúsculas, sin tildes ni
// espacios de más): "Liz", "liz" y " LIZ " son la misma persona. Así los que
// ya estaban registrados como "liz" y "david" siguen con su respaldo de siempre.

const DUENO_KEY = "liz-dueno";
const NOMBRE_KEY = "liz-dueno-nombre";

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 30;
/** Formato de la llave que acepta el servidor. */
export const LLAVE_REGEX = /^[a-z0-9]+(?:[ .'-][a-z0-9]+)*$/;

/** "  José   Pérez " → "jose perez". Devuelve null si no sirve como nombre. */
export function llaveDeNombre(nombre: string): string | null {
  const llave = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 .'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (llave.length < NOMBRE_MIN || llave.length > NOMBRE_MAX) return null;
  return LLAVE_REGEX.test(llave) ? llave : null;
}

function leer(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function escribir(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modo privado */
  }
}

/** Llave de la persona registrada en este celular (null si todavía nadie). */
export function leerLlave(): string | null {
  const v = leer(DUENO_KEY);
  return v && LLAVE_REGEX.test(v) ? v : null;
}

/** Nombre tal como lo escribió la persona (o la llave con mayúscula inicial). */
export function leerNombre(): string | null {
  const nombre = leer(NOMBRE_KEY)?.trim();
  if (nombre) return nombre;
  const llave = leerLlave();
  return llave ? llave.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : null;
}

export function registrar(llave: string, nombre: string) {
  escribir(DUENO_KEY, llave);
  escribir(NOMBRE_KEY, nombre.trim().replace(/\s+/g, " "));
}
