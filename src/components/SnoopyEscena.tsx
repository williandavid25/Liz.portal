import type { CSSProperties, KeyboardEvent, Ref } from "react";

export type AccionTecho = null | "feliz";
export type OidoMascota = "inactivo" | "escuchando" | "oyendo" | "hablando";
/** Dónde está Snoopy: en el techo, bajando de un salto, en el pasto o subiendo. */
export type PoseMascota = "techo" | "bajando" | "suelo" | "subiendo";
/** Qué hace en el pasto. */
export type AnimSuelo = "parado" | "correr" | "comer" | "frente" | "tina" | "sacudir";

export interface EstadoSuelo {
  pose: PoseMascota;
  x: number; // posición horizontal en el patio (unidades del viewBox)
  dir: 1 | -1; // 1 mira a la derecha, -1 a la izquierda
  anim: AnimSuelo;
  dur: number; // ms del desplazamiento actual
}
export interface EstadoHueso {
  estado: "oculto" | "volando" | "suelo" | "comiendo";
  x: number;
}

const SUELO_Y = 522;

/** Enter o espacio activan lo que se puede tocar (teclado / lectores de pantalla). */
const teclaActiva = (fn: () => void) => (e: KeyboardEvent<SVGGElement>) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
const TECHO = { x: 800, y: 262 };

/* ------------------------------------------------------------------ */
/* Piezas de Snoopy                                                     */
/* ------------------------------------------------------------------ */

const TRAZO = "#262321";
const PELAJE = "url(#m-pelaje)";

/** Cabeza de perfil (hocico hacia la izquierda). Se reutiliza en varias poses. */
function CabezaPerfil({ ojo }: { ojo: "abierto" | "cerrado" }) {
  return (
    <>
      <path
        d="M22 -10 C22 -32 -4 -40 -20 -30 C-30 -24 -40 -22 -60 -22 C-78 -22 -86 -10 -84 0 C-82 12 -70 16 -50 15 C-36 14 -26 18 -14 22 C4 28 22 14 22 -10 Z"
        fill={PELAJE}
        stroke={TRAZO}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="-85" cy="-6" rx="9.5" ry="7.5" fill="#161413" />
      <ellipse cx="-88" cy="-8.5" rx="3" ry="2" fill="#fff" opacity="0.65" />
      {ojo === "cerrado" ? (
        <path d="M-24 -12 q6 5 12 0" fill="none" stroke="#161413" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <g className="m-ojo">
          <ellipse cx="-17" cy="-13" rx="3.4" ry="5.2" fill="#161413" />
          <circle cx="-16" cy="-15" r="1.1" fill="#fff" />
        </g>
      )}
      <path className="m-sonrisa" d="M-64 9 q12 7 26 1" fill="none" stroke="#161413" strokeWidth="2.6" strokeLinecap="round" />
    </>
  );
}

function OrejaPerfil() {
  return (
    <g transform="translate(6 2)">
      <path
        className="m-oreja"
        d="M0 -24 C16 -26 22 -8 18 14 C14 40 2 58 -6 58 C-16 58 -14 36 -10 16 C-8 0 -10 -20 0 -24 Z"
        fill="url(#m-oreja-grad)"
      />
    </g>
  );
}

/** Snoopy acostado en el techo de la casita (pose clásica). */
function SnoopyTecho({ durmiendo }: { durmiendo: boolean }) {
  return (
    <g className="m-snoopy-salto">
      <ellipse cx="18" cy="34" rx="70" ry="7" fill="#000" opacity="0.12" />
      <ellipse cx="76" cy="22" rx="20" ry="11" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <path
        className="m-cola"
        d="M76 -12 C84 -26 92 -30 96 -40 C100 -34 96 -20 84 -8 Z"
        fill={PELAJE}
        stroke={TRAZO}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse className="m-cuerpo" cx="18" cy="6" rx="64" ry="28" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <path d="M-20 18 q30 12 70 4" fill="none" stroke="#d9d4c9" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      <rect x="-16" y="-14" width="9" height="30" rx="3" fill="#d23a2e" stroke={TRAZO} strokeWidth="2" transform="rotate(-10 -12 0)" />
      <ellipse cx="-30" cy="26" rx="17" ry="9" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <g transform="translate(-48 -6)">
        <g className="m-cabeza-anim">
          <CabezaPerfil ojo={durmiendo ? "cerrado" : "abierto"} />
          <OrejaPerfil />
        </g>
      </g>
    </g>
  );
}

