import { useEffect, useState, type RefObject } from "react";

/**
 * Pasa a `true` (una sola vez) cuando el elemento se acerca a la pantalla.
 * Sirve para no descargar escenas pesadas (galaxia, océano) hasta que hacen falta.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  rootMargin = "50% 0px",
  enabled = true,
) {
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near || !enabled) return;
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin },
    );
    // Se empieza a observar cuando la página terminó de cargar: antes de eso
    // los estilos pueden no estar aplicados (todo mide 0 px y "parece" visible)
    // y además así lo primero que se descarga es la portada.
    const start = () => observer.observe(el);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      observer.disconnect();
    };
  }, [ref, rootMargin, near, enabled]);

  return near;
}
