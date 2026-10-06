import type { CSSProperties, Ref } from "react";

/* This module intentionally exports the pose helpers used by MascotaGame. */
/* eslint-disable react-refresh/only-export-components */

// Snoopy "con vida": cada pose es la misma imagen de siempre, pero recortada
// en piezas (cabeza, orejas, cola, patas, cuerpo) que se mueven por separado,
// a distinta profundidad (3D real con perspectiva) y con párpados y boca
// dibujados encima. Las coordenadas están medidas sobre las imágenes de 560 px.

export type Pose =
  | "frente"
  | "comiendo"
  | "banando"
  | "durmiendo"
  | "triste"
  | "espalda"
  | "mira-derecha"
  | "mira-izquierda";

export type Boca = "auto" | "voz";

export const imgPose = (p: Pose) => `/mascota/${p}.webp`;

/** Cuánto aire transparente queda bajo las patas de cada pose (fracción del alto). */
export const PIE: Record<Pose, number> = {
  frente: 0.04,
  comiendo: 0.033,
  banando: 0.027,
  durmiendo: 0.097,
  triste: 0.037,
  espalda: 0.012,
  "mira-derecha": 0.036,
  "mira-izquierda": 0.032,
};

type Punto = readonly [number, number];
const poligono = (pts: readonly Punto[]) =>
  `polygon(${pts.map(([x, y]) => `${((x / 560) * 100).toFixed(2)}% ${((y / 560) * 100).toFixed(2)}%`).join(", ")})`;
const origen = ([x, y]: Punto) =>
  `${((x / 560) * 100).toFixed(2)}% ${((y / 560) * 100).toFixed(2)}%`;

// Las orejas se meten un poco por debajo de la cabeza (y la cabeza un poco
// sobre ellas): así al moverse nunca se abre una ranura entre las piezas.
const OREJA_I = poligono([
  [186, 98],
  [120, 82],
  [72, 150],
  [72, 338],
  [200, 338],
  [205, 262],
  [186, 236],
  [180, 200],
  [178, 140],
  [180, 104],
]);
const OREJA_D = (abajo: number) =>
  poligono(
    abajo > 310
      ? [
          [384, 94],
          [455, 82],
          [505, 150],
          [505, abajo],
          [375, abajo],
          [370, 262],
          [384, 236],
          [388, 200],
          [390, 140],
          [388, 104],
        ]
      : [
          [384, 94],
          [455, 82],
          [505, 150],
          [505, abajo],
          [415, abajo],
          [398, 250],
          [388, 200],
          [390, 140],
          [388, 104],
        ],
  );
const CABEZA = poligono([
  [168, 100],
  [162, 140],
  [164, 200],
  [176, 238],
  [205, 262],
  [243, 272],
  [245, 302],
  [333, 302],
  [335, 272],
  [370, 262],
  [396, 238],
  [404, 200],
  [406, 140],
  [400, 100],
  [380, 55],
  [345, 20],
  [290, 6],
  [235, 20],
  [195, 55],
]);
const CUERPO = poligono([
  [243, 286],
  [335, 286],
  [375, 300],
  [380, 340],
  [400, 395],
  [450, 400],
  [455, 450],
  [447, 530],
  [380, 550],
  [380, 468],
  [338, 458],
  [290, 462],
  [240, 458],
  [198, 468],
  [198, 550],
  [125, 542],
  [105, 480],
  [110, 415],
  [165, 395],
  [198, 340],
  [205, 300],
]);
// Comiendo: la cabeza, los brazos y el hueso van juntos (no se separan).
const CUERPO_COMIENDO = poligono([
  [172, 100],
  [195, 55],
  [235, 20],
  [290, 4],
  [345, 20],
  [380, 55],
  [396, 100],
  [402, 140],
  [398, 236],
  [415, 298],
  [432, 340],
  [450, 400],
  [455, 450],
  [447, 530],
  [380, 550],
  [380, 468],
  [338, 458],
  [290, 462],
  [240, 458],
  [198, 468],
  [198, 550],
  [125, 542],
  [105, 480],
  [110, 415],
  [165, 395],
  [200, 338],
  [205, 262],
  [180, 236],
  [168, 200],
  [166, 140],
]);
const COLA = poligono([
  [447, 442],
  [508, 436],
  [508, 528],
  [447, 532],
]);
const PATA_I = poligono([
  [198, 552],
  [198, 468],
  [240, 458],
  [290, 462],
  [290, 552],
]);
const PATA_D = poligono([
  [290, 552],
  [290, 462],
  [338, 458],
  [380, 468],
  [380, 552],
]);

