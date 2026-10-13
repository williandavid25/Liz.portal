// Service worker: permite "instalar" el sitio, abrirlo sin internet una vez
// visitado, y recibir avisos de cartas nuevas con la app cerrada.
const CACHE_NAME = "liz-portal-v5";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Los datos en vivo (cartas, fotos, música, eventos) NUNCA se guardan en
  // caché: si se guardaran, la app instalada seguiría mostrando lo viejo y no
  // se verían los cambios hechos desde el otro celular.
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;

  // Pedidos "Range" (videos/audio buscando un punto de reproducción) devuelven
  // 206 Partial Content, que el Cache API no acepta guardar.
  if (req.headers.has("range")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.status !== 206) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      if (req.mode === "navigate") {
        const fresh = await network;
        if (fresh) return fresh;
        if (cached) return cached;
        return new Response(
          "<meta charset='utf-8'><body style='background:#1e1428;color:#fff;font-family:sans-serif;text-align:center;padding:3rem'><h1>Sin conexión</h1><p>Abre esta página una vez con internet para poder verla luego sin conexión.</p></body>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }

      return cached || (await network) || Response.error();
    }),
  );
});

// --- Avisos de cartas nuevas (llegan aunque la app esté cerrada) ---
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "💌 Nueva carta para ti" };
  }
  const title = data.title || "💌 Nueva carta para ti";
  const url = data.url || "/bienvenida";
  // Si la app está abierta, que revise las notas de Snoopy al instante.
  const avisarApp = url.startsWith("/mascota")
    ? self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ tipo: "nota" })))
    : Promise.resolve();
  event.waitUntil(
    Promise.all([
      avisarApp,
      self.registration.showNotification(title, {
        body: data.body || "Toca para leerla",
        tag: data.tag || "carta",
        icon: "/icons/liz-192.png",
        badge: "/icons/liz-192.png",
        vibrate: [120, 60, 120],
        renotify: true,
        data: { url },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/bienvenida";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
