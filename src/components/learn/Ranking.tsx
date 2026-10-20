import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Crown,
  Gem,
  FlaskConical,
  Flame,
  Languages,
  Medal,
  Pencil,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { guardarRankingFn, leerRankingFn, salirRankingFn, uploadImage } from "@/lib/cloud";
import { getDeviceId } from "@/lib/dispositivo";
import { compressImage } from "@/lib/image";
import { fechaLocal } from "@/lib/learn/progreso";
import {
  LIGAS,
  avanceDe,
  guardarPerfil,
  ligaDe,
  lugarTexto,
  leerPerfil,
  nivelDe,
  ordenar,
  puntaje,
  usePerfil,
  type FilaRanking,
  type PerfilRanking,
  type VistaRanking,
} from "@/lib/learn/ranking";
import type { EstadoLearn, Track } from "@/lib/learn/tipos";

// Ranking de Snoopy Learn: la tarjeta del inicio, la pantalla completa y el
// registro (nombre + foto). Los datos se leen de la nube cada 30 s mientras
// Learn está abierto, así lo que avanza el otro celular aparece solo.

const REFRESCO_MS = 30_000;

/* ---------------- Datos compartidos (tarjeta y pantalla) ---------------- */

let filas: FilaRanking[] | null = null;
const oyentes = new Set<() => void>();
let pidiendo: Promise<void> | null = null;

function avisar() {
  for (const fn of oyentes) fn();
}

export function refrescarRanking(): Promise<void> {
  pidiendo ??= leerRankingFn({ data: getDeviceId() })
    .then((r) => {
      if (r.ok) {
        filas = r.filas;
        avisar();
      }
    })
    .catch(() => {})
    .finally(() => {
      pidiendo = null;
    });
  return pidiendo;
}

function useFilas(): FilaRanking[] | null {
  const valor = useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    () => filas,
    () => null,
  );
  useEffect(() => {
    void refrescarRanking();
    const reloj = setInterval(() => {
      if (document.visibilityState === "visible") void refrescarRanking();
    }, REFRESCO_MS);
    const alVolver = () => document.visibilityState === "visible" && void refrescarRanking();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);
  return valor;
}

async function subir(perfil: PerfilRanking, estado: EstadoLearn): Promise<boolean> {
  const r = await guardarRankingFn({
    data: { device: getDeviceId(), ...perfil, avance: avanceDe(estado) },
  }).catch(() => ({ ok: false }));
  if (r.ok) await refrescarRanking();
  return r.ok;
}

/**
 * Sube el avance cada vez que cambia (si esta persona se unió al ranking).
 * Espera un momento para juntar los cambios de una misma lección.
 */
export function useSincronizarRanking(estado: EstadoLearn) {
  const perfil = usePerfil();
  const ultimo = useRef("");
  // Si la nube no respondió, se vuelve a intentar a los 15 s.
  const [reintento, setReintento] = useState(0);
  useEffect(() => {
    if (!perfil) return;
    const firma = JSON.stringify([perfil, avanceDe(estado)]);
    if (firma === ultimo.current) return;
    const reloj = setTimeout(
      () => {
        void subir(perfil, estado).then((ok) => {
          if (ok) ultimo.current = firma;
          else setReintento((n) => n + 1);
        });
      },
      reintento > 0 ? 15_000 : 800,
    );
    return () => clearTimeout(reloj);
  }, [perfil, estado, reintento]);
}

/* ---------------- Piezas ---------------- */

const NOMBRES: Record<VistaRanking, string> = {
  english: "Inglés",
  laboratory: "Laboratorio",
  general: "General",
};
const ICONOS: Record<VistaRanking, typeof Languages> = {
  english: Languages,
  laboratory: FlaskConical,
  general: Trophy,
};

