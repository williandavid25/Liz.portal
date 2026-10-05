import type { Ref } from "react";

export type AccionMascota = null | "comiendo" | "banando" | "feliz";
export type OidoMascota = "inactivo" | "escuchando" | "oyendo" | "hablando";

/**
 * Escena de la mascota dibujada en SVG (no una imagen) para poder animar cada
 * parte: Snoopy respira, parpadea, mueve la cola, levanta la oreja para
 * escuchar y mueve la boca al repetir. El viewBox es muy ancho y se recorta
 * centrado ("slice"), así en celular se ve la casita de cerca y en computador
 * el patio completo.
 */
export function SnoopyEscena({
  nombre,
  durmiendo,
  accion,
  oido,
  contento,
  globo,
  bocaRef,
  onTocarSnoopy,
}: {
  nombre: string;
  durmiendo: boolean;
  accion: AccionMascota;
  oido: OidoMascota;
  contento: boolean;
  globo: string;
  bocaRef: Ref<SVGEllipseElement>;
  onTocarSnoopy: () => void;
}) {
  const escuchando = oido === "escuchando" || oido === "oyendo";
  const hablando = oido === "hablando";
  const clases = [
    "escena-mascota",
    durmiendo && "es-noche",
    accion && `accion-${accion}`,
    escuchando && "escuchando",
    oido === "oyendo" && "oyendo",
    hablando && "hablando",
    contento && "contento",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox="0 0 1600 560"
      preserveAspectRatio="xMidYMax slice"
      className={`${clases} block h-full w-full`}
      role="img"
      aria-label={`Snoopy sobre su casita. ${globo}`}
    >
      <defs>
        <linearGradient id="m-cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fa8d8" />
          <stop offset="0.5" stopColor="#a9cbe3" />
          <stop offset="0.78" stopColor="#f3dcb6" />
        </linearGradient>
        <radialGradient id="m-sol" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6d2" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff6d2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="m-pasto" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86c152" />
          <stop offset="1" stopColor="#4b8a2d" />
        </linearGradient>
        <linearGradient id="m-techo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2523f" />
          <stop offset="1" stopColor="#b8362a" />
        </linearGradient>
        <linearGradient id="m-casa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4433a" />
          <stop offset="1" stopColor="#a92f25" />
        </linearGradient>
        <pattern id="m-tablas" width="44" height="100" patternUnits="userSpaceOnUse">
          <rect x="2" y="0" width="40" height="100" rx="3" fill="#c49465" />
          <rect x="2" y="0" width="40" height="100" rx="3" fill="none" stroke="#8d6038" strokeWidth="2" />
          <line x1="14" y1="12" x2="14" y2="88" stroke="#b07f52" strokeWidth="2" opacity="0.6" />
        </pattern>
        <pattern id="m-hierba" width="24" height="18" patternUnits="userSpaceOnUse">
          <path d="M3 18 L6 6 M11 18 L13 3 M19 18 L17 8" stroke="#3f7a24" strokeWidth="1.6" opacity="0.55" />
        </pattern>
        <symbol id="m-nube" viewBox="-40 -50 160 80" overflow="visible">
          <g fill="#fff">
            <circle cx="0" cy="0" r="30" />
            <circle cx="36" cy="-16" r="38" />
            <circle cx="78" cy="-2" r="30" />
            <ellipse cx="40" cy="10" rx="62" ry="20" />
          </g>
        </symbol>
        <symbol id="m-corazon" viewBox="-12 -11 24 22" overflow="visible">
          <path
            d="M0 9 C-14 -1 -9 -12 0 -5 C9 -12 14 -1 0 9 Z"
            fill="#e8506f"
            stroke="#a52746"
            strokeWidth="1.2"
          />
        </symbol>
      </defs>

      {/* ===== Cielo, sol y nubes ===== */}
      <rect width="1600" height="560" fill="url(#m-cielo)" />
      <circle cx="1240" cy="330" r="230" fill="url(#m-sol)" className="m-sol" />
      <g className="m-nubes" opacity="0.92">
        <g className="m-nube n1"><use href="#m-nube" x="0" y="0" width="160" height="80" transform="translate(120 120) scale(1)" /></g>
        <g className="m-nube n2"><use href="#m-nube" x="0" y="0" width="160" height="80" transform="translate(600 70) scale(0.7)" /></g>
        <g className="m-nube n3"><use href="#m-nube" x="0" y="0" width="160" height="80" transform="translate(1050 150) scale(0.55)" /></g>
        <g className="m-nube n4"><use href="#m-nube" x="0" y="0" width="160" height="80" transform="translate(1380 90) scale(0.9)" /></g>
      </g>

      {/* ===== Noche (al dormir) ===== */}
      <g className="m-noche" pointerEvents="none">
        <rect width="1600" height="560" fill="#0c1640" />
        {[
          [560, 60],
          [640, 140],
          [700, 40],
          [905, 70],
          [990, 30],
          [1060, 170],
          [600, 230],
          [1120, 60],
          [480, 120],
          [1200, 200],
          [380, 50],
          [1280, 110],
        ].map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i % 3 === 0 ? 2.6 : 1.8}
            fill="#fff8d8"
            className="m-estrella"
            style={{ animationDelay: `${(i % 5) * 0.6}s` }}
          />
        ))}
        <path
          d="M1010 70 a38 38 0 1 0 34 56 a30 30 0 1 1 -34 -56 Z"
          fill="#ffe27a"
          className="m-luna"
        />
      </g>

      {/* ===== Arbustos de atrás, cerca y pasto ===== */}
      <g fill="#3f7d2c">
        <circle cx="60" cy="380" r="70" />
        <circle cx="160" cy="360" r="80" />
        <circle cx="270" cy="395" r="60" />
        <circle cx="1340" cy="395" r="60" />
        <circle cx="1450" cy="360" r="80" />
        <circle cx="1560" cy="380" r="70" />
      </g>
      <rect x="0" y="340" width="1600" height="100" fill="url(#m-tablas)" />
      <rect x="0" y="362" width="1600" height="9" fill="#946640" />
      <rect x="0" y="408" width="1600" height="9" fill="#946640" />
      <g fill="#4f9a35">
        <circle cx="430" cy="430" r="44" />
        <circle cx="490" cy="440" r="34" />
        <circle cx="1120" cy="440" r="36" />
        <circle cx="1175" cy="430" r="44" />
      </g>
      <rect x="0" y="425" width="1600" height="135" fill="url(#m-pasto)" />
      <rect x="0" y="425" width="1600" height="135" fill="url(#m-hierba)" />
      <g fill="#3d7a26">
        <circle cx="40" cy="520" r="60" />
        <circle cx="130" cy="540" r="50" />
        <circle cx="1480" cy="540" r="50" />
        <circle cx="1570" cy="515" r="60" />
      </g>
      <ellipse cx="800" cy="528" rx="140" ry="14" fill="#1d3a10" opacity="0.28" />

      {/* ===== Casita ===== */}
      <g>
        <path d="M712 372 L800 298 L888 372 Z" fill="url(#m-casa)" />
        <rect x="712" y="366" width="176" height="160" fill="url(#m-casa)" />
        <g stroke="#8f2a20" strokeWidth="2" opacity="0.55">
          {[392, 418, 444, 470, 496].map((y) => (
            <line key={y} x1="712" y1={y} x2="888" y2={y} />
          ))}
        </g>
        <rect x="712" y="366" width="176" height="160" fill="none" stroke="#7d2219" strokeWidth="3" />
        <path d="M770 526 V474 A30 30 0 0 1 830 474 V526 Z" fill="#3a1610" />
        <path d="M770 526 V474 A30 30 0 0 1 830 474" fill="none" stroke="#7d2219" strokeWidth="4" />
        <rect x="758" y="392" width="84" height="27" rx="6" fill="#f6e6c4" stroke="#8a5a2a" strokeWidth="2.5" />
        <text
          x="800"
          y="411"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          fill="#6b3a14"
          letterSpacing="1.5"
          style={{ fontFamily: "Karla, sans-serif" }}
        >
          {nombre.toUpperCase().slice(0, 9)}
        </text>
        <path d="M664 374 L800 274 L800 300 L680 392 Z" fill="url(#m-techo)" stroke="#7d2219" strokeWidth="3" strokeLinejoin="round" />
        <path d="M800 274 L936 374 L920 392 L800 300 Z" fill="url(#m-techo)" stroke="#7d2219" strokeWidth="3" strokeLinejoin="round" />
        <path d="M672 372 L800 280 L928 372" fill="none" stroke="#f07a62" strokeWidth="3" opacity="0.6" />
      </g>

      {/* ===== Platito (aparece al comer) ===== */}
      <g transform="translate(905 514)"><g className="m-plato">
        <ellipse cx="0" cy="-14" rx="25" ry="8" fill="#8b5a2b" />
        <circle cx="-9" cy="-18" r="5" fill="#a26a35" />
        <circle cx="6" cy="-19" r="5" fill="#9a6331" />
        <path d="M-30 -14 H30 L22 4 H-22 Z" fill="#d23a2e" stroke="#7d2219" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M-12 -6 h24" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      </g></g>

      {/* ===== Snoopy ===== */}
      <g
        className="m-snoopy"
        transform="translate(800 262)"
        onClick={onTocarSnoopy}
        style={{ cursor: "pointer" }}
      >
        <rect x="-150" y="-80" width="250" height="140" fill="transparent" />
        <g className="m-snoopy-salto">
          {/* pata trasera */}
          <ellipse cx="76" cy="22" rx="20" ry="11" fill="#fbfaf6" stroke="#2b2b2b" strokeWidth="3" />
          {/* cola */}
          <path
            className="m-cola"
            d="M76 -12 C84 -26 92 -30 96 -40 C100 -34 96 -20 84 -8 Z"
            fill="#fbfaf6"
            stroke="#2b2b2b"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* cuerpo */}
          <ellipse className="m-cuerpo" cx="18" cy="6" rx="64" ry="28" fill="#fbfaf6" stroke="#2b2b2b" strokeWidth="3" />
          {/* collar */}
          <rect x="-16" y="-14" width="9" height="30" rx="3" fill="#d23a2e" stroke="#2b2b2b" strokeWidth="2" transform="rotate(-10 -12 0)" />
          {/* pata delantera */}
          <ellipse cx="-30" cy="26" rx="17" ry="9" fill="#fbfaf6" stroke="#2b2b2b" strokeWidth="3" />

          {/* cabeza */}
          <g className="m-cabeza" transform="translate(-48 -6)">
            <g className="m-cabeza-anim">
              <path
                d="M22 -10 C22 -32 -4 -40 -20 -30 C-30 -24 -40 -22 -60 -22 C-78 -22 -86 -10 -84 0 C-82 12 -70 16 -50 15 C-36 14 -26 18 -14 22 C4 28 22 14 22 -10 Z"
                fill="#fbfaf6"
                stroke="#2b2b2b"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <ellipse cx="-85" cy="-6" rx="9.5" ry="7.5" fill="#1d1d1d" />
              <ellipse cx="-88" cy="-8.5" rx="3" ry="2" fill="#fff" opacity="0.6" />
              {/* ojo: cerrado al dormir, abierto (y parpadea) despierto */}
              {durmiendo ? (
                <path d="M-24 -12 q6 5 12 0" fill="none" stroke="#1d1d1d" strokeWidth="3" strokeLinecap="round" />
              ) : (
                <ellipse className="m-ojo" cx="-17" cy="-13" rx="3.4" ry="5.2" fill="#1d1d1d" />
              )}
              {/* sonrisa / boca que habla */}
              <path className="m-sonrisa" d="M-64 9 q12 7 26 1" fill="none" stroke="#1d1d1d" strokeWidth="2.6" strokeLinecap="round" />
              <ellipse ref={bocaRef} className="m-boca" cx="-50" cy="10" rx="7" ry="1" fill="#5a1d1d" />
              {/* espuma del baño */}
              <g className="m-espuma" fill="#fff" stroke="#bfe3f5" strokeWidth="1.5">
                <circle cx="-6" cy="-34" r="10" />
                <circle cx="8" cy="-30" r="8" />
                <circle cx="-18" cy="-32" r="7" />
              </g>
              {/* oreja: cuelga; al escuchar se levanta */}
              <g transform="translate(6 2)"><path
                className="m-oreja"
                d="M0 -24 C16 -26 22 -8 18 14 C14 40 2 58 -6 58 C-16 58 -14 36 -10 16 C-8 0 -10 -20 0 -24 Z"
                fill="#1f1f1f" /></g>
            </g>
          </g>
        </g>
      </g>

      {/* ===== Woodstock ===== */}
      <g transform="translate(610 225)">
        <g className="m-woodstock">
          <path d="M-22 4 l-12 -6 l2 10 l-10 2 l12 4 Z" fill="#f2c114" stroke="#5a3d0c" strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="0" cy="2" rx="22" ry="16" fill="#f7d117" stroke="#5a3d0c" strokeWidth="2.5" />
          <circle cx="15" cy="-17" r="14" fill="#f7d117" stroke="#5a3d0c" strokeWidth="2.5" />
          <path d="M10 -30 q-4 -12 4 -14 M15 -31 q2 -12 10 -10 M20 -29 q8 -8 12 -2" fill="none" stroke="#5a3d0c" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M27 -19 L40 -15 L27 -11 Z" fill="#f29a1d" stroke="#8a4c08" strokeWidth="1.5" strokeLinejoin="round" />
          {durmiendo ? (
            <path d="M15 -19 q3 3 6 0" fill="none" stroke="#3a2a10" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <circle cx="19" cy="-19" r="2.2" fill="#3a2a10" />
          )}
          <path className="m-ala" d="M-6 -2 C-18 -20 4 -26 10 -8 C6 0 -2 2 -6 -2 Z" fill="#f2c114" stroke="#5a3d0c" strokeWidth="2" strokeLinejoin="round" />
          <path d="M-4 17 l-3 9 M4 17 l2 9" stroke="#8a4c08" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>

      {/* ===== Corazones (cuando está contento) ===== */}
      <g className="m-corazones" pointerEvents="none">
        <g className="m-corazon"><use href="#m-corazon" x="0" y="0" width="22" height="20" transform="translate(628 168)" /></g>
        <g className="m-corazon c2"><use href="#m-corazon" x="0" y="0" width="28" height="26" transform="translate(655 150)" /></g>
        <g className="m-corazon c3"><use href="#m-corazon" x="0" y="0" width="20" height="18" transform="translate(760 200)" /></g>
      </g>

      {/* ===== Zzz (dormido) ===== */}
      <g className="m-zzz" pointerEvents="none" fill="#eaf0ff" fontWeight="800" style={{ fontFamily: "Karla, sans-serif" }}>
        <text x="776" y="226" fontSize="20" className="z z1">z</text>
        <text x="790" y="212" fontSize="26" className="z z2">z</text>
        <text x="806" y="196" fontSize="32" className="z z3">Z</text>
      </g>

      {/* ===== Baño: ducha y burbujas ===== */}
      <g className="m-bano" pointerEvents="none">
        <g stroke="#7cc8ef" strokeWidth="3" strokeLinecap="round" opacity="0.85">
          {[720, 745, 770, 795, 820, 845, 870].map((x, i) => (
            <line key={x} x1={x} y1="150" x2={x - 6} y2="172" className="m-gota" style={{ animationDelay: `${i * 0.11}s` }} />
          ))}
        </g>
        <path d="M790 118 h40 a8 8 0 0 1 8 8 v14 h-56 v-14 a8 8 0 0 1 8 -8 Z" fill="#c9d3dc" stroke="#5b6670" strokeWidth="2.5" />
        <path d="M810 118 v-40 h60" fill="none" stroke="#5b6670" strokeWidth="6" strokeLinecap="round" />
        {[
          [730, 300, 9],
          [770, 310, 12],
          [820, 305, 8],
          [860, 300, 11],
          [700, 290, 7],
          [890, 295, 9],
        ].map(([x, y, r], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill="#e9f7ff"
            fillOpacity="0.55"
            stroke="#9fd6f2"
            strokeWidth="1.8"
            className="m-burbuja"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </g>

      {/* ===== Globo de diálogo ===== */}
      <g className="m-globo" pointerEvents="none">
        <foreignObject x="822" y="96" width="232" height="140">
          <div className="m-globo-caja">
            <div key={globo} className="m-globo-texto">
              {globo}
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>
  );
}
