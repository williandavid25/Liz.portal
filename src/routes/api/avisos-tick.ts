import { createFileRoute } from "@tanstack/react-router";

// Lo llama el reloj de la base (pg_cron) cada 5 minutos: revisa a Snoopy en
// cada celular y manda los avisos que tocan, aunque la app esté cerrada.
// Solo responde si trae el token secreto guardado en la base.
export const Route = createFileRoute("/api/avisos-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getConfig, revisarAvisos } = await import("../../lib/avisos.server");
          const token = await getConfig("tick_token");
          if (!token || request.headers.get("x-liz-tick") !== token) {
            return Response.json({ error: "no autorizado" }, { status: 401 });
          }
          return Response.json(await revisarAvisos());
        } catch (e) {
          console.error("Fallo al revisar los avisos:", e);
          return Response.json({ error: "fallo" }, { status: 500 });
        }
      },
    },
  },
});
