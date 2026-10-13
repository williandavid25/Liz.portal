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
        // Solo la propia página puede pedir un token (evita que otro sitio
        // use el almacenamiento). El aviso de "subida terminada" de Vercel
        // llega sin cabecera Origin y pasa igual.
        const origin = request.headers.get("origin");
        if (origin) {
          const hosts = [
            new URL(request.url).host,
            request.headers.get("host"),
            request.headers.get("x-forwarded-host"),
          ];
          let originHost = "";
          try {
            originHost = new URL(origin).host;
          } catch {
            /* origen inválido */
          }
          if (!hosts.includes(originHost)) {
            return Response.json({ error: "origen no permitido" }, { status: 403 });
          }
        }
        try {
          const body = (await request.json()) as HandleUploadBody;
          const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => ({
              allowedContentTypes: ["audio/*"],
              maximumSizeInBytes: 50 * 1024 * 1024,
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
