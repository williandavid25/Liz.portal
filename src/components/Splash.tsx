import { useEffect, useState } from "react";

declare global {
  interface Window {
    __splashListo?: boolean;
  }
}

/** Resuelve cuando la pantalla de carga empieza a irse (o de inmediato si ya se fue). */
export function esperarSplash(): Promise<void> {
  if (typeof window === "undefined" || window.__splashListo) return Promise.resolve();
  return new Promise((r) => window.addEventListener("splash:listo", () => r(), { once: true }));
}

const MIN_MS = 700; // lo justo para que se lea, sin hacer esperar
const MAX_MS = 3000; // con conexión muy lenta no se queda pegada

function cargarImagen(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
    if (img.complete) resolve();
  });
}

/**
 * Pantalla de carga: "Bienvenida" en letra manuscrita mientras la página se
 * prepara. Viene ya en el HTML del servidor, así que aparece al instante (antes
 * de que cargue el JavaScript). Se va con un fundido cuando están listos la
 * letra, el logo y el primer cuadro de la portada.
 */
export function Splash() {
  const [saliendo, setSaliendo] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const listo = Promise.all([
      document.fonts?.load ? document.fonts.load('64px "Great Vibes"').catch(() => {}) : null,
      cargarImagen("/icons/logo-liz.jpg"),
      location.pathname === "/" ? cargarImagen("/portadas/flor-de-loto.jpg") : null,
    ]);
    const tope = new Promise((r) => setTimeout(r, MAX_MS));

    Promise.race([listo, tope]).then(() => {
      // performance.now() cuenta desde que se abrió la página: el mínimo se
      // mide desde ahí, no desde que arrancó el JavaScript.
      const falta = Math.max(0, MIN_MS - performance.now());
      setTimeout(() => {
        if (cancelado) return;
        setSaliendo(true);
        // Avisa (p. ej. al título de la portada) que ya se puede animar.
        window.__splashListo = true;
        window.dispatchEvent(new Event("splash:listo"));
        setTimeout(() => !cancelado && setVisible(false), 650);
      }, falta);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      className={`splash fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#02020a] transition-opacity duration-[650ms] ${
        saliendo ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-label="Cargando"
    >
      <span className="splash-texto">Bienvenida</span>
      <span className="splash-linea" aria-hidden="true" />
    </div>
  );
}
