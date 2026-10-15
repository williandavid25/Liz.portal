import { createFileRoute } from "@tanstack/react-router";

// Lo llama el reloj de la base una vez al día: si a alguien se le está por
// acabar el contenido, Claude escribe una semana nueva (queda pendiente de
// aprobación en la app). Solo responde con el token secreto de la base.
export const Route = createFileRoute("/api/learn-generar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getConfig } = await import("../../lib/avisos.server");
          const token = await getConfig("tick_token");
          if (!token || request.headers.get("x-liz-tick") !== token) {
            return Response.json({ error: "no autorizado" }, { status: 401 });
          }
          const { generarSiHaceFalta } = await import("../../lib/learn.server");
          return Response.json({ informe: await generarSiHaceFalta() });
        } catch (e) {
          console.error("Fallo al generar contenido:", e);
          return Response.json({ error: "fallo" }, { status: 500 });
        }
      },
    },
  },
});
