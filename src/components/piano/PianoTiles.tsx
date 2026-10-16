import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ListMusic, Music2, Pencil, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ICONO3D_CSS, Icono3D } from "../Icono3D";
import { Sinte } from "./audio";
import {
  DIFICULTADES,
  calificar,
  cargarCanciones,
  cargarRecords,
  claveRecord,
  duracion,
  guardarCanciones,
  precision,
  registrarRecord,
  restaurarBase,
  type Cancion,
  type Nota,
  type Stats,
} from "./canciones";
import Editor from "./Editor";
import { PIANO_CSS, cargarFuente } from "./estilos";
import Juego from "./Juego";

type Pantalla =
  | { tipo: "menu" }
  | { tipo: "editor"; cancion?: Cancion }
  | { tipo: "juego"; cancion: Cancion; intento: number }
  | { tipo: "resultado"; cancion: Cancion; stats: Stats; record: boolean };

const transicion = {
  initial: { opacity: 0, y: 14, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.99 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
};

export default function PianoTiles({ onCerrar }: { onCerrar: () => void }) {
  const [montado, setMontado] = useState(false);
  const [canciones, setCanciones] = useState<Cancion[]>(() => cargarCanciones());
  const [dif, setDif] = useState(1);
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: "menu" });
  const sinteRef = useRef<Sinte | null>(null);

  const sinte = useCallback(() => {
    if (!sinteRef.current) sinteRef.current = new Sinte();
    return sinteRef.current;
  }, []);

  useEffect(() => {
    setMontado(true);
    cargarFuente();
    return () => {
      sinteRef.current?.cerrar();
      sinteRef.current = null;
    };
  }, []);

  const actualizar = (lista: Cancion[]) => {
    setCanciones(lista);
    guardarCanciones(lista);
  };

  const jugar = (c: Cancion) => {
    sinte().preparar();
    setPantalla((p) => ({
      tipo: "juego",
      cancion: c,
      intento: p.tipo === "resultado" ? Date.now() : 0,
    }));
  };

  const terminar = useCallback(
    (cancion: Cancion, stats: Stats) => {
      const record = registrarRecord(cancion.id, dif, stats.puntos);
      setPantalla({ tipo: "resultado", cancion, stats, record });
    },
    [dif],
  );

  if (!montado) return null;

  return createPortal(
    <div
      className="pt-raiz fixed inset-0 z-[80] overflow-hidden bg-[#07071a] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Piano Tiles"
    >
      <style>{ICONO3D_CSS + PIANO_CSS}</style>
      <Fondo />
      <AnimatePresence mode="wait" initial={false}>
        {pantalla.tipo === "menu" && (
          <motion.div key="menu" {...transicion} className="absolute inset-0">
            <Menu
              canciones={canciones}
              dif={dif}
              onDif={setDif}
              onJugar={jugar}
              onEditar={(c) => setPantalla({ tipo: "editor", cancion: c })}
              onCrear={() => setPantalla({ tipo: "editor" })}
              onBorrar={(id) => actualizar(canciones.filter((c) => c.id !== id))}
              onRestaurar={() => actualizar(restaurarBase(canciones))}
              onCerrar={onCerrar}
            />
          </motion.div>
        )}
        {pantalla.tipo === "editor" && (
          <motion.div
            key="editor"
            {...transicion}
            className="absolute inset-0"
            style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}
          >
            <Editor
              inicial={pantalla.cancion}
              sinte={sinte}
              onVolver={() => setPantalla({ tipo: "menu" })}
              onGuardar={(c) => {
                const existe = canciones.some((x) => x.id === c.id);
                actualizar(
                  existe ? canciones.map((x) => (x.id === c.id ? c : x)) : [...canciones, c],
                );
                setPantalla({ tipo: "menu" });
              }}
            />
          </motion.div>
        )}
        {pantalla.tipo === "juego" && (
          <motion.div
            key={`juego-${pantalla.intento}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
          >
            <Juego
              cancion={pantalla.cancion}
              dif={dif}
              sinte={sinte()}
              onFin={(s) => terminar(pantalla.cancion, s)}
              onSalir={() => setPantalla({ tipo: "menu" })}
            />
          </motion.div>
        )}
        {pantalla.tipo === "resultado" && (
          <motion.div key="resultado" {...transicion} className="absolute inset-0">
            <Resultado
              cancion={pantalla.cancion}
              stats={pantalla.stats}
              record={pantalla.record}
              dif={dif}
              onReintentar={() => jugar(pantalla.cancion)}
              onMenu={() => setPantalla({ tipo: "menu" })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ fondo

function Fondo() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#00eeff]/15 blur-3xl" />
      <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-[#ff00cc]/15 blur-3xl" />
      <div className="absolute -bottom-28 left-1/4 h-80 w-80 rounded-full bg-[#aa00ff]/20 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)",
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ menú

function Menu({
  canciones,
  dif,
  onDif,
  onJugar,
  onEditar,
  onCrear,
  onBorrar,
  onRestaurar,
  onCerrar,
}: {
  canciones: Cancion[];
  dif: number;
  onDif: (d: number) => void;
  onJugar: (c: Cancion) => void;
  onEditar: (c: Cancion) => void;
  onCrear: () => void;
  onBorrar: (id: string) => void;
  onRestaurar: () => void;
  onCerrar: () => void;
}) {
  const [armado, setArmado] = useState<string | null>(null);
  const [records] = useState(() => cargarRecords());

  useEffect(() => {
    if (!armado) return;
    const id = window.setTimeout(() => setArmado(null), 3000);
    return () => window.clearTimeout(id);
  }, [armado]);

  return (
    <div
      className="flex h-full flex-col"
      style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}
    >
      <div className="flex items-start justify-between px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Juego de ritmo
          </p>
          <h1 className="pt-orbitron pt-titulo text-[30px] font-black leading-tight tracking-wide">
            PIANO TILES
          </h1>
        </div>
        <button
          type="button"
          aria-label="Cerrar juego"
          onClick={onCerrar}
          className="pt-boton-vidrio grid h-11 w-11 flex-none place-items-center rounded-full text-white/90"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1 px-5 text-sm text-white/55">
        Toca cada ficha justo cuando cruce la línea de luz.
      </p>

      {/* Dificultad */}
      <div className="mt-5 px-5">
        <div className="pt-vidrio relative grid grid-cols-4 rounded-2xl p-1">
          {DIFICULTADES.map((d, i) => (
            <button
              key={d.nombre}
              type="button"
              onClick={() => onDif(i)}
              aria-pressed={dif === i}
              className={`relative z-10 h-10 rounded-xl text-[13px] font-bold transition-colors ${
                dif === i ? "text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              {dif === i && (
                <motion.span
                  layoutId="piano-dif"
                  className="absolute inset-0 -z-10 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, #00eeff55, #aa00ff88 55%, #ff00cc77)",
                    boxShadow:
                      "0 0 18px rgba(170,0,255,.45), inset 0 1px 0 rgba(255,255,255,.3), inset 0 0 0 1px rgba(255,255,255,.18)",
                  }}
                  transition={{ type: "spring", stiffness: 480, damping: 36 }}
                />
              )}
              {d.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Tus canciones · {canciones.length}
        </p>
        {canciones.length > 0 && (
          <button
            type="button"
            onClick={onCrear}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-[#00eeff] hover:text-white"
          >
            <Plus className="h-4 w-4" />
            Crear
          </button>
        )}
      </div>

      {/* Lista */}
      <div
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        {canciones.length === 0 ? (
          <div className="pt-vidrio mt-4 flex flex-col items-center rounded-3xl px-6 py-10 text-center">
            <Icono3D nombre="mic" size={64} brillo />
            <p className="pt-orbitron mt-4 text-[17px] font-bold text-white">SIN CANCIONES</p>
            <p className="mt-1.5 max-w-[260px] text-sm text-white/55">
              Crea la primera con tus notas favoritas. Puedes armarla tiempo a tiempo.
            </p>
            <button
              type="button"
              onClick={onCrear}
              className="pt-boton-neon mt-6 flex h-12 items-center gap-2 rounded-2xl px-6 text-[15px] font-bold text-white"
            >
              <Plus className="h-5 w-5" />
              Crear canción
            </button>
            <button
              type="button"
              onClick={onRestaurar}
              className="mt-4 text-[13px] font-medium text-white/45 underline-offset-4 hover:text-white/80 hover:underline"
            >
              Restaurar canciones de ejemplo
            </button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {canciones.map((c, i) => {
                const rec = records[claveRecord(c.id, dif)];
                const seg = Math.round(duracion(c));
                const borrar = armado === c.id;
                return (
                  <motion.li
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
                    exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                    className="pt-vidrio pt-tarjeta flex items-center gap-2 rounded-2xl p-2 pr-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onJugar(c)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left"
                    >
                      <span
                        className="grid h-12 w-12 flex-none place-items-center rounded-xl text-white"
                        style={{
                          background: `linear-gradient(135deg, ${["#00eeff", "#ff00cc", "#aa00ff", "#00ff88"][i % 4]}cc, #1a1340)`,
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,.3), 0 4px 14px rgba(0,0,0,.35)",
                        }}
                      >
                        <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-white">
                          {c.titulo}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-white/50">
                          {c.artista && <span className="truncate">{c.artista}</span>}
                          {c.artista && <span className="text-white/25">·</span>}
                          <span className="pt-orbitron flex-none text-[10px]">{c.bpm} BPM</span>
                          <span className="text-white/25">·</span>
                          <span className="flex-none">
                            {Math.floor(seg / 60)}:{String(seg % 60).padStart(2, "0")}
                          </span>
                        </span>
                        {rec ? (
                          <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#ffd166]">
                            <Icono3D nombre="trofeo" size={14} quieto />
                            <span className="pt-orbitron">{rec.toLocaleString("es")}</span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {!borrar && (
                      <button
                        type="button"
                        aria-label={`Editar ${c.titulo}`}
                        onClick={() => onEditar(c)}
                        className="grid h-10 w-10 flex-none place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Pencil className="h-[18px] w-[18px]" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={borrar ? `Confirmar borrar ${c.titulo}` : `Borrar ${c.titulo}`}
                      onClick={() => {
                        if (borrar) {
                          setArmado(null);
                          onBorrar(c.id);
                        } else setArmado(c.id);
                      }}
                      className={`flex h-10 flex-none items-center justify-center gap-1 rounded-full transition-all ${
                        borrar
                          ? "bg-[#ff4d6d] px-3 text-[13px] font-bold text-white shadow-[0_0_16px_#ff4d6d88]"
                          : "w-10 text-white/40 hover:bg-white/10 hover:text-[#ff8fa3]"
                      }`}
                    >
                      <Trash2 className="h-[18px] w-[18px]" />
                      {borrar && "¿Borrar?"}
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            <li>
              <button
                type="button"
                onClick={onCrear}
                className="mt-1 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-[14px] font-semibold text-white/60 transition-colors hover:border-[#00eeff]/60 hover:text-white"
              >
                <Music2 className="h-[18px] w-[18px]" />
                Crear canción
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ resultado

const MENSAJES: Record<Nota, string> = {
  S: "¡Perfecta, como tú!",
  A: "¡Increíble, mi amor!",
  B: "¡Muy bien! Ya casi",
  C: "Vas mejorando, sigue así",
  D: "Otra vez, tú puedes",
};

const COLOR_NOTA: Record<Nota, string> = {
  S: "linear-gradient(180deg, #fff3c4, #fbbf24 55%, #c2780a)",
  A: "linear-gradient(180deg, #d6f8ff, #00eeff 55%, #0891b2)",
  B: "linear-gradient(180deg, #eadcff, #aa00ff 60%, #5b14b8)",
  C: "linear-gradient(180deg, #ffe0ef, #ff00cc 60%, #9d0f7c)",
  D: "linear-gradient(180deg, #e5eaf1, #9aa6b8 60%, #4a5568)",
};

function Resultado({
  cancion,
  stats,
  record,
  dif,
  onReintentar,
  onMenu,
}: {
  cancion: Cancion;
  stats: Stats;
  record: boolean;
  dif: number;
  onReintentar: () => void;
  onMenu: () => void;
}) {
  const nota = calificar(stats);
  const pct = Math.round(precision(stats) * 1000) / 10;
  const datos: [string, string, string?][] = [
    ["Puntos", stats.puntos.toLocaleString("es")],
    ["Combo máx", String(stats.comboMax)],
    ["Precisión", `${pct.toLocaleString("es")}%`],
    ["Perfect", String(stats.perfect), "#00eeff"],
    ["Good", String(stats.good), "#ffd166"],
    ["Miss", String(stats.miss), "#ff4d6d"],
  ];
  return (
    <div
      className="flex h-full flex-col items-center justify-center overflow-y-auto px-5"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 16px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
      }}
    >
      <div className="pt-vidrio w-full max-w-[380px] rounded-[32px] px-5 pb-5 pt-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <Icono3D nombre="trofeo" size={34} brillo />
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
            {DIFICULTADES[dif]?.nombre}
          </p>
        </div>
        <p className="mt-2 truncate text-[17px] font-semibold text-white">{cancion.titulo}</p>
        {cancion.artista && <p className="text-[13px] text-white/45">{cancion.artista}</p>}

        <div className="relative mx-auto mt-4 grid h-[132px] w-[132px] place-items-center">
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
            className="pt-orbitron text-[104px] font-black leading-none"
            style={{
              background: COLOR_NOTA[nota],
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 0 22px rgba(170,0,255,.55))",
            }}
          >
            {nota}
          </motion.div>
          {nota === "S" && (
            <>
              <Icono3D nombre="estrella" size={30} className="absolute -right-2 top-2" />
              <Icono3D nombre="brillo" size={22} className="absolute -left-1 bottom-4" />
            </>
          )}
        </div>
        <p className="mt-1 text-[15px] font-semibold text-white/85">{MENSAJES[nota]}</p>
        {record && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#ffd166]/40 bg-[#ffd166]/10 px-3 py-1 text-[12px] font-bold text-[#ffd166]"
          >
            <Icono3D nombre="estrella" size={16} quieto />
            Nuevo récord
          </motion.p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {datos.map(([k, v, color], i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="rounded-2xl border border-white/[0.07] bg-black/25 px-1 py-2.5"
            >
              <p
                className="pt-orbitron truncate text-[16px] font-black text-white"
                style={color ? { color, textShadow: `0 0 12px ${color}88` } : undefined}
              >
                {v}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                {k}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onMenu}
            className="pt-boton-vidrio flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white/85"
          >
            <ListMusic className="h-5 w-5" />
            Menú
          </button>
          <button
            type="button"
            onClick={onReintentar}
            className="pt-boton-neon flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white"
          >
            <RotateCcw className="h-5 w-5" />
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}
