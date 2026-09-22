import { useEffect, useState, type CSSProperties } from "react";

type Star = {
  left: number;
  delay: number;
  duration: number;
  size: number;
  blur: number;
  opacity: number;
  drift: number;
  symbol: string;
  id: number;
};

/**
 * Estrellitas que caen como nieve. Se generan solo en el cliente (usan
 * Math.random) para evitar diferencias entre el HTML del servidor y el del
 * navegador (hydration mismatch).
 */
export function FallingStars({
  className = "pointer-events-none fixed inset-0 overflow-hidden",
}: {
  className?: string;
}) {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    // En móvil usamos menos estrellas y sin blur para conservar fluidez.
    const isMobile = window.innerWidth < 768;
    const count = isMobile ? 14 : 34;
    const symbols = ["✦", "✧", "⋆", "·"];
    setStars(
      Array.from({ length: count }).map((_, i) => {
        // depth: 0 = lejos (fondo), 1 = cerca (frente). Da sensación 3D:
        // los lejanos son pequeños, tenues y caen lento.
        const depth = Math.random();
        const duration = 20 - depth * 9;
        return {
          left: Math.random() * 100,
          // Retardo NEGATIVO: cada estrella arranca ya "a mitad de caída",
          // así siempre hay estrellas cayendo desde el primer segundo (sin pausas).
          delay: -Math.random() * duration,
          duration,
          size: 7 + depth * 17,
          blur: isMobile ? 0 : (1 - depth) * 1.2,
          opacity: 0.3 + depth * 0.65,
          drift: -34 + Math.random() * 68,
          symbol: symbols[Math.floor(Math.random() * symbols.length)] ?? "✦",
          id: i,
        };
      }),
    );
  }, []);

  return (
    <div className={className}>
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute animate-starlight text-cosmic-star"
          style={
            {
              left: `${star.left}%`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
              fontSize: star.size,
              filter: star.blur ? `blur(${star.blur}px)` : undefined,
              opacity: star.opacity,
              "--star-drift": `${star.drift}px`,
            } as CSSProperties
          }
        >
          {star.symbol}
        </div>
      ))}
    </div>
  );
}
