import { Link } from "@tanstack/react-router";
import { useRef, useState, type MouseEvent } from "react";
import { Volume2, VolumeX, ArrowRight } from "lucide-react";

/**
 * Sección del corazón: reproduce el video `/video-corazon.mp4` en bucle.
 * Se reproduce solo (autoplay silenciado) y se funde con el fondo mediante los
 * bordes difuminados. El resplandor rosa/negro late alrededor y el botón central
 * lleva a /recuerdos. El sonido del latido se activa con el altavoz.
 */
export default function BeatingHeart() {
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleSound = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.muted) {
      v.muted = false;
      setMuted(false);
      if (v.paused) v.play().catch(() => {});
    } else {
      v.muted = true;
      setMuted(true);
    }
  };

  // Difuminado radial de los bordes del video para que se funda con el fondo.
  const edgeFade = {
    WebkitMaskImage: "radial-gradient(circle at center, #000 55%, transparent 84%)",
    maskImage: "radial-gradient(circle at center, #000 55%, transparent 84%)",
  } as const;

  return (
    <section className="relative flex flex-col items-center justify-center gap-6 px-5 py-20 sm:py-28 overflow-hidden bg-transparent">
      <div className="relative">
        {/* Resplandor suave que late detrás del corazón. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[105%] h-[105%] rounded-full blur-[56px] animate-heart-glow"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--rose-glow) 58%, transparent), color-mix(in oklab, var(--cosmic-violet) 58%, transparent) 45%, transparent 72%)",
          }}
        />

        {/* Video del corazón (se reproduce solo, bordes difuminados) */}
        <div className="relative w-[300px] sm:w-[380px]">
          {!failed ? (
            <video
              ref={videoRef}
              src="/video-corazon.mp4"
              autoPlay
              loop
              muted={muted}
              playsInline
              preload="auto"
              onError={() => setFailed(true)}
              className="w-full h-auto select-none mix-blend-screen"
              style={edgeFade}
            />
          ) : (
            <div className="w-full aspect-square grid place-items-center text-[9rem] animate-heartbeat">
              ❤️
            </div>
          )}

          {/* Botón "Ver recuerdos" en el centro del corazón */}
          <Link
            to="/recuerdos"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white font-bold text-sm backdrop-blur-md bg-black/40 border border-white/25 hover:bg-black/60 hover:scale-105 active:scale-95 transition-all shadow-[0_0_28px_rgba(255,45,95,0.5)]"
          >
            Ver recuerdos
            <ArrowRight size={15} />
          </Link>

          {/* Botón de sonido del latido */}
          <button
            onClick={toggleSound}
            className="absolute top-3 right-3 z-20 p-2.5 rounded-full text-white backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 shadow-lg"
            aria-label={muted ? "Escuchar el latido" : "Silenciar latido"}
            title={muted ? "Escuchar el latido" : "Silenciar latido"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      <p className="text-white/40 text-xs">
        {muted ? "Toca el altavoz para escuchar su latido 🔊" : "Escuchando su latido…"}
      </p>
    </section>
  );
}
