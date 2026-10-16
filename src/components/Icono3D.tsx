import { useId, type CSSProperties } from "react";

// Íconos con volumen propios de Liz (en vez de emojis o íconos planos). Cada
// pieza tiene grosor (una capa más oscura debajo), una cara con degradado y un
// relieve calculado con luz real (feSpecularLighting), así el brillo sigue la
// forma. Cada ícono trae su propio movimiento: el corazón late, la llama
// titila, la gema gira, la campana se balancea…

type Paleta = readonly [claro: string, base: string, oscuro: string, lado: string];

const P = {
  rojo: ["#ffb3c1", "#f43f5e", "#be123c", "#7f0d2c"],
  naranja: ["#ffd9a0", "#fb923c", "#ea580c", "#8a2f08"],
  amarillo: ["#fff6c2", "#fcd34d", "#eab308", "#8a5a06"],
  oro: ["#fff3c4", "#fbbf24", "#c2780a", "#6e3c06"],
  verde: ["#c8f7d6", "#4ade80", "#15a34a", "#0f4f2a"],
  azul: ["#cfe6ff", "#60a5fa", "#2563eb", "#1a2f7a"],
  cian: ["#d6f8ff", "#5fd3f5", "#0891b2", "#0b4560"],
  morado: ["#eadcff", "#a78bfa", "#7c3aed", "#3f1a87"],
  rosa: ["#ffe0ef", "#f9a8d4", "#ec4899", "#86184e"],
  marfil: ["#ffffff", "#f7efdc", "#d9c49b", "#94723f"],
  plata: ["#ffffff", "#e5eaf1", "#9aa6b8", "#4a5568"],
  grafito: ["#8c9bb3", "#4b5872", "#1f2937", "#0b1220"],
  cafe: ["#e2b88c", "#a8662b", "#6f3d12", "#3a1c05"],
  blanco: ["#ffffff", "#ffffff", "#f1e6ea", "#b9a3ab"],
} as const satisfies Record<string, Paleta>;

interface Pieza {
  d: string;
  p: Paleta;
  /** Detalle sobre la cara (sin grosor propio). */
  plano?: boolean;
  /** Se dibuja como línea de este grosor (sin relleno). */
  trazo?: number;
  opacidad?: number;
}

type Anim = "flotar" | "latir" | "titilar" | "girar" | "balancear" | "destellar" | "quieto";

interface Def {
  piezas: Pieza[];
  anim: Anim;
  giro?: number;
}

