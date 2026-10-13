import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { deletePushSub, listPushSubs } from "./cloud.server";
import { getVapidKeys } from "./avisos.server";

// Envío de avisos reales (Web Push, RFC 8291) desde el servidor a cada celular
// que aceptó recibirlos. Funciona con la app instalada y cerrada.
// Las claves VAPID salen de las variables del proyecto o, si no están, de las
// que el servidor generó y guardó en la base (ver avisos.server.ts).

export async function sendPushToAll(
  payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  },
  /** exceptDevice: a quien lo envía no le llega · onlyDevice: solo a ese celular. */
  opts: { exceptDevice?: string; onlyDevice?: string } = {},
): Promise<{ sent: number }> {
  const keys = await getVapidKeys();
  if (!keys) return { sent: 0 };

  const vapid = { subject: "mailto:avisos@liz.app", ...keys };
  const subs = ((await listPushSubs(opts)) as PushSubscription[]).filter(
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
          // Un servicio de avisos lento no debe frenar a quien envía.
          signal: AbortSignal.timeout(6000),
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
