import { createFileRoute } from "@tanstack/react-router";
import { MascotaGame } from "@/components/MascotaGame";

export const Route = createFileRoute("/mascota")({
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
  component: MascotaGame,
});
