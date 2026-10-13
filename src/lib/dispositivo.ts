// Cada celular guarda un identificador propio (no hay cuentas de usuario). Sirve
// para que un aviso o una nota de Snoopy le llegue al OTRO celular y no al que
// la envió.
const DEVICE_KEY = "liz-device-id";

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && saved.length >= 8) return (cached = saved);
  } catch {
    /* almacenamiento bloqueado: se usa un id solo para esta sesión */
  }
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* ignorar */
  }
  return (cached = id);
}
