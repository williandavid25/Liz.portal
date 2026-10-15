import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  FlaskConical,
  Flame,
  Gem,
  Heart,
  Languages,
  Lock,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { reproducir } from "@/lib/sonidos-mascota";
import {
  COSTO_ESCUDO,
  COSTO_REPARAR,
  CORAZONES_MAX,
  MAX_ESCUDOS,
  TRACKS,
  comprarEscudo,
  completarDia,
  corazonesActuales,
  fechaLocal,
  guardarLearn,
  infoRacha,
  leerLearn,
  perderCorazon,
  repararRacha,
  useLearn,
} from "@/lib/learn/progreso";
import {
  TOTAL_DIAS,
  cargarTrack,
  esCorrecta,
  pasosLeccion,
  pasosTest,
  respuestaCorrecta,
  type Paso,
} from "@/lib/learn/contenido";
import type { ContenidoTrack, Dia, Premio, Track } from "@/lib/learn/tipos";
import { TarjetaVocab, VistaEjercicio, type Respuesta } from "./Ejercicios";

// Snoopy Learn: Snoopy le da a la persona una tarea por día, con preguntas de
// UNA EN UNA. Cada materia (Inglés / Laboratorio) tiene su propia racha y sus
// propios corazones. Se abre encima de la página de la mascota.

const TEMAS: Record<Track, { nombre: string; Icono: typeof Languages; estilo: CSSProperties }> = {
  english: {
    nombre: "Inglés",
    Icono: Languages,
    estilo: {
      "--fondo-a": "#1e1b4b",
      "--fondo-b": "#312e81",
      "--fondo-c": "#0b1026",
      "--acento": "#7dd3fc",
      "--acento-suave": "rgba(125,211,252,0.28)",
      "--acento-fuerte": "#38bdf8",
    } as CSSProperties,
  },
  laboratory: {
    nombre: "Laboratorio",
    Icono: FlaskConical,
    estilo: {
      "--fondo-a": "#042f2e",
      "--fondo-b": "#115e59",
      "--fondo-c": "#03141a",
      "--acento": "#5eead4",
      "--acento-suave": "rgba(94,234,212,0.28)",
      "--acento-fuerte": "#2dd4bf",
    } as CSSProperties,
  },
};

const sonar = (s: Parameters<typeof reproducir>[0]) => {
  try {
    reproducir(s);
  } catch {
    /* sin audio */
  }
};

function useReloj(activo: boolean) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activo]);
  return ahora;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Vista =
  | { tipo: "inicio" }
  | { tipo: "sesion"; dia: Dia; pasos: Paso[]; repaso: boolean }
  | { tipo: "resultado"; dia: Dia; premio: Premio; aciertos: number; total: number }
  | { tipo: "sinCorazones"; dia: Dia };

export default function SnoopyLearn({
  onCerrar,
  onTerminar,
  nombre = "Snoopy",
}: {
  onCerrar: () => void;
  /** Avisa a la mascota: lección terminada (para que se ponga feliz). */
  onTerminar?: (p: Premio, track: Track) => void;
  nombre?: string;
}) {
  const estado = useLearn();
  const [track, setTrack] = useState<Track>(() => {
    try {
      const t = localStorage.getItem("snoopy-learn-track");
      return t === "laboratory" ? "laboratory" : "english";
    } catch {
      return "english";
    }
  });
  const [contenido, setContenido] = useState<ContenidoTrack | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [vista, setVista] = useState<Vista>({ tipo: "inicio" });

  useEffect(() => {
    try {
      localStorage.setItem("snoopy-learn-track", track);
    } catch {
      /* ignorar */
    }
    let vivo = true;
    setContenido(null);
    setErrorCarga(false);
    cargarTrack(track)
      .then((c) => vivo && setContenido(c))
      .catch(() => vivo && setErrorCarga(true));
    return () => {
      vivo = false;
    };
  }, [track]);

  // Escape: vuelve al inicio o cierra.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (vista.tipo === "inicio") onCerrar();
      else setVista({ tipo: "inicio" });
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [vista.tipo, onCerrar]);

  const tema = TEMAS[track];
  const t = estado.tracks[track];

  const empezar = useCallback(
    (dia: Dia) => {
      if (!contenido) return;
      const repaso = t.completados.includes(dia.day_id) && dia.day_type === "lesson";
      const { corazones } = corazonesActuales(leerLearn().tracks[track]);
      // Sin corazones solo se puede repasar (y así se gana uno).
      if (corazones <= 0 && !repaso && dia.day_type === "lesson") {
        setVista({ tipo: "sinCorazones", dia });
        return;
      }
      const pasos =
        dia.day_type === "lesson" ? pasosLeccion(dia, !repaso) : pasosTest(contenido, dia);
      sonar("pasear");
      setVista({ tipo: "sesion", dia, pasos, repaso });
    },
    [contenido, t.completados, track],
  );

  // Se dibuja sobre todo el sitio (por encima de la barra superior de la app).
  return createPortal(
    <motion.div
      className="lrn-raiz fixed inset-0 z-[90] flex flex-col text-white"
      style={tema.estilo}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label="Snoopy Learn"
    >
      <style>{CSS}</style>
      <div className="lrn-fondo pointer-events-none absolute inset-0" aria-hidden="true" />
      {/* Sin esperar animaciones de salida: si una no termina (app en segundo
          plano, celular lento), la pantalla siguiente igual aparece. */}
      <>
        {vista.tipo === "inicio" && (
          <Inicio
            key={`inicio-${track}`}
            track={track}
            setTrack={setTrack}
            contenido={contenido}
            errorCarga={errorCarga}
            onEmpezar={empezar}
            onCerrar={onCerrar}
            nombre={nombre}
          />
        )}
        {vista.tipo === "sesion" && contenido && (
          <Sesion
            key={`sesion-${vista.dia.day_id}`}
            track={track}
            contenido={contenido}
            dia={vista.dia}
            pasosIniciales={vista.pasos}
            repaso={vista.repaso}
            nombre={nombre}
            onSalir={() => setVista({ tipo: "inicio" })}
            onSinCorazones={() => setVista({ tipo: "sinCorazones", dia: vista.dia })}
            onFin={(premio, aciertos, total) => {
              onTerminar?.(premio, track);
              setVista({ tipo: "resultado", dia: vista.dia, premio, aciertos, total });
            }}
          />
        )}
        {vista.tipo === "resultado" && (
          <Resultado
            key="resultado"
            dia={vista.dia}
            premio={vista.premio}
            aciertos={vista.aciertos}
            total={vista.total}
            contenido={contenido}
            track={track}
            onSeguir={() => setVista({ tipo: "inicio" })}
            onSiguiente={(d) => empezar(d)}
          />
        )}
        {vista.tipo === "sinCorazones" && (
          <SinCorazones
            key="sin-corazones"
            track={track}
            contenido={contenido}
            onRepasar={(d) => empezar(d)}
            onVolver={() => setVista({ tipo: "inicio" })}
          />
        )}
      </>
    </motion.div>,
    document.body,
  );
}

