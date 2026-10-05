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
            <linearGradient id="bienvenida-tinta" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#ffe3ef" />
              <stop offset="50%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffd1e6" />
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
      <p className="bienvenida-texto mt-1 max-w-[30rem] font-display text-[1.05rem] italic leading-snug text-white/90 sm:mt-2 sm:text-[1.35rem]">
        {DESCRIPCION}
      </p>
    </div>
  );
}
