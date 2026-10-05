import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Mail } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { FallingStars } from "@/components/FallingStars";
import { PortadaVideo } from "@/components/PortadaVideo";
import { Bienvenida } from "@/components/Bienvenida";
import { useAjustes } from "@/lib/ajustes";
import { resolvePortada } from "@/lib/portadas";
import { useNearViewport } from "@/hooks/use-near-viewport";

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
    links: [
      // Abre la conexión con Supabase (donde vive el video) desde el primer instante.
      {
        rel: "preconnect",
        href: "https://qgucscghlnjlikvvuxpe.supabase.co",
        crossOrigin: "anonymous",
      },
      { rel: "preload", as: "image", href: "/portadas/flor-de-loto.jpg", fetchPriority: "high" },
    ],
  }),
  component: Inicio,
});

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

const roundBtn =
  "flex shrink-0 flex-col items-center gap-1 rounded-full border border-white/25 bg-black/35 p-2.5 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/55";

function CartasButton() {
  return (
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
  );
}

function GalaxiaIframe() {
  return (
    <iframe
      title="Galaxia Simple - Agujero Negro, Día de las Flores Amarillas"
      src="/galaxia-flores-amarillas.html"
      allow="autoplay; fullscreen"
      className="block h-[100svh] min-h-[38rem] w-full max-w-full border-0 bg-black"
      scrolling="no"
    />
  );
}

/**
 * El océano usa three.js (~1.6 MB). Se importa recién cuando se va a mostrar,
 * así no viaja con la portada. Es un import manual en un efecto (no
 * React.lazy/Suspense, que dejaba la escena colgada en producción).
 */
function OceanoDiferido() {
  const [Scene, setScene] = useState<ComponentType<{ className?: string }> | null>(null);
  useEffect(() => {
    let alive = true;
    import("@/components/OceanScene")
      .then((m) => {
        if (alive) setScene(() => m.default);
      })
      .catch((err) => console.error("No se pudo cargar el océano:", err));
    return () => {
      alive = false;
    };
  }, []);
  if (!Scene) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-cosmos" aria-hidden="true">
        <p className="animate-pulse text-xs font-semibold tracking-wide text-white/50">
          Cargando el océano…
        </p>
      </div>
    );
  }
  return <Scene className="video-cover-container" />;
}

function Inicio() {
  const ajustes = useAjustes();
  const portada = resolvePortada(ajustes.portada, ajustes.portadaUrl);
  const portadaEsGalaxia = portada.tipo === "galaxia";
  const portadaEsOceano = portada.tipo === "oceano";

  // Si la galaxia o el océano ya son la portada, no se repiten más abajo.
  const showGalaxia = ajustes.mostrarGalaxia && !portadaEsGalaxia;
  const showOceano = ajustes.mostrarOceano && !portadaEsOceano;

  const galaxiaRef = useRef<HTMLElement>(null);
  const oceanoRef = useRef<HTMLElement>(null);
  // La galaxia (670 KB + Three.js) y el océano 3D solo se descargan al
  // acercarse a su sección: la portada aparece y responde de inmediato.
  // (-1px abajo: la galaxia empieza justo donde termina la pantalla y, sin
  // eso, el navegador ya la cuenta como visible sin haber bajado nada.)
  const loadGalaxia = useNearViewport(galaxiaRef, "0px 0px -1px 0px", showGalaxia);
  const loadOceano = useNearViewport(oceanoRef, "35% 0px", showOceano);

  const order = ["portada", showGalaxia && "galaxia", showOceano && "oceano"].filter(
    Boolean,
  ) as string[];
  const nextOf = (id: string) => order[order.indexOf(id) + 1];
  const prevOf = (id: string) => order[order.indexOf(id) - 1];
  const label: Record<string, string> = {
    portada: "Inicio",
    galaxia: "Galaxia",
    oceano: "Océano",
  };

  const nextPortada = nextOf("portada");
  const nextGalaxia = nextOf("galaxia");
  const prevOceano = prevOf("oceano");

  return (
    <div className="relative">
      <section
        id="portada"
        className="relative h-[100svh] min-h-[32rem] overflow-hidden bg-[#02020a]"
      >
        {portada.tipo === "galaxia" ? (
          <GalaxiaIframe />
        ) : portada.tipo === "oceano" ? (
          <>
            <OceanoDiferido />
            <FallingStars className="pointer-events-none absolute inset-0 overflow-hidden" />
            <div className="portada-fade-top" />
            <div className="portada-fade-bottom" />
          </>
        ) : (
          <PortadaVideo src={portada.src} poster={portada.poster} />
        )}
        {/* La galaxia ya trae su propio título, así que ahí no se superpone. */}
        {!portadaEsGalaxia && <Bienvenida />}
        <div className="absolute inset-x-0 bottom-5 z-20 flex items-end gap-3 px-4 sm:bottom-8 sm:justify-center">
          <CartasButton />
          {nextPortada && (
            <button
              type="button"
              onClick={() => scrollTo(nextPortada)}
              className={roundBtn}
              aria-label={`Bajar a ${label[nextPortada]}`}
            >
              <ArrowDown size={20} />
              <span className="text-[10px] font-bold">{label[nextPortada]}</span>
            </button>
          )}
        </div>
      </section>

      {showGalaxia && (
        <section id="galaxia" ref={galaxiaRef} className="relative overflow-hidden bg-[#02020a]">
          {loadGalaxia ? (
            <GalaxiaIframe />
          ) : (
            <div className="h-[100svh] min-h-[38rem] w-full bg-[#02020a]" aria-hidden="true" />
          )}
          {nextGalaxia && (
            <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-8">
              <button
                type="button"
                onClick={() => scrollTo(nextGalaxia)}
                className={roundBtn}
                aria-label={`Bajar a ${label[nextGalaxia]}`}
              >
                <ArrowDown size={20} />
                <span className="text-[10px] font-bold">{label[nextGalaxia]}</span>
              </button>
            </div>
          )}
        </section>
      )}

      {showOceano && (
        <section
          id="oceano"
          ref={oceanoRef}
          className="relative min-h-[min(100svh,52rem)] overflow-hidden bg-transparent"
        >
          {loadOceano ? (
            <>
              <OceanoDiferido />
              <FallingStars className="pointer-events-none absolute inset-0 overflow-hidden" />
            </>
          ) : (
            <div className="absolute inset-0 bg-cosmos" aria-hidden="true" />
          )}
          {/* Une el borde superior con la sección anterior (fondo casi negro). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#02020a] to-transparent" />
          {prevOceano && (
            <button
              type="button"
              onClick={() => scrollTo(prevOceano)}
              // Debajo del panel transparente de arriba, para que no quede tapado.
              className={`absolute inset-x-0 top-24 z-30 mx-auto w-fit sm:top-32 ${roundBtn}`}
              aria-label={`Subir a ${label[prevOceano]}`}
            >
              <ArrowUp size={20} />
              <span className="text-[10px] font-bold">{label[prevOceano]}</span>
            </button>
          )}
        </section>
      )}
    </div>
  );
}
