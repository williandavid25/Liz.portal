// Stickers de las notitas (compartido entre la app y el servidor).

/** Un sticker de la colección (se ve en los dos celulares). */
export interface Sticker {
  id: string;
  url: string;
}

/**
 * Un sticker pegado en una nota. Todo es relativo al post-it, así se ve igual
 * en cualquier pantalla: x, y = centro (0 a 1), w = ancho (fracción del
 * post-it), r = giro en grados.
 */
export interface StickerEnNota {
  u: string;
  x: number;
  y: number;
  w: number;
  r: number;
}

export const MAX_STICKERS_NOTA = 12;
export const MAX_BYTES_STICKER = 1_500_000;
export const ANCHO_MIN = 0.08;
export const ANCHO_MAX = 1;
