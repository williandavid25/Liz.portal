import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Flower2, Sparkles, Waves } from "lucide-react";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/")({ component: Index });

const phrases = ["Como el girasol, miro hacia ti", "Hoy el amarillo lleva tu nombre", "Contigo hasta lo simple brilla", "Un girasol para quien ilumina", "Pétalos dorados solo para ti", "Tu risa le hace bien a mis días"];

function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let animation = 0, width = 0, height = 0;
    let stars: { x: number; y: number; size: number; speed: number }[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width; height = bounds.height; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      stars = Array.from({ length: Math.max(70, Math.min(180, Math.round((width * height) / 7000))) }, () => ({ x: Math.random() * width, y: Math.random() * height, size: Math.random() * 1.6 + .35, speed: Math.random() * .8 + .15 }));
    };
    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(width / 2, height * .54, 0, width / 2, height * .54, Math.max(width, height) * .66);
      glow.addColorStop(0, "#382704"); glow.addColorStop(.32, "#151106"); glow.addColorStop(1, "#030405"); context.fillStyle = glow; context.fillRect(0, 0, width, height);
      stars.forEach((star) => { context.fillStyle = `rgba(255, 239, 172, ${reducedMotion ? .72 : .38 + Math.sin(time * .001 * star.speed + star.x) * .28})`; context.beginPath(); context.arc(star.x, star.y, star.size, 0, Math.PI * 2); context.fill(); });
      if (!reducedMotion) animation = requestAnimationFrame(draw);
    };
    resize(); draw(); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(animation); };
  }, []);
  return <canvas ref={canvasRef} className="galaxy-canvas" aria-hidden="true" />;
}

function scrollToSection(id: "flowers" | "ocean") { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }

function Index() {
  return <main className="portal">
    <nav className="section-nav" aria-label="Navegación entre secciones">
      <button type="button" onClick={() => scrollToSection("flowers")} aria-label="Ir a Flores Amarillas"><Flower2 aria-hidden="true" /><span>Flores</span></button>
      <button type="button" onClick={() => scrollToSection("ocean")} aria-label="Ir al Océano"><Waves aria-hidden="true" /><span>Océano</span></button>
    </nav>
    <section id="flowers" className="scene scene--flowers" aria-labelledby="flowers-title">
      <GalaxyCanvas />
      <div className="scene-content flowers-content">
        <p className="eyebrow"><Sparkles aria-hidden="true" /> 21 de septiembre</p>
        <h1 id="flowers-title">Feliz Día de las<br />Flores Amarillas <span aria-hidden="true">🌻</span></h1>
        <p className="scene-intro">Un pequeño universo dorado para ti.</p>
        <div className="galaxy-orbit" aria-hidden="true"><div className="galaxy-core" /><i className="orbit orbit--one" /><i className="orbit orbit--two" /><i className="orbit orbit--three" /><span className="sunflower sunflower--one">🌻</span><span className="sunflower sunflower--two">🌼</span><span className="sunflower sunflower--three">🌻</span></div>
        <div className="phrase-cloud" aria-label="Mensajes de flores amarillas">{phrases.map((phrase, index) => <p key={phrase} className={`phrase phrase--${index + 1}`}>{phrase}</p>)}</div>
      </div>
      <button className="scroll-cue" type="button" onClick={() => scrollToSection("ocean")}><span>Descubre el océano</span><ArrowDown aria-hidden="true" /></button>
    </section>
    <div className="scene-divider" aria-label="Cambiar entre Flores y Océano"><button type="button" onClick={() => scrollToSection("flowers")}><ArrowUp aria-hidden="true" /><span>Flores</span></button><span className="divider-line" aria-hidden="true" /><button type="button" onClick={() => scrollToSection("ocean")}><span>Océano</span><ArrowDown aria-hidden="true" /></button></div>
    <section id="ocean" className="scene scene--ocean" aria-labelledby="ocean-title">
      <div className="ocean-glow" aria-hidden="true" /><div className="ocean-stars" aria-hidden="true" /><div className="ocean-waves" aria-hidden="true"><i /><i /><i /></div>
      <div className="scene-content ocean-content"><p className="eyebrow eyebrow--blue"><Waves aria-hidden="true" /> Bajo la misma luna</p><h2 id="ocean-title">Océano de<br />recuerdos</h2><p className="scene-intro">Cada ola guarda una historia, cada luz te encuentra.</p><div className="dolphin" role="img" aria-label="Delfín saltando sobre las olas">🐬</div></div>
      <button className="scroll-cue scroll-cue--up" type="button" onClick={() => scrollToSection("flowers")}><ArrowUp aria-hidden="true" /><span>Volver a las flores</span></button>
    </section>
  </main>;
}
