import type { CSSProperties } from "react";
import { Flower2, Heart, Moon, PawPrint, Sparkles, Star, type LucideIcon } from "lucide-react";

/* This module intentionally exports the effect helpers used by MascotaGame. */
/* eslint-disable react-refresh/only-export-components */

// Efectos de Snoopy dibujados de verdad (SVG con degradados y brillos), cada uno
// con su propia física: las burbujas suben bamboleándose y revientan, las gotas
// caen con gravedad, las hojas planean, los destellos titilan… En vez de emojis.

export type Efecto =
  "corazon" | "burbuja" | "gota" | "destello" | "zzz" | "hoja" | "hueso" | "confeti" | "sobre";

/** Degradados compartidos por todos los efectos (se dibujan una sola vez). */
export function EfectosDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="ef-corazon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8fab" />
          <stop offset="0.55" stopColor="#f43f5e" />
          <stop offset="1" stopColor="#be123c" />
        </linearGradient>
        <radialGradient id="ef-burbuja" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.62" stopColor="#e0f2fe" stopOpacity="0.04" />
          <stop offset="0.86" stopColor="#bae6fd" stopOpacity="0.35" />
          <stop offset="0.97" stopColor="#f0f9ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.4" />
        </radialGradient>
        <linearGradient id="ef-burbuja-iris" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0abfc" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#67e8f9" stopOpacity="0" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="ef-gota" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
        <radialGradient id="ef-destello" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
        <linearGradient id="ef-hoja" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bef264" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id="ef-hueso" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbeb" />
          <stop offset="1" stopColor="#e7d3a8" />
        </linearGradient>
        <linearGradient id="ef-sobre" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1f2" />
          <stop offset="1" stopColor="#fecdd3" />
        </linearGradient>
        <linearGradient id="ef-zzz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0e7ff" />
          <stop offset="1" stopColor="#a5b4fc" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Dibujo({ tipo }: { tipo: Efecto }) {
  switch (tipo) {
    case "corazon":
      return (
        <svg viewBox="0 0 32 30">
          <path
            d="M16 29C7 22 1 16.5 1 9.6 1 4.8 4.7 1 9.3 1c2.8 0 5.2 1.4 6.7 3.6C17.5 2.4 19.9 1 22.7 1 27.3 1 31 4.8 31 9.6 31 16.5 25 22 16 29z"
            fill="url(#ef-corazon)"
          />
          <ellipse
            cx="9.5"
            cy="8"
            rx="4"
            ry="2.6"
            fill="#fff"
            opacity="0.55"
            transform="rotate(-30 9.5 8)"
          />
        </svg>
      );
    case "burbuja":
      return (
        <svg viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="15" fill="url(#ef-burbuja)" />
          <circle cx="16" cy="16" r="14.5" fill="url(#ef-burbuja-iris)" />
          <path
            d="M8 11a9 9 0 0 1 7-5.5"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
          <circle cx="22.5" cy="22" r="1.6" fill="#fff" opacity="0.7" />
        </svg>
      );
    case "gota":
      return (
        <svg viewBox="0 0 24 32">
          <path
            d="M12 1C12 1 2 13.5 2 20a10 10 0 0 0 20 0C22 13.5 12 1 12 1z"
            fill="url(#ef-gota)"
          />
          <ellipse cx="8" cy="20" rx="2.2" ry="4" fill="#fff" opacity="0.6" />
        </svg>
      );
    case "destello":
      return (
        <svg viewBox="0 0 32 32">
          <path
            d="M16 0C17 10 22 15 32 16 22 17 17 22 16 32 15 22 10 17 0 16 10 15 15 10 16 0z"
            fill="url(#ef-destello)"
          />
        </svg>
      );
    case "zzz":
      return (
        <svg viewBox="0 0 32 32">
          <text
            x="16"
            y="25"
            textAnchor="middle"
            fontSize="26"
            fontWeight="800"
            fontFamily="Karla, system-ui, sans-serif"
            fill="url(#ef-zzz)"
            stroke="#4338ca"
            strokeWidth="1"
            strokeOpacity="0.45"
          >
            Z
          </text>
        </svg>
      );
    case "hoja":
      return (
        <svg viewBox="0 0 32 32">
          <path d="M4 28C4 12 14 3 29 3c0 15-9 25-25 25z" fill="url(#ef-hoja)" />
          <path
            d="M5 27C11 19 18 12 27 5"
            stroke="#14532d"
            strokeWidth="1.3"
            strokeOpacity="0.55"
            fill="none"
          />
        </svg>
      );
    case "hueso":
      return (
        <svg viewBox="0 0 40 20">
          <path
            d="M9 4a4 4 0 1 0-4 6 4 4 0 1 0 4 6h22a4 4 0 1 0 4-6 4 4 0 1 0-4-6H9z"
            fill="url(#ef-hueso)"
            stroke="#b8925a"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "confeti":
      return (
        <svg viewBox="0 0 12 20">
          <rect x="1" y="1" width="10" height="18" rx="2.5" fill="hsl(var(--hue, 340) 85% 62%)" />
          <rect x="2.5" y="2.5" width="3" height="15" rx="1.5" fill="#fff" opacity="0.35" />
        </svg>
      );
    case "sobre":
      return (
        <svg viewBox="0 0 36 26">
          <rect
            x="1"
            y="1"
            width="34"
            height="24"
            rx="3"
            fill="url(#ef-sobre)"
            stroke="#e11d48"
            strokeOpacity="0.5"
          />
          <path
            d="M2 3l16 12L34 3"
            fill="none"
            stroke="#e11d48"
            strokeOpacity="0.55"
            strokeWidth="1.6"
          />
          <path
            d="M18 10.5c-1.6-2.2-5-1.2-4.4 1.4.4 1.9 4.4 4.3 4.4 4.3s4-2.4 4.4-4.3c.6-2.6-2.8-3.6-4.4-1.4z"
            fill="#f43f5e"
          />
        </svg>
      );
  }
}

export interface Particula {
  id: number;
  tipo: Efecto;
  x: number;
  delay: number;
  size: number;
  dx: number;
  rot: number;
  hue: number;
}

export function ParticulaVisual({ p }: { p: Particula }) {
  return (
    <span
      className={`ef-particula ef-${p.tipo} absolute bottom-[45%]`}
      style={
        {
          left: `${p.x}%`,
          width: p.size,
          height: p.size,
          animationDelay: `${p.delay}s`,
          "--dx": `${p.dx}px`,
          "--rot": `${p.rot}deg`,
          "--hue": p.hue,
        } as CSSProperties
      }
    >
      <span className="ef-cuerpo">
        <Dibujo tipo={p.tipo} />
      </span>
    </span>
  );
}

/* ---------------- Sellos de las notas ---------------- */

export const SELLOS: Record<string, { nombre: string; Icono: LucideIcon }> = {
  corazon: { nombre: "Corazón", Icono: Heart },
  estrella: { nombre: "Estrella", Icono: Star },
  luna: { nombre: "Luna", Icono: Moon },
  flor: { nombre: "Flor", Icono: Flower2 },
  huella: { nombre: "Huella", Icono: PawPrint },
  brillo: { nombre: "Brillo", Icono: Sparkles },
};
export const SELLO_INICIAL = "corazon";
/** Notas viejas guardaron un emoji: se muestran con el corazón. */
export const sello = (id?: string) => SELLOS[id ?? ""] ?? SELLOS[SELLO_INICIAL]!;

// Emojis, tonos de piel, selector de variación (FE0F) y unión (200D). Se arma
// con escapes en texto para que ningún formateador los cambie por caracteres.
const EMOJI_RE = new RegExp(
  "\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}]|\\u{FE0F}|\\u{200D}",
  "gu",
);

/** Quita los emojis de los mensajes de Snoopy (se ven más limpios). */
export const sinEmojis = (t: string) =>
  t
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([!?.,…])/g, "$1")
    .trim();

