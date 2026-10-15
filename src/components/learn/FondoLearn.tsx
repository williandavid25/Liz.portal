import { useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/learn/tipos";
import { srcFondo, srcsetFondo } from "@/lib/learn/fondos";

// Fondo de cada materia en Snoopy Learn: la foto (en el tamaño justo para la
// pantalla, sin perder calidad), un movimiento de cámara muy lento y
// luciérnagas que flotan y titilan, cada una a su ritmo.

const FONDOS: Record<
  Track,
  { archivo: string; borrador: string; luz: [number, number, number][] }
> = {
  // Atardecer morado con el libro: luces cálidas, doradas y rosadas.
  english: {
    archivo: "ingles",
    borrador:
      "data:image/webp;base64,UklGRsQAAABXRUJQVlA4ILgAAABwBgCdASoYACsAPtFYo0yoJSMiKrgN+QAaCWIAnTMABeAHID/q3sJXDLs3WdHP4MBWQZ+eBKnrAHU/cAAA/uyxPkps57I6t51BYNrC1KhL4G3AbehwY7xnXvhiPZbBNYHsiG3yUn/ma3gWYC6EUnJlDPM4aEYHl+MjIyK22hUgBQF+IIbxWNDs5cEpPizW6ZJUC1dk651u7M9bqS+zFbeyvfhnxOtqi/WlTOZSpcswHUj96ZguGAAA",
    luz: [
      [255, 214, 140],
      [255, 190, 230],
      [255, 236, 190],
    ],
  },
  // Árbol azul brillante: luces frías, celestes y turquesa.
  laboratory: {
    archivo: "laboratorio",
    borrador:
      "data:image/webp;base64,UklGRpgAAABXRUJQVlA4IIwAAACwBQCdASoYACsAPtFSpUyoJCOiNVQIAQAaCUAWI+5Is9WI/TqB2Ewl6QLd0dgCuHEUjtS/6uAA/vpasrx9mnU1rYLPs3jP86H3HQfzomnhdCr6m6kAYMYlY0sSwdfspta5loZ5BwXIL2TeuTN3E7rHxQ7bVbOHrs7UWeXfy1hmQquCLQO9tBCZcAAAAA==",
    luz: [
      [150, 240, 255],
      [200, 255, 245],
      [120, 210, 255],
    ],
  },
};

export function FondoLearn({ track }: { track: Track }) {
  const f = FONDOS[track];
  const [cargada, setCargada] = useState(false);
  useEffect(() => setCargada(false), [track]);
  return (
    <div
      className="lrn-foto pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Borrador diminuto: aparece al instante mientras baja la foto. */}
      <img
        src={f.borrador}
        alt=""
        className="lrn-foto-borrador absolute inset-0 h-full w-full object-cover"
      />
      <picture key={track}>
        <source type="image/avif" srcSet={srcsetFondo(track, "avif")} sizes="100vw" />
        <img
          src={srcFondo(track, "webp")}
          srcSet={srcsetFondo(track, "webp")}
          sizes="100vw"
          alt=""
          decoding="async"
          fetchPriority="high"
          // Precargada en la página de la mascota: ya está lista, sin esperar.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setCargada(true);
          }}
          onLoad={() => setCargada(true)}
          className={`lrn-foto-img absolute inset-0 h-full w-full object-cover ${cargada ? "visible" : ""}`}
        />
      </picture>
      <Luciernagas colores={f.luz} />
    </div>
  );
}

interface Luciernaga {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rumbo: number;
  r: number;
  fase: number;
  ritmo: number;
  color: [number, number, number];
}

/** Luciérnagas dibujadas en canvas (fluido incluso en celulares). */
function Luciernagas({ colores }: { colores: [number, number, number][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let bichos: Luciernaga[] = [];

    const crear = (): Luciernaga => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      rumbo: Math.random() * Math.PI * 2,
      r: 1.1 + Math.random() * 1.7,
      fase: Math.random() * Math.PI * 2,
      ritmo: 0.6 + Math.random() * 1.1, // titileo: entre ~2,5 y 6 s
      color: colores[Math.floor(Math.random() * colores.length)]!,
    });
    const medir = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cantidad = Math.round(Math.min(34, Math.max(14, (w * h) / 16000)));
      bichos = Array.from({ length: cantidad }, crear);
    };
    medir();
    window.addEventListener("resize", medir);

    let raf = 0;
    let previo = performance.now();
    const dibujar = (t: number) => {
      const dt = Math.min(0.05, (t - previo) / 1000);
      previo = t;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const b of bichos) {
        if (!quieto) {
          // Vuelo errante: el rumbo gira de a poco y la velocidad se suaviza.
          b.rumbo += (Math.random() - 0.5) * 1.8 * dt;
          const v = 9 + b.r * 4;
          b.vx += (Math.cos(b.rumbo) * v - b.vx) * dt * 0.9;
          b.vy += (Math.sin(b.rumbo) * v - 3 - b.vy) * dt * 0.9; // leve tendencia a subir
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < -20) b.x = w + 20;
          if (b.x > w + 20) b.x = -20;
          if (b.y < -20) b.y = h + 20;
          if (b.y > h + 20) b.y = -20;
          b.fase += b.ritmo * dt * 2;
        }
        // Brillo que se enciende y apaga (con momentos de casi apagado).
        const pulso = Math.pow((Math.sin(b.fase) + 1) / 2, 2.2);
        const alfa = 0.15 + pulso * 0.85;
        const [r, g, bl] = b.color;
        const halo = b.r * (7 + pulso * 5);
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, halo);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${0.55 * alfa})`);
        grad.addColorStop(0.25, `rgba(${r},${g},${bl},${0.18 * alfa})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, halo, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,250,${0.35 + alfa * 0.65})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (0.6 + pulso * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      raf = quieto ? 0 : requestAnimationFrame(dibujar);
    };
    raf = requestAnimationFrame(dibujar);

    // Con la app en segundo plano no se gasta batería.
    const alCambiarVisibilidad = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !quieto) {
        previo = performance.now();
        raf = requestAnimationFrame(dibujar);
      }
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", medir);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [colores]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
