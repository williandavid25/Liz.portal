import { useEffect, useRef, useState } from "react";
import Game from "@/ocean/Game/Game.class";
import ResourceLoader from "@/ocean/Game/Utils/ResourceLoader.class";
import ASSETS from "@/ocean/assets";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Fondo 3D interactivo del delfín (portado de Cyber-Ocean): flechas/WASD para
 * nadar, arrastrar con el mouse para orbitar la cámara alrededor de él.
 * Se degrada a un fondo estático solo si el navegador no soporta WebGL
 * (se mantiene activo en celulares: es el dispositivo principal del sitio).
 */
export default function OceanScene({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    // El delfín se muestra siempre que el navegador soporte WebGL (incluidos
    // celulares). Solo si no hay WebGL se cae al fondo cósmico.
    if (!supportsWebGL()) {
      setEnabled(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let game: InstanceType<typeof Game> | null = null;
    let cancelled = false;
    // Si por conexión lenta o un recurso caído nunca termina de cargar, no
    // se queda pegado en "Cargando el océano…" para siempre: se degrada al
    // fondo cósmico normal, como si el navegador no soportara WebGL.
    const giveUp = setTimeout(() => {
      if (cancelled) return;
      console.error("El océano tardó demasiado en cargar, se muestra el fondo normal.");
      setEnabled(false);
    }, 20000);

    // La descarga y el armado del 3D se posponen hasta que la página ya
    // pintó y el celular está libre: así el texto y los botones responden
    // desde el primer momento en vez de esperar al océano.
    const iniciar = () => {
      if (cancelled) return;
      const resources = new ResourceLoader(ASSETS);
      resources.on("loaded", () => {
        clearTimeout(giveUp);
        if (cancelled) return;
        try {
          game = new Game(canvas, resources, false);
          setReady(true);
        } catch (err) {
          console.error("No se pudo iniciar la escena del océano:", err);
          setEnabled(false);
        }
      });
      resources.on("error", (payload: { id: string; url: string }) => {
        console.error("Error cargando recurso del océano:", payload);
      });
    };

    const usaIdle = typeof window.requestIdleCallback === "function";
    const arranque = usaIdle
      ? window.requestIdleCallback(iniciar, { timeout: 1200 })
      : window.setTimeout(iniciar, 300);

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      if (arranque !== undefined) {
        if (usaIdle) window.cancelIdleCallback(arranque);
        else clearTimeout(arranque);
      }
      game?.destroy();
    };
  }, []);

  if (!enabled) {
    return <div className={className} aria-hidden="true" />;
  }

  return (
    <div className={`${className ?? ""} relative`}>
      <div
        className={`absolute inset-0 bg-cosmos transition-opacity duration-700 flex items-center justify-center ${
          ready ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <p className="animate-pulse text-white/50 text-xs tracking-wide font-semibold">
          Cargando el océano…
        </p>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="h-full w-full touch-none transition-opacity duration-700"
        style={{ opacity: ready ? 1 : 0 }}
      />
      <div className="video-cover-blur-edges-cosmic" />
    </div>
  );
}
