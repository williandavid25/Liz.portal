import { createFileRoute } from "@tanstack/react-router";
import { MascotaGame } from "@/components/MascotaGame";

export const Route = createFileRoute("/mascota")({
  // ?nota=<id>: llega al tocar el aviso de una nota de Snoopy.
  // ?compartido=1: llegaron imágenes desde "Compartir" (Android) para stickers.
  validateSearch: (search: Record<string, unknown>): { nota?: string; compartido?: string } => ({
    nota: typeof search.nota === "string" ? search.nota : undefined,
    compartido: search.compartido != null ? String(search.compartido) : undefined,
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
  const { nota, compartido } = Route.useSearch();
  return <MascotaGame notaInicial={nota} compartido={!!compartido} />;
}