interface Rig {
  cuerpo: string;
  orejaD: string;
  cabeza: boolean;
  ojos: readonly Punto[];
  boca?: Punto;
}

const RIGS: Partial<Record<Pose, Rig>> = {
  frente: {
    cuerpo: CUERPO,
    orejaD: OREJA_D(338),
    cabeza: true,
    ojos: [
      [239, 125],
      [330, 119],
    ],
    boca: [284, 256],
  },
  triste: {
    cuerpo: CUERPO,
    orejaD: OREJA_D(338),
    cabeza: true,
    ojos: [
      [235, 128],
      [325, 118],
    ],
  },
  comiendo: {
    cuerpo: CUERPO_COMIENDO,
    orejaD: OREJA_D(298),
    cabeza: false,
    ojos: [
      [238, 128],
      [330, 116],
    ],
  },
};

const pct = (n: number) => `${((n / 560) * 100).toFixed(2)}%`;

export function SnoopyVivo({
  pose,
  animo,
  boca,
  ladrido,
  ladrando,
  caminando = false,
  bocaRef,
}: {
  pose: Pose;
  animo: "feliz" | "triste" | "normal";
  boca: Boca;
  /** Cambia este número para que ladre (abre la boca dos veces). */
  ladrido: number;
  ladrando: boolean;
  caminando?: boolean;
  bocaRef?: Ref<HTMLDivElement>;
}) {
  const src = imgPose(pose);
  const rig = RIGS[pose];
  const mascara = { WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` } as CSSProperties;

  const pieza = (clip: string, clase: string, extra?: CSSProperties) => (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`sv-pieza ${clase}`}
      style={{ clipPath: clip, WebkitClipPath: clip, ...extra } as CSSProperties}
    />
  );

  return (
    <div
      ref={bocaRef}
      className={`sv-raiz sv-${animo} sv-pose-${pose} ${caminando ? "sv-caminando" : ""}`}
      style={{ translate: `0 ${PIE[pose] * 100}%` }}
    >
      <div className="sv-balanceo">
        <div className="sv-3d">
          {rig ? (
            <>
              <div className="sv-capa sv-cola" style={{ transformOrigin: origen([449, 506]) }}>
                {pieza(COLA, "")}
              </div>
              <div className="sv-capa sv-cuerpo">{pieza(rig.cuerpo, "")}</div>
              <div className="sv-capa sv-pata sv-pata-i" style={{ transformOrigin: "40% 98%" }}>
                {pieza(PATA_I, "")}
              </div>
              <div className="sv-capa sv-pata sv-pata-d" style={{ transformOrigin: "60% 98%" }}>
                {pieza(PATA_D, "")}
              </div>
              <div
                className={`sv-capa ${rig.cabeza ? "sv-cabeza" : "sv-cabeza-fija"}`}
                style={{ transformOrigin: origen([289, 300]) }}
              >
                <div className="sv-mira">
                  {/* Las orejas cuelgan de la cabeza: se mueven con ella. */}
                  <div
                    className="sv-capa sv-oreja sv-oreja-i"
                    style={{ transformOrigin: origen([178, 100]) }}
                  >
                    {pieza(OREJA_I, "")}
                  </div>
                  <div
                    className="sv-capa sv-oreja sv-oreja-d"
                    style={{ transformOrigin: origen([390, 98]) }}
                  >
                    {pieza(rig.orejaD, "")}
                  </div>
                  {rig.cabeza && pieza(CABEZA, "sv-cara")}
                  {rig.ojos.map(([x, y], i) => (
                    <span
                      key={i}
                      className="sv-parpado"
                      style={{
                        left: pct(x - 13),
                        top: pct(y - 17),
                        width: pct(26),
                        height: pct(34),
                      }}
                    />
                  ))}
                  {rig.boca && (
                    <span
                      className="sv-boca-caja"
                      style={{
                        left: pct(rig.boca[0] - 36),
                        top: pct(rig.boca[1]),
                        width: pct(72),
                        height: pct(48),
                      }}
                    >
                      <span
                        key={ladrido}
                        className={`sv-boca ${boca === "voz" ? "sv-boca-voz" : ladrando ? "sv-boca-ladra" : "sv-boca-jadeo"}`}
                      />
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <img src={src} alt="" draggable={false} className="sv-pieza sv-entera" />
          )}
          {/* Brillo que se mueve con el giro: da volumen. */}
          <span className="sv-brillo" style={mascara} />
        </div>
      </div>
    </div>
  );
}

export const SNOOPY_CSS = `
.sv-raiz { position: absolute; inset: 0; perspective: 640px; }
.sv-balanceo, .sv-3d, .sv-capa, .sv-mira { position: absolute; inset: 0; transform-style: preserve-3d; }
.sv-balanceo { animation: sv-balanceo 7s ease-in-out infinite; will-change: transform; }
.sv-caminando .sv-balanceo { animation: sv-caminar-balanceo 0.84s ease-in-out infinite; }
.sv-3d {
  transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transition: transform 0.45s cubic-bezier(.2,.8,.3,1);
}
.sv-pieza { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; user-select: none; -webkit-user-drag: none; }
.sv-entera { filter: drop-shadow(0 8px 10px rgba(0,0,0,0.3)); }
.sv-capa > .sv-pieza { filter: drop-shadow(0 4px 5px rgba(0,0,0,0.18)); }

/* Profundidad de cada pieza: al girar se separan como en 3D. */
.sv-cola { translate: 0 0 -18px; animation: sv-cola 0.55s ease-in-out infinite alternate; }
.sv-cuerpo { translate: 0 0 0; }
.sv-oreja { translate: 0 0 -8px; }
.sv-oreja-i { animation: sv-oreja-i 3.1s ease-in-out infinite; }
.sv-oreja-d { animation: sv-oreja-d 3.4s ease-in-out infinite; }
.sv-pata { translate: 0 0 14px; }
.sv-pata-i { animation: sv-pata 4.6s ease-in-out infinite; }
.sv-pata-d { animation: sv-pata 4.6s ease-in-out 2.3s infinite; }
.sv-caminando .sv-pata-i { animation: sv-pata-paso 0.84s ease-in-out infinite; }
.sv-caminando .sv-pata-d { animation: sv-pata-paso 0.84s ease-in-out 0.42s infinite; }
.sv-pose-comiendo .sv-pata-i { animation: sv-pata-comiendo 1.1s ease-in-out infinite; }
.sv-pose-comiendo .sv-pata-d { animation: sv-pata-comiendo 1.1s ease-in-out 0.55s infinite; }
.sv-pose-espalda .sv-pata-i { animation: sv-pata-caminando 0.42s ease-in-out infinite; }
.sv-pose-espalda .sv-pata-d { animation: sv-pata-caminando 0.42s ease-in-out 0.21s infinite; }
.sv-cabeza { translate: 0 0 26px; animation: sv-cabeza 5.2s ease-in-out infinite; }
.sv-cabeza-fija { translate: 0 0 2px; }
.sv-mira {
  translate: var(--hx, 0px) var(--hy, 0px);
  transition: translate 0.45s cubic-bezier(.2,.8,.3,1);
}

/* Párpados: color del pelaje, cierran de arriba hacia abajo. */
.sv-parpado {
  position: absolute; border-radius: 50%;
  background: linear-gradient(#c3cce6, #eef0f4 70%, #f6f1ea);
  box-shadow: inset 0 -1.5px 0 rgba(30,20,20,0.55);
  transform: scaleY(0); transform-origin: 50% 0%;
  animation: sv-parpadeo 4.8s ease-in-out infinite;
}
.sv-parpado + .sv-parpado { animation-delay: 0.04s; }

/* Boca: se abre bajo la sonrisa. */
.sv-boca-caja { position: absolute; overflow: hidden; }
.sv-boca {
  position: absolute; inset: 0;
  border-radius: 12% 12% 50% 50% / 8% 8% 100% 100%;
  background:
    radial-gradient(ellipse 60% 45% at 50% 100%, #f07c8f 0 70%, transparent 72%),
    radial-gradient(ellipse at 50% 20%, #5a1820, #2a070b 75%);
  box-shadow: inset 0 3px 3px rgba(0,0,0,0.5);
  transform: scaleY(0); transform-origin: 50% 0%;
}
.sv-boca-voz { transform: scaleY(var(--boca, 0)); transition: transform 70ms linear; }
.sv-boca-jadeo { animation: sv-jadeo 7s ease-in-out infinite; }
.sv-boca-ladra { animation: sv-ladra 0.5s ease-out both; }

.sv-brillo {
  position: absolute; inset: 0; pointer-events: none;
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  background: radial-gradient(circle at calc(38% - var(--ry, 0deg) * 1.6) calc(26% + var(--rx, 0deg) * 1.6), rgba(255,255,255,0.38), rgba(255,255,255,0) 45%),
              linear-gradient(to top, rgba(40,30,80,0.18), transparent 45%);
  mix-blend-mode: soft-light;
  translate: 0 0 30px;
}

/* Estados de ánimo */
.sv-triste .sv-oreja-i { animation: sv-oreja-i-triste 4.5s ease-in-out infinite; }
.sv-triste .sv-oreja-d { animation: sv-oreja-d-triste 4.5s ease-in-out infinite; }
.sv-triste .sv-cola { animation: sv-cola-triste 1.6s ease-in-out infinite alternate; }
.sv-triste .sv-cabeza { animation: sv-cabeza-triste 4s ease-in-out infinite; }
.sv-triste .sv-pata-i, .sv-triste .sv-pata-d { animation: none; }
.sv-feliz .sv-cola { animation-duration: 0.32s; }

@keyframes sv-balanceo { 0%, 100% { transform: rotateY(-5deg); } 50% { transform: rotateY(5deg); } }
@keyframes sv-caminar-balanceo {
  0%, 100% { transform: translate3d(0, 0, 0) rotateZ(-1.2deg) rotateY(-3deg); }
  25% { transform: translate3d(0, -0.8%, 0) rotateZ(1deg) rotateY(2deg); }
  50% { transform: translate3d(0, 0, 0) rotateZ(-1.2deg) rotateY(3deg); }
  75% { transform: translate3d(0, -0.8%, 0) rotateZ(1deg) rotateY(-2deg); }
}
@keyframes sv-cola { from { transform: rotate(-12deg); } to { transform: rotate(14deg); } }
@keyframes sv-cola-triste { from { transform: rotate(18deg); } to { transform: rotate(10deg); } }
@keyframes sv-oreja-i { 0%, 100% { transform: rotate(0deg); } 30% { transform: rotate(3deg); } 60% { transform: rotate(-2deg); } }
@keyframes sv-oreja-d { 0%, 100% { transform: rotate(0deg); } 35% { transform: rotate(-3deg); } 65% { transform: rotate(2deg); } }
@keyframes sv-oreja-i-triste { 0%, 100% { transform: rotate(7deg); } 50% { transform: rotate(9deg); } }
@keyframes sv-oreja-d-triste { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(-9deg); } }
@keyframes sv-pata {
  0%, 70%, 100% { transform: translateY(0) rotate(0); }
  76% { transform: translateY(-5%) rotate(-3deg); }
  82% { transform: translateY(0) rotate(0); }
}
@keyframes sv-pata-comiendo {
  0%, 100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(2%) rotate(1.5deg); }
}
@keyframes sv-pata-caminando {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-7%) rotate(5deg); }
}
@keyframes sv-pata-paso {
  0%, 100% { transform: translate3d(0, 0, 0) rotateZ(-5deg) rotateY(-7deg); }
  22% { transform: translate3d(0, -7%, 10px) rotateZ(8deg) rotateY(8deg); }
  48% { transform: translate3d(0, 1%, 0) rotateZ(3deg) rotateY(3deg); }
  72% { transform: translate3d(0, -3%, -7px) rotateZ(-8deg) rotateY(-5deg); }
}
@keyframes sv-cabeza {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-2.5deg); }
  55% { transform: rotate(2deg) translateY(-0.5%); }
  80% { transform: rotate(-1deg); }
}
@keyframes sv-cabeza-triste { 0%, 100% { transform: rotate(-2deg) translateY(1.2%); } 50% { transform: rotate(2deg) translateY(1.8%); } }
@keyframes sv-parpadeo { 0%, 91%, 100% { transform: scaleY(0); } 94% { transform: scaleY(1); } 97% { transform: scaleY(0); } }
@keyframes sv-jadeo {
  0%, 62%, 100% { transform: scaleY(0); }
  66% { transform: scaleY(0.75); } 70% { transform: scaleY(0.35); }
  74% { transform: scaleY(0.8); } 78% { transform: scaleY(0.35); }
  82% { transform: scaleY(0.7); } 88% { transform: scaleY(0); }
}
@keyframes sv-ladra {
  0% { transform: scaleY(0); } 18% { transform: scaleY(1); } 40% { transform: scaleY(0.15); }
  58% { transform: scaleY(1); } 82% { transform: scaleY(0.1); } 100% { transform: scaleY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .sv-balanceo, .sv-cola, .sv-oreja-i, .sv-oreja-d, .sv-pata-i, .sv-pata-d, .sv-cabeza, .sv-boca-jadeo { animation: none; }
}
`;