/** Snoopy de pie, de perfil (mira a la derecha). Origen: entre los pies. */
function SnoopyLado({ anim }: { anim: AnimSuelo }) {
  return (
    <g className={`m-lado m-lado-${anim}`}>
      <circle className="m-polvo" cx="-18" cy="-4" r="7" fill="#e9dcc0" />
      <circle className="m-polvo p2" cx="-8" cy="-2" r="5" fill="#e9dcc0" />
      <g className="m-pierna m-pierna-atras">
        <rect x="-15" y="-40" width="15" height="34" rx="7" fill="#ebe7de" stroke={TRAZO} strokeWidth="3" />
        <ellipse cx="-2" cy="-6" rx="16" ry="7.5" fill="#ebe7de" stroke={TRAZO} strokeWidth="3" />
      </g>
      <path className="m-cola-lado" d="M-22 -62 C-34 -70 -38 -80 -36 -90 C-28 -84 -24 -74 -16 -66 Z" fill={PELAJE} stroke={TRAZO} strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="0" cy="-60" rx="25" ry="31" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <path d="M-14 -40 q12 10 26 2" fill="none" stroke="#d9d4c9" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      <g className="m-pierna m-pierna-frente">
        <rect x="-2" y="-40" width="15" height="34" rx="7" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
        <ellipse cx="11" cy="-6" rx="16" ry="7.5" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      </g>
      <rect x="0" y="-92" width="9" height="22" rx="3" fill="#d23a2e" stroke={TRAZO} strokeWidth="2" transform="rotate(14 4 -80)" />
      <ellipse className="m-brazo" cx="12" cy="-62" rx="7" ry="15" fill={PELAJE} stroke={TRAZO} strokeWidth="3" transform="rotate(-22 12 -62)" />
      <g transform="translate(14 -104) scale(-0.8 0.8)">
        <g className="m-cabeza-lado">
          <CabezaPerfil ojo="abierto" />
          <OrejaPerfil />
        </g>
      </g>
      {/* gotitas al sacudirse */}
      <g className="m-gotitas" fill="#8fd3f5">
        <circle cx="-40" cy="-90" r="4" />
        <circle cx="38" cy="-100" r="3.5" />
        <circle cx="-34" cy="-50" r="3" />
        <circle cx="42" cy="-60" r="4" />
        <circle cx="0" cy="-140" r="3.5" />
      </g>
    </g>
  );
}

/** Snoopy de pie mirando al frente (para escuchar y hablar). */
function SnoopyFrente({ bocaRef, enTina }: { bocaRef: Ref<SVGEllipseElement>; enTina: boolean }) {
  return (
    <g transform={enTina ? "translate(0 36)" : undefined}>
    <g className="m-frente">
      {!enTina && <ellipse cx="0" cy="2" rx="40" ry="8" fill="#1d3a10" opacity="0.28" />}
      <ellipse cx="-16" cy="-7" rx="15" ry="8" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <ellipse cx="16" cy="-7" rx="15" ry="8" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <ellipse cx="0" cy="-46" rx="29" ry="35" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
      <ellipse cx="0" cy="-38" rx="15" ry="18" fill="#fff" opacity="0.7" />
      <g className="m-brazo-izq">
        <ellipse cx="-28" cy="-52" rx="8" ry="16" fill={PELAJE} stroke={TRAZO} strokeWidth="3" transform="rotate(20 -28 -52)" />
      </g>
      <g className="m-brazo-der">
        <ellipse cx="28" cy="-52" rx="8" ry="16" fill={PELAJE} stroke={TRAZO} strokeWidth="3" transform="rotate(-20 28 -52)" />
      </g>
      <rect x="-19" y="-84" width="38" height="9" rx="4.5" fill="#d23a2e" stroke={TRAZO} strokeWidth="2" />
      <g transform="translate(0 -113)">
        <g className="m-cabeza-frente">
          <ellipse cx="0" cy="0" rx="34" ry="31" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
          <ellipse cx="0" cy="15" rx="26" ry="19" fill={PELAJE} stroke={TRAZO} strokeWidth="3" />
          <path d="M-20 6 q20 -8 40 0" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="0" cy="5" rx="10.5" ry="8" fill="#161413" />
          <ellipse cx="-3" cy="1.5" rx="3" ry="2" fill="#fff" opacity="0.65" />
          <g className="m-ojo">
            <ellipse cx="-13" cy="-11" rx="3.4" ry="5.2" fill="#161413" />
            <ellipse cx="13" cy="-11" rx="3.4" ry="5.2" fill="#161413" />
            <circle cx="-12" cy="-13" r="1.1" fill="#fff" />
            <circle cx="14" cy="-13" r="1.1" fill="#fff" />
          </g>
          <path className="m-sonrisa" d="M-10 24 q10 8 20 0" fill="none" stroke="#161413" strokeWidth="2.6" strokeLinecap="round" />
          <ellipse ref={bocaRef} className="m-boca" cx="0" cy="25" rx="7" ry="1" fill="#5a1d1d" />
          <g className="m-oreja-izq">
            <path d="M-26 -18 C-38 -16 -44 4 -42 24 C-40 42 -32 52 -26 50 C-20 48 -22 28 -20 12 C-18 -2 -16 -16 -26 -18 Z" fill="url(#m-oreja-grad)" />
          </g>
          <g className="m-oreja-der">
            <path d="M26 -18 C38 -16 44 4 42 24 C40 42 32 52 26 50 C20 48 22 28 20 12 C18 -2 16 -16 26 -18 Z" fill="url(#m-oreja-grad)" />
          </g>
          <g className="m-espuma" fill="#fff" stroke="#bfe3f5" strokeWidth="1.5">
            <circle cx="-8" cy="-30" r="11" />
            <circle cx="8" cy="-32" r="9" />
            <circle cx="20" cy="-26" r="7" />
          </g>
        </g>
      </g>
    </g>
    </g>
  );
}

