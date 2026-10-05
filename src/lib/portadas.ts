// Plantillas de portada que se pueden elegir desde Ajustes. Para agregar una
// nueva basta con sumarla a esta lista (video en Supabase u otra URL pública).

const SUPABASE_PUBLIC = "https://qgucscghlnjlikvvuxpe.supabase.co/storage/v1/object/public";

export type Portada =
  | {
      id: string;
      nombre: string;
      tipo: "video";
      src: string;
      poster?: string;
      miniatura?: string;
    }
  | { id: "galaxia"; nombre: string; tipo: "galaxia"; miniatura?: undefined };

export const PORTADAS: Portada[] = [
  {
    id: "flor-de-loto",
    nombre: "Flor de loto",
    tipo: "video",
    // Mismo video original (sin recomprimir), con el índice al inicio del
    // archivo para que empiece a reproducirse sin descargarlo entero.
    src: `${SUPABASE_PUBLIC}/portada/flor-de-loto.mp4`,
    poster: "/portadas/flor-de-loto.jpg",
    miniatura: "/portadas/flor-de-loto-mini.jpg",
  },
  {
    id: "corazon",
    nombre: "Corazón",
    tipo: "video",
    src: "/video-corazon.mp4",
    miniatura: "/portadas/corazon-mini.jpg",
  },
  { id: "galaxia", nombre: "Rosas amarillas", tipo: "galaxia" },
];

export const PORTADA_DEFAULT = "flor-de-loto";

/** Devuelve la portada a proyectar según los ajustes (o la de flor de loto). */
export function resolvePortada(id: string, urlPropia?: string): Portada {
  if (id === "personalizada" && urlPropia?.trim()) {
    return { id: "personalizada", nombre: "Mi video", tipo: "video", src: urlPropia.trim() };
  }
  return PORTADAS.find((p) => p.id === id) ?? PORTADAS[0]!;
}
