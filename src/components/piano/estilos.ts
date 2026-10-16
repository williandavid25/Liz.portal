// Estilos compartidos del piano (se inyectan en un <style> dentro del overlay).

export const PIANO_CSS = `
.pt-raiz { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
.pt-orbitron { font-family: Orbitron, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.pt-vidrio {
  background: linear-gradient(160deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025));
  border: 1px solid rgba(255,255,255,0.09);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.35);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}
.pt-boton-vidrio {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: background-color .15s, transform .12s;
}
.pt-boton-vidrio:hover { background: rgba(255,255,255,0.1); }
.pt-boton-vidrio:active { transform: scale(0.96); }
.pt-boton-neon {
  background: linear-gradient(135deg, #00eeff 0%, #aa00ff 55%, #ff00cc 100%);
  box-shadow: 0 0 22px rgba(170,0,255,0.45), inset 0 1px 0 rgba(255,255,255,0.35);
  transition: transform .12s, box-shadow .2s, filter .2s;
}
.pt-boton-neon:hover { filter: brightness(1.08); box-shadow: 0 0 30px rgba(255,0,204,0.5), inset 0 1px 0 rgba(255,255,255,0.35); }
.pt-boton-neon:active { transform: scale(0.96); }
.pt-campo {
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(255,255,255,0.1);
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.pt-campo:focus, .pt-campo:focus-within { border-color: rgba(0,238,255,0.6); box-shadow: 0 0 0 3px rgba(0,238,255,0.15); }
.pt-titulo {
  background: linear-gradient(90deg, #00eeff, #aa00ff 40%, #ff00cc 70%, #00ff88);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: pt-brillo 8s linear infinite;
  filter: drop-shadow(0 0 18px rgba(170,0,255,0.45));
}
@keyframes pt-brillo { to { background-position: 200% 0; } }
.pt-tarjeta { transition: background-color .18s, border-color .18s, transform .12s; }
.pt-tarjeta:hover { background: rgba(255,255,255,0.075); border-color: rgba(255,255,255,0.16); }
.pt-tarjeta:active { transform: scale(0.985); }
.pt-canvas { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
@media (prefers-reduced-motion: reduce) { .pt-titulo { animation: none; } }
`;

const ID_FUENTE = "liz-orbitron-font";

/** Carga Orbitron una sola vez. */
export function cargarFuente() {
  if (typeof document === "undefined" || document.getElementById(ID_FUENTE)) return;
  const link = document.createElement("link");
  link.id = ID_FUENTE;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap";
  document.head.appendChild(link);
}
