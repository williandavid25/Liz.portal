// Dibujos y firmas de las notitas (compartido entre la app y el servidor).

/**
 * Un trazo del lápiz. Todo es relativo a la cara del cuadro (0 a 1000), así se
 * ve igual en cualquier pantalla: g = grosor, p = puntos [x, y, x, y, …],
 * c = color (#rrggbb; sin él, negro).
 */
export interface Trazo {
  g: number;
  p: number[];
  c?: string;
}

/** Colores rápidos para el lápiz y las letras (además de cualquier color libre). */
export const COLORES_TINTA = [
  { c: "#0a0a0a", nombre: "Negro" },
  { c: "#ffffff", nombre: "Blanco" },
  { c: "#ff4d8d", nombre: "Rosa" },
  { c: "#ef4444", nombre: "Rojo" },
  { c: "#facc15", nombre: "Dorado" },
  { c: "#4ade80", nombre: "Verde" },
  { c: "#38bdf8", nombre: "Celeste" },
  { c: "#a855f7", nombre: "Morado" },
] as const;

export const TINTA_INICIAL = "#0a0a0a";
export const PATRON_TINTA = /^#[0-9a-f]{6}$/i;
export const tintaValida = (c?: string | null): string =>
  c && PATRON_TINTA.test(c) ? c : TINTA_INICIAL;

/** Los colores oscuros llevan un halo claro y los claros uno oscuro: siempre se leen. */
function esOscura(c: string): boolean {
  const n = parseInt(c.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export const haloDe = (c: string) => (esOscura(c) ? "rgba(220,255,240,0.6)" : "rgba(0,12,10,0.55)");

export const sombraTexto = (c: string) =>
  esOscura(c)
    ? "0 0 3px rgba(220,255,240,0.9), 0 0 8px rgba(200,255,235,0.55)"
    : "0 0 3px rgba(0,12,10,0.9), 0 0 8px rgba(0,12,10,0.55)";

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
