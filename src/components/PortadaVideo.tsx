import { useEffect, useRef, useState, type CSSProperties } from "react";

// En pantallas anchas (computador, tablet acostada) el video vertical se
// agranda hasta esta proporción recortando solo cielo arriba y abajo: la
// flor ocupa la franja central del video, así que nunca se corta.
const RATIO_MINIMO_ANCHO = 0.75;

function useEsPantallaAncha() {
  const [ancha, setAncha] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-aspect-ratio: 3/4)");
    const update = () => setAncha(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ancha;
}

/**
 * Video de portada en bucle continuo. Detalles para que se vea fluido:
 * - Mientras el video arranca se ve su primer cuadro (poster), así no hay
 *   pantalla negra; el video aparece con un fundido cuando ya se reproduce.
 * - Se pausa solo cuando sale de la pantalla (no gasta batería ni CPU mientras
 *   se ve la galaxia o el océano) y se reanuda al volver.
 * - Silenciado: los navegadores solo permiten reproducción automática así, y
 *   la música de fondo del sitio sigue sonando aparte.
 * - En computador, los costados se llenan con un reflejo difuminado del mismo
 *   video (se dibuja en un canvas diminuto: casi no consume nada).
 */
export function PortadaVideo({ src, poster }: { src: string; poster?: string }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientRef = useRef<HTMLCanvasElement>(null);
  const ambientReadyRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [ambientOn, setAmbientOn] = useState(false);
  const [ratio, setRatio] = useState(9 / 16);
  const ancha = useEsPantallaAncha();

  useEffect(() => {
    setPlaying(false);
    setAmbientOn(false);
    ambientReadyRef.current = false;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;
    video.setAttribute("fetchpriority", "high");

    const tryPlay = () => {
      video.play().catch(() => {
        /* el navegador lo intentará de nuevo con el primer toque */
      });
    };
    video.load();

    // La portada ya está montada dentro del primer viewport: iniciar aquí
    // evita esperar al primer callback del observer y conserva el poster
    // visible mientras el navegador prepara el primer cuadro.
    tryPlay();
    if (!("IntersectionObserver" in window)) return;
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

  // Reflejo ambiental de los costados (solo pantallas anchas).
  useEffect(() => {
    if (!ancha) return;
    const video = videoRef.current;
    const canvas = ambientRef.current;
    const section = sectionRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !section || !ctx) return;

    let cancelled = false;
    let handle = 0;
    const W = 48;

    const draw = () => {
      if (cancelled) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh && video.readyState >= 2) {
        const sw = section.clientWidth || 1;
        const sh = section.clientHeight || 1;
        const H = Math.max(1, Math.round((W * sh) / sw));
        if (canvas.width !== W || canvas.height !== H) {
          canvas.width = W;
          canvas.height = H;
        }
        // Recorte tipo "cover": llena todo el canvas con el centro del video.
        const scale = Math.max(W / vw, H / vh);
        const cw = W / scale;
        const ch = H / scale;
        ctx.filter = "blur(3px)";
        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H);
        if (!ambientReadyRef.current) {
          ambientReadyRef.current = true;
          setAmbientOn(true);
        }
      }
      schedule();
    };

    // requestVideoFrameCallback solo dispara con cuadros nuevos (si el video
    // está pausado no hace nada); en navegadores sin él, ~15 cuadros/s.
    const rvfc = "requestVideoFrameCallback" in video;
    const schedule = () => {
      if (cancelled) return;
      if (rvfc) handle = video.requestVideoFrameCallback(draw);
      else handle = window.setTimeout(draw, 66);
    };
    schedule();

    return () => {
      cancelled = true;
      if (rvfc) video.cancelVideoFrameCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [ancha, src]);

  const portrait = ratio < 1;
  const frameRatio = ancha && portrait ? Math.max(ratio, RATIO_MINIMO_ANCHO) : ratio;

  return (
    <div
      ref={sectionRef}
      className="absolute inset-0 flex items-center justify-center bg-[#02020a]"
    >
      {/* Brillo de fondo mientras arranca: el primer cuadro muy difuminado. */}
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
      )}
      {ancha && (
        <canvas
          ref={ambientRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-1000 ${
            ambientOn ? "opacity-60" : "opacity-0"
          }`}
        />
      )}
      {/* Viñeta: oscurece los bordes para que el centro sea protagonista. */}
      {ancha && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(2_2_10/0.75)_100%)]" />
      )}

      <div
        className="portada-frame portada-frame--fade"
        style={{ "--portada-ar": String(frameRatio) } as CSSProperties}
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
          crossOrigin="anonymous"
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
      {!playing && (
        <div className="portada-cargando" role="status" aria-live="polite">
          <span className="portada-cargando-linea" />
          <span>Cargando tu sorpresa…</span>
        </div>
      )}

      <div className="portada-fade-top" />
      <div className="portada-fade-bottom" />
    </div>
  );
}
