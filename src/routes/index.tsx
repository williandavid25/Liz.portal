import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import OceanScene from "@/components/OceanScene";
import { FallingStars } from "@/components/FallingStars";

// Nota: se probó cargar el océano con React.lazy/Suspense para que el resto
// de la página pintara antes, pero eso dejaba la escena colgada en "Cargando"
// para siempre en producción (probable choque entre Suspense y el SSR de
// TanStack Start). Se volvió a la carga directa, que sí funciona.

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inicio · Feliz Cumpleaños ✨" },
      {
        name: "description",
        content: "Una sorpresa de cumpleaños con cartas, recuerdos y momentos especiales.",
      },
      { property: "og:title", content: "Feliz Cumpleaños ✨" },
      { property: "og:description", content: "Una sorpresa hecha con cariño." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  const oceanSectionRef = useRef<HTMLElement>(null);
  const [shouldLoadOcean, setShouldLoadOcean] = useState(false);

  useEffect(() => {
    const section = oceanSectionRef.current;
    if (!section || !("IntersectionObserver" in window)) {
      setShouldLoadOcean(true);
      return;
    }

    // El motor 3D descarga el modelo, texturas y audio. Se inicia solo al
    // acercarse a la sección para que la galaxia y los botones respondan de
    // inmediato, especialmente en teléfonos de gama media.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoadOcean(true);
        observer.disconnect();
      },
      { rootMargin: "35% 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative scroll-smooth snap-y snap-mandatory">
      <section id="galaxia" className="relative snap-start overflow-hidden bg-[#02020a]">
        <iframe
          title="Galaxia Simple - Agujero Negro, Día de las Flores Amarillas"
          src="/galaxia-flores-amarillas.html"
          allow="autoplay; fullscreen"
          className="block h-[100svh] min-h-[38rem] w-full max-w-full border-0 bg-black"
          scrolling="no"
        />
        <div className="absolute inset-x-0 bottom-5 z-20 flex items-end gap-3 px-4 sm:bottom-8 sm:justify-center">
          <motion.div
            animate={{ scale: [1, 1.04, 1], opacity: [0.86, 1, 0.86] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="min-w-0 flex-1 sm:flex-none"
          >
            <Link
              to="/bienvenida"
              className="flex items-center justify-center gap-2 rounded-full border border-yellow-100/40 bg-black/35 px-4 py-3 font-display text-sm text-yellow-50 shadow-[0_0_30px_rgba(255,190,35,.3)] backdrop-blur-md transition-colors hover:bg-black/55 sm:px-7 sm:py-3.5 sm:text-lg"
            >
              <Mail size={20} className="shrink-0" />
              <span className="truncate">Ver mis cartas</span>
            </Link>
          </motion.div>
          <button
            type="button"
            onClick={() =>
              document.getElementById("oceano")?.scrollIntoView({ behavior: "smooth" })
            }
            className="flex shrink-0 flex-col items-center gap-1 rounded-full border border-white/25 bg-black/35 p-2.5 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/55"
            aria-label="Bajar al océano"
          >
            <ArrowDown size={20} />
            <span className="text-[10px] font-bold">Océano</span>
          </button>
        </div>
      </section>

      <section
        id="oceano"
        ref={oceanSectionRef}
        className="relative min-h-[min(100svh,52rem)] snap-start overflow-hidden bg-transparent"
      >
        {shouldLoadOcean ? (
          <>
            <OceanScene className="video-cover-container" />
            <FallingStars className="pointer-events-none absolute inset-0 overflow-hidden" />
          </>
        ) : (
          <div className="absolute inset-0 bg-cosmos" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => document.getElementById("galaxia")?.scrollIntoView({ behavior: "smooth" })}
          className="absolute inset-x-0 top-5 z-30 mx-auto flex w-fit flex-col items-center gap-1 rounded-full border border-white/25 bg-black/35 p-2.5 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/55 sm:top-8"
          aria-label="Subir a la galaxia"
        >
          <ArrowUp size={20} />
          <span className="text-[10px] font-bold">Galaxia</span>
        </button>
      </section>
    </div>
  );
}
