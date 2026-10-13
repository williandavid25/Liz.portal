import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { deletePushSub, listPushSubs } from "./cloud.server";

// Envío de avisos reales (Web Push, RFC 8291) desde el servidor a cada celular
// que aceptó recibirlos. Funciona con la app instalada y cerrada.
// Las claves VAPID viven en secretos del proyecto; la pública también la usa
// el navegador para suscribirse.

export async function sendPushToAll(
  payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  },
  /** Celular que lo envía: a él no le llega su propio aviso. */
  exceptDevice?: string,
): Promise<{ sent: number }> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateJwk = process.env["VAPID_PRIVATE_JWK"];
  if (!publicKey || !privateJwk) return { sent: 0 };

  let privateKey: string | undefined;
  try {
    privateKey = (JSON.parse(privateJwk) as { d?: string }).d;
  } catch {
    privateKey = undefined;
  }
  if (!privateKey) return { sent: 0 };

  const vapid = { subject: "mailto:avisos@liz.app", publicKey, privateKey };
  const subs = ((await listPushSubs(exceptDevice)) as PushSubscription[]).filter(
    // Suscripciones viejas guardadas sin claves no se pueden cifrar.
    (s) => s?.endpoint && s.keys?.p256dh && s.keys?.auth,
  );
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const built = await buildPushPayload(
          { data: payload, options: { ttl: 60 * 60 * 24, urgency: "high" } },
          sub,
          vapid,
        );
        const res = await fetch(sub.endpoint, {
          method: built.method,
          headers: built.headers,
          body: built.body as unknown as BodyInit,
        });
        if (res.status === 404 || res.status === 410) {
          // El navegador ya no existe / desinstaló la app: se limpia.
          await deletePushSub(sub.endpoint);
        } else if (res.ok) {
          sent += 1;
        } else {
          console.error("Push rechazado", res.status, await res.text());
        }
      } catch (e) {
        console.error("No se pudo enviar el aviso:", e);
      }
    }),
  );

  return { sent };
}
