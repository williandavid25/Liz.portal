// Dibujos y firmas de las notitas (compartido entre la app y el servidor).

/**
 * Un trazo del lápiz. Todo es relativo a la cara del cuadro (0 a 1000), así se
 * ve igual en cualquier pantalla: g = grosor, p = puntos [x, y, x, y, …].
 */
export interface Trazo {
  g: number;
  p: number[];
}

/** Grosores del lápiz, del más fino al más grueso (en milésimas de la cara). */
export const GROSORES = [
  { g: 6, nombre: "Fino" },
  { g: 12, nombre: "Medio" },
  { g: 20, nombre: "Grueso" },
  { g: 34, nombre: "Muy grueso" },
] as const;

/** Giro de la cara del cuadro (el mismo que .mg-postit-cara en el CSS). */
export const GIRO_CARA_GRADOS = -3.5;

export const GROSOR_MIN = 4;
export const GROSOR_MAX = 40;
export const MAX_TRAZOS = 80;
/** Puntos en total (no coordenadas) entre todos los trazos de una nota. */
export const MAX_PUNTOS = 4000;

export const puntosDe = (trazos: Trazo[]) => trazos.reduce((n, t) => n + t.p.length / 2, 0);

/** Camino SVG suave (curvas por los puntos medios) para un trazo. */
export function caminoTrazo(p: number[]): string {
  if (p.length < 2) return "";
  if (p.length === 2) return `M${p[0]} ${p[1]}l0.01 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    d += `Q${p[i]} ${p[i + 1]} ${mx} ${my}`;
  }
  return `${d}L${p[p.length - 2]} ${p[p.length - 1]}`;
}
