import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Video de portada en bucle continuo. Detalles para que se vea fluido:
 * - Mientras el video arranca se ve su primer cuadro (poster), así no hay
 *   pantalla negra; el video aparece con un fundido cuando ya se reproduce.
 * - Se pausa solo cuando sale de la pantalla (no gasta batería ni CPU mientras
 *   se ve la galaxia o el océano) y se reanuda al volver.
 * - Silenciado: los navegadores solo permiten reproducción automática así, y
 *   la música de fondo del sitio sigue sonando aparte.
 */
export function PortadaVideo({ src, poster }: { src: string; poster?: string }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ratio, setRatio] = useState(9 / 16);

  useEffect(() => {
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    const tryPlay = () => {
      video.play().catch(() => {
        /* el navegador lo intentará de nuevo con el primer toque */
      });
    };

    if (!("IntersectionObserver" in window)) {
      tryPlay();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) tryPlay();
        else video.pause();
      },
      { threshold: 0.05 },
    );
    observer.observe(section);

    // Algunos celulares (modo ahorro de batería) bloquean el autoplay hasta
    // que se toca la pantalla: lo reintentamos en ese primer toque.
    const onFirstTouch = () => {
      if (video.paused) tryPlay();
    };
    window.addEventListener("pointerdown", onFirstTouch, { once: true, passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", onFirstTouch);
    };
  }, [src]);

  const portrait = ratio < 1;

  return (
    <div
      ref={sectionRef}
      className="absolute inset-0 flex items-center justify-center bg-[#02020a]"
    >
      {/* Brillo de fondo para pantallas anchas: el primer cuadro muy difuminado. */}
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
      )}

      <div
        className="portada-frame portada-frame--fade"
        style={{ "--portada-ar": String(ratio) } as CSSProperties}
      >
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            className={`absolute inset-0 h-full w-full ${portrait ? "object-cover" : "object-contain"}`}
          />
        )}
        <video
          key={src}
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
          }}
          onPlaying={() => setPlaying(true)}
          // Respaldo por si el atributo `loop` falla en algún navegador viejo.
          onEnded={(e) => {
            e.currentTarget.currentTime = 0;
            e.currentTarget.play().catch(() => {});
          }}
          className={`portada-video absolute inset-0 h-full w-full transition-opacity duration-700 ${
            portrait ? "object-cover" : "object-contain"
          } ${playing || !poster ? "opacity-100" : "opacity-0"}`}
        />
      </div>

      <div className="portada-fade-top" />
      <div className="portada-fade-bottom" />
    </div>
  );
}