export const EFECTOS_CSS = `
.ef-particula { opacity: 0; pointer-events: none; will-change: transform, opacity; }
.ef-cuerpo { position: absolute; inset: 0; display: block; }
.ef-cuerpo > svg { width: 100%; height: 100%; overflow: visible; display: block; }

/* Corazones y sobres: suben meciéndose de lado a lado. */
.ef-corazon, .ef-sobre { animation: ef-subir 2.6s cubic-bezier(.22,.61,.36,1) both; }
.ef-corazon .ef-cuerpo, .ef-sobre .ef-cuerpo { animation: ef-mecer 1.3s cubic-bezier(.45,.05,.55,.95) infinite alternate; filter: drop-shadow(0 3px 4px rgba(120,10,40,0.35)); }

/* Burbujas: suben lento con bamboleo y revientan al final. */
.ef-burbuja { animation: ef-burbuja 2.9s cubic-bezier(.33,.0,.3,1) both; }
.ef-burbuja .ef-cuerpo { animation: ef-bambolear 0.9s cubic-bezier(.45,.05,.55,.95) infinite alternate; }

/* Gotas: salen disparadas y caen con gravedad. */
.ef-gota { animation: ef-gota 1.25s linear both; }
.ef-gota .ef-cuerpo { filter: drop-shadow(0 2px 2px rgba(3,60,110,0.35)); }

/* Destellos: aparecen, giran y titilan. */
.ef-destello { animation: ef-destello 1.5s cubic-bezier(.22,.61,.36,1) both; }
.ef-destello .ef-cuerpo { filter: drop-shadow(0 0 4px rgba(253,230,138,0.95)) drop-shadow(0 0 10px rgba(251,191,36,0.6)); }

/* Zzz: flotan hacia arriba y a un lado, creciendo. */
.ef-zzz { animation: ef-zzz 3.2s cubic-bezier(.22,.61,.36,1) both; }

/* Hojas: planean con aleteo. */
.ef-hoja { animation: ef-hoja 3.1s cubic-bezier(.3,.1,.4,1) both; }
.ef-hoja .ef-cuerpo { animation: ef-aleteo 0.8s cubic-bezier(.45,.05,.55,.95) infinite alternate; }

/* Huesos y confeti: estallan hacia arriba y caen girando. */
.ef-hueso, .ef-confeti { animation: ef-estallar 1.8s linear both; }
.ef-hueso .ef-cuerpo { filter: drop-shadow(0 2px 2px rgba(80,50,10,0.35)); }

@keyframes ef-subir {
  0% { opacity: 0; transform: translate(0, 0) scale(0.3); }
  14% { opacity: 1; transform: translate(0, -18px) scale(1.08); }
  24% { transform: translate(calc(var(--dx) * 0.15), -34px) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), -150px) scale(0.85) rotate(var(--rot)); }
}
@keyframes ef-mecer { from { transform: translateX(-6px) rotate(-8deg); } to { transform: translateX(6px) rotate(8deg); } }
@keyframes ef-burbuja {
  0% { opacity: 0; transform: translate(0, 0) scale(0.2); }
  15% { opacity: 0.95; transform: translate(0, -14px) scale(1); }
  85% { opacity: 0.9; transform: translate(var(--dx), -125px) scale(1.06); }
  92% { opacity: 1; transform: translate(var(--dx), -130px) scale(1.35); }
  100% { opacity: 0; transform: translate(var(--dx), -131px) scale(1.6); }
}
@keyframes ef-bambolear { from { transform: translateX(-4px) scale(1.04, 0.96); } to { transform: translateX(4px) scale(0.96, 1.04); } }
@keyframes ef-gota {
  0% { opacity: 0; transform: translate(0, 0) scale(0.5); animation-timing-function: cubic-bezier(.2,.7,.4,1); }
  10% { opacity: 1; }
  40% { transform: translate(calc(var(--dx) * 0.6), -60px) scale(1) rotate(calc(var(--rot) * 0.5)); animation-timing-function: cubic-bezier(.55,0,.9,.4); }
  100% { opacity: 0; transform: translate(var(--dx), 40px) scale(0.9) rotate(var(--rot)); }
}
@keyframes ef-destello {
  0% { opacity: 0; transform: translate(0, 0) scale(0) rotate(0deg); }
  30% { opacity: 1; transform: translate(calc(var(--dx) * 0.3), -40px) scale(1.15) rotate(45deg); }
  55% { opacity: 0.55; transform: translate(calc(var(--dx) * 0.5), -60px) scale(0.75) rotate(70deg); }
  75% { opacity: 1; transform: translate(calc(var(--dx) * 0.7), -75px) scale(1) rotate(90deg); }
  100% { opacity: 0; transform: translate(var(--dx), -95px) scale(0) rotate(135deg); }
}
@keyframes ef-zzz {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4) rotate(-12deg); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(30px + var(--dx) * 0.3), -120px) scale(1.25) rotate(10deg); }
}
@keyframes ef-hoja {
  0% { opacity: 0; transform: translate(0, -20px) rotate(0); }
  15% { opacity: 1; }
  35% { transform: translate(calc(var(--dx) * 0.5), -70px) rotate(calc(var(--rot) * 0.6)); }
  65% { transform: translate(calc(var(--dx) * -0.2), -95px) rotate(calc(var(--rot) * -0.4)); }
  100% { opacity: 0; transform: translate(calc(var(--dx) * 1.2), -60px) rotate(var(--rot)); }
}
@keyframes ef-aleteo { from { transform: rotateX(0deg) rotate(-10deg); } to { transform: rotateX(55deg) rotate(12deg); } }
@keyframes ef-estallar {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4) rotate(0); animation-timing-function: cubic-bezier(.2,.75,.35,1); }
  8% { opacity: 1; }
  38% { transform: translate(calc(var(--dx) * 0.7), -90px) scale(1) rotate(calc(var(--rot) * 2)); animation-timing-function: cubic-bezier(.5,0,.85,.45); }
  100% { opacity: 0; transform: translate(var(--dx), 30px) scale(0.9) rotate(calc(var(--rot) * 6)); }
}
@media (prefers-reduced-motion: reduce) {
  .ef-particula, .ef-cuerpo { animation-duration: 0.01s !important; animation-iteration-count: 1 !important; }
}
`;
