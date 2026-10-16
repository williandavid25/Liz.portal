import { useRef } from "react";
import { GIRO_CARA_GRADOS, MAX_PUNTOS, caminoTrazo, puntosDe, type Trazo } from "@/lib/dibujo";

// Capa del lápiz dentro de la cara del cuadro: firmas y dibujos a mano.
// Mientras se dibuja, el trazo se pinta directo en el SVG (sin estado de
// React por cada movimiento) y solo al soltar el dedo se guarda.

const HALO = "rgba(220,255,240,0.6)";
const TINTA = "#0a0a0a";

function Trazos({ trazos }: { trazos: Trazo[] }) {
  return (
    <>
      {/* Primero todos los halos y luego la tinta: el negro se lee sobre la galaxia. */}
      <g stroke={HALO}>
        {trazos.map((t, i) => (
          <path key={i} d={caminoTrazo(t.p)} strokeWidth={t.g + 7} />
        ))}
      </g>
      <g stroke={TINTA}>
        {trazos.map((t, i) => (
          <path key={i} d={caminoTrazo(t.p)} strokeWidth={t.g} />
        ))}
      </g>
    </>
  );
}

export function CapaDibujo({
  trazos,
  dibujando = false,
  grosor = 12,
  onTrazo,
}: {
  trazos: Trazo[];
  dibujando?: boolean;
  grosor?: number;
  /** Se llama con cada trazo terminado. */
  onTrazo?: (trazo: Trazo) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const halo = useRef<SVGPathElement>(null);
  const tinta = useRef<SVGPathElement>(null);
  const puntos = useRef<number[] | null>(null);

  /** Punto de la pantalla → coordenadas de la cara (que está girada). */
  const aLocal = (e: React.PointerEvent): [number, number] => {
    const el = svg.current!;
    const r = el.getBoundingClientRect();
    // Lado de la cara sin girar (el rectángulo de pantalla es el de la cara ya girada).
    const lado = el.parentElement?.offsetWidth || 1;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const a = (-GIRO_CARA_GRADOS * Math.PI) / 180;
    const x = dx * Math.cos(a) - dy * Math.sin(a);
    const y = dx * Math.sin(a) + dy * Math.cos(a);
    const aMil = (v: number) => Math.round(Math.min(1000, Math.max(0, (v / lado + 0.5) * 1000)));
    return [aMil(x), aMil(y)];
  };

  const pintar = () => {
    const d = caminoTrazo(puntos.current ?? []);
    halo.current?.setAttribute("d", d);
    tinta.current?.setAttribute("d", d);
  };

  const alBajar = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dibujando || puntos.current) return;
    if (puntosDe(trazos) >= MAX_PUNTOS) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    puntos.current = aLocal(e);
    pintar();
  };

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = puntos.current;
    if (!p) return;
    const [x, y] = aLocal(e);
    // Puntos muy juntos no aportan nada y solo pesan.
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 4) return;
    if (puntosDe(trazos) + p.length / 2 >= MAX_PUNTOS) return;
    p.push(x, y);
    pintar();
  };

  const alSubir = () => {
    const p = puntos.current;
    puntos.current = null;
    pintar();
    if (p) onTrazo?.({ g: grosor, p });
  };

  return (
    <svg
      ref={svg}
      viewBox="0 0 1000 1000"
      aria-hidden="true"
      className={`absolute inset-0 z-[1] h-full w-full overflow-visible ${
        dibujando ? "cursor-crosshair touch-none" : "pointer-events-none"
      }`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSubir}
      onPointerCancel={alSubir}
    >
      <Trazos trazos={trazos} />
      <path ref={halo} stroke={HALO} strokeWidth={grosor + 7} />
      <path ref={tinta} stroke={TINTA} strokeWidth={grosor} />
    </svg>
  );
}