/* ================= Inicio ================= */

function Inicio({
  track,
  setTrack,
  contenido,
  errorCarga,
  onEmpezar,
  onCerrar,
  nombre,
}: {
  track: Track;
  setTrack: (t: Track) => void;
  contenido: ContenidoTrack | null;
  errorCarga: boolean;
  onEmpezar: (d: Dia) => void;
  onCerrar: () => void;
  nombre: string;
}) {
  const estado = useLearn();
  const t = estado.tracks[track];
  const hoy = fechaLocal();
  const racha = infoRacha(t, hoy);
  const corazonesInfo = corazonesActuales(t);
  const ahora = useReloj(corazonesInfo.proximoEnMs !== null);
  const corazones = corazonesActuales(t, ahora);
  const diaActual = contenido?.days.find((d) => d.day_id === t.dia) ?? null;
  const caminoRef = useRef<HTMLDivElement>(null);

  // Lleva el camino al día actual.
  useEffect(() => {
    if (!contenido) return;
    const el = caminoRef.current?.querySelector<HTMLElement>("[data-actual='true']");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [contenido, track]);

  const mensajeRacha = racha.hechaHoy
    ? "¡Tarea de hoy cumplida! Vuelve mañana para sumar otro día."
    : racha.protegida
      ? "Ayer faltaste, pero un escudo protegió tu racha. ¡Hoy no se te pase!"
      : racha.enRiesgo
        ? "Haz la tarea de hoy para no perder tu racha."
        : racha.rota
          ? "Tu racha se apagó. ¡Empecemos otra hoy!"
          : "Completa tu primera lección para encender la racha.";

  const pasoAnimacion = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  };

  return (
    <motion.div {...pasoAnimacion} className="relative flex min-h-0 flex-1 flex-col">
      {/* Cabecera */}
      <div className="relative z-10 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src="/mascota/frente.webp" alt="" className="lrn-flotar h-9 w-9 object-contain" />
            <p className="text-lg font-bold tracking-tight">Snoopy Learn</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar Snoopy Learn"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <X size={20} />
          </button>
        </div>
        {/* Materias */}
        <div className="mx-auto mt-3 flex max-w-md rounded-full bg-black/25 p-1" role="tablist">
          {TRACKS.map((id) => {
            const Icono = TEMAS[id].Icono;
            const activo = id === track;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setTrack(id)}
                className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold"
              >
                {activo && (
                  <motion.span
                    layoutId="lrn-tab"
                    className="absolute inset-0 rounded-full bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icono size={15} className="relative" />
                <span className="relative">{TEMAS[id].nombre}</span>
                {infoRacha(estado.tracks[id], hoy).racha > 0 && (
                  <span className="relative flex items-center gap-0.5 text-[11px] text-orange-200">
                    <Flame size={11} /> {infoRacha(estado.tracks[id], hoy).racha}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          {/* Racha */}
          <div className="lrn-tarjeta flex items-center gap-4 rounded-3xl p-4">
            <div
              className={`lrn-llama ${racha.hechaHoy ? "encendida" : racha.racha > 0 ? "tibia" : "apagada"}`}
            >
              <Flame size={34} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-extrabold leading-none">
                {racha.racha}{" "}
                <span className="text-base font-bold text-white/70">
                  {racha.racha === 1 ? "día" : "días"} de racha
                </span>
              </p>
              <p className="mt-1 text-[13px] leading-snug text-white/70">{mensajeRacha}</p>
              {racha.reparable && <RepararBoton track={track} />}
            </div>
          </div>

          {/* Recursos */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <Recurso
              Icono={Heart}
              color="text-rose-300"
              valor={`${corazones.corazones}/${CORAZONES_MAX}`}
              etiqueta={corazones.proximoEnMs ? `+1 en ${mmss(corazones.proximoEnMs)}` : "Llenos"}
            />
            <Recurso Icono={Zap} color="text-amber-200" valor={t.xp} etiqueta="XP" />
            <Recurso Icono={Gem} color="text-sky-200" valor={estado.gemas} etiqueta="Gemas" />
            <EscudoBoton track={track} />
          </div>

          {/* Tarea de hoy */}
          {errorCarga ? (
            <div className="lrn-tarjeta rounded-3xl p-5 text-sm text-white/80">
              No se pudo cargar el contenido. Revisa tu conexión y vuelve a abrir.
            </div>
          ) : !contenido ? (
            <div className="lrn-tarjeta lrn-cargando h-40 rounded-3xl" aria-label="Cargando" />
          ) : diaActual ? (
            <TareaHoy
              dia={diaActual}
              hechaHoy={racha.hechaHoy}
              nombre={nombre}
              onEmpezar={() => onEmpezar(diaActual)}
            />
          ) : (
            <div className="lrn-tarjeta rounded-3xl p-5">
              <p className="text-lg font-bold">¡Completaste todo lo disponible! 🎉</p>
              <p className="mt-1 text-sm text-white/70">
                Pronto llegan más días. Mientras tanto, repasa cualquier lección para ganar
                corazones y XP.
              </p>
            </div>
          )}

          {/* Camino de días */}
          {contenido && (
            <div ref={caminoRef} className="mt-2 flex flex-col items-center gap-3 py-2">
              <p className="self-start text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
                Fase 1 · Fundamentos
              </p>
              {contenido.days.map((d, i) => {
                const hecho = t.completados.includes(d.day_id);
                const actual = d.day_id === t.dia;
                const bloqueado = d.day_id > t.dia;
                const lado = [0, 1, 0, -1][i % 4]!;
                return (
                  <motion.button
                    key={d.day_id}
                    type="button"
                    data-actual={actual}
                    disabled={bloqueado}
                    onClick={() => onEmpezar(d)}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: Math.min(i, 10) * 0.03,
                      type: "spring",
                      stiffness: 300,
                      damping: 24,
                    }}
                    style={{ translate: `${lado * 56}px 0` }}
                    className="group flex flex-col items-center gap-1"
                    aria-label={`Día ${d.day_id}: ${d.title}${hecho ? " (completado)" : bloqueado ? " (bloqueado)" : ""}`}
                  >
                    <span
                      className={`lrn-nodo ${hecho ? "hecho" : actual ? "actual" : "bloqueado"} ${d.day_type === "test" ? "test" : ""}`}
                    >
                      {bloqueado ? (
                        <Lock size={20} />
                      ) : d.day_type === "test" ? (
                        <Trophy size={22} />
                      ) : hecho ? (
                        <Check size={24} strokeWidth={3} />
                      ) : (
                        <Star />
                      )}
                      {actual && <span className="lrn-onda" aria-hidden="true" />}
                    </span>
                    <span
                      className={`max-w-[9rem] text-center text-[11px] font-semibold leading-tight ${bloqueado ? "text-white/35" : "text-white/80"}`}
                    >
                      Día {d.day_id} · {d.title}
                    </span>
                  </motion.button>
                );
              })}
              {contenido.days.length < TOTAL_DIAS && (
                <div className="mt-1 flex flex-col items-center gap-1 text-white/35">
                  <span className="lrn-nodo bloqueado">
                    <Sparkles size={20} />
                  </span>
                  <span className="text-[11px] font-semibold">
                    Días {contenido.days.length + 1}–{TOTAL_DIAS}: próximamente
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Insignias */}
          {estado.insignias.length > 0 && (
            <div className="lrn-tarjeta rounded-3xl p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
                Insignias
              </p>
              <div className="flex flex-wrap gap-2">
                {estado.insignias.map((n) => (
                  <span
                    key={n}
                    className="flex items-center gap-1.5 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-bold text-amber-100"
                  >
                    <Trophy size={12} /> {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
        fill="currentColor"
      />
    </svg>
  );
}

function Recurso({
  Icono,
  color,
  valor,
  etiqueta,
}: {
  Icono: typeof Heart;
  color: string;
  valor: string | number;
  etiqueta: string;
}) {
  return (
    <div className="lrn-tarjeta flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5">
      <Icono size={18} className={color} fill="currentColor" fillOpacity={0.25} />
      <span className="text-[15px] font-extrabold tabular-nums">{valor}</span>
      <span className="text-[10px] leading-tight text-white/55">{etiqueta}</span>
    </div>
  );
}

function EscudoBoton({ track }: { track: Track }) {
  const estado = useLearn();
  const t = estado.tracks[track];
  const puede = estado.gemas >= COSTO_ESCUDO && t.escudos < MAX_ESCUDOS;
  return (
    <button
      type="button"
      disabled={!puede}
      onClick={() => {
        const n = comprarEscudo(leerLearn(), track);
        if (n) {
          guardarLearn(n);
          sonar("logro");
        }
      }}
      className="lrn-tarjeta flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5 transition enabled:hover:bg-white/15 disabled:opacity-80"
      title={`Escudo: protege tu racha si faltas un día (${COSTO_ESCUDO} gemas)`}
    >
      <Shield size={18} className="text-emerald-200" fill="currentColor" fillOpacity={0.25} />
      <span className="text-[15px] font-extrabold tabular-nums">{t.escudos}</span>
      <span className="text-[10px] leading-tight text-white/55">
        {t.escudos >= MAX_ESCUDOS ? "Escudos" : `+1 por ${COSTO_ESCUDO}`}
        {t.escudos < MAX_ESCUDOS && <Gem size={9} className="ml-0.5 inline align-[-1px]" />}
      </span>
    </button>
  );
}

function RepararBoton({ track }: { track: Track }) {
  const estado = useLearn();
  const puede = estado.gemas >= COSTO_REPARAR;
  return (
    <button
      type="button"
      disabled={!puede}
      onClick={() => {
        const n = repararRacha(leerLearn(), track);
        if (n) {
          guardarLearn(n);
          sonar("logro");
        }
      }}
      className="mt-2 flex items-center gap-1.5 rounded-full bg-orange-400/90 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-400 disabled:opacity-50"
    >
      <RotateCcw size={13} /> Reparar racha · {COSTO_REPARAR} <Gem size={12} />
      {!puede && <span className="font-semibold opacity-80">(te faltan gemas)</span>}
    </button>
  );
}

function TareaHoy({
  dia,
  hechaHoy,
  nombre,
  onEmpezar,
}: {
  dia: Dia;
  hechaHoy: boolean;
  nombre: string;
  onEmpezar: () => void;
}) {
  const esTest = dia.day_type === "test";
  return (
    <div className="lrn-tarjeta lrn-destacada relative overflow-hidden rounded-3xl p-4">
      <div className="flex gap-3">
        <img
          src="/mascota/frente.webp"
          alt=""
          className="lrn-flotar h-16 w-16 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--acento)]">
            {hechaHoy ? "Sigue si quieres" : `${nombre} te dejó una tarea`}
          </p>
          <p className="mt-0.5 text-lg font-extrabold leading-tight">
            Día {dia.day_id} · {dia.title}
          </p>
          {dia.subtitle && <p className="text-sm text-white/70">{dia.subtitle}</p>}
        </div>
      </div>
      {dia.snoopy_tip && (
        <p className="lrn-globo relative mt-3 rounded-2xl bg-white/10 px-3 py-2 text-[13px] italic text-white/85">
          {dia.snoopy_tip}
        </p>
      )}
      <p className="mt-2 text-xs text-white/55">
        {esTest
          ? `${dia.total_questions} preguntas de repaso, una por una · aprueba con ${dia.pass_score_pct}%`
          : `${dia.lesson.vocabulary.length} palabras nuevas y ${dia.exercises.length} preguntas, una por una`}
      </p>
      <button
        type="button"
        onClick={onEmpezar}
        className="lrn-boton-principal mt-3 w-full rounded-2xl py-3.5 text-[15px] font-extrabold"
      >
        {esTest ? "Empezar el test" : hechaHoy ? "Siguiente lección" : "Empezar la tarea"}
      </button>
    </div>
  );
}

/* ================= Sesión (una pregunta a la vez) ================= */

function Sesion({
  track,
  contenido,
  dia,
  pasosIniciales,
  repaso,
  nombre,
  onSalir,
  onSinCorazones,
  onFin,
}: {
  track: Track;
  contenido: ContenidoTrack;
  dia: Dia;
  pasosIniciales: Paso[];
  repaso: boolean;
  nombre: string;
  onSalir: () => void;
  onSinCorazones: () => void;
  onFin: (p: Premio, aciertos: number, total: number) => void;
}) {
  const esTest = dia.day_type === "test";
  const [cola, setCola] = useState(pasosIniciales);
  const [i, setI] = useState(0);
  const [respuesta, setRespuesta] = useState<Respuesta>(null);
  const [revision, setRevision] = useState<null | { correcta: boolean }>(null);
  const [errorPareja, setErrorPareja] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const aciertos = useRef(0);
  const errores = useRef(0);
  const totalEjercicios = useMemo(
    () => pasosIniciales.filter((p) => p.tipo === "ejercicio").length,
    [pasosIniciales],
  );
  const estado = useLearn();
  const corazones = corazonesActuales(estado.tracks[track]).corazones;
  const usaCorazones = !esTest && !repaso;

  const paso = cola[i]!;
  const progreso = (i + (revision ? 1 : 0)) / cola.length;

  const comprobar = () => {
    if (paso.tipo !== "ejercicio" || revision) return;
    const ej = paso.ej;
    const bien =
      ej.type === "word_match"
        ? !errorPareja
        : esCorrecta(ej, respuesta as string | number | string[]);
    setRevision({ correcta: bien });
    if (bien) {
      if (!paso.repaso) aciertos.current += 1;
      sonar("logro");
      navigator.vibrate?.(15);
    } else {
      errores.current += 1;
      sonar("triste");
      navigator.vibrate?.([30, 40, 30]);
      if (usaCorazones)
        guardarLearn({
          ...leerLearn(),
          tracks: { ...leerLearn().tracks, [track]: perderCorazon(leerLearn().tracks[track]) },
        });
      // En lecciones, lo que se falla vuelve al final para acertarlo (no en tests ni en pareja).
      if (!esTest && !paso.repaso && ej.type !== "word_match") {
        setCola((c) => [...c, { ...paso, key: `${paso.key}-r`, repaso: true }]);
      }
    }
  };

  const continuar = () => {
    if (
      usaCorazones &&
      revision &&
      !revision.correcta &&
      corazonesActuales(leerLearn().tracks[track]).corazones <= 0
    ) {
      onSinCorazones();
      return;
    }
    if (i + 1 >= cola.length) {
      const base = {
        dia: dia.day_id,
        aciertos: aciertos.current,
        total: totalEjercicios,
        errores: errores.current,
      };
      const r =
        dia.day_type === "test"
          ? completarDia(leerLearn(), track, {
              ...base,
              esTest: true,
              pasoPct: dia.pass_score_pct,
              premioTest: { primero: dia.reward_first_try, repetido: dia.reward_retry },
            })
          : completarDia(leerLearn(), track, { ...base, esTest: false, xpLeccion: dia.xp_reward });
      guardarLearn(r.estado);
      onFin(r.premio, aciertos.current, totalEjercicios);
      return;
    }
    setI(i + 1);
    setRespuesta(null);
    setRevision(null);
    setErrorPareja(false);
  };

  const listo = paso.tipo === "vocab" || respuesta !== null;
  const instruccion =
    paso.tipo === "vocab"
      ? `Palabra nueva ${paso.n} de ${paso.de}`
      : paso.repaso
        ? "¡Otra oportunidad! Inténtalo de nuevo"
        : esTest
          ? `Pregunta ${Math.min(i + 1, totalEjercicios)} de ${totalEjercicios}`
          : `${nombre} pregunta…`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 flex min-h-0 flex-1 flex-col"
    >
      {/* Barra superior */}
      <div className="px-4 pb-2 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmarSalida(true)}
            aria-label="Salir de la lección"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <div
            className="h-3.5 flex-1 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={Math.round(progreso * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <motion.div
              className="lrn-progreso h-full rounded-full"
              animate={{ width: `${Math.max(4, progreso * 100)}%` }}
              transition={{ type: "spring", stiffness: 160, damping: 24 }}
            />
          </div>
          {usaCorazones ? (
            <span className="flex items-center gap-1 text-sm font-extrabold text-rose-200">
              <motion.span
                key={corazones}
                initial={{ scale: 1.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <Heart size={20} fill="currentColor" />
              </motion.span>
              {corazones}
            </span>
          ) : (
            <span className="text-xs font-bold text-white/60">{esTest ? "Test" : "Repaso"}</span>
          )}
        </div>
      </div>

      {/* Pregunta (una a la vez) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="mx-auto max-w-md">
          <div className="mb-4 mt-2 flex items-center gap-2.5">
            <img
              src="/mascota/frente.webp"
              alt=""
              className="lrn-flotar h-12 w-12 object-contain"
            />
            <p className="lrn-globo rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white/90">
              {instruccion}
            </p>
          </div>
          <>
            <motion.div
              key={paso.key}
              data-paso={paso.tipo === "vocab" ? "vocab" : paso.ej.type}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              {paso.tipo === "vocab" ? (
                <TarjetaVocab v={paso.vocab} voz={contenido.voz} />
              ) : (
                <VistaEjercicio
                  ej={paso.ej}
                  respuesta={respuesta}
                  revisada={!!revision}
                  voz={contenido.voz}
                  onRespuesta={setRespuesta}
                  onErrorPareja={() => setErrorPareja(true)}
                />
              )}
            </motion.div>
          </>
        </div>
      </div>

      {/* Botón / panel de respuesta */}
      <div className="relative px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div className="mx-auto max-w-md">
          <>
            {revision && paso.tipo === "ejercicio" && (
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 30, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`mb-3 rounded-3xl p-4 ${revision.correcta ? "bg-emerald-500/20 ring-1 ring-emerald-300/40" : "bg-rose-500/20 ring-1 ring-rose-300/40"}`}
                aria-live="polite"
              >
                <p
                  className={`flex items-center gap-2 text-lg font-extrabold ${revision.correcta ? "text-emerald-200" : "text-rose-200"}`}
                >
                  {revision.correcta ? (
                    <Check size={22} strokeWidth={3} />
                  ) : (
                    <X size={22} strokeWidth={3} />
                  )}
                  {revision.correcta ? ["¡Excelente!", "¡Muy bien!", "¡Perfecto!"][i % 3] : "Casi…"}
                </p>
                {!revision.correcta && paso.ej.type !== "word_match" && (
                  <p className="mt-1 text-sm text-white/90">
                    Respuesta correcta: <strong>{respuestaCorrecta(paso.ej)}</strong>
                  </p>
                )}
                {"explanation" in paso.ej && paso.ej.explanation && (
                  <p className="mt-1 text-[13px] text-white/75">{paso.ej.explanation}</p>
                )}
                {!revision.correcta && !esTest && !paso.repaso && paso.ej.type !== "word_match" && (
                  <p className="mt-1 text-[12px] text-white/60">La repasaremos al final 😉</p>
                )}
              </motion.div>
            )}
          </>
          <button
            type="button"
            disabled={!listo}
            onClick={paso.tipo === "vocab" || revision ? continuar : comprobar}
            className={`w-full rounded-2xl py-4 text-[15px] font-extrabold transition disabled:opacity-40 ${
              revision
                ? revision.correcta
                  ? "lrn-boton-ok"
                  : "lrn-boton-mal"
                : "lrn-boton-principal"
            }`}
          >
            {paso.tipo === "vocab" ? "Entendido" : revision ? "Continuar" : "Comprobar"}
          </button>
        </div>
      </div>

      {/* Confirmar salida */}
      <>
        {confirmarSalida && (
          <motion.div
            className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmarSalida(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="lrn-tarjeta w-full max-w-md rounded-3xl p-5 text-center"
            >
              <img src="/mascota/triste.webp" alt="" className="mx-auto h-20 w-20 object-contain" />
              <p className="mt-2 text-lg font-extrabold">¿Te vas ya?</p>
              <p className="mt-1 text-sm text-white/70">
                Si sales ahora, esta lección no cuenta para tu racha.
              </p>
              <button
                type="button"
                onClick={() => setConfirmarSalida(false)}
                className="lrn-boton-principal mt-4 w-full rounded-2xl py-3.5 font-extrabold"
              >
                Seguir aprendiendo
              </button>
              <button
                type="button"
                onClick={onSalir}
                className="mt-2 w-full rounded-2xl py-3 text-sm font-bold text-white/70 hover:text-white"
              >
                Salir
              </button>
            </motion.div>
          </motion.div>
        )}
      </>
    </motion.div>
  );
}

/* ================= Resultado ================= */

function Resultado({
  dia,
  premio,
  aciertos,
  total,
  contenido,
  track,
  onSeguir,
  onSiguiente,
}: {
  dia: Dia;
  premio: Premio;
  aciertos: number;
  total: number;
  contenido: ContenidoTrack | null;
  track: Track;
  onSeguir: () => void;
  onSiguiente: (d: Dia) => void;
}) {
  const estado = useLearn();
  const subio = premio.rachaDespues > premio.rachaAntes;
  const pct = total > 0 ? Math.round((aciertos / total) * 100) : 100;
  const siguiente = contenido?.days.find((d) => d.day_id === estado.tracks[track].dia);
  const confeti = useMemo(
    () =>
      Array.from({ length: premio.aprobado ? 26 : 0 }, (_, k) => ({
        k,
        x: (Math.random() - 0.5) * 340,
        y: -160 - Math.random() * 220,
        r: (Math.random() - 0.5) * 540,
        hue: Math.round(Math.random() * 360),
        d: Math.random() * 0.25,
      })),
    [premio.aprobado],
  );

  useEffect(() => {
    sonar(premio.aprobado ? "logro" : "triste");
  }, [premio.aprobado]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+20px)] text-center"
    >
      <div className="pointer-events-none absolute left-1/2 top-[38%]" aria-hidden="true">
        {confeti.map((c) => (
          <motion.span
            key={c.k}
            className="absolute block h-3 w-1.5 rounded-sm"
            style={{ background: `hsl(${c.hue} 85% 62%)` }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: c.x, y: [0, c.y, c.y + 420], opacity: [1, 1, 0], rotate: c.r }}
            transition={{ duration: 2.2, delay: c.d, ease: "easeOut", times: [0, 0.35, 1] }}
          />
        ))}
      </div>

      <motion.img
        src={premio.aprobado ? "/mascota/comiendo.webp" : "/mascota/triste.webp"}
        alt=""
        className="h-36 w-36 object-contain"
        initial={{ y: 30, scale: 0.8 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      />
      <p className="mt-2 text-2xl font-extrabold">
        {premio.aprobado
          ? dia.day_type === "test"
            ? "¡Test aprobado!"
            : "¡Tarea cumplida!"
          : "Casi lo logras"}
      </p>
      <p className="mt-1 text-sm text-white/70">
        {premio.aprobado
          ? `Día ${dia.day_id} · ${dia.title}`
          : `Necesitas ${dia.day_type === "test" ? dia.pass_score_pct : 70}% y lograste ${pct}%. Repasa y vuelve a intentarlo.`}
      </p>

      {subio && (
        <motion.div
          className="mt-5 flex items-center gap-3 rounded-3xl bg-orange-400/15 px-5 py-3 ring-1 ring-orange-300/40"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 14 }}
        >
          <span className="lrn-llama encendida grande">
            <Flame size={40} strokeWidth={2.2} />
          </span>
          <div className="text-left">
            <p className="text-3xl font-black leading-none text-orange-100">
              <ContadorAnimado de={premio.rachaAntes} a={premio.rachaDespues} />
            </p>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200/90">
              {premio.rachaDespues === 1 ? "día de racha" : "días de racha"}
            </p>
          </div>
        </motion.div>
      )}

      <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2">
        <Stat
          etiqueta="XP"
          valor={`+${premio.xp}`}
          Icono={Zap}
          color="text-amber-200"
          retraso={0.5}
        />
        <Stat
          etiqueta="Aciertos"
          valor={`${pct}%`}
          Icono={Check}
          color="text-emerald-200"
          retraso={0.6}
        />
        <Stat
          etiqueta="Gemas"
          valor={`+${premio.gemas}`}
          Icono={Gem}
          color="text-sky-200"
          retraso={0.7}
        />
      </div>

      {(premio.corazonExtra || premio.insignias.length > 0 || premio.metaAlcanzada) && (
        <motion.div
          className="mt-4 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          {premio.corazonExtra && (
            <span className="flex items-center gap-1 rounded-full bg-rose-400/15 px-3 py-1.5 text-xs font-bold text-rose-100">
              <Heart size={12} fill="currentColor" /> +1 corazón
            </span>
          )}
          {premio.metaAlcanzada && (
            <span className="flex items-center gap-1 rounded-full bg-orange-400/20 px-3 py-1.5 text-xs font-bold text-orange-100">
              <Flame size={12} /> ¡Meta de {premio.metaAlcanzada} días!
            </span>
          )}
          {premio.insignias.map((n) => (
            <span
              key={n}
              className="flex items-center gap-1 rounded-full bg-amber-300/20 px-3 py-1.5 text-xs font-bold text-amber-100"
            >
              <Trophy size={12} /> {n}
            </span>
          ))}
        </motion.div>
      )}

      <div className="mt-7 flex w-full max-w-sm flex-col gap-2">
        {premio.aprobado && siguiente && siguiente.day_id !== dia.day_id ? (
          <>
            <button
              type="button"
              onClick={onSeguir}
              className="lrn-boton-principal w-full rounded-2xl py-4 font-extrabold"
            >
              Listo por hoy
            </button>
            <button
              type="button"
              onClick={() => onSiguiente(siguiente)}
              className="w-full rounded-2xl py-3 text-sm font-bold text-white/75 hover:text-white"
            >
              Una más: Día {siguiente.day_id} · {siguiente.title}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSeguir}
            className="lrn-boton-principal w-full rounded-2xl py-4 font-extrabold"
          >
            Continuar
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ContadorAnimado({ de, a }: { de: number; a: number }) {
  const [v, setV] = useState(de);
  useEffect(() => {
    if (a === de) return;
    const t = window.setTimeout(() => setV(a), 650);
    return () => window.clearTimeout(t);
  }, [de, a]);
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={v}
        className="inline-block"
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -26, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
      >
        {v}
      </motion.span>
    </AnimatePresence>
  );
}

function Stat({
  etiqueta,
  valor,
  Icono,
  color,
  retraso,
}: {
  etiqueta: string;
  valor: string;
  Icono: typeof Zap;
  color: string;
  retraso: number;
}) {
  return (
    <motion.div
      className="lrn-tarjeta flex flex-col items-center rounded-2xl py-3"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: retraso, type: "spring", stiffness: 300, damping: 22 }}
    >
      <Icono size={18} className={color} />
      <span className="mt-0.5 text-lg font-extrabold">{valor}</span>
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/55">{etiqueta}</span>
    </motion.div>
  );
}

/* ================= Sin corazones ================= */

function SinCorazones({
  track,
  contenido,
  onRepasar,
  onVolver,
}: {
  track: Track;
  contenido: ContenidoTrack | null;
  onRepasar: (d: Dia) => void;
  onVolver: () => void;
}) {
  const estado = useLearn();
  const t = estado.tracks[track];
  const ahora = useReloj(true);
  const { corazones, proximoEnMs } = corazonesActuales(t, ahora);
  const repasable =
    contenido?.days.filter((d) => d.day_type === "lesson" && t.completados.includes(d.day_id)) ??
    [];
  const sugerida = repasable[repasable.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center"
    >
      <img src="/mascota/durmiendo.webp" alt="" className="h-36 w-36 object-contain" />
      <p className="mt-2 text-2xl font-extrabold">{nombreDescanso(corazones)}</p>
      <p className="mt-1 max-w-xs text-sm text-white/70">
        Te quedaste sin corazones. Se recarga uno cada 30 minutos
        {proximoEnMs ? ` (el próximo en ${mmss(proximoEnMs)})` : ""}. Repasar una lección ya hecha
        también te da uno.
      </p>
      <div className="mt-4 flex gap-1.5" aria-label={`${corazones} de ${CORAZONES_MAX} corazones`}>
        {Array.from({ length: CORAZONES_MAX }, (_, k) => (
          <Heart
            key={k}
            size={24}
            className={k < corazones ? "text-rose-300" : "text-white/20"}
            fill="currentColor"
          />
        ))}
      </div>
      <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
        {sugerida && (
          <button
            type="button"
            onClick={() => onRepasar(sugerida)}
            className="lrn-boton-principal w-full rounded-2xl py-4 font-extrabold"
          >
            Repasar Día {sugerida.day_id} (+1 corazón)
          </button>
        )}
        <button
          type="button"
          onClick={onVolver}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white/75 hover:text-white"
        >
          Volver
        </button>
      </div>
    </motion.div>
  );
}

const nombreDescanso = (c: number) =>
  c > 0 ? "¡Ya tienes corazones!" : "Snoopy necesita un descanso";

/* ================= Estilos ================= */

const CSS = `
.lrn-raiz { background: var(--fondo-c); font-family: Karla, system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
.lrn-fondo {
  background:
    radial-gradient(120% 70% at 85% -10%, color-mix(in srgb, var(--acento) 30%, transparent), transparent 60%),
    radial-gradient(90% 60% at -10% 20%, var(--fondo-b), transparent 70%),
    linear-gradient(180deg, var(--fondo-a), var(--fondo-c));
  transition: background 0.5s ease;
}
.lrn-tarjeta {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 10px 30px -14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
.lrn-destacada { border-color: color-mix(in srgb, var(--acento) 45%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--acento) 25%, transparent), 0 18px 40px -18px var(--acento-suave); }
.lrn-boton-principal {
  color: #04121a;
  background: linear-gradient(180deg, color-mix(in srgb, var(--acento) 85%, white), var(--acento-fuerte));
  box-shadow: 0 4px 0 color-mix(in srgb, var(--acento-fuerte) 55%, black), 0 12px 24px -10px var(--acento-suave);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
}
.lrn-boton-principal:not(:disabled):active { transform: translateY(3px); box-shadow: 0 1px 0 color-mix(in srgb, var(--acento-fuerte) 55%, black); }
.lrn-boton-ok { color: #032016; background: linear-gradient(180deg, #6ee7b7, #10b981); box-shadow: 0 4px 0 #047857; }
.lrn-boton-mal { color: #2a0610; background: linear-gradient(180deg, #fda4af, #f43f5e); box-shadow: 0 4px 0 #be123c; }
.lrn-boton-ok:active, .lrn-boton-mal:active { transform: translateY(3px); box-shadow: none; }
.lrn-progreso { background: linear-gradient(90deg, var(--acento-fuerte), color-mix(in srgb, var(--acento) 70%, white)); box-shadow: 0 0 12px var(--acento-suave); }
.lrn-globo { position: relative; }
.lrn-flotar { animation: lrn-flotar 3.2s cubic-bezier(.45,.05,.55,.95) infinite; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.35)); }
@keyframes lrn-flotar { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-5px) rotate(2deg); } }

.lrn-llama { display: grid; place-items: center; width: 62px; height: 62px; flex-shrink: 0; border-radius: 22px; transition: all 0.4s ease; }
.lrn-llama.grande { width: 70px; height: 70px; }
.lrn-llama.encendida { color: #fff7ed; background: radial-gradient(circle at 50% 70%, #fdba74, #f97316 55%, #c2410c); box-shadow: 0 0 0 4px rgba(251,146,60,0.18), 0 10px 30px -6px rgba(249,115,22,0.75); }
.lrn-llama.encendida svg { animation: lrn-fuego 1.4s cubic-bezier(.45,.05,.55,.95) infinite; transform-origin: 50% 90%; filter: drop-shadow(0 0 6px rgba(255,237,213,0.9)); }
.lrn-llama.tibia { color: #fed7aa; background: rgba(251,146,60,0.18); box-shadow: inset 0 0 0 1px rgba(251,146,60,0.45); }
.lrn-llama.tibia svg { animation: lrn-fuego 2.4s ease-in-out infinite; transform-origin: 50% 90%; opacity: 0.85; }
.lrn-llama.apagada { color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.06); }
@keyframes lrn-fuego { 0%, 100% { transform: scale(1, 1) rotate(-2deg); } 50% { transform: scale(1.06, 1.12) rotate(2deg); } }

.lrn-nodo {
  position: relative; display: grid; place-items: center; width: 64px; height: 58px; border-radius: 999px;
  transition: transform 0.2s cubic-bezier(.2,.9,.3,1.3);
}
.lrn-nodo.hecho { color: #04121a; background: linear-gradient(180deg, #fde68a, #f59e0b); box-shadow: 0 5px 0 #b45309; }
.lrn-nodo.actual { color: #04121a; background: linear-gradient(180deg, color-mix(in srgb, var(--acento) 85%, white), var(--acento-fuerte)); box-shadow: 0 5px 0 color-mix(in srgb, var(--acento-fuerte) 55%, black), 0 0 24px var(--acento-suave); }
.lrn-nodo.bloqueado { color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.08); box-shadow: 0 5px 0 rgba(0,0,0,0.3); }
.lrn-nodo.test.hecho, .lrn-nodo.test.actual { width: 72px; height: 64px; }
button:not(:disabled):active .lrn-nodo { transform: translateY(4px); box-shadow: none; }
.lrn-onda { position: absolute; inset: -6px; border-radius: 999px; border: 2px solid var(--acento); animation: lrn-onda 1.8s ease-out infinite; }
@keyframes lrn-onda { 0% { opacity: 0.9; transform: scale(0.95); } 100% { opacity: 0; transform: scale(1.35); } }

.lrn-cargando { background: linear-gradient(100deg, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.05) 60%); background-size: 200% 100%; animation: lrn-brillo 1.2s linear infinite; }
@keyframes lrn-brillo { to { background-position: -200% 0; } }
.lrn-sacudir { animation: lrn-sacudir 0.4s cubic-bezier(.36,.07,.19,.97); }
@keyframes lrn-sacudir { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-6px); } 40%, 60% { transform: translateX(6px); } }

@media (prefers-reduced-motion: reduce) {
  .lrn-flotar, .lrn-llama svg, .lrn-onda, .lrn-cargando { animation: none !important; }
}
`;
