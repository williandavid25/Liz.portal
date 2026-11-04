// Modo ligero para celulares de gama baja.
//
// El "vidrio esmerilado" (backdrop-filter: blur) es lo que más le cuesta a la
// tarjeta gráfica de un celular barato: se recalcula en cada cuadro cuando lo
// que hay detrás se mueve (estrellas, Snoopy, el fondo). En esos celulares se
// quita solo el desenfoque (el panel queda translúcido); todas las animaciones
// siguen igual. Ver los estilos `html[data-ligero]` en styles.css.
//
// Se activa de dos formas:
// 1. Al instante, antes de pintar (script en <head>): celulares con ~3 GB de RAM
//    o menos (el navegador reporta 2), o con "ahorro de datos" activado.
// 2. Midiendo: si la página va a menos de ~35 cuadros por segundo, se activa y
//    se recuerda en este celular (solo guarda esta marca; no toca otros datos).

const CLAVE = "liz-ligero";

/** Script que corre en <head> antes de pintar la página. */
export const SCRIPT_LIGERO = `(function(){try{var d=document.documentElement,n=navigator,s=localStorage.getItem("${CLAVE}");if(s==="1"||(s!=="0"&&((n.deviceMemory&&n.deviceMemory<=2)||(n.connection&&n.connection.saveData))))d.setAttribute("data-ligero","")}catch(e){}})()`;

export function esLigero(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-ligero");
}

function activar() {
  document.documentElement.setAttribute("data-ligero", "");
  try {
    localStorage.setItem(CLAVE, "1");
  } catch {
    /* almacenamiento bloqueado: vale solo para esta visita */
  }
}

/**
 * Mide ~2 s de cuadros con la página visible. Si la mediana pasa de 28 ms por
 * cuadro (menos de ~35 por segundo), activa el modo ligero.
 */
export function medirFluidez(): () => void {
  if (typeof window === "undefined" || esLigero()) return () => {};
  try {
    if (localStorage.getItem(CLAVE) === "0") return () => {};
  } catch {
    /* ignorar */
  }
  let raf = 0;
  let cancelado = false;
  const tiempos: number[] = [];
  let previo = 0;
  const paso = (t: number) => {
    if (cancelado) return;
    if (document.visibilityState !== "visible") {
      // En segundo plano el navegador frena los cuadros: no sirve medir.
      tiempos.length = 0;
      previo = 0;
    } else if (previo) {
      tiempos.push(t - previo);
    }
    previo = t;
    if (tiempos.length < 120) {
      raf = requestAnimationFrame(paso);
      return;
    }
    const orden = [...tiempos].sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)] ?? 0;
    if (mediana > 28) activar();
  };
  raf = requestAnimationFrame(paso);
  return () => {
    cancelado = true;
    cancelAnimationFrame(raf);
  };
}