function Hueso() {
  return (
    <g>
      <path
        d="M-16 -3 H16 a6 6 0 1 1 5 -6 a6 6 0 1 1 1 12 a6 6 0 1 1 -6 6 H-16 a6 6 0 1 1 -6 -6 a6 6 0 1 1 1 -12 a6 6 0 1 1 5 6 Z"
        fill="#fbf4e4"
        stroke="#7a5a35"
        strokeWidth="2.4"
        strokeLinejoin="round"
        transform="translate(0 -6)"
      />
    </g>
  );
}

function Tina() {
  return (
    <g className="m-tina">
      <ellipse cx="0" cy="2" rx="70" ry="9" fill="#1d3a10" opacity="0.28" />
      <path d="M-46 -6 l-8 10 M46 -6 l8 10" stroke="#c9a33a" strokeWidth="6" strokeLinecap="round" />
      <path d="M-64 -50 Q-62 -6 -30 -6 H30 Q62 -6 64 -50 Z" fill="url(#m-tina-grad)" stroke="#5b6670" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="0" cy="-50" rx="66" ry="9" fill="#e9f3f8" stroke="#5b6670" strokeWidth="3" />
      <g fill="#fff" stroke="#bfe3f5" strokeWidth="1.5">
        <circle cx="-48" cy="-56" r="10" />
        <circle cx="-30" cy="-60" r="12" />
        <circle cx="30" cy="-60" r="11" />
        <circle cx="50" cy="-55" r="9" />
      </g>
      <g transform="translate(44 -66)">
      <g className="m-patito">
        <ellipse cx="0" cy="0" rx="12" ry="8" fill="#ffd23f" stroke="#a37a00" strokeWidth="1.8" />
        <circle cx="8" cy="-9" r="6.5" fill="#ffd23f" stroke="#a37a00" strokeWidth="1.8" />
        <path d="M14 -9 l6 2 l-6 2 Z" fill="#f28c1d" />
        <circle cx="10" cy="-11" r="1.2" fill="#222" />
      </g>
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */

export function SnoopyEscena({
  nombre,
  durmiendo,
  accionTecho,
  oido,
  contento,
  globo,
  suelo,
  hueso,
  tina,
  bocaRef,
  onTocarSnoopy,
  onTocarLampara,
  pausada = false,
}: {
  pausada?: boolean;
  nombre: string;
  durmiendo: boolean;
  accionTecho: AccionTecho;
  oido: OidoMascota;
  contento: boolean;
  globo: string;
  suelo: EstadoSuelo;
  hueso: EstadoHueso;
  tina: boolean;
  bocaRef: Ref<SVGEllipseElement>;
  onTocarSnoopy: () => void;
  onTocarLampara: () => void;
}) {
  const escuchando = oido === "escuchando" || oido === "oyendo";
  const enSuelo = suelo.pose !== "techo";
  const frente = suelo.anim === "frente" || suelo.anim === "tina";
  const clases = [
    "escena-mascota",
    durmiendo && "es-noche",
    accionTecho && `accion-${accionTecho}`,
    escuchando && "escuchando",
    oido === "oyendo" && "oyendo",
    oido === "hablando" && "hablando",
    contento && "contento",
    suelo.anim === "tina" && "accion-banando",
    pausada && "escena-pausada",
  ]
    .filter(Boolean)
    .join(" ");

  const sueloStyle: CSSProperties = {
    transform: `translate(${suelo.x}px, ${SUELO_Y}px)`,
    transition: `transform ${suelo.dur}ms ${suelo.anim === "correr" ? "cubic-bezier(0.45, 0, 0.25, 1)" : "ease-in-out"}`,
  };

  return (
    <svg
      viewBox="0 0 1600 560"
      preserveAspectRatio="xMidYMax slice"
      className={`${clases} block h-full w-full select-none`}
      role="img"
      aria-label={`Snoopy en su casita. ${globo}`}
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
        <radialGradient id="m-luz" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#ffd970" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd970" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="m-pelaje" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.65" stopColor="#f6f3ec" />
          <stop offset="1" stopColor="#dcd6c9" />
        </radialGradient>
        <linearGradient id="m-oreja-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3634" />
          <stop offset="1" stopColor="#121110" />
        </linearGradient>
        <linearGradient id="m-tina-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfdde6" />
        </linearGradient>
        <linearGradient id="m-pasto" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86c152" />
          <stop offset="1" stopColor="#4b8a2d" />
        </linearGradient>
        <linearGradient id="m-techo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e85a45" />
          <stop offset="1" stopColor="#b3342a" />
        </linearGradient>
        <linearGradient id="m-casa" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9352b" />
          <stop offset="0.45" stopColor="#d84a3c" />
          <stop offset="1" stopColor="#a52d24" />
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
          <ellipse cx="40" cy="20" rx="60" ry="8" fill="#d8e6f2" opacity="0.7" />
        </symbol>
        <symbol id="m-corazon" viewBox="-12 -11 24 22" overflow="visible">
          <path d="M0 9 C-14 -1 -9 -12 0 -5 C9 -12 14 -1 0 9 Z" fill="#e8506f" stroke="#a52746" strokeWidth="1.2" />
        </symbol>
      </defs>

      {/* ===== Cielo, sol y nubes ===== */}
      <rect width="1600" height="560" fill="url(#m-cielo)" />
      <circle cx="1240" cy="330" r="230" fill="url(#m-sol)" className="m-sol" />
      <g opacity="0.92">
        {(
          [
            ["n1", 120, 120, 1],
            ["n2", 600, 70, 0.7],
            ["n3", 1050, 150, 0.55],
            ["n4", 1380, 90, 0.9],
          ] as const
        ).map(([k, x, y, s]) => (
          <g key={k} className={`m-nube ${k}`}>
            <use href="#m-nube" width="160" height="80" transform={`translate(${x} ${y}) scale(${s})`} />
          </g>
        ))}
      </g>
      {/* cielo nocturno */}
      <g className="m-noche" pointerEvents="none">
        <rect width="1600" height="440" fill="#0c1640" />
        {[
          [560, 60], [640, 140], [700, 40], [905, 70], [990, 30], [1060, 170],
          [600, 230], [1120, 60], [480, 120], [1200, 200], [380, 50], [1280, 110],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.6 : 1.8} fill="#fff8d8" className="m-estrella" style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
        ))}
        <circle cx="1010" cy="100" r="90" fill="url(#m-sol)" opacity="0.35" />
        <path d="M1010 70 a38 38 0 1 0 34 56 a30 30 0 1 1 -34 -56 Z" fill="#ffe27a" />
      </g>

      {/* ===== Fondo del patio ===== */}
      <g fill="#4b8a3a">
        <circle cx="60" cy="380" r="70" />
        <circle cx="160" cy="360" r="80" />
        <circle cx="270" cy="395" r="60" />
        <circle cx="1340" cy="395" r="60" />
        <circle cx="1450" cy="360" r="80" />
        <circle cx="1560" cy="380" r="70" />
      </g>
      <rect x="0" y="300" width="1600" height="140" fill="#dbe9f2" opacity="0.22" />
      <rect x="0" y="340" width="1600" height="100" fill="url(#m-tablas)" />
      <rect x="0" y="340" width="1600" height="100" fill="#e8f1f6" opacity="0.12" />
      <rect x="0" y="362" width="1600" height="9" fill="#946640" />
      <rect x="0" y="408" width="1600" height="9" fill="#946640" />
      <rect x="0" y="430" width="1600" height="12" fill="#2f5a1c" opacity="0.25" />
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

      {/* ===== Lámpara (tócala para apagar/encender la luz) ===== */}
      <g
        className={`m-lampara ${durmiendo ? "apagada" : "encendida"}`}
        transform="translate(612 525)"
        onClick={onTocarLampara}
        onKeyDown={teclaActiva(onTocarLampara)}
        tabIndex={0}
        style={{ cursor: "pointer" }}
        role="button"
        aria-label={durmiendo ? "Encender la luz" : "Apagar la luz"}
      >
        <circle className="m-lampara-halo" cx="0" cy="-216" r="120" fill="url(#m-luz)" />
        <rect x="-40" y="-275" width="80" height="285" fill="transparent" />
        <ellipse cx="0" cy="2" rx="24" ry="5" fill="#1d3a10" opacity="0.3" />
        <rect x="-16" y="-10" width="32" height="10" rx="3" fill="#26332c" />
        <rect x="-5" y="-192" width="10" height="184" fill="#34473d" />
        <rect x="-3" y="-192" width="3" height="184" fill="#5d7668" opacity="0.7" />
        <path d="M-20 -194 L20 -194 L14 -236 L-14 -236 Z" className="m-lampara-vidrio" stroke="#26332c" strokeWidth="3" strokeLinejoin="round" />
        <path d="M0 -236 V-194 M-17 -215 H17" stroke="#26332c" strokeWidth="2" />
        <path d="M-25 -236 L0 -253 L25 -236 Z" fill="#26332c" />
        <circle cx="0" cy="-258" r="4.5" fill="#26332c" />
        <rect x="-24" y="-196" width="48" height="6" rx="2" fill="#26332c" />
      </g>

      {/* ===== Casita ===== */}
      <g>
        <ellipse cx="800" cy="528" rx="140" ry="14" fill="#1d3a10" opacity="0.28" />
        <path d="M712 372 L800 298 L888 372 Z" fill="url(#m-casa)" />
        <rect x="712" y="366" width="176" height="160" fill="url(#m-casa)" />
        <g stroke="#8f2a20" strokeWidth="2" opacity="0.5">
          {[392, 418, 444, 470, 496].map((y) => (
            <line key={y} x1="712" y1={y} x2="888" y2={y} />
          ))}
        </g>
        <g stroke="#f07a62" strokeWidth="1.5" opacity="0.35">
          {[394, 420, 446, 472, 498].map((y) => (
            <line key={y} x1="712" y1={y} x2="888" y2={y} />
          ))}
        </g>
        <rect x="712" y="366" width="176" height="160" fill="none" stroke="#7d2219" strokeWidth="3" />
        <path d="M770 526 V474 A30 30 0 0 1 830 474 V526 Z" fill="#2e110c" />
        <path d="M770 526 V474 A30 30 0 0 1 830 474" fill="none" stroke="#7d2219" strokeWidth="4" />
        <rect x="758" y="392" width="84" height="27" rx="6" fill="#f6e6c4" stroke="#8a5a2a" strokeWidth="2.5" />
        <text x="800" y="411" textAnchor="middle" fontSize="15" fontWeight="800" fill="#6b3a14" letterSpacing="1.5" style={{ fontFamily: "Fredoka, Karla, sans-serif" }}>
          {nombre.toUpperCase().slice(0, 9)}
        </text>
        <path d="M712 372 L800 300 L800 316 L712 388 Z" fill="#000" opacity="0.12" />
        <path d="M664 374 L800 274 L800 300 L680 392 Z" fill="url(#m-techo)" stroke="#7d2219" strokeWidth="3" strokeLinejoin="round" />
        <path d="M800 274 L936 374 L920 392 L800 300 Z" fill="url(#m-techo)" stroke="#7d2219" strokeWidth="3" strokeLinejoin="round" />
        <path d="M672 372 L800 280 L928 372" fill="none" stroke="#f58e75" strokeWidth="3" opacity="0.6" />
      </g>

      {/* ===== Snoopy en el techo ===== */}
      <g
        transform={`translate(${TECHO.x} ${TECHO.y})`}
        onClick={suelo.pose === "techo" ? onTocarSnoopy : undefined}
        onKeyDown={suelo.pose === "techo" ? teclaActiva(onTocarSnoopy) : undefined}
        tabIndex={suelo.pose === "techo" ? 0 : -1}
        role="button"
        aria-label="Jugar con Snoopy"
        style={{ cursor: "pointer" }}
      >
        <g className={`m-techo m-techo-${suelo.pose}`}>
          <rect x="-150" y="-80" width="250" height="140" fill="transparent" />
          <SnoopyTecho durmiendo={durmiendo} />
        </g>
      </g>

      {/* ===== Hueso ===== */}
      {hueso.estado !== "oculto" && (
        <g transform={`translate(${hueso.x} ${SUELO_Y - 6})`}>
          <g className={`m-hueso m-hueso-${hueso.estado}`}>
            <Hueso />
          </g>
        </g>
      )}

      {/* ===== Snoopy en el pasto ===== */}
      <g style={sueloStyle} className={`m-suelo-pos ${enSuelo ? "" : "m-oculto"}`}>
        <g className={`m-suelo m-suelo-${suelo.pose}`}>
          <g transform={`scale(${frente ? 1 : suelo.dir} 1)`}>
            {frente ? (
              <SnoopyFrente bocaRef={bocaRef} enTina={suelo.anim === "tina"} />
            ) : (
              <SnoopyLado anim={suelo.anim} />
            )}
          </g>
        </g>
      </g>

      {/* ===== Tina (delante de Snoopy) ===== */}
      <g transform={`translate(${suelo.x} ${SUELO_Y})`} className={`m-tina-pos ${tina ? "visible" : ""}`}>
        <Tina />
        <g className="m-ducha" pointerEvents="none">
          <g stroke="#7cc8ef" strokeWidth="3" strokeLinecap="round" opacity="0.85">
            {[-36, -22, -8, 6, 20, 34].map((x, i) => (
              <line key={x} x1={x} y1="-215" x2={x - 5} y2="-195" className="m-gota" style={{ animationDelay: `${i * 0.11}s` }} />
            ))}
          </g>
          <path d="M-22 -238 h44 a8 8 0 0 1 8 8 v10 h-60 v-10 a8 8 0 0 1 8 -8 Z" fill="#c9d3dc" stroke="#5b6670" strokeWidth="2.5" />
          {[[-40, -70, 9], [-10, -78, 12], [24, -74, 8], [50, -70, 10]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#e9f7ff" fillOpacity="0.55" stroke="#9fd6f2" strokeWidth="1.8" className="m-burbuja" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </g>
      </g>

      {/* ===== Woodstock ===== */}
      <g transform="translate(676 168)">
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

      {/* ===== Corazones / Zzz ===== */}
      <g pointerEvents="none">
        {(
          [
            ["", 690, 112, 22],
            [" c2", 718, 96, 28],
            [" c3", 760, 200, 20],
          ] as const
        ).map(([c, x, y, s]) => (
          <g key={c || "c1"} className={`m-corazon${c}`}>
            <use href="#m-corazon" width={s} height={s * 0.9} transform={`translate(${x} ${y})`} />
          </g>
        ))}
      </g>
      <g className="m-zzz" pointerEvents="none" fill="#eaf0ff" fontWeight="800" style={{ fontFamily: "Fredoka, Karla, sans-serif" }}>
        <text x="776" y="226" fontSize="20" className="z z1">z</text>
        <text x="790" y="212" fontSize="26" className="z z2">Z</text>
        <text x="806" y="196" fontSize="32" className="z z3">Z</text>
      </g>

      {/* Penumbra general de noche (Snoopy y la casita también) */}
      <rect width="1600" height="560" fill="#0b1338" className="m-penumbra" pointerEvents="none" />

      {/* ===== Globo de diálogo ===== */}
      <foreignObject
        x={enSuelo ? 788 : 808}
        y={enSuelo ? 236 : 96}
        width="232"
        height="140"
        pointerEvents="none"
        className={enSuelo ? "m-globo-suelo" : ""}
      >
        <div className="m-globo-caja">
          <div key={globo} className="m-globo-texto">
            {globo}
          </div>
        </div>
      </foreignObject>
    </svg>
  );
}
