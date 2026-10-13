import { getPushKey, savePushSubscription } from "./cloud";
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

export async function enablePush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (typeof Notification === "undefined") return false;
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return false;

    const { key } = await getPushKey();
    if (!key) return false;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));

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
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  await enablePush();
}