function Avatar({ nombre, foto, tam = 44 }: { nombre: string; foto: string | null; tam?: number }) {
  const [rota, setRota] = useState(false);
  return (
    <span
      className="lrn-avatar grid shrink-0 place-items-center overflow-hidden rounded-full font-extrabold"
      style={{ width: tam, height: tam, fontSize: tam * 0.42 }}
    >
      {foto && !rota ? (
        <img
          src={foto}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setRota(true)}
        />
      ) : (
        (nombre.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

const Puesto = ({ n }: { n: number }) =>
  n === 1 ? (
    <Crown size={18} className="text-amber-300" fill="currentColor" fillOpacity={0.3} />
  ) : n <= 3 ? (
    <Medal size={18} className={n === 2 ? "text-slate-200" : "text-orange-300"} />
  ) : (
    <span className="text-sm font-extrabold tabular-nums text-white/55">{n}</span>
  );

function ChipLiga({ liga, nombre }: { liga: string; nombre: string }) {
  const Icono = liga === "diamante" ? Gem : Medal;
  return (
    <span
      className={`lrn-liga ${liga} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider`}
    >
      <Icono size={11} strokeWidth={2.6} /> {nombre}
    </span>
  );
}

/* ---------------- Tarjeta del inicio ---------------- */

export function TarjetaRanking({ track, onAbrir }: { track: Track; onAbrir: () => void }) {
  const perfil = usePerfil();
  const datos = useFilas();
  const lista = datos ? ordenar(datos, track) : [];
  const yo = lista.findIndex((f) => f.esTu);
  const tuyo = yo >= 0 ? lista[yo]! : null;
  const nivel = tuyo ? nivelDe(puntaje(tuyo.avance, track).xp) : null;
  const liga = nivel ? ligaDe(nivel.nivel) : null;
  const primero = yo === 0 && !!tuyo && puntaje(tuyo.avance, track).xp > 0;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`lrn-tarjeta flex w-full items-center gap-3 rounded-3xl p-3.5 text-left transition active:scale-[0.99] ${primero ? "lrn-primero" : ""}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-300/15 text-amber-200">
        <Trophy size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
          Ranking · {NOMBRES[track]}
        </span>
        {!perfil ? (
          <span className="block text-[15px] font-extrabold leading-tight">
            Únete con tu nombre y tu foto
          </span>
        ) : tuyo && nivel && liga ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-extrabold leading-tight">
            <span className={primero ? "lrn-texto-oro" : ""}>
              {primero ? "👑 Primer lugar" : lugarTexto(yo + 1)}
            </span>
            <ChipLiga liga={liga.id} nombre={liga.nombre} />
            <span className="text-[13px] text-white/60">Nivel {nivel.nivel}</span>
          </span>
        ) : (
          <span className="block text-[15px] font-extrabold leading-tight">Ver posiciones</span>
        )}
      </span>
      <span className="flex -space-x-2">
        {lista.slice(0, 3).map((f, k) => (
          <span key={k} className="rounded-full ring-2 ring-[var(--fondo-c)]">
            <Avatar nombre={f.nombre} foto={f.foto} tam={30} />
          </span>
        ))}
      </span>
      <ChevronRight size={18} className="shrink-0 text-white/50" />
    </button>
  );
}

/* ---------------- Pantalla completa ---------------- */

export function PantallaRanking({ track, onVolver }: { track: Track; onVolver: () => void }) {
  const perfil = usePerfil();
  const datos = useFilas();
  const [vista, setVista] = useState<VistaRanking>(track);
  const [editando, setEditando] = useState(false);
  const hoy = fechaLocal();
  const lista = datos ? ordenar(datos, vista) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 flex min-h-0 flex-1 flex-col"
    >
      <div className="px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
          <p className="flex-1 text-lg font-bold tracking-tight">Ranking</p>
          {perfil && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/20"
            >
              <Pencil size={13} /> Mi perfil
            </button>
          )}
        </div>
        <div className="mx-auto mt-3 flex max-w-md rounded-full bg-black/25 p-1" role="tablist">
          {(["english", "laboratory", "general"] as const).map((id) => {
            const Icono = ICONOS[id];
            const activo = id === vista;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setVista(id)}
                className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[13px] font-bold"
              >
                {activo && (
                  <motion.span
                    layoutId="lrn-tab-ranking"
                    className="absolute inset-0 rounded-full bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icono size={14} className="relative" />
                <span className="relative">{NOMBRES[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <div className="mx-auto flex max-w-md flex-col gap-2.5">
          {!perfil && (
            <div className="lrn-tarjeta lrn-destacada rounded-3xl p-4">
              <p className="text-[15px] font-extrabold">Únete al ranking</p>
              <p className="mt-1 text-[13px] leading-snug text-white/70">
                Pon tu nombre y una foto para compararte con quien usa el otro celular. Tu avance se
                actualiza solo cada vez que terminas una lección.
              </p>
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="lrn-boton-principal mt-3 w-full rounded-2xl py-3 text-[15px] font-extrabold"
              >
                Registrarme
              </button>
            </div>
          )}

          {lista === null ? (
            <>
              <div className="lrn-tarjeta lrn-cargando h-20 rounded-3xl" />
              <div className="lrn-tarjeta lrn-cargando h-20 rounded-3xl" />
            </>
          ) : lista.length === 0 ? (
            <div className="lrn-tarjeta flex flex-col items-center gap-2 rounded-3xl p-6 text-center">
              <Users size={28} className="text-white/50" />
              <p className="text-sm text-white/70">Todavía nadie se unió al ranking.</p>
            </div>
          ) : (
            lista.map((f, k) => {
              const p = puntaje(f.avance, vista, hoy);
              const nivel = nivelDe(p.xp);
              const liga = ligaDe(nivel.nivel);
              const primero = k === 0 && p.xp > 0;
              return (
                <motion.div
                  key={`${f.nombre}-${k}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(k, 8) * 0.04 }}
                  className={`lrn-tarjeta rounded-3xl p-3.5 ${primero ? "lrn-primero" : f.esTu ? "lrn-destacada" : ""}`}
                >
                  <p
                    className={`mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] ${primero ? "lrn-texto-oro" : "text-white/50"}`}
                  >
                    {primero && <Crown size={13} fill="currentColor" fillOpacity={0.35} />}
                    {primero ? "Primer lugar" : lugarTexto(k + 1)}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="grid w-6 shrink-0 place-items-center">
                      <Puesto n={k + 1} />
                    </span>
                    <span className={`lrn-aro ${liga.id} rounded-full p-[2.5px]`}>
                      <Avatar nombre={f.nombre} foto={f.foto} tam={46} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[15px] font-extrabold leading-tight">
                        <span className={`truncate ${primero ? "lrn-texto-oro" : ""}`}>
                          {f.nombre}
                        </span>
                        {f.esTu && (
                          <span className="shrink-0 rounded-full bg-[var(--acento-suave)] px-2 py-0.5 text-[10px] font-bold text-[var(--acento)]">
                            Tú
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-white/65">
                        <ChipLiga liga={liga.id} nombre={liga.nombre} />
                        Nivel {nivel.nivel}
                        <span className="font-semibold text-white/45">
                          {vista === "general" ? ` · hasta el día ${p.dia}` : ` · día ${p.dia}`}
                        </span>
                      </p>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(nivel.pct)}
                        aria-label={`Progreso al nivel ${nivel.nivel + 1}`}
                      >
                        <div
                          className={`lrn-barra-liga ${liga.id} h-full rounded-full`}
                          style={{ width: `${nivel.pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="flex items-center gap-1 text-[15px] font-extrabold tabular-nums">
                        <Zap
                          size={14}
                          className="text-amber-200"
                          fill="currentColor"
                          fillOpacity={0.3}
                        />
                        {p.xp}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-xs font-bold tabular-nums ${p.racha > 0 ? "text-orange-200" : "text-white/40"}`}
                      >
                        <Flame size={12} /> {p.racha}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 pl-9 text-[11px] text-white/45">
                    {p.completados} {p.completados === 1 ? "lección hecha" : "lecciones hechas"} ·{" "}
                    {nivel.hasta - p.xp} XP para el nivel {nivel.nivel + 1}
                  </p>
                </motion.div>
              );
            })
          )}

          <p className="mt-1 text-center text-[11px] leading-snug text-white/40">
            Se ordena por XP. Cada nivel pide 50 XP más que el anterior.
          </p>
          <div className="lrn-tarjeta mt-1 rounded-3xl p-3.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
              Ligas
            </p>
            <div className="flex flex-col gap-1.5">
              {LIGAS.map((l, i) => {
                const hasta = LIGAS[i + 1]?.desde;
                return (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <ChipLiga liga={l.id} nombre={l.nombre} />
                    <span className="text-xs text-white/55">
                      {hasta ? `Niveles ${l.desde}–${hasta - 1}` : `Nivel ${l.desde} en adelante`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {editando && <EditarPerfil onCerrar={() => setEditando(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------- Registro / editar perfil ---------------- */

/**
 * Registro rápido: con solo el nombre ya entra. Se guarda al instante en el
 * celular y la subida a la nube (y la de la foto, si sigue subiendo) termina
 * por detrás con useSincronizarRanking.
 */
export function EditarPerfil({
  onCerrar,
  bienvenida = false,
}: {
  onCerrar: () => void;
  /** Se abrió sola al entrar a Learn: muestra "Más tarde". */
  bienvenida?: boolean;
}) {
  const actual = leerPerfil();
  const [nombre, setNombre] = useState(actual?.nombre ?? "");
  const [foto, setFoto] = useState<string | null>(actual?.foto ?? null);
  const [vista, setVista] = useState<string | null>(actual?.foto ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const subida = useRef<Promise<string | null> | null>(null);

  const elegirFoto = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setError(null);
    setVista(URL.createObjectURL(f));
    setSubiendo(true);
    const anterior = foto;
    const p = (async () => {
      try {
        const chica = await compressImage(f, 400, 0.85);
        const fd = new FormData();
        fd.append("file", chica);
        const { url } = await uploadImage({ data: fd });
        if (!url) throw new Error("sin url");
        setFoto(url);
        return url;
      } catch {
        setError("No se pudo subir la foto. Intenta de nuevo.");
        setVista(anterior);
        return null;
      } finally {
        setSubiendo(false);
      }
    })();
    subida.current = p;
  };

  const guardar = () => {
    const limpio = nombre.trim().slice(0, 30);
    if (!limpio) return;
    guardarPerfil({ nombre: limpio, foto });
    // La foto que sigue subiendo se agrega al perfil apenas llegue.
    const pendiente = subiendo ? subida.current : null;
    void pendiente?.then((url) => {
      const p = leerPerfil();
      if (url && p) guardarPerfil({ ...p, foto: url });
    });
    onCerrar();
  };

  const salir = async () => {
    setGuardando(true);
    await salirRankingFn({ data: getDeviceId() }).catch(() => {});
    setGuardando(false);
    guardarPerfil(null);
    void refrescarRanking();
    onCerrar();
  };

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCerrar}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="lrn-hoja w-full max-w-md rounded-t-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:rounded-3xl"
        role="dialog"
        aria-label={actual ? "Editar mi perfil" : "Unirme al ranking"}
      >
        <p className="text-lg font-extrabold">
          {actual ? "Mi perfil" : bienvenida ? "¡Entra al ranking!" : "Únete al ranking"}
        </p>
        <p className="mt-0.5 text-[13px] text-white/60">
          {actual
            ? "Así te verá la otra persona."
            : "Escribe tu nombre y listo: compite por niveles y puntos con la otra persona."}
        </p>

        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => archivo.current?.click()}
            className="relative rounded-full"
            aria-label="Elegir foto de perfil"
          >
            <Avatar nombre={nombre || "?"} foto={vista} tam={96} />
            <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-white text-slate-900 shadow-lg">
              <Camera size={16} />
            </span>
            {subiendo && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-[11px] font-bold">
                Subiendo…
              </span>
            )}
          </button>
          <input
            ref={archivo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              elegirFoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-white/50">Foto de perfil (opcional)</span>
        </div>

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
          Tu nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus={!actual}
            enterKeyHint="done"
            maxLength={30}
            placeholder="Cómo quieres aparecer"
            className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[var(--acento)]"
            onKeyDown={(e) => e.key === "Enter" && guardar()}
          />
        </label>

        {error && <p className="mt-2 text-[13px] text-rose-300">{error}</p>}

        <button
          type="button"
          disabled={!nombre.trim() || guardando}
          onClick={guardar}
          className="lrn-boton-principal mt-4 w-full rounded-2xl py-3.5 text-[15px] font-extrabold disabled:opacity-50"
        >
          {actual ? "Guardar cambios" : "Unirme"}
        </button>
        {!actual && bienvenida && (
          <button
            type="button"
            onClick={onCerrar}
            className="mt-2 w-full rounded-2xl py-2.5 text-[13px] font-bold text-white/55 hover:text-white"
          >
            Más tarde
          </button>
        )}
        {actual && (
          <button
            type="button"
            disabled={guardando}
            onClick={() => void salir()}
            className="mt-2 w-full rounded-2xl py-2.5 text-[13px] font-bold text-white/55 hover:text-white"
          >
            Salir del ranking
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
