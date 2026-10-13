import { createFileRoute } from "@tanstack/react-router";
import { MascotaGame } from "@/components/MascotaGame";

export const Route = createFileRoute("/mascota")({
  // ?nota=<id>: llega al tocar el aviso de una nota de Snoopy.
  validateSearch: (search: Record<string, unknown>): { nota?: string } => ({
    nota: typeof search.nota === "string" ? search.nota : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Mi mascota · Snoopy's House 🐶" },
      {
        name: "description",
        content: "Cuida a Snoopy: dale de comer, báñalo, hazlo dormir, sácalo a pasear y háblale.",
      },
    ],
    links: [{ rel: "preload", as: "image", href: "/mascota/frente.webp" }],
  }),
  component: MascotaPage,
});

function MascotaPage() {
  const { nota } = Route.useSearch();
  return <MascotaGame notaInicial={nota} />;
}
