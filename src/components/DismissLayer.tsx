import { useEffect } from "react";

/**
 * Capa invisible que cubre toda la pantalla detrás de un panel abierto: tocar
 * en cualquier parte fuera del panel lo cierra (también con la tecla Esc).
 *
 * Se usa una capa en vez de escuchar clics en `document` porque la galaxia y
 * el océano son un iframe y un canvas 3D que se "tragan" los toques: el
 * documento nunca se enteraba y el panel se quedaba abierto. Además, el toque
 * que cierra el panel no activa lo que esté debajo por accidente.
 */
export function DismissLayer({
  onDismiss,
  className = "z-40",
}: {
  onDismiss: () => void;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 cursor-default ${className}`}
      onClick={onDismiss}
      onContextMenu={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    />
  );
}
