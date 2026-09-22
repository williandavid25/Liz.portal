import { createFileRoute } from "@tanstack/react-router";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Ruta de intercambio de token para subir archivos directo desde el navegador
// a Vercel Blob (sin pasar por una función servidor): antes, un mp3 subido
// pasaba entero por el servidor y volvía a salir hacia Vercel Blob, lo que
// fallaba o se colgaba con archivos de varios MB. Con este flujo, el
// servidor solo entrega un token chico y el navegador sube directo.
export const Route = createFileRoute("/api/blob-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as HandleUploadBody;
        try {
          const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => ({
              allowedContentTypes: ["audio/*"],
              addRandomSuffix: true,
            }),
          });
          return Response.json(jsonResponse);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "upload failed" },
            { status: 400 },
          );
        }
      },
    },
  },
});
