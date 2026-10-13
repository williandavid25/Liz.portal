import { getPushKey, prepararAvisos, savePushSubscription } from "./cloud";
import { getDeviceId } from "./dispositivo";

// Suscribe este celular a los avisos reales. Se llama cuando la persona
// acepta los avisos; a partir de ahí recibe la notificación de una carta
// nueva incluso con la app cerrada (en iPhone, solo si la instaló en la
// pantalla de inicio).

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function mismaClave(a: ArrayBuffer | null, b: Uint8Array) {
  if (!a) return true; // el navegador no la informa: se asume la misma
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export async function enablePush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (typeof Notification === "undefined") return false;
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return false;

    const { key } = await getPushKey();
    if (!key) return false;

    const clave = urlBase64ToUint8Array(key);
    const reg = await navigator.serviceWorker.ready;
    let existing = await reg.pushManager.getSubscription();
    // Si la suscripción se hizo con otra clave, el servidor no podría usarla.
    if (existing && !mismaClave(existing.options.applicationServerKey, clave)) {
      await existing.unsubscribe().catch(() => false);
      existing = null;
    }
    const sub =
      existing ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave }));

    const res = await savePushSubscription({ data: { sub: sub.toJSON(), device: getDeviceId() } });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Si este celular ya dio permiso, vuelve a registrar su suscripción en
 * silencio (sin preguntar nada). Repara las que se guardaron incompletas y
 * anota a qué celular pertenecen.
 */
export async function refreshPushIfGranted(): Promise<void> {
  // El servidor deja listas sus claves y el reloj de avisos (una sola vez).
  await prepararAvisos().catch(() => null);
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  await enablePush();
}
