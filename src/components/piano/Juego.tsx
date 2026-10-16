import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Pause, Play } from "lucide-react";
import { Icono3D } from "../Icono3D";
import type { Sinte } from "./audio";
import { DIFICULTADES, type Cancion, type Stats } from "./canciones";
import { Motor } from "./motor";

const TECLAS: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  ArrowLeft: 0,
  ArrowDown: 1,
  ArrowUp: 2,
  ArrowRight: 3,
};

export default function Juego({
  cancion,
  dif,
  sinte,
  onFin,
  onSalir,
}: {
  cancion: Cancion;
  dif: number;
  sinte: Sinte;
  onFin: (s: Stats) => void;
  onSalir: () => void;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const onFinRef = useRef(onFin);
  const [hud, setHud] = useState({ puntos: 0, combo: 0 });
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    onFinRef.current = onFin;
  }, [onFin]);

  // Crear el motor, ajustar tamaño y arrancar.
  useEffect(() => {
    const canvas = canvasRef.current;
    const caja = cajaRef.current;
    if (!canvas || !caja) return;
    const motor = new Motor(
      canvas,
      sinte,
      {
        onHud: (puntos, combo) => setHud({ puntos, combo }),
        onFin: (s) => onFinRef.current(s),
      },
      barraRef.current,
    );
    motorRef.current = motor;
    const medir = () => {
      const r = caja.getBoundingClientRect();
      motor.redimensionar(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caja);
    motor.iniciar(cancion, dif);
    return () => {
      ro.disconnect();
      motor.destruir();
      motorRef.current = null;
    };
  }, [cancion, dif, sinte]);

  const pausar = () => {
    motorRef.current?.pausar();
    setPausado(true);
  };
  const continuar = () => {
    sinte.preparar();
    motorRef.current?.reanudar();
    setPausado(false);
  };

  // Teclado y pausa automática al salir de la app.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        if (motorRef.current?.pausado) {
          motorRef.current.reanudar();
          setPausado(false);
        } else {
          motorRef.current?.pausar();
          setPausado(true);
        }
        return;
      }
      const col = TECLAS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (col === undefined || e.repeat) return;
      e.preventDefault();
      motorRef.current?.presionar(-1 - col, col);
    };
    const soltar = (e: KeyboardEvent) => {
      const col = TECLAS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (col !== undefined) motorRef.current?.soltar(-1 - col);
    };
    const visible = () => {
      if (document.hidden && motorRef.current) {
        motorRef.current.pausar();
        setPausado(true);
      }
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("keyup", soltar);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("keyup", soltar);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  const columna = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(3, Math.floor(((e.clientX - r.left) / r.width) * 4)));
  };

  return (
    <div className="absolute inset-0 bg-[#07071a]">
      <div ref={cajaRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="pt-canvas block h-full w-full"
          onPointerDown={(e) => {
            e.preventDefault();
            motorRef.current?.presionar(e.pointerId, columna(e));
          }}
          onPointerUp={(e) => motorRef.current?.soltar(e.pointerId)}
          onPointerCancel={(e) => motorRef.current?.soltar(e.pointerId)}
          onPointerLeave={(e) => motorRef.current?.soltar(e.pointerId)}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* HUD */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
      >
        <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
          <div
            ref={barraRef}
            className="h-full origin-left rounded-full bg-gradient-to-r from-[#00eeff] via-[#aa00ff] to-[#ff00cc]"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {cancion.titulo} · {DIFICULTADES[dif]?.nombre}
            </p>
            <p className="pt-orbitron text-[28px] font-black leading-tight text-white drop-shadow-[0_0_12px_rgba(0,238,255,0.55)]">
              {hud.puntos.toLocaleString("es")}
            </p>
          </div>
          <button
            type="button"
            aria-label="Pausar"
            onClick={pausar}
            className="pt-boton-vidrio pointer-events-auto grid h-11 w-11 flex-none place-items-center rounded-full text-white"
          >
            <Pause className="h-5 w-5" fill="currentColor" />
          </button>
        </div>
        <AnimatePresence>
          {hud.combo >= 2 && (
            <motion.div
              key="combo"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="mt-1 flex items-center justify-center gap-1.5"
            >
              {hud.combo >= 10 && <Icono3D nombre="llama" size={26} />}
              <motion.span
                key={hud.combo}
                initial={{ scale: 1.35 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
                className="pt-orbitron text-[26px] font-black text-white drop-shadow-[0_0_14px_rgba(255,0,204,0.7)]"
              >
                {hud.combo}
              </motion.span>
              <span className="pt-orbitron text-[11px] font-bold tracking-[0.2em] text-[#ff00cc]">
                COMBO
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pausa */}
      <AnimatePresence>
        {pausado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 grid place-items-center bg-[#07071a]/70 px-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="pt-vidrio w-full max-w-[320px] rounded-[28px] p-6 text-center"
            >
              <p className="pt-orbitron text-[22px] font-black tracking-[0.12em] text-white">
                EN PAUSA
              </p>
              <p className="mt-1 text-sm text-white/55">Tómate tu tiempo, aquí te espero</p>
              <button
                type="button"
                onClick={continuar}
                className="pt-boton-neon mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white"
              >
                <Play className="h-5 w-5" fill="currentColor" />
                Continuar
              </button>
              <button
                type="button"
                onClick={onSalir}
                className="pt-boton-vidrio mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white/85"
              >
                <LogOut className="h-5 w-5" />
                Salir
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
