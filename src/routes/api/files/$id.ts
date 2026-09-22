import { createFileRoute } from "@tanstack/react-router";

// Importa cloud.server dentro del handler (no arriba del archivo): este
// archivo lo referencia el árbol de rutas del cliente solo para saber que
// existe, así que cualquier import de nivel superior también viaja al
// navegador. `cloud.server.ts` usa Postgres (Node), así que hacerlo así
// rompía la página entera con "Buffer is not defined".
export const Route = createFileRoute("/api/files/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getFile } = await import("@/lib/cloud.server");
        const file = await getFile(params.id);
        if (!file) return new Response("No encontrado", { status: 404 });
        return new Response(new Blob([file.data as unknown as BlobPart]), {
          headers: {
            "Content-Type": file.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
