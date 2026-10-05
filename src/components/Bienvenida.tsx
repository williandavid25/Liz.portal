import { useEffect, useState } from "react";

const TITULO = "Bienvenida, mi niña";
const DESCRIPCION =
  "Este es tu espacio, hecho especialmente para ti. Espero que te guste y que aquí puedas guardar y escribir muchos momentos bonitos.";

/**
 * Título de la portada que se "escribe" a mano: el trazo de cada letra se
 * dibuja de izquierda a derecha y luego se rellena con un brillo suave. La
 * descripción aparece después saliendo de un difuminado.
 *
 * La animación espera a que cargue la fuente manuscrita (Great Vibes): si
 * arrancara antes se dibujaría con la letra de reserva y luego saltaría.
 */
export function Bienvenida() {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let hecho = false;
    const empezar = () => {
      if (hecho) return;
      hecho = true;
      setListo(true);
    };
    // Si la fuente tarda (conexión lenta), igual se muestra a los 2 s.
    const respaldo = window.setTimeout(empezar, 2000);
    if (document.fonts?.load) {
      document.fonts.load('120px "Great Vibes"').then(empezar, empezar);
    } else {
      empezar();
    }
    return () => window.clearTimeout(respaldo);
  }, []);

  return (
    <div
      className={`bienvenida pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+96px)] z-10 flex flex-col items-center px-4 text-center sm:top-[calc(env(safe-area-inset-top)+124px)] ${
        listo ? "bienvenida--play" : ""
      }`}
    >
      <h1 className="sr-only">{TITULO}</h1>
      <div className="bienvenida-titulo w-full max-w-[44rem]" aria-hidden="true">
        <svg viewBox="0 0 1100 210" className="h-auto w-full overflow-visible">
          <defs>
            {/* Degradado con los colores de la flor (dorado → rosa → lavanda).
                Mide el doble del título y se desplaza en bucle: un brillo que
                recorre las letras lentamente. */}
            <linearGradient
              id="bienvenida-tinta"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="2200"
              y2="0"
              spreadMethod="repeat"
            >
              <stop offset="0%" stopColor="#ffd9a0" />
              <stop offset="18%" stopColor="#ff9ec4" />
              <stop offset="34%" stopColor="#ffe9f3" />
              <stop offset="50%" stopColor="#d4b0ff" />
              <stop offset="68%" stopColor="#ff8db8" />
              <stop offset="84%" stopColor="#ffd9a0" />
              <stop offset="100%" stopColor="#ffd9a0" />
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="0 0"
                to="-2200 0"
                dur="9s"
                repeatCount="indefinite"
              />
            </linearGradient>
          </defs>
          <text
            x="550"
            y="140"
            textAnchor="middle"
            className="bienvenida-trazo"
            style={{ fontFamily: '"Great Vibes", cursive', fontSize: 124 }}
          >
            {TITULO}
          </text>
          <text
            x="550"
            y="140"
            textAnchor="middle"
            fill="url(#bienvenida-tinta)"
            className="bienvenida-relleno"
            style={{ fontFamily: '"Great Vibes", cursive', fontSize: 124 }}
          >
            {TITULO}
          </text>
        </svg>
      </div>
      <p className="bienvenida-texto mt-1 max-w-[30rem] font-display text-[1.05rem] italic leading-snug sm:mt-2 sm:text-[1.35rem]">
        {DESCRIPCION}
      </p>
    </div>
  );
}
