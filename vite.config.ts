// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "vercel",
    // Generar una semana de lecciones con Claude puede tardar más de un minuto.
    vercel: { functionRules: { "/api/learn-generar": { maxDuration: 300 } } },
    // Los fondos llevan versión en el nombre: se guardan en el celular por un año.
    routeRules: {
      "/learn/fondos/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
    },
    // La configuración de Lovable no declara "vercel", pero Nitro sí la usa.
  } as { preset: string },
  // three.js (galaxia/océano) pesa ~1.6 MB por sí solo; se carga solo al bajar
  // a esas secciones, así que el aviso de "chunk grande" no aplica aquí.
  vite: { build: { chunkSizeWarningLimit: 2000 } },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
