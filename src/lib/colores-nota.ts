import type { CSSProperties } from "react";

// Colores de las notitas de Snoopy (vidrio teñido translúcido). Cada color
// tiene tres tonos: claro (a), medio (b) y oscuro (c), en "R G B".
export const COLORES_NOTA = {
  rojo: { nombre: "Rojo", a: "251 113 133", b: "225 29 72", c: "159 18 57" },
  rosa: { nombre: "Rosa", a: "249 168 212", b: "236 72 153", c: "157 23 77" },
  morado: { nombre: "Morado", a: "192 132 252", b: "147 51 234", c: "88 28 135" },
  lila: { nombre: "Lila", a: "216 180 254", b: "167 139 250", c: "109 40 217" },
  azul: { nombre: "Azul", a: "147 197 253", b: "59 130 246", c: "30 64 175" },
  celeste: { nombre: "Celeste", a: "125 211 252", b: "14 165 233", c: "7 89 133" },
  turquesa: { nombre: "Turquesa", a: "94 234 212", b: "20 184 166", c: "17 94 89" },
  verde: { nombre: "Verde", a: "134 239 172", b: "34 197 94", c: "21 128 61" },
  dorado: { nombre: "Dorado", a: "253 224 71", b: "234 179 8", c: "161 98 7" },
  naranja: { nombre: "Naranja", a: "253 186 116", b: "249 115 22", c: "154 52 18" },
} as const;

export type ColorNota = keyof typeof COLORES_NOTA;
export const COLOR_INICIAL: ColorNota = "rojo";
export const IDS_COLOR = Object.keys(COLORES_NOTA) as [ColorNota, ...ColorNota[]];

export const colorValido = (id?: string | null): ColorNota =>
  id && id in COLORES_NOTA ? (id as ColorNota) : COLOR_INICIAL;

/** Variables CSS para pintar el post-it y su sello con el color elegido. */
export function estiloColorNota(id?: string | null): CSSProperties {
  const c = COLORES_NOTA[colorValido(id)];
  return { "--pa": c.a, "--pb": c.b, "--pc": c.c } as CSSProperties;
}
