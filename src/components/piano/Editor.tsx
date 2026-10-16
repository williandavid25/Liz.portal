import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eraser, Minus, Plus, Save } from "lucide-react";
import type { Sinte } from "./audio";
import {
  COLORES,
  NOTAS_COL_DEFECTO,
  NOTAS_EDITOR,
  nuevoId,
  type Cancion,
  type Tile,
} from "./canciones";

// Editor de canciones: una cuadrícula de medios tiempos × 4 columnas. Cada
// casilla encendida es una ficha; la nota sale del selector de su columna.

interface Celda {
  n: string;
  d: number;
}

const FILA = 30;

function filasIniciales(c?: Cancion) {
  if (!c || c.tiles.length === 0) return 32;
  const max = c.tiles.reduce((m, t) => Math.max(m, t.b), 0);
  return Math.max(32, Math.ceil((max + 1) / 4) * 8);
}

function celdasIniciales(c?: Cancion) {
  const m: Record<string, Celda> = {};
  for (const t of c?.tiles ?? []) m[`${t.c}|${Math.round(t.b * 2)}`] = { n: t.n, d: t.d };
  return m;
}

function notasIniciales(c?: Cancion) {
  if (c?.notasCol && c.notasCol.length === 4) return [...c.notasCol];
  return NOTAS_COL_DEFECTO.map((def, col) => c?.tiles.find((t) => t.c === col)?.n ?? def);
}