/** Estrella / sol: puntas alternando radio exterior e interior. */
function puntas(cx: number, cy: number, n: number, rOut: number, rIn: number, desfase = -90) {
  const pts: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const r = k % 2 ? rIn : rOut;
    const a = ((desfase + (k * 180) / n) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}
const circulo = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
const ovalo = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;

const CORAZON =
  "M32 54C17 43 8 34.5 8 23.5 8 15.5 14 9.5 21.5 9.5c4.6 0 8.3 2.3 10.5 5.9 2.2-3.6 5.9-5.9 10.5-5.9C50 9.5 56 15.5 56 23.5 56 34.5 47 43 32 54z";
const PETALOS = [0, 1, 2, 3, 4]
  .map((k) => {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    return circulo(
      +(32 + 12.5 * Math.cos(a)).toFixed(2),
      +(30 + 12.5 * Math.sin(a)).toFixed(2),
      10,
    );
  })
  .join("");

export const ICONOS = {
  corazon: { anim: "latir", piezas: [{ d: CORAZON, p: P.rojo }] },
  estrella: { anim: "flotar", piezas: [{ d: puntas(32, 32, 5, 25, 11), p: P.oro }] },
  luna: {
    anim: "flotar",
    giro: -8,
    piezas: [{ d: "M30.7 10A22 22 0 1 0 50.6 39.8 18 18 0 0 1 30.7 10z", p: P.amarillo }],
  },
  flor: {
    anim: "flotar",
    piezas: [
      { d: PETALOS, p: P.rosa },
      { d: circulo(32, 30, 7.5), p: P.amarillo },
    ],
  },
  huella: {
    anim: "flotar",
    piezas: [
      {
        d:
          "M32 30c-8 0-15 7.5-15 14.5 0 5 4 7.5 8 7.5 3 0 4.5-1.5 7-1.5s4 1.5 7 1.5c4 0 8-2.5 8-7.5C47 37.5 40 30 32 30z" +
          ovalo(15, 27, 5, 6.5) +
          ovalo(25, 16, 5, 6.5) +
          ovalo(39, 16, 5, 6.5) +
          ovalo(49, 27, 5, 6.5),
        p: P.cafe,
      },
    ],
  },
  brillo: {
    anim: "destellar",
    piezas: [
      {
        d: "M30 8c1.6 16 6 22.5 22 26-16 3.5-20.4 10-22 26-1.6-16-6-22.5-22-26 16-3.5 20.4-10 22-26z",
        p: P.amarillo,
      },
      {
        d: "M50 4c.6 4.5 2 6 6.5 6.5-4.5.5-5.9 2-6.5 6.5-.6-4.5-2-6-6.5-6.5 4.5-.5 5.9-2 6.5-6.5z",
        p: P.oro,
      },
    ],
  },
  llama: {
    anim: "titilar",
    piezas: [
      {
        d: "M32 4c3 9 15 15 15 30 0 11-7 20-15 20s-15-8-15-18c0-7 4-11 6-14 0 5 2 8 5 9-1-10 1-19 4-27z",
        p: P.naranja,
      },
      {
        d: "M32 29c2.5 5 8.5 8.5 8.5 15.5 0 5.5-3.8 9.5-8.5 9.5s-8.5-4-8.5-9c0-4.2 2.6-6.4 3.7-8.4.5 2.6 1.6 3.8 3.1 4.3.2-4.2-.1-8.3 1.7-11.9z",
        p: P.amarillo,
        plano: true,
      },
    ],
  },
  rayo: {
    anim: "flotar",
    piezas: [{ d: "M37 4L14 36h15l-4 24 25-34H35l7-22z", p: P.amarillo }],
  },
  gema: {
    anim: "girar",
    piezas: [
      { d: "M19 12h26l13 15-26 29L6 27z", p: P.cian },
      { d: "M19 12h26l13 15H6z", p: P.blanco, plano: true, opacidad: 0.35 },
      { d: "M6 27h16l10 29z", p: P.azul, plano: true, opacidad: 0.45 },
      { d: "M58 27H42L32 56z", p: P.azul, plano: true, opacidad: 0.3 },
      { d: "M19 12l3 15 10-15zM45 12l-3 15-10-15z", p: P.blanco, plano: true, opacidad: 0.4 },
    ],
  },
  check: {
    anim: "quieto",
    piezas: [
      { d: circulo(32, 31, 25), p: P.verde },
      { d: "M20 32l8.5 8.5L45 23", p: P.blanco, trazo: 6.5 },
    ],
  },
  candado: {
    anim: "quieto",
    piezas: [
      { d: "M19 31V22a13 13 0 0 1 26 0v9h-6.5v-9a6.5 6.5 0 0 0-13 0v9z", p: P.plata },
      {
        d: "M13 29h38a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V33a4 4 0 0 1 4-4z",
        p: P.oro,
      },
      {
        d: "M32 36.5a4.3 4.3 0 0 0-2.2 8V50h4.4v-5.5a4.3 4.3 0 0 0-2.2-8z",
        p: P.cafe,
        plano: true,
      },
    ],
  },
  trofeo: {
    anim: "flotar",
    piezas: [
      {
        d: "M19 7h26v13c0 9-5.8 16-13 16S19 29 19 20zM19 11h-8v4c0 7 4.5 11.5 10 12.5l1-4.5c-3.4-1-6-3.6-6-8v-.5h3zM45 11h8v4c0 7-4.5 11.5-10 12.5l-1-4.5c3.4-1 6-3.6 6-8v-.5h-3zM28 35h8v9h-8z",
        p: P.oro,
      },
      {
        d: "M20 44h24a3 3 0 0 1 3 3v8H17v-8a3 3 0 0 1 3-3z",
        p: P.cafe,
      },
      { d: puntas(32, 19, 5, 6.5, 2.9), p: P.amarillo, plano: true },
    ],
  },
  hueso: {
    anim: "quieto",
    giro: -28,
    piezas: [
      {
        d: "M15.5 23a6 6 0 1 0-6 9 6 6 0 1 0 6 9h33a6 6 0 1 0 6-9 6 6 0 1 0-6-9H15.5z",
        p: P.marfil,
      },
    ],
  },
  gota: {
    anim: "quieto",
    piezas: [{ d: "M32 5S13 28 13 39a19 19 0 0 0 38 0C51 28 32 5 32 5z", p: P.cian }],
  },
  burbujas: {
    anim: "quieto",
    piezas: [
      { d: circulo(23, 38, 15), p: P.cian, opacidad: 0.92 },
      { d: circulo(42, 22, 11), p: P.cian, opacidad: 0.92 },
      { d: circulo(46, 46, 8), p: P.cian, opacidad: 0.92 },
    ],
  },
  sol: {
    anim: "quieto",
    piezas: [
      { d: puntas(32, 32, 12, 28, 19), p: P.naranja },
      { d: circulo(32, 32, 15.5), p: P.amarillo },
    ],
  },
  casa: {
    anim: "quieto",
    piezas: [
      { d: "M12 30L32 13l20 17v25H38V41H26v14H12z", p: P.marfil },
      { d: "M32 5L3 30l4.5 4.5L32 14l24.5 20.5L61 30z", p: P.rojo },
    ],
  },
  arbol: {
    anim: "quieto",
    piezas: [
      { d: "M28 34h8v22h-8z", p: P.cafe },
      {
        d: circulo(32, 18, 13) + circulo(20, 30, 11) + circulo(44, 30, 11) + circulo(32, 34, 10),
        p: P.verde,
      },
    ],
  },
  mic: {
    anim: "quieto",
    piezas: [
      {
        d: "M15 27h4.5a12.5 12.5 0 0 0 25 0H49a17 17 0 0 1-14.5 16.8V51h8v5h-21v-5h8v-7.2A17 17 0 0 1 15 27z",
        p: P.grafito,
      },
      { d: "M23 14a9 9 0 0 1 18 0v14a9 9 0 0 1-18 0z", p: P.plata },
    ],
  },
  sobre: {
    anim: "quieto",
    piezas: [
      {
        d: "M9 15h46a5 5 0 0 1 5 5v27a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V20a5 5 0 0 1 5-5z",
        p: P.blanco,
      },
      { d: "M7 19l25 18 25-18", p: P.rosa, trazo: 2.6 },
      {
        d: "M32 46c-4.2-3-7.4-5.6-7.4-8.7a3.7 3.7 0 0 1 7.4-1.2 3.7 3.7 0 0 1 7.4 1.2c0 3.1-3.2 5.7-7.4 8.7z",
        p: P.rojo,
      },
    ],
  },
  birrete: {
    anim: "quieto",
    piezas: [
      { d: "M17 28v11c0 5 7 8.5 15 8.5S47 44 47 39V28l-15 7z", p: P.morado },
      { d: "M32 9l29 12.5L32 34 3 21.5z", p: P.morado },
      { d: "M51 25v13", p: P.oro, trazo: 2.4 },
      { d: "M48.5 37h5l1.2 9h-7.4z", p: P.oro },
    ],
  },
  campana: {
    anim: "balancear",
    piezas: [
      { d: "M26 51a6 6 0 0 0 12 0z", p: P.cafe },
      {
        d: "M32 5a4 4 0 0 1 4 4v1.6c8 2 13 9 13 18V39l5 6v4H10v-4l5-6V28.6c0-9 5-16 13-18V9a4 4 0 0 1 4-4z",
        p: P.oro,
      },
    ],
  },
  musica: {
    anim: "quieto",
    piezas: [
      {
        d:
          "M25 15L55 7v33.5h-4V15.6L29 21.4v25.1h-4z" +
          ovalo(20, 46.5, 8.5, 6.5) +
          ovalo(46, 40.5, 8.5, 6.5),
        p: P.morado,
      },
      { d: "M25 15L55 7v8.5L25 23.5z", p: P.rosa },
    ],
  },
  escudo: {
    anim: "quieto",
    piezas: [
      { d: "M32 5l22 8v16c0 14-10 23.5-22 28.5C20 52.5 10 43 10 29V13z", p: P.verde },
      { d: "M32 13l14.5 5.3V29c0 9.5-6.5 16-14.5 19.8z", p: P.blanco, plano: true, opacidad: 0.3 },
    ],
  },
} satisfies Record<string, Def>;

export type NombreIcono3D = keyof typeof ICONOS;

export function Icono3D({
  nombre,
  size = 28,
  anim,
  quieto = false,
  brillo = false,
  apagado = false,
  className = "",
  style,
}: {
  nombre: NombreIcono3D;
  size?: number | string;
  /** Cambia el movimiento propio del ícono. */
  anim?: Anim;
  quieto?: boolean;
  /** Reflejo de luz que cruza el ícono de vez en cuando. */
  brillo?: boolean;
  /** Gris y sin brillo (bloqueado / no disponible). */
  apagado?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const def: Def = ICONOS[nombre];
  const mov = quieto ? "quieto" : (anim ?? def.anim);
  const solidas = def.piezas.filter((pz) => !pz.plano && !pz.trazo);
  const giro = def.giro ? `rotate(${def.giro} 32 32)` : undefined;

  return (
    <span
      className={`i3d i3d-${mov} ${apagado ? "i3d-apagado" : ""} ${className}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="i3d-svg">
        <defs>
          {def.piezas.map((pz, i) => (
            <linearGradient key={i} id={`${uid}g${i}`} x1="0.25" y1="0" x2="0.6" y2="1">
              <stop offset="0" stopColor={pz.p[0]} />
              <stop offset="0.48" stopColor={pz.p[1]} />
              <stop offset="1" stopColor={pz.p[2]} />
            </linearGradient>
          ))}
          <radialGradient id={`${uid}piso`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#000" stopOpacity="0.38" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          {/* Relieve: el borde que mira a la luz brilla y el de abajo se oscurece. */}
          <filter
            id={`${uid}f`}
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.7" result="b" />
            <feSpecularLighting
              in="b"
              surfaceScale="3.2"
              specularConstant="1.25"
              specularExponent="30"
              lightingColor="#ffffff"
              result="s"
            >
              <feDistantLight azimuth="235" elevation="44" />
            </feSpecularLighting>
            <feComposite in="s" in2="SourceAlpha" operator="in" result="si" />
            <feComposite
              in="SourceGraphic"
              in2="si"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="0.75"
              k4="0"
              result="luz"
            />
            <feOffset in="SourceAlpha" dx="-1.2" dy="-2.4" result="o" />
            <feGaussianBlur in="o" stdDeviation="1.6" result="ob" />
            <feComposite in="SourceAlpha" in2="ob" operator="out" result="borde" />
            <feFlood floodColor="#1a0612" floodOpacity="0.32" />
            <feComposite in2="borde" operator="in" result="sombra" />
            <feMerge>
              <feMergeNode in="luz" />
              <feMergeNode in="sombra" />
            </feMerge>
          </filter>
          <clipPath id={`${uid}c`}>
            {solidas.map((pz, i) => (
              <path key={i} d={pz.d} />
            ))}
          </clipPath>
          {brillo && (
            <>
              <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </>
          )}
        </defs>

        <ellipse className="i3d-piso" cx="32" cy="60" rx="19" ry="3.6" fill={`url(#${uid}piso)`} />
        <g className="i3d-cuerpo" transform={giro}>
          {/* Grosor: la misma forma, más oscura, un poco más abajo. */}
          {solidas.map((pz, i) => (
            <path
              key={`l${i}`}
              d={pz.d}
              fill={pz.p[3]}
              stroke={pz.p[3]}
              strokeWidth="2"
              strokeLinejoin="round"
              transform="translate(0.4 3.2)"
              opacity={pz.opacidad}
            />
          ))}
          <g filter={`url(#${uid}f)`}>
            {def.piezas.map((pz, i) =>
              pz.trazo ? (
                <path
                  key={i}
                  d={pz.d}
                  fill="none"
                  stroke={`url(#${uid}g${i})`}
                  strokeWidth={pz.trazo}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={pz.opacidad}
                />
              ) : (
                <path
                  key={i}
                  d={pz.d}
                  fill={`url(#${uid}g${i})`}
                  stroke={pz.plano ? "none" : `url(#${uid}g${i})`}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  opacity={pz.opacidad}
                />
              ),
            )}
          </g>
          {/* Brillo de vidrio en la parte de arriba. */}
          <ellipse
            cx="24"
            cy="17"
            rx="10"
            ry="5"
            fill="#fff"
            opacity="0.22"
            transform="rotate(-28 24 17)"
            clipPath={`url(#${uid}c)`}
          />
          {brillo && (
            <g clipPath={`url(#${uid}c)`}>
              <rect
                className="i3d-barrido"
                x="-8"
                y="-10"
                width="16"
                height="84"
                fill={`url(#${uid}b)`}
                transform="rotate(22 32 32)"
              />
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}

export const ICONO3D_CSS = `
.i3d { display: inline-block; position: relative; flex: none; perspective: 240px; vertical-align: middle; }
.i3d-svg { width: 100%; height: 100%; display: block; overflow: visible; transform-style: preserve-3d; will-change: transform; }
.i3d-apagado { filter: grayscale(1) brightness(0.8); opacity: 0.55; }
.i3d-apagado .i3d-svg { animation: none !important; }

.i3d-flotar .i3d-svg { animation: i3d-flotar 4.6s ease-in-out infinite; }
.i3d-latir .i3d-svg { animation: i3d-latir 1.7s cubic-bezier(.3,0,.3,1) infinite; transform-origin: 50% 60%; }
.i3d-titilar .i3d-svg { animation: i3d-titilar 1.25s ease-in-out infinite alternate; transform-origin: 50% 92%; }
.i3d-girar .i3d-svg { animation: i3d-girar 5.5s cubic-bezier(.45,.05,.55,.95) infinite; }
.i3d-balancear .i3d-svg { animation: i3d-balancear 2.6s ease-in-out infinite; transform-origin: 50% 10%; }
.i3d-destellar .i3d-svg { animation: i3d-destellar 2.2s ease-in-out infinite alternate; }
.i3d-flotar .i3d-piso, .i3d-latir .i3d-piso { animation: i3d-piso 4.6s ease-in-out infinite; transform-origin: 32px 60px; }
.i3d-latir .i3d-piso { animation-duration: 1.7s; }
.i3d-barrido { animation: i3d-barrido 4.2s cubic-bezier(.5,0,.3,1) infinite; }

@keyframes i3d-flotar {
  0%, 100% { transform: translateY(1%) rotateY(-16deg) rotateX(6deg); }
  50% { transform: translateY(-7%) rotateY(16deg) rotateX(-4deg); }
}
@keyframes i3d-piso { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.82); opacity: 0.7; } }
@keyframes i3d-latir {
  0%, 46%, 100% { transform: scale(1) rotateY(0deg); }
  10% { transform: scale(1.14) rotateY(-8deg); }
  20% { transform: scale(0.98); }
  30% { transform: scale(1.08) rotateY(6deg); }
}
@keyframes i3d-titilar {
  0% { transform: scale(1, 1) skewX(-2deg); filter: brightness(1); }
  40% { transform: scale(0.97, 1.06) skewX(3deg); filter: brightness(1.12); }
  100% { transform: scale(1.03, 0.97) skewX(-3deg); filter: brightness(1.04); }
}
@keyframes i3d-girar {
  0% { transform: rotateY(0deg) translateY(0); }
  50% { transform: rotateY(180deg) translateY(-6%); }
  100% { transform: rotateY(360deg) translateY(0); }
}
@keyframes i3d-balancear {
  0%, 100% { transform: rotate(-11deg); }
  50% { transform: rotate(11deg); }
}
@keyframes i3d-destellar {
  0% { transform: scale(0.92) rotate(-6deg); filter: brightness(1); }
  100% { transform: scale(1.08) rotate(8deg); filter: brightness(1.18); }
}
@keyframes i3d-barrido {
  0%, 55% { transform: translateX(-60px) rotate(22deg); }
  100% { transform: translateX(80px) rotate(22deg); }
}
@media (prefers-reduced-motion: reduce) {
  .i3d-svg, .i3d-piso, .i3d-barrido { animation: none !important; }
}
`;