export default function Editor({
  inicial,
  sinte,
  onGuardar,
  onVolver,
}: {
  inicial?: Cancion;
  sinte: () => Sinte;
  onGuardar: (c: Cancion) => void;
  onVolver: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [artista, setArtista] = useState(inicial?.artista ?? "");
  const [bpm, setBpm] = useState(inicial?.bpm ?? 100);
  const [bpmTexto, setBpmTexto] = useState(String(inicial?.bpm ?? 100));
  const [notasCol, setNotasCol] = useState<string[]>(() => notasIniciales(inicial));
  const [filas, setFilas] = useState(() => filasIniciales(inicial));
  const [celdas, setCeldas] = useState<Record<string, Celda>>(() => celdasIniciales(inicial));
  const [error, setError] = useState("");
  const [limpiarArmado, setLimpiarArmado] = useState(false);

  useEffect(() => {
    if (!limpiarArmado) return;
    const id = window.setTimeout(() => setLimpiarArmado(false), 3000);
    return () => window.clearTimeout(id);
  }, [limpiarArmado]);

  const total = Object.keys(celdas).length;
  const nuevas = !inicial;

  const fijarBpm = (v: number) => {
    const b = Math.round(Math.min(220, Math.max(60, Number.isFinite(v) ? v : 100)));
    setBpm(b);
    setBpmTexto(String(b));
  };

  const alternar = (c: number, f: number) => {
    const k = `${c}|${f}`;
    setError("");
    setCeldas((prev) => {
      const sig = { ...prev };
      if (sig[k]) delete sig[k];
      else sig[k] = { n: notasCol[c], d: f % 2 ? 0.4 : 0.9 };
      return sig;
    });
    if (!celdas[k]) sinte().tocar(notasCol[c], 0.35);
  };

  const limpiar = () => {
    if (!limpiarArmado) {
      setLimpiarArmado(true);
      return;
    }
    setCeldas({});
    setLimpiarArmado(false);
  };

  const guardar = () => {
    const t = titulo.trim();
    if (!t) {
      setError("Ponle un título a tu canción");
      return;
    }
    if (total < 4) {
      setError("Necesitas al menos 4 notas");
      return;
    }
    const tiles: Tile[] = Object.entries(celdas)
      .map(([k, v]) => {
        const [c, f] = k.split("|").map(Number);
        return { c, b: f / 2, n: v.n, d: v.d };
      })
      .sort((a, b) => a.b - b.b || a.c - b.c);
    onGuardar({
      id: inicial?.id ?? nuevoId(),
      titulo: t,
      artista: artista.trim(),
      bpm,
      tiles,
      notasCol: [...notasCol],
    });
  };

  const indices = useMemo(() => Array.from({ length: filas }, (_, i) => i), [filas]);

  return (
    <div className="relative flex h-full flex-col">
      {/* Encabezado */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={onVolver}
          className="pt-boton-vidrio flex h-10 items-center gap-1 rounded-full pl-2 pr-4 text-sm font-semibold text-white/85"
        >
          <ChevronLeft className="h-5 w-5" />
          Volver
        </button>
        <h2 className="pt-orbitron ml-1 flex-1 truncate text-center text-[15px] font-bold tracking-wider text-white">
          {nuevas ? "NUEVA CANCIÓN" : "EDITAR"}
        </h2>
        <button
          type="button"
          onClick={guardar}
          className="pt-boton-neon flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-white"
        >
          <Save className="h-4 w-4" />
          Guardar
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28">
        {/* Datos */}
        <div className="pt-vidrio space-y-3 rounded-3xl p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
              Título
            </span>
            <input
              value={titulo}
              onChange={(e) => {
                setTitulo(e.target.value);
                setError("");
              }}
              maxLength={60}
              placeholder="Nuestra canción"
              className="pt-campo w-full rounded-xl px-3 py-2.5 text-[15px] text-white placeholder:text-white/30"
            />
          </label>
          <div className="flex gap-3">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Artista
              </span>
              <input
                value={artista}
                onChange={(e) => setArtista(e.target.value)}
                maxLength={40}
                placeholder="Opcional"
                className="pt-campo w-full rounded-xl px-3 py-2.5 text-[15px] text-white placeholder:text-white/30"
              />
            </label>
            <div className="w-[132px] flex-none">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                BPM
              </span>
              <div className="pt-campo flex items-center rounded-xl">
                <button
                  type="button"
                  aria-label="Bajar BPM"
                  onClick={() => fijarBpm(bpm - 4)}
                  className="grid h-10 w-9 place-items-center text-white/70 active:text-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  value={bpmTexto}
                  inputMode="numeric"
                  onChange={(e) => setBpmTexto(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onBlur={() => fijarBpm(Number(bpmTexto))}
                  aria-label="BPM"
                  className="pt-orbitron w-full min-w-0 bg-transparent text-center text-[15px] font-bold text-white outline-none"
                />
                <button
                  type="button"
                  aria-label="Subir BPM"
                  onClick={() => fijarBpm(bpm + 4)}
                  className="grid h-10 w-9 place-items-center text-white/70 active:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-2xl border border-[#ff4d6d]/40 bg-[#ff4d6d]/10 px-4 py-2.5 text-center text-sm font-semibold text-[#ff8fa3]">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Nota de cada columna
          </p>
          <p className="pt-orbitron text-[11px] font-bold text-white/60">{total} notas</p>
        </div>

        {/* Selectores de nota (pegados arriba al hacer scroll) */}
        <div className="sticky top-0 z-10 -mx-4 bg-[#07071a]/85 px-4 pb-2 pt-2 backdrop-blur-md">
          <div className="grid grid-cols-[28px_repeat(4,1fr)] gap-1.5">
            <span />
            {notasCol.map((n, c) => (
              <select
                key={c}
                value={n}
                aria-label={`Nota de la columna ${c + 1}`}
                onChange={(e) => {
                  const v = e.target.value;
                  setNotasCol((prev) => prev.map((x, i) => (i === c ? v : x)));
                  sinte().tocar(v, 0.35);
                }}
                className="pt-orbitron h-9 w-full appearance-none rounded-xl border bg-white/[0.04] text-center text-[12px] font-bold text-white outline-none"
                style={{ borderColor: `${COLORES[c]}88`, boxShadow: `0 0 12px ${COLORES[c]}33` }}
              >
                {(NOTAS_EDITOR.includes(n) ? NOTAS_EDITOR : [n, ...NOTAS_EDITOR]).map((x) => (
                  <option key={x} value={x} className="bg-[#0b0a24]">
                    {x}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>

        {/* Cuadrícula */}
        <div className="pt-vidrio mt-1 rounded-2xl p-2">
          {indices.map((f) => {
            const entero = f % 2 === 0;
            return (
              <div
                key={f}
                className={`grid grid-cols-[28px_repeat(4,1fr)] gap-1.5 ${
                  entero && f > 0 && f % 8 === 0 ? "mt-2 border-t border-white/10 pt-2" : "mt-1"
                }`}
                style={{ height: FILA }}
              >
                <span
                  className={`pt-orbitron self-center text-right text-[10px] ${
                    entero ? "font-bold text-white/55" : "text-white/20"
                  }`}
                >
                  {entero ? f / 2 + 1 : "·"}
                </span>
                {[0, 1, 2, 3].map((c) => {
                  const celda = celdas[`${c}|${f}`];
                  const color = COLORES[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => alternar(c, f)}
                      aria-pressed={!!celda}
                      aria-label={`Tiempo ${f / 2 + 1}, columna ${c + 1}`}
                      className={`pt-orbitron rounded-lg text-[10px] font-bold transition-[transform,background-color] duration-100 active:scale-95 ${
                        celda ? "text-[#07071a]" : entero ? "bg-white/[0.06]" : "bg-white/[0.025]"
                      }`}
                      style={
                        celda
                          ? {
                              background: `linear-gradient(180deg, ${color}aa, ${color})`,
                              boxShadow: `0 0 12px ${color}88, inset 0 1px 0 rgba(255,255,255,.45)`,
                            }
                          : undefined
                      }
                    >
                      {celda?.n ?? ""}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra inferior */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-2 bg-gradient-to-t from-[#07071a] via-[#07071a]/95 to-transparent px-4 pt-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 14px)" }}
      >
        <button
          type="button"
          onClick={() => setFilas((x) => x + 8)}
          className="pt-boton-vidrio flex h-11 items-center gap-1 rounded-full px-4 text-[13px] font-semibold text-white/90"
        >
          <Plus className="h-4 w-4" />4 tiempos
        </button>
        <button
          type="button"
          onClick={() => setFilas((x) => x + 16)}
          className="pt-boton-vidrio flex h-11 items-center gap-1 rounded-full px-4 text-[13px] font-semibold text-white/90"
        >
          <Plus className="h-4 w-4" />8 tiempos
        </button>
        <button
          type="button"
          onClick={limpiar}
          className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors ${
            limpiarArmado
              ? "bg-[#ff4d6d] text-white shadow-[0_0_18px_#ff4d6d88]"
              : "pt-boton-vidrio text-white/90"
          }`}
        >
          <Eraser className="h-4 w-4" />
          {limpiarArmado ? "¿Limpiar?" : "Limpiar"}
        </button>
      </div>
    </div>
  );
}
