import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bath,
  Bell,
  BellOff,
  Bone,
  Check,
  Droplets,
  Drumstick,
  Flame,
  GraduationCap,
  HeartPulse,
  House,
  Lamp,
  Mail,
  Mic,
  MicOff,
  Moon,
  Pencil,
  Send,
  Smile,
  Sun,
  Trees,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { VozMascota, type EstadoVoz } from "@/lib/voz-mascota";
import { reproducir, type Sonido } from "@/lib/sonidos-mascota";
import {
  LOGROS,
  PROGRESO_INICIAL,
  rachaActual,
  registrarCuidado,
  type Contadores,
  type Progreso,
} from "@/lib/logros-mascota";
import { enablePush } from "@/lib/push-client";
import {
  abrirNota,
  cerrarNota,
  mandarNota,
  alLeerseUnaNota,
  ocultarEnviadas,
  useNotasEnviadas,
  useNotasRecibidas,
} from "@/lib/notas-client";
import { NOTA_MAX, guardarEstadoMascota, type NotaEnviada, type NotaSnoopy } from "@/lib/cloud";
import { getDeviceId } from "@/lib/dispositivo";
import { SNOOPY_CSS, SnoopyVivo, imgPose, type Pose } from "@/components/SnoopyVivo";
import { WeatherPanel } from "@/components/WeatherPanel";
import { leerLearn, resumenLearn, useLearn } from "@/lib/learn/progreso";
import type { Premio } from "@/lib/learn/tipos";

// Snoopy Learn se descarga solo cuando se abre (no pesa en la página).
const cargarLearn = () => import("@/components/learn/SnoopyLearn");
const learnInicial = () => leerLearn();
const SnoopyLearn = lazy(cargarLearn);
import {
  EFECTOS_CSS,
  EfectosDefs,
  ParticulaVisual,
  SELLOS,
  SELLO_INICIAL,
  sello,
  sinEmojis,
  type Efecto,
  type Particula,
} from "@/components/Efectos";

// Mascota virtual tipo Tamagotchi. Snoopy vive "dentro" del fondo: se ubica en
// coordenadas de la imagen (sobre la cama o el pasto), así siempre toca el piso
// sin importar el tamaño de pantalla. Los controles van en su propia franja.

type StatKey = "hambre" | "felicidad" | "higiene" | "energia";
type Stats = Record<StatKey, number>;
type Escena = "dormitorio" | "patio";
type TipoAccion = "alimentar" | "banar" | "dormir" | "pasear";
type Anim = "respirar" | "bounce" | "wiggle" | "breathe" | "shake" | "walk" | "tilt" | "entregar";
type Orientacion = "v" | "h";

interface Accion {
  /** Cada toque crea una acción nueva; los temporizadores viejos no la cortan. */
  id: number;
  tipo: Exclude<TipoAccion, "dormir"> | "nota";
  pose: Pose;
  anim: Anim;
  dur: number;
  /** Desplazamiento de toda la mascota (al salir o volver del paseo). */
  mover?: "irse" | "llegar";
}

interface Guardado {
  version?: number;
  stats?: Partial<Stats>;
  statUpdatedAt?: Partial<Record<StatKey, number>>;
  escena?: Escena;
  ts?: number;
  nombre?: string;
  progreso?: Partial<Progreso>;
  sonido?: boolean;
  avisos?: boolean;
  dormido?: boolean;
}

interface CartaPendiente {
  id?: string;
  title: string;
  text: string;
  format?: string;
}

/** Punto de apoyo en la imagen: x, y (fracciones) y lado del cuadro de Snoopy. */
interface Ancla {
  x: number;
  y: number;
  s: number;
}

const KEY = "liz-mascota-juego";
const GUARDADO_VERSION = 2;
// Cada cuánto baja cada barra y cuánto. La energía dura 3 horas: 1 punto
// cada 108 s (100 puntos × 108 s = 10 800 s = 3 h), poco a poco.
const STAT_TICK_MS: Record<StatKey, number> = {
  hambre: 30_000,
  felicidad: 30_000,
  higiene: 30_000,
  energia: 108_000,
};
const DECAY_PER_TICK: Record<StatKey, number> = {
  hambre: 1,
  felicidad: 2,
  higiene: 1,
  energia: 1,
};
const RECOVERY_STEP_MS = 30_000;
const CARICIA_FELICIDAD = 5;
const UMBRAL_TRISTE = 50;
const UMBRAL_AVISO = 50;
const INICIAL: Stats = { hambre: 80, felicidad: 85, higiene: 75, energia: 80 };
const COMIDAS = [
  { hora: 8, nombre: "desayuno" },
  { hora: 13, nombre: "almuerzo" },
  { hora: 19, nombre: "merienda" },
] as const;
const POSES: Pose[] = [
  "frente",
  "comiendo",
  "banando",
  "durmiendo",
  "triste",
  "espalda",
  "mira-derecha",
  "mira-izquierda",
];

const FONDOS: Record<Orientacion, { ar: number } & Record<Escena, string>> = {
  v: {
    ar: 941 / 1672,
    dormitorio: "/mascota/dormitorio-vertical.webp",
    patio: "/mascota/patio-vertical.webp",
  },
  h: {
    ar: 1.785,
    dormitorio: "/mascota/dormitorio-horizontal.webp",
    patio: "/mascota/patio-horizontal.webp",
  },
};

// Medido sobre cada fondo: dónde está la cama y el pasto.
const ANCLAS: Record<Orientacion, Record<Escena, Ancla> & { cama: Ancla }> = {
  v: {
    dormitorio: { x: 0.5, y: 0.935, s: 0.46 },
    patio: { x: 0.44, y: 0.9, s: 0.46 },
    cama: { x: 0.5, y: 0.95, s: 0.54 },
  },
  h: {
    dormitorio: { x: 0.5, y: 0.93, s: 0.2 },
    patio: { x: 0.42, y: 0.9, s: 0.19 },
    cama: { x: 0.5, y: 0.95, s: 0.24 },
  },
};

const ESCENAS: Record<
  Escena,
  { nombre: string; Icono: LucideIcon; ambiente: string; IconoAmb: LucideIcon }
> = {
  dormitorio: { nombre: "Dormitorio", Icono: House, ambiente: "Noche tranquila", IconoAmb: Moon },
  patio: { nombre: "Patio", Icono: Trees, ambiente: "Día soleado", IconoAmb: Sun },
};

/** Solo la primera vez: de día arranca en el patio y de noche en el dormitorio. */
const escenaPorHora = (): Escena => {
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "patio" : "dormitorio";
};

const STATS: Array<{ key: StatKey; Icono: LucideIcon; label: string; color: string }> = [
  { key: "hambre", Icono: Drumstick, label: "Hambre", color: "#f87171" },
  { key: "felicidad", Icono: Smile, label: "Felicidad", color: "#facc15" },
  { key: "higiene", Icono: Droplets, label: "Higiene", color: "#4ade80" },
  { key: "energia", Icono: Zap, label: "Energía", color: "#60a5fa" },
];

const ACCIONES: Record<
  "alimentar" | "banar",
  {
    pose: Pose;
    anim: Anim;
    dur: number;
    delta: Partial<Stats>;
    particulas: Efecto[];
    frases: string[];
    sonido: Sonido;
  }
> = {
  alimentar: {
    pose: "comiendo",
    anim: "bounce",
    dur: 2600,
    delta: { hambre: 5 },
    particulas: ["hueso", "hueso", "destello", "corazon"],
    frases: ["¡Qué rico! 😋", "¡Ñam, ñam! 🍖", "¡Mi favorito! 🦴"],
    sonido: "comer",
  },
  banar: {
    pose: "banando",
    anim: "wiggle",
    dur: 2800,
    delta: { higiene: 5 },
    particulas: ["burbuja", "burbuja", "gota", "gota", "destello"],
    frases: ["¡Splash! 💦", "¡Burbujas! 🫧", "¡Quedé brillante! ✨"],
    sonido: "banar",
  },
};

const ANIM_CLASE: Record<Anim, string> = {
  respirar: "mg-respirar",
  bounce: "mg-bounce",
  wiggle: "mg-wiggle",
  breathe: "mg-breathe",
  shake: "mg-shake",
  walk: "mg-walk",
  tilt: "mg-tilt",
  entregar: "mg-entregar",
};

type AvisoTono = "envio" | "ok" | "leida" | "llega" | "error";

/** Estado de una nota enviada, en palabras y con su color. */
function estadoEnviada(n: NotaEnviada): { texto: string; clase: string } {
  if (n.pendiente === "error")
    return { texto: "Sin conexión, reintentando…", clase: "text-amber-200" };
  if (n.pendiente) return { texto: "Enviando…", clase: "text-white/60" };
  if (n.leidaAt) return { texto: "Leída", clase: "text-pink-200" };
  if (n.entregadaAt) return { texto: "En su celular · sin abrir", clase: "text-sky-200" };
  return { texto: "Enviada ✓", clase: "text-white/75" };
}

const horaCorta = (ts: number) =>
  new Date(ts).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function SelloIcono({
  id,
  size = 14,
  className,
}: {
  id?: string;
  size?: number;
  className?: string;
}) {
  const S = sello(id).Icono;
  return <S size={size} strokeWidth={2.2} className={className} aria-hidden="true" />;
}

const FRASES_CARICIA = ["¡Jiji! 💛", "¡Me haces cosquillas!", "¡Te quiero! ❤️", "¡Otra vez! 🐾"];
const FRASES_TRISTE: Record<StatKey, string> = {
  hambre: "Tengo hambre… 🍖",
  felicidad: "Me siento solito… 🥺",
  higiene: "Necesito un baño… 🛁",
  energia: "Tengo mucho sueño… 😴",
};

// Polvo de luz del ambiente: posiciones fijas (no Math.random) para que el
// HTML del servidor coincida con el del navegador.
const MOTAS = [
  [8, 72, 0, 11],
  [18, 40, 3.5, 13],
  [27, 85, 6, 10],
  [39, 58, 1.8, 14],
  [52, 78, 8, 12],
  [61, 30, 4.4, 15],
  [70, 66, 2.2, 11],
  [79, 48, 7.1, 13],
  [88, 82, 5.2, 12],
  [94, 36, 0.9, 14],
] as const;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const colorNivel = (v: number) => (v > 60 ? "#4ade80" : v > 30 ? "#facc15" : "#f87171");
const elegir = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
function aplicar(s: Stats, delta: Partial<Stats>): Stats {
  return {
    hambre: clamp(s.hambre + (delta.hambre ?? 0)),
    felicidad: clamp(s.felicidad + (delta.felicidad ?? 0)),
    higiene: clamp(s.higiene + (delta.higiene ?? 0)),
    energia: clamp(s.energia + (delta.energia ?? 0)),
  };
}

/** Pausa/reanuda la música de fondo del sitio (vive en __root.tsx). */
const musica = (accion: "pausar" | "reanudar") =>
  window.dispatchEvent(new CustomEvent("liz:musica", { detail: accion }));

/** Lienzo con la proporción del fondo, que lo cubre todo (como object-cover). */
const lienzoEstilo = (ar: number): CSSProperties => ({
  aspectRatio: String(ar),
  width: `max(100cqw, calc(100cqh * ${ar}))`,
});

const anclaEstilo = (a: Ancla): CSSProperties => ({
  left: `${a.x * 100}%`,
  top: `${a.y * 100}%`,
  width: `min(${a.s * 100}%, 46cqh)`,
});

export function MascotaGame({ notaInicial }: { notaInicial?: string } = {}) {
  const navigate = useNavigate();
  const notas = useNotasRecibidas();
  const enviadas = useNotasEnviadas();
  const [notaAbierta, setNotaAbierta] = useState<NotaSnoopy | null>(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const [textoNota, setTextoNota] = useState("");
  const [emojiNota, setEmojiNota] = useState<string>(SELLO_INICIAL);
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [notaLlena, setNotaLlena] = useState(false);
  // Panel tipo campanita de las notitas y el aviso flotante junto al botón.
  const [panelNotas, setPanelNotas] = useState(false);
  const [aprendiendo, setAprendiendo] = useState(false);
  const learn = useLearn();
  const tarea = resumenLearn(learn);
  const [avisoNota, setAvisoNota] = useState<{ id: number; texto: string; tono: AvisoTono } | null>(
    null,
  );
  const [sobreVolando, setSobreVolando] = useState(0);
  const [stats, setStats] = useState<Stats>(INICIAL);
  const [escena, setEscena] = useState<Escena>("dormitorio");
  const [orient, setOrient] = useState<Orientacion>("v");
  const [nombre, setNombre] = useState("Snoopy");
  const [progreso, setProgreso] = useState<Progreso>(PROGRESO_INICIAL);
  const [sonido, setSonido] = useState(true);
  const [avisos, setAvisos] = useState(false);
  const [listo, setListo] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [dormido, setDormido] = useState(false);
  const [tristeEnCama, setTristeEnCama] = useState(false);
  const [tristeAtendida, setTristeAtendida] = useState(false);
  const [particulas, setParticulas] = useState<Particula[]>([]);
  const [toast, setToast] = useState<{ id: number; texto: string } | null>(null);
  const [toques, setToques] = useState(0);
  const [ladrando, setLadrando] = useState(false);
  const [oido, setOido] = useState<EstadoVoz>("inactivo");
  const [textoOido, setTextoOido] = useState<string | null>(null);
  const [micDisponible, setMicDisponible] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [panelLogros, setPanelLogros] = useState(false);
  const [cola, setCola] = useState<string[]>([]);
  const [cartaPendiente, setCartaPendiente] = useState<CartaPendiente | null>(null);

  const raizRef = useRef<HTMLElement>(null);
  const idRef = useRef(0);
  const accionRef = useRef(0);
  const timers = useRef(new Set<number>());
  const vozRef = useRef<VozMascota | null>(null);
  const bocaRef = useRef<HTMLDivElement>(null);
  const ultimaCaricia = useRef(0);
  const durmiendoRef = useRef(false);
  const statUpdatedAtRef = useRef<Record<StatKey, number>>({
    hambre: Date.now(),
    felicidad: Date.now(),
    higiene: Date.now(),
    energia: Date.now(),
  });
  const descansoAutomaticoRef = useRef(false);
  const ultimaAlertaRef = useRef<Partial<Record<StatKey, number>>>({});
  const comidasAvisadasRef = useRef(new Set<string>());
  durmiendoRef.current = dormido;
  // Los navegadores solo dejan sonar audio después de un toque.
  const interactuo = useRef(false);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;
  const avisosRef = useRef(avisos);
  avisosRef.current = avisos;
  const nombreRef = useRef(nombre);
  nombreRef.current = nombre;

  /** setTimeout que se limpia solo al salir de la página. */
  const programar = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const decir = useCallback(
    (texto: string, ms = 2400) => {
      const id = ++idRef.current;
      setToast({ id, texto: sinEmojis(texto) });
      programar(() => setToast((t) => (t?.id === id ? null : t)), ms);
    },
    [programar],
  );

  /** Aviso flotante junto al botón de notas (como una notificación). */
  const avisarNota = useCallback(
    (texto: string, tono: AvisoTono, ms = 3800) => {
      const id = ++idRef.current;
      setAvisoNota({ id, texto, tono });
      programar(() => setAvisoNota((a) => (a?.id === id ? null : a)), ms);
    },
    [programar],
  );

  const sonar = useCallback((s: Sonido) => {
    if (sonidoRef.current && interactuo.current) reproducir(s);
  }, []);

  const lanzar = useCallback(
    (tipos: readonly Efecto[], n = 10) => {
      const nuevas: Particula[] = Array.from({ length: n }, () => {
        const tipo = elegir(tipos);
        const base = tipo === "destello" ? 16 : tipo === "confeti" ? 10 : tipo === "gota" ? 14 : 24;
        return {
          id: ++idRef.current,
          tipo,
          x: 14 + Math.random() * 72,
          delay: Math.random() * 0.55,
          size: base + Math.random() * (base * 0.6),
          dx: (Math.random() - 0.5) * 80,
          rot: (Math.random() - 0.5) * 70,
          hue: Math.round(Math.random() * 360),
        };
      });
      setParticulas((p) => [...p, ...nuevas]);
      const ids = new Set(nuevas.map((p) => p.id));
      programar(() => setParticulas((p) => p.filter((q) => !ids.has(q.id))), 3200);
    },
    [programar],
  );

  const registrar = useCallback((k: keyof Contadores) => {
    setProgreso((p) => registrarCuidado(p, k));
  }, []);

  const recuperarGradual = useCallback((delta: Partial<Stats>) => {
    const ahora = Date.now();
    for (const key of Object.keys(delta) as StatKey[]) {
      statUpdatedAtRef.current[key] = ahora;
      setStats((s) => ({ ...s, [key]: clamp(s[key] + 5) }));
    }
  }, []);

  /** Notificación del sistema, solo si la app quedó en segundo plano. */
  const avisar = useCallback((cuerpo: string) => {
    if (!avisosRef.current || !document.hidden) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const titulo = `${nombreRef.current} te necesita 🐶`;
    const opts: NotificationOptions = {
      body: cuerpo,
      tag: "mascota",
      silent: false,
      icon: "/icons/liz-192.png",
      badge: "/icons/liz-192.png",
      data: { url: "/mascota" },
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((r) => r.showNotification(titulo, opts))
        .catch((error) => console.warn("No se pudo mostrar el aviso de la mascota:", error));
    } else {
      try {
        new Notification(titulo, opts);
      } catch (error) {
        console.warn("El navegador no permitió mostrar el aviso:", error);
      }
    }
  }, []);

  /* ---------------- Carga, guardado y desgaste ---------------- */

  useEffect(() => {
    let volvio = false;
    let durmiendo = false;
    try {
      const raw = localStorage.getItem(KEY);
      const g: Guardado = raw ? (JSON.parse(raw) as Guardado) : {};
      volvio = !!raw;
      const ahora = Date.now();
      const actualizaciones = {} as Record<StatKey, number>;
      const guardadoDormido = g.dormido === true;
      const statsGuardadas = { ...INICIAL, ...g.stats };
      const statsActualizadas = { ...statsGuardadas };
      for (const key of Object.keys(DECAY_PER_TICK) as StatKey[]) {
        const ultimo = g.statUpdatedAt?.[key] ?? g.ts ?? ahora;
        // Dormido, la energía se recupera (+1 cada 30 s); si no, se descarga.
        const paso = guardadoDormido && key === "energia" ? RECOVERY_STEP_MS : STAT_TICK_MS[key];
        const ticks = Math.floor(Math.max(0, ahora - ultimo) / paso);
        actualizaciones[key] = guardadoDormido && key === "energia" ? ahora : ultimo + ticks * paso;
        const cambio = guardadoDormido && key === "energia" ? ticks : -ticks * DECAY_PER_TICK[key];
        statsActualizadas[key] = clamp(statsActualizadas[key] + cambio);
      }
      statUpdatedAtRef.current = actualizaciones;
      setStats(statsActualizadas);
      durmiendo = guardadoDormido;
      setDormido(durmiendo);
      setEscena(
        durmiendo
          ? "dormitorio"
          : g.escena === "patio" || g.escena === "dormitorio"
            ? g.escena
            : escenaPorHora(),
      );
      if (g.progreso) {
        setProgreso({
          ...PROGRESO_INICIAL,
          ...g.progreso,
          contadores: { ...PROGRESO_INICIAL.contadores, ...g.progreso.contadores },
        });
      }
      if (typeof g.sonido === "boolean") setSonido(g.sonido);
      if (typeof g.avisos === "boolean") setAvisos(g.avisos);
      // Si este celular ya permite avisos, Snoopy avisa sin tener que activarlo.
      else if (typeof Notification !== "undefined" && Notification.permission === "granted")
        setAvisos(true);
      let n = g.nombre;
      if (!n) {
        const vieja = localStorage.getItem("liz-mascota");
        const v = vieja ? (JSON.parse(vieja) as { nombre?: unknown }).nombre : null;
        if (typeof v === "string") n = v;
      }
      if (n?.trim()) setNombre(n.trim());
    } catch {
      setEscena(escenaPorHora());
    }
    setMicDisponible(VozMascota.disponible());
    setListo(true);
    if (durmiendo) decir("Zzz… sigo dormidito 💤", 2600);
    else if (volvio) decir("¡Hola de nuevo! 💛", 2600);
    else decir("¡Hola! Cuídame mucho 🐶", 2800);
    // Después del saludo, Snoopy recuerda la tarea de hoy (si falta).
    const r = resumenLearn(learnInicial());
    if (!durmiendo && !r.hechaHoy) {
      programar(
        () =>
          decir(
            r.racha > 0
              ? `¡No pierdas tu racha de ${r.racha} ${r.racha === 1 ? "día" : "días"}! Tengo tu tarea`
              : "Tengo una tarea para ti: ¡aprendamos juntos!",
            4200,
          ),
        3000,
      );
    }
    // Precarga de poses: sin parpadeo blanco al cambiar de estado.
    for (const p of POSES) {
      const i = new Image();
      i.decoding = "async";
      i.src = imgPose(p);
    }
    const rawCarta = localStorage.getItem("liz-carta-pendiente");
    if (rawCarta) {
      try {
        const carta = JSON.parse(rawCarta) as CartaPendiente;
        if (carta.title || carta.text) {
          setCartaPendiente(carta);
          localStorage.removeItem("liz-carta-pendiente");
          decir("Tengo una carta para ti 💌", 4500);
        }
      } catch (error) {
        console.warn("No se pudo leer la carta pendiente:", error);
        localStorage.removeItem("liz-carta-pendiente");
      }
    }
  }, [decir, programar]);

  // Fondo vertical en celulares, horizontal en pantallas anchas.
  useEffect(() => {
    const mq = window.matchMedia("(min-aspect-ratio: 1/1)");
    const fn = () => setOrient(mq.matches ? "h" : "v");
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (!listo) return;
    try {
      const g: Guardado = {
        version: GUARDADO_VERSION,
        stats,
        statUpdatedAt: statUpdatedAtRef.current,
        escena,
        ts: Date.now(),
        nombre,
        progreso,
        sonido,
        avisos,
        dormido,
      };
      localStorage.setItem(KEY, JSON.stringify(g));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [listo, stats, escena, nombre, progreso, sonido, avisos, dormido]);

  // Sube el estado al servidor para que avise aunque la app esté cerrada
  // (hambre, baño, sueño y horas de comida). Se espera a que se calme y
  // también se manda al salir de la app.
  const estadoRef = useRef({ stats, dormido, nombre, avisos, tarea });
  estadoRef.current = { stats, dormido, nombre, avisos, tarea };
  const subirEstado = useCallback(() => {
    const e = estadoRef.current;
    void guardarEstadoMascota({
      data: {
        device: getDeviceId(),
        nombre: e.nombre,
        stats: e.stats,
        statUpdatedAt: { ...statUpdatedAtRef.current },
        dormido: e.dormido,
        avisos: e.avisos,
        tz: new Date().getTimezoneOffset(),
        // Para el recordatorio diario de la tarea (racha de Snoopy Learn).
        aprender: {
          racha: e.tarea.racha,
          ultimoDia: e.tarea.ultimoDia,
          empezado: e.tarea.empezado,
        },
      },
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!listo) return;
    const t = window.setTimeout(subirEstado, 4000);
    return () => window.clearTimeout(t);
  }, [listo, stats, dormido, nombre, avisos, tarea.ultimoDia, tarea.racha, subirEstado]);
  useEffect(() => {
    if (!listo) return;
    const alOcultar = () => document.hidden && subirEstado();
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", subirEstado);
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", subirEstado);
    };
  }, [listo, subirEstado]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const ahora = Date.now();
      setStats((s) => {
        const siguiente = { ...s };
        for (const key of Object.keys(DECAY_PER_TICK) as StatKey[]) {
          if (key === "energia" && durmiendoRef.current) continue;
          const ticks = Math.floor(
            Math.max(0, ahora - statUpdatedAtRef.current[key]) / STAT_TICK_MS[key],
          );
          if (ticks > 0 && siguiente[key] > 0) {
            siguiente[key] = clamp(siguiente[key] - ticks * DECAY_PER_TICK[key]);
            statUpdatedAtRef.current[key] += ticks * STAT_TICK_MS[key];
          }
        }
        return siguiente;
      });
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Al salir: cortar temporizadores y micrófono, y devolver la música.
  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      for (const id of pendientes) window.clearTimeout(id);
      pendientes.clear();
      if (vozRef.current) {
        vozRef.current.detener();
        vozRef.current = null;
        musica("reanudar");
      }
    };
  }, []);

  /* ---------------- Giro 3D: Snoopy sigue tu dedo o el mouse ---------------- */

  // La mirada sigue al dedo con un resorte amortiguado: acelera, frena y se
  // asienta con inercia (como un modelo animado), en vez de saltar de golpe.
  // Las variables se escriben solo en Snoopy, no en toda la página.
  const snoopyRef = useRef<HTMLButtonElement>(null);
  const mirada = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, raf: 0, ultimo: 0 });
  const animarMirada = useCallback(() => {
    const m = mirada.current;
    if (m.raf || !snoopyRef.current) return;
    let previo = performance.now();
    const paso = (t: number) => {
      const el = snoopyRef.current;
      if (!el) {
        m.raf = 0;
        return;
      }
      const dt = Math.min(0.05, (t - previo) / 1000);
      previo = t;
      const k = 60; // rigidez
      const c = 2 * Math.sqrt(k) * 0.92; // casi crítico: sin rebote exagerado
      m.vx += ((m.tx - m.x) * k - m.vx * c) * dt;
      m.vy += ((m.ty - m.y) * k - m.vy * c) * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      el.style.setProperty("--ry", `${(m.x * 26).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-m.y * 14).toFixed(2)}deg`);
      el.style.setProperty("--hx", `${(m.x * 2).toFixed(2)}%`);
      el.style.setProperty("--hy", `${(m.y * 1.4).toFixed(2)}%`);
      const quieto =
        Math.abs(m.tx - m.x) < 0.002 &&
        Math.abs(m.ty - m.y) < 0.002 &&
        Math.abs(m.vx) < 0.01 &&
        Math.abs(m.vy) < 0.01;
      m.raf = quieto ? 0 : requestAnimationFrame(paso);
    };
    m.raf = requestAnimationFrame(paso);
  }, []);
  const mirarHacia = useCallback(
    (x: number, y: number) => {
      mirada.current.tx = Math.max(-0.5, Math.min(0.5, x));
      mirada.current.ty = Math.max(-0.5, Math.min(0.5, y));
      animarMirada();
    },
    [animarMirada],
  );
  const mirar = (e: React.PointerEvent) => {
    const el = raizRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mirada.current.ultimo = Date.now();
    mirarHacia((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
  };
  const soltarMirada = () => mirarHacia(0, 0);

  // Si nadie lo toca, de vez en cuando mira a su alrededor por su cuenta.
  useEffect(() => {
    if (!listo || dormido) {
      mirarHacia(0, 0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (Date.now() - mirada.current.ultimo < 5000) return;
      if (Math.random() < 0.35) mirarHacia(0, 0);
      else mirarHacia((Math.random() - 0.5) * 0.42, (Math.random() - 0.5) * 0.22);
    }, 3200);
    return () => window.clearInterval(id);
  }, [listo, dormido, mirarHacia]);
  useEffect(() => () => cancelAnimationFrame(mirada.current.raf), []);

  /* ---------------- Estado visible ---------------- */

  const masBaja = STATS.reduce((a, b) => (stats[b.key] < stats[a.key] ? b : a)).key;
  const necesitada = stats[masBaja] < UMBRAL_TRISTE;
  const escuchando = oido !== "inactivo";
  const bienestar = Math.round(
    (stats.hambre + stats.felicidad + stats.higiene + stats.energia) / 4,
  );
  const racha = rachaActual(progreso);

  let pose: Pose = "frente";
  let anim: Anim = "respirar";
  if (dormido) {
    pose = "durmiendo";
    anim = "breathe";
  } else if (accion) {
    pose = accion.pose;
    anim = accion.anim;
  } else if (tristeEnCama && !tristeAtendida) {
    pose = "espalda";
    anim = "breathe";
  } else if (escuchando) {
    anim = "tilt";
  } else if (necesitada && !tristeAtendida) {
    pose = "triste";
    anim = "shake";
  }
  const animo =
    bienestar <= 18
      ? "enojado"
      : pose === "triste" && !tristeAtendida
        ? "triste"
        : tristeAtendida
          ? "feliz"
          : bienestar > 70
            ? "feliz"
            : "normal";

  // Cuando una necesidad llega a un nivel crítico, Snoopy se refugia en la
  // cama y mira hacia la ventana hasta que vuelven a cuidarlo.
  useEffect(() => {
    if (!listo || dormido || accion || escuchando) return;
    if (necesitada && !tristeEnCama && !tristeAtendida) {
      setEscena("dormitorio");
      setTristeEnCama(true);
      decir("Estoy triste… nadie viene a verme 🥺", 3600);
      sonar("triste");
    } else if (!necesitada && tristeEnCama) {
      setTristeEnCama(false);
    } else if (!necesitada && tristeAtendida) {
      setTristeAtendida(false);
    }
  }, [listo, dormido, accion, escuchando, necesitada, tristeEnCama, tristeAtendida, decir, sonar]);

  // De noche solo avisa con un mensaje: nunca se duerme ni se despierta solo,
  // eso lo decides tú con la lámpara.
  useEffect(() => {
    if (!listo) return;
    const revisarHorario = () => {
      const h = new Date().getHours();
      if ((h >= 19 || h < 7) && !durmiendoRef.current) {
        const ultima = ultimaAlertaRef.current.energia ?? 0;
        if (Date.now() - ultima < 4 * 60 * 60_000) return;
        ultimaAlertaRef.current.energia = Date.now();
        decir("Ya es de noche, tengo sueñito… 🌙", 3000);
      }
    };
    revisarHorario();
    const id = window.setInterval(revisarHorario, 60_000);
    return () => window.clearInterval(id);
  }, [listo, decir]);

  // Avisa cuando una necesidad baja de 50% y limita los avisos repetidos.
  useEffect(() => {
    if (!listo) return;
    if (accion) return;
    const ahora = Date.now();
    const alertar = (tipo: StatKey, texto: string, sonidoAviso: Sonido) => {
      const ultima = ultimaAlertaRef.current[tipo] ?? 0;
      if (ahora - ultima < 4 * 60 * 60_000) return;
      ultimaAlertaRef.current[tipo] = ahora;
      decir(texto, 3200);
      sonar(sonidoAviso);
      avisar(texto);
    };
    if (stats.hambre < UMBRAL_AVISO) {
      alertar("hambre", FRASES_TRISTE.hambre, "aviso-hambre");
    }
    if (stats.higiene < UMBRAL_AVISO) {
      alertar("higiene", FRASES_TRISTE.higiene, "aviso-higiene");
    }
    if (!dormido && stats.energia < UMBRAL_AVISO) {
      alertar("energia", FRASES_TRISTE.energia, "aviso-sueno");
    }
  }, [listo, stats.hambre, stats.higiene, stats.energia, accion, dormido, decir, sonar, avisar]);

  // Tres avisos de comida al día, uno por cada franja horaria. Se guarda una
  // clave por fecha para que volver a abrir la página no repita el mismo aviso.
  useEffect(() => {
    if (!listo) return;
    const revisarComida = () => {
      const ahora = new Date();
      const comida = COMIDAS.find((c) => c.hora === ahora.getHours());
      if (!comida) return;
      const fechaLocal = [
        ahora.getFullYear(),
        String(ahora.getMonth() + 1).padStart(2, "0"),
        String(ahora.getDate()).padStart(2, "0"),
      ].join("-");
      const clave = `${fechaLocal}-${comida.hora}`;
      if (comidasAvisadasRef.current.has(clave)) return;
      comidasAvisadasRef.current.add(clave);
      const texto = `Es hora del ${comida.nombre}. Tengo hambre 🍖`;
      decir(texto, 3000);
      sonar("aviso-hambre");
      avisar(texto);
    };
    revisarComida();
    const id = window.setInterval(revisarComida, 60_000);
    return () => window.clearInterval(id);
  }, [listo, decir, sonar, avisar]);

  // Celebra cuando la racha sube a un nuevo día.
  const rachaPrevia = useRef<number | null>(null);
  useEffect(() => {
    if (!listo) return;
    const antes = rachaPrevia.current;
    rachaPrevia.current = progreso.racha;
    if (antes !== null && progreso.racha > antes && progreso.racha >= 2) {
      programar(() => decir(`🔥 ¡${progreso.racha} días seguidos juntos!`, 3000), 2700);
    }
  }, [listo, progreso.racha, programar, decir]);

  /* ---------------- Dormir con la lámpara ---------------- */

  const despertar = useCallback(() => {
    setDormido(false);
    statUpdatedAtRef.current.energia = Date.now();
    sonar("despertar");
    decir("¡Buenos días! ☀️");
  }, [sonar, decir]);

  // Mientras duerme recupera energía. Con la barra llena solo lo avisa:
  // sigue dormido hasta que tú enciendas la luz.
  useEffect(() => {
    if (!dormido) return;
    const id = window.setInterval(() => {
      statUpdatedAtRef.current.energia = Date.now();
      setStats((s) => (s.energia >= 100 ? s : { ...s, energia: clamp(s.energia + 1) }));
      lanzar(["zzz"], 2);
    }, RECOVERY_STEP_MS);
    return () => window.clearInterval(id);
  }, [dormido, lanzar]);
  const avisoDescansado = useRef(false);
  useEffect(() => {
    if (!listo) return;
    if (!dormido || stats.energia < 100) {
      avisoDescansado.current = false;
      return;
    }
    if (!avisoDescansado.current) {
      avisoDescansado.current = true;
      decir("Ya descansé. Enciende la luz cuando quieras", 3200);
    }
  }, [listo, dormido, stats.energia, decir]);

  /* ---------------- Logros ---------------- */

  useEffect(() => {
    if (!listo) return;
    const nuevos = LOGROS.filter(
      (l) => !progreso.logros.includes(l.id) && l.valor(progreso, bienestar) >= l.meta,
    );
    if (nuevos.length === 0) return;
    setProgreso((p) => ({ ...p, logros: [...p.logros, ...nuevos.map((l) => l.id)] }));
    setCola((c) => [...c, ...nuevos.map((l) => l.id)]);
  }, [listo, progreso, bienestar]);

  const celebrando = cola[0] ? LOGROS.find((l) => l.id === cola[0]) : undefined;
  useEffect(() => {
    if (!celebrando) return;
    sonar("logro");
    lanzar(["confeti", "confeti", "destello", "corazon"], 18);
    const t = window.setTimeout(() => setCola((c) => c.slice(1)), 5200);
    return () => window.clearTimeout(t);
  }, [celebrando, sonar, lanzar]);

  // Escape cierra el panel de logros.
  useEffect(() => {
    if (!panelLogros) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && setPanelLogros(false);
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [panelLogros]);

  /* ---------------- Notas de Snoopy (de un celular al otro) ---------------- */

  // Quien envía se entera cuando la nota llegó al otro celular. Una vez visto
  // el aviso, la nota sale de su lista: solo sigue esperando en la nube.
  const estadoEnviadas = useRef<Map<string, "enviada" | "entregada"> | null>(null);
  useEffect(() => {
    if (!listo) return;
    const antes = estadoEnviadas.current;
    const ahora = new Map(
      enviadas.map((n) => [n.id, n.entregadaAt ? ("entregada" as const) : ("enviada" as const)]),
    );
    estadoEnviadas.current = ahora;
    const recien = [...ahora]
      .filter(([id, e]) => e === "entregada" && antes?.get(id) !== "entregada")
      .map(([id]) => id);
    if (recien.length === 0) return;
    avisarNota(
      recien.length > 1
        ? `${recien.length} notas en su celular · aún sin abrir`
        : "Llegó a su celular · aún sin abrir",
      "ok",
      5000,
    );
    if (antes) {
      decir("Tu nota ya llegó a su celular. Se borrará cuando la lea", 3400);
      sonar("caricia");
    }
    programar(() => ocultarEnviadas(recien), 5200);
  }, [listo, enviadas, decir, sonar, avisarNota, programar]);

  // Al cerrar el panel, las entregadas que se vieron ahí también salen.
  const panelAbierto = useRef(false);
  useEffect(() => {
    if (panelAbierto.current && !panelNotas) {
      ocultarEnviadas(enviadas.filter((n) => n.entregadaAt).map((n) => n.id));
    }
    panelAbierto.current = panelNotas;
  }, [panelNotas, enviadas]);

  // La leyó y la cerró: se borró de la nube. Solo queda este aviso.
  useEffect(
    () =>
      alLeerseUnaNota((cuantas) => {
        avisarNota(
          cuantas > 1 ? `Leyó ${cuantas} notas · ya se borraron` : "¡Leyó tu nota! · ya se borró",
          "leida",
          5000,
        );
        decir("¡Leyó tu nota!", 3600);
        sonar("logro");
        lanzar(["corazon", "destello"], 10);
      }),
    [avisarNota, decir, sonar, lanzar],
  );

  // Cuando llega una nota nueva, Snoopy la anuncia y aparece el sobre.
  const notasVistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!listo) return;
    const vistas = notasVistas.current;
    notasVistas.current = new Set(notas.map((n) => n.id));
    const nuevas = vistas ? notas.filter((n) => !vistas.has(n.id)) : notas;
    if (nuevas.length === 0) return;
    decir(
      nuevas.length > 1
        ? `¡Te traje ${nuevas.length} notas! Tócalas 💌`
        : "¡Te llegó una nota! Toca el sobre 💌",
      4200,
    );
    sonar("logro");
    lanzar(["sobre", "destello", "corazon"], 9);
    avisarNota(
      nuevas.length > 1 ? `Te llegaron ${nuevas.length} notas` : "Te llegó una nota",
      "llega",
      5000,
    );
  }, [listo, notas, decir, sonar, lanzar, avisarNota]);

  const leerNota = useCallback(
    (n: NotaSnoopy) => {
      // Desde aquí ya cuenta como leída: si se cierra la app, igual se borra.
      abrirNota(n.id);
      setNotaAbierta(n);
      sonar("caricia");
    },
    [sonar],
  );

  // Al tocar el aviso del celular se abre directo esa nota.
  const notaInicialAbierta = useRef(false);
  useEffect(() => {
    if (!listo || !notaInicial || notaInicialAbierta.current) return;
    const n = notas.find((x) => x.id === notaInicial);
    if (n) {
      notaInicialAbierta.current = true;
      leerNota(n);
    }
  }, [listo, notaInicial, notas, leerNota]);

  const cerrarNotaAbierta = useCallback(() => {
    if (!notaAbierta) return;
    setNotaAbierta(null);
    void cerrarNota(notaAbierta.id);
    lanzar(["hoja", "destello"], 8);
    decir("Nota leída… y se fue con el viento 🍃", 2800);
    if (notaInicial) void navigate({ to: "/mascota", search: {}, replace: true });
  }, [notaAbierta, notaInicial, navigate, lanzar, decir]);

  useEffect(() => {
    if (!panelNotas) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && setPanelNotas(false);
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [panelNotas]);

  // Escape cierra la nota (y la borra) o el editor.
  useEffect(() => {
    if (!notaAbierta && !escribiendo) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (notaAbierta) cerrarNotaAbierta();
      else setEscribiendo(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [notaAbierta, escribiendo, cerrarNotaAbierta]);

  /* ---------------- Acciones ---------------- */

  /** Apaga el micrófono sin decir nada (para cuando se va a dormir). */
  const cortarMic = () => {
    if (!vozRef.current) return;
    vozRef.current.detener();
    vozRef.current = null;
    setOido("inactivo");
    setTextoOido(null);
    bocaRef.current?.style.setProperty("--boca", "0");
    musica("reanudar");
  };

  /** Arranca una acción nueva (corta la anterior) y devuelve su id. */
  const iniciarAccion = (a: Omit<Accion, "id">) => {
    const id = ++idRef.current;
    accionRef.current = id;
    setAccion({ ...a, id });
    return id;
  };

  const lampara = () => {
    if (dormido) {
      despertar();
      return;
    }
    // Siempre obedece: deja lo que estaba haciendo y se va a dormir.
    accionRef.current = 0;
    setAccion(null);
    cortarMic();
    registrar("dormir");
    recuperarGradual({ felicidad: 8 });
    sonar("dormir");
    decir("Buenas noches… 🌙", 2600);
    // Se va a su cama: si estaba en el patio, vuelve al dormitorio.
    setEscena("dormitorio");
    statUpdatedAtRef.current.energia = Date.now();
    setDormido(true);
  };

  const ejecutar = (tipo: TipoAccion) => {
    if (tipo === "dormir") return lampara();
    // A mitad del paseo espera a llegar; todo lo demás responde al instante,
    // también de noche o si estaba durmiendo (se despierta para hacerlo).
    if (accion?.tipo === "pasear") return;
    setTristeEnCama(false);
    setTristeAtendida(true);
    if (dormido) setDormido(false);
    registrar(tipo);

    if (tipo === "pasear") {
      const destino: Escena = escena === "dormitorio" ? "patio" : "dormitorio";
      const dur = 1900;
      const alPatio = destino === "patio";
      const id = iniciarAccion({
        tipo,
        pose: alPatio ? "espalda" : "mira-derecha",
        anim: "walk",
        dur,
        mover: alPatio ? "irse" : "llegar",
      });
      recuperarGradual({ felicidad: 20 });
      sonar("pasear");
      decir(alPatio ? "¡Vamos al patio! 🌳" : "¡De vuelta a casa! 🏠", 1700);
      lanzar(alPatio ? ["hoja", "hoja", "destello"] : ["corazon", "destello"]);
      // El fondo cambia a mitad de camino, mientras va caminando.
      programar(() => accionRef.current === id && setEscena(destino), dur * 0.35);
      programar(() => {
        if (accionRef.current !== id) return;
        accionRef.current = 0;
        setAccion(null);
        decir(alPatio ? "¡Qué lindo día! ☀️🦋" : "Hogar, dulce hogar 💛");
      }, dur);
      return;
    }

    // Cada toque suma 5 % al momento: puedes darle varias veces seguidas.
    const c = ACCIONES[tipo];
    const lleno = tipo === "alimentar" ? stats.hambre >= 100 : stats.higiene >= 100;
    const id = iniciarAccion({ tipo, pose: c.pose, anim: c.anim, dur: c.dur });
    recuperarGradual(c.delta);
    sonar(c.sonido);
    lanzar(c.particulas);
    decir(
      lleno
        ? tipo === "alimentar"
          ? "¡Ya estoy llenito, pero gracias! 💛"
          : "¡Ya estoy limpiecito! ✨"
        : `${elegir(c.frases)} +5%`,
      Math.min(c.dur, 2600),
    );
    programar(() => {
      if (accionRef.current !== id) return;
      accionRef.current = 0;
      setAccion(null);
    }, c.dur);
  };

  const acariciar = () => {
    const ahora = Date.now();
    if (ahora - ultimaCaricia.current < 700) return;
    ultimaCaricia.current = ahora;
    setTristeEnCama(false);
    setTristeAtendida(true);
    recuperarGradual({ felicidad: CARICIA_FELICIDAD });
    registrar("caricias");
    lanzar(["corazon", "corazon", "destello"], 9);
    // Dormido recibe el cariño sin despertarse.
    if (dormido) return decir("Zzz… 💛", 1600);
    setToques((t) => t + 1);
    if (Math.random() < 0.4) {
      setLadrando(true);
      programar(() => setLadrando(false), 520);
      sonar("ladrido");
      decir("¡Guau, guau! 🐶", 1800);
    } else {
      sonar("caricia");
      decir(`${elegir(FRASES_CARICIA)} +${CARICIA_FELICIDAD}%`, 1800);
    }
  };

  // Quien escribe no espera: el panel se cierra al instante, Snoopy sale con
  // la nota y el envío sigue en segundo plano (con reintentos si no hay red).
  const enviarNotaSnoopy = () => {
    const texto = textoNota.trim();
    if (!texto) return;
    setTextoNota("");
    setNotaLlena(false);
    setEscribiendo(false);
    if (dormido) setDormido(false);
    if (accion?.tipo !== "pasear") {
      const id = iniciarAccion({ tipo: "nota", pose: "frente", anim: "entregar", dur: 1800 });
      programar(() => {
        if (accionRef.current !== id) return;
        accionRef.current = 0;
        setAccion(null);
      }, 1800);
    }
    const vuelo = ++idRef.current;
    setSobreVolando(vuelo);
    programar(() => setSobreVolando((v) => (v === vuelo ? 0 : v)), 1700);
    sonar("pasear");
    lanzar(["sobre", "corazon", "destello"], 9);
    decir("¡Allá voy con tu nota!", 2000);
    avisarNota("Enviando tu nota…", "envio", 12000);
    setEnviandoNota(true);
    void mandarNota(texto, emojiNota)
      .catch(() => ({ ok: false, avisos: 0 }))
      .then((r) => {
        setEnviandoNota(false);
        if (!r.ok) {
          avisarNota("Sin conexión · se enviará sola", "error", 5000);
          decir("Sin conexión: la entregaré apenas vuelva el internet", 3600);
          return;
        }
        avisarNota(
          r.avisos > 0 ? "Nota enviada ✓ · le llegó el aviso" : "Nota enviada ✓",
          "ok",
          4500,
        );
        decir(
          r.avisos > 0
            ? "¡Entregada! Le llegó el aviso a su celular"
            : "Nota enviada. Su celular todavía no tiene los avisos activados",
          3800,
        );
      });
  };

  /** Lección de Snoopy Learn terminada: Snoopy se alegra (+10 felicidad). */
  const terminarLeccion = useCallback(
    (p: Premio) => {
      if (!p.aprobado) return;
      statUpdatedAtRef.current.felicidad = Date.now();
      setStats((s) => ({ ...s, felicidad: clamp(s.felicidad + 10) }));
      lanzar(["confeti", "destello", "corazon"], 14);
      decir(
        p.rachaDespues > p.rachaAntes
          ? `¡Racha de ${p.rachaDespues} ${p.rachaDespues === 1 ? "día" : "días"}! Estoy orgulloso`
          : "¡Aprendiste mucho! +10% de felicidad",
        4000,
      );
    },
    [lanzar, decir],
  );

  const guardarNombre = () => {
    const n = borrador.trim().slice(0, 14);
    if (n && n !== nombre) {
      setNombre(n);
      decir(`¡Me encanta llamarme ${n}! 💛`, 2600);
    }
    setEditandoNombre(false);
  };

  const alternarAvisos = async () => {
    if (avisos) {
      setAvisos(false);
      decir("Avisos apagados 🔕", 2000);
      return;
    }
    if (typeof Notification === "undefined") {
      decir("Instala la app en tu inicio para recibir avisos 📲", 3200);
      return;
    }
    await enablePush();
    const ok = Notification.permission === "granted";
    setAvisos(ok);
    decir(
      ok ? "¡Te avisaré si te necesito! 🔔" : "Permite las notificaciones en tu navegador 🔔",
      3000,
    );
  };

  /* ---------------- Háblale (repite tu voz) ---------------- */

  const apagarMic = () => {
    cortarMic();
    decir("¡Me encantó hablar contigo! 💛", 2200);
  };

  const prenderMic = async () => {
    if (dormido) setDormido(false);
    const voz = new VozMascota({
      onEstado: (e) => {
        if (e === "inactivo") return;
        setOido(e);
        if (e === "hablando") {
          recuperarGradual({ felicidad: 2 });
          registrar("charlas");
        }
        if (e === "oyendo") setTextoOido(null);
      },
      onBoca: (nivel) => bocaRef.current?.style.setProperty("--boca", String(nivel)),
      onTexto: (t) => setTextoOido(t),
    });
    vozRef.current = voz;
    musica("pausar");
    try {
      await voz.iniciar();
      setOido("escuchando");
    } catch {
      vozRef.current = null;
      musica("reanudar");
      setOido("inactivo");
      decir("Permite el micrófono para hablarle 🎤", 3200);
    }
  };

  /* ---------------- Vista ---------------- */

  const globo = escuchando
    ? oido === "hablando"
      ? textoOido
        ? `«${textoOido}»`
        : "¡Te lo repito!"
      : oido === "oyendo"
        ? "…"
        : "Te escucho…"
    : null;

  const botones: Array<{
    tipo: TipoAccion;
    Icono: LucideIcon;
    label: string;
    necesita: boolean;
  }> = [
    { tipo: "alimentar", Icono: Bone, label: "Comer", necesita: stats.hambre <= 30 },
    { tipo: "banar", Icono: Bath, label: "Bañar", necesita: stats.higiene <= 30 },
    {
      tipo: "dormir",
      Icono: Lamp,
      label: dormido ? "Encender" : "Dormir",
      necesita: !dormido && stats.energia <= 30,
    },
    {
      tipo: "pasear",
      Icono: escena === "dormitorio" ? Trees : House,
      label: escena === "dormitorio" ? "Pasear" : "Casa",
      necesita: stats.felicidad <= 30,
    },
  ];

  const fondos = FONDOS[orient];
  const ancla = dormido || tristeEnCama ? ANCLAS[orient].cama : ANCLAS[orient][escena];
  const sombraAncha = pose === "durmiendo" || pose === "banando";
  return (
    <section
      ref={raizRef}
      className={`mascota-ui mg-raiz relative -mb-px h-[100svh] min-h-[600px] overflow-hidden bg-[#0f1328] ${escena}`}
      onPointerDownCapture={() => (interactuo.current = true)}
      onKeyDownCapture={() => (interactuo.current = true)}
      onPointerMove={mirar}
      onPointerLeave={soltarMirada}
    >
      <style>{CSS + SNOOPY_CSS + EFECTOS_CSS}</style>
      <EfectosDefs />
      {/* Columna derecha: el clima y, justo debajo, el botón de notas. */}
      <div
        className={`mg-contenido absolute right-4 top-[calc(env(safe-area-inset-top)+260px)] z-10 flex flex-col items-end gap-3 sm:right-6 sm:top-[calc(env(safe-area-inset-top)+286px)] ${
          listo ? "opacity-100" : "opacity-0"
        }`}
      >
        <WeatherPanel />
        <div className="relative z-20 flex w-16 flex-col items-center gap-0.5 text-white">
          <button
            type="button"
            onClick={() => setPanelNotas((v) => !v)}
            aria-expanded={panelNotas}
            aria-label={
              notas.length > 0
                ? `Notitas: ${notas.length === 1 ? "tienes una nota nueva" : `tienes ${notas.length} notas nuevas`}`
                : "Notitas"
            }
            title="Notitas"
            className={`mg-boton mg-boton-transparente relative grid h-12 w-12 shrink-0 place-items-center overflow-visible rounded-full ${
              panelNotas || escribiendo ? "mg-boton-activo" : ""
            } ${enviandoNota ? "mg-boton-cargando" : ""}`}
          >
            <Mail size={22} strokeWidth={1.8} aria-hidden="true" className="text-pink-100" />
            {notas.length > 0 ? (
              <span className="mg-nota-badge absolute -right-1 -top-1 z-[2] grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-none text-white">
                {notas.length > 9 ? "9+" : notas.length}
              </span>
            ) : (
              enviadas.some((n) => !n.leidaAt) && (
                <span
                  className="absolute -right-1 -top-1 z-[2] grid h-5 min-w-5 place-items-center rounded-full border border-rose-300/80 bg-[#2a1030]/85 px-1 text-[10px] font-bold leading-none text-rose-100"
                  title="Notas enviadas que aún no se leen"
                >
                  {Math.min(9, enviadas.filter((n) => !n.leidaAt).length)}
                </span>
              )
            )}
          </button>
          <span
            className={`whitespace-nowrap text-[10.5px] font-semibold leading-tight ${
              notas.length > 0 ? "text-pink-200" : "text-white/80"
            }`}
          >
            {notas.length > 0 ? "¡Nueva!" : "Notitas"}
          </span>

          {/* Aviso flotante, como una notificación, al lado del botón. */}
          {avisoNota && !panelNotas && (
            <button
              type="button"
              key={avisoNota.id}
              onClick={() => {
                setAvisoNota(null);
                setPanelNotas(true);
              }}
              className={`mg-aviso-nota mg-vidrio-oscuro absolute right-[calc(100%+6px)] top-1 flex w-max max-w-[min(230px,calc(100vw-110px))] items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-white ${avisoNota.tono}`}
            >
              <span className="mg-aviso-punto" aria-hidden="true" />
              {avisoNota.texto}
            </button>
          )}

          {/* Panel tipo campanita: notas recibidas y enviadas. */}
          {panelNotas && (
            <>
              <div
                className="fixed inset-0 z-[-1]"
                aria-hidden="true"
                onClick={() => setPanelNotas(false)}
              />
              <div
                role="dialog"
                aria-label="Notitas"
                className="mg-panel mg-vidrio-oscuro absolute right-0 top-[calc(100%+8px)] max-h-[min(60svh,26rem)] w-[min(290px,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-3 text-left text-white"
              >
                <div className="mb-2 flex items-center justify-between border-b border-white/15 pb-2">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <Mail size={15} className="text-pink-200" /> Notitas
                  </p>
                  <button
                    type="button"
                    onClick={() => setPanelNotas(false)}
                    aria-label="Cerrar notitas"
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
                  >
                    <X size={14} />
                  </button>
                </div>

                <p className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
                  Te llegaron
                  {notas.length > 0 && (
                    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] tracking-normal text-white">
                      {notas.length}
                    </span>
                  )}
                </p>
                {notas.length === 0 ? (
                  <p className="mb-2 px-1 py-1.5 text-xs text-white/55">No tienes notas nuevas.</p>
                ) : (
                  <ul className="mb-2 space-y-1">
                    {notas.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPanelNotas(false);
                            leerNota(n);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl bg-rose-500/15 px-2.5 py-2 text-left transition hover:bg-rose-500/25"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-500 text-white">
                            <SelloIcono id={n.emoji} size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold">
                              Nota nueva · tócala para leer
                            </span>
                            <span className="block text-[10px] text-white/60">
                              {horaCorta(n.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mb-1 mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
                  En camino
                </p>
                {enviadas.length === 0 ? (
                  <p className="mb-2 px-1 py-1.5 text-xs text-white/55">No hay notas en camino.</p>
                ) : (
                  <ul className="mb-2 space-y-1">
                    {enviadas.map((n) => {
                      const e = estadoEnviada(n);
                      return (
                        <li
                          key={n.id}
                          className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2"
                        >
                          <SelloIcono id={n.emoji} size={14} className="shrink-0 text-rose-200" />
                          <span className="flex-1 text-[11px] text-white/70">
                            {horaCorta(n.createdAt)}
                          </span>
                          <span className={`text-[11px] font-semibold ${e.clase}`}>{e.texto}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPanelNotas(false);
                    setEscribiendo(true);
                  }}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-400 to-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:brightness-110"
                >
                  <Pencil size={13} /> Escribir una nota
                </button>
              </div>
            </>
          )}
        </div>

        {/* Snoopy Learn: la tarea del día y la racha. */}
        <div className="relative flex w-16 flex-col items-center gap-0.5 text-white">
          <button
            type="button"
            onClick={() => setAprendiendo(true)}
            onPointerEnter={() => void cargarLearn()}
            onTouchStart={() => void cargarLearn()}
            aria-label={
              tarea.hechaHoy
                ? `Snoopy Learn: tarea de hoy cumplida, racha de ${tarea.racha} días`
                : "Snoopy Learn: tienes una tarea pendiente"
            }
            title="Snoopy Learn"
            className={`mg-boton mg-boton-transparente relative grid h-12 w-12 shrink-0 place-items-center overflow-visible rounded-full ${
              aprendiendo ? "mg-boton-activo" : ""
            } ${!tarea.hechaHoy ? "mg-boton-necesita" : ""}`}
          >
            <GraduationCap
              size={22}
              strokeWidth={1.8}
              aria-hidden="true"
              className="text-amber-100"
            />
            {tarea.racha > 0 ? (
              <span
                className={`mg-racha-badge absolute -right-1.5 -top-1.5 z-[2] flex h-5 min-w-5 items-center gap-0.5 rounded-full px-1 text-[10.5px] font-extrabold leading-none text-white ${
                  tarea.hechaHoy ? "encendida" : "tibia"
                }`}
              >
                <Flame size={10} strokeWidth={2.6} />
                {tarea.racha}
              </span>
            ) : (
              !tarea.hechaHoy && (
                <span className="absolute -right-1 -top-1 z-[2] h-3 w-3 rounded-full bg-amber-400 ring-2 ring-[#0f1328]" />
              )
            )}
          </button>
          <span
            className={`whitespace-nowrap text-[10.5px] font-semibold leading-tight ${
              tarea.hechaHoy ? "text-white/80" : "text-amber-200"
            }`}
          >
            {tarea.hechaHoy ? "Aprender" : "¡Tarea!"}
          </span>
        </div>
      </div>

      {aprendiendo && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[90] grid place-items-center bg-[#0b1026]/90 text-sm font-semibold text-white/80">
              Abriendo Snoopy Learn…
            </div>
          }
        >
          <SnoopyLearn
            nombre={nombre}
            onCerrar={() => setAprendiendo(false)}
            onTerminar={terminarLeccion}
          />
        </Suspense>
      )}

      {/* Fondo difuminado de pantalla completa (se ve detrás de los controles). */}
      <div className="absolute inset-0" aria-hidden="true">
        {(["dormitorio", "patio"] as Escena[]).map((e) => (
          <img
            key={e}
            src={fondos[e]}
            alt=""
            decoding="async"
            className="mg-fondo mg-desenfoque absolute inset-0 h-full w-full object-cover"
            style={{ opacity: escena === e ? 1 : 0 }}
          />
        ))}
      </div>

      {/* Escena: el fondo nítido con Snoopy apoyado en él. */}
      <div className="mg-escena absolute inset-0">
        <div className="mg-lienzo mg-kb" style={lienzoEstilo(fondos.ar)}>
          {(["dormitorio", "patio"] as Escena[]).map((e) => (
            <img
              key={e}
              src={fondos[e]}
              alt=""
              decoding="async"
              fetchPriority={e === escena ? "high" : "low"}
              className="mg-fondo absolute inset-0 h-full w-full object-cover"
              style={{ opacity: escena === e ? 1 : 0 }}
              aria-hidden="true"
            />
          ))}

          <button
            ref={snoopyRef}
            type="button"
            onClick={acariciar}
            aria-label={dormido ? `${nombre} está durmiendo` : `Acariciar a ${nombre}`}
            className="mg-ancla absolute aspect-square rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={anclaEstilo(ancla)}
          >
            <div
              key={`${accion?.tipo ?? "x"}-${accion?.mover ?? ""}`}
              className={`absolute inset-0 ${accion?.mover ? `mg-${accion.mover}` : ""}`}
              style={
                accion?.mover
                  ? ({ animationDuration: `${accion.dur}ms` } as CSSProperties)
                  : undefined
              }
            >
              <span
                className={`mg-sombra absolute bottom-[-1%] left-1/2 h-[7%] rounded-[50%] ${
                  sombraAncha ? "w-[80%]" : "w-[58%]"
                } ${
                  anim === "respirar" || anim === "breathe"
                    ? "mg-sombra-respira"
                    : anim === "walk"
                      ? "mg-sombra-camina"
                      : anim === "bounce" || anim === "entregar"
                        ? "mg-sombra-salta"
                        : ""
                }`}
                aria-hidden="true"
              />
              <div className={`absolute inset-0 ${ANIM_CLASE[anim]}`}>
                <div key={`${pose}-${toques}`} className="mg-pop absolute inset-0">
                  <SnoopyVivo
                    pose={pose}
                    animo={animo}
                    boca={oido === "hablando" ? "voz" : "auto"}
                    ladrido={toques}
                    ladrando={ladrando}
                    caminando={anim === "walk"}
                    bocaRef={bocaRef}
                  />
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Luz de la habitación: con la lámpara apagada todo queda a oscuras. */}
        <div
          className="mg-overlay pointer-events-none absolute inset-0"
          style={{ background: dormido ? "rgba(4,7,28,0.66)" : "rgba(0,0,0,0.16)" }}
          aria-hidden="true"
        />
        <div className="mg-vineta pointer-events-none absolute inset-0" aria-hidden="true" />
        {cartaPendiente && (
          <button
            type="button"
            onClick={() => {
              setCartaPendiente(null);
              if (cartaPendiente.id) {
                void navigate({
                  to: "/bienvenida",
                  search: { open: cartaPendiente.id },
                });
              }
            }}
            aria-label={`Abrir carta: ${cartaPendiente.title}`}
            className="mg-carta-aviso absolute z-20 w-[min(112px,27vw)] -translate-x-1/2 translate-y-[-105%] overflow-hidden rounded-md shadow-2xl transition-transform hover:scale-105 sm:w-36"
            style={{
              left: `${ancla.x * 100 - 14}%`,
              top: `${ancla.y * 100}%`,
            }}
          >
            <img
              src="/cartas/sobre.webp"
              alt={`Sobre de la carta: ${cartaPendiente.title}`}
              width={640}
              height={426}
              className="block aspect-[3/2] w-full object-cover"
            />
          </button>
        )}
        {notas.length > 0 && !notaAbierta && (
          <button
            type="button"
            onClick={() => leerNota(notas[0]!)}
            aria-label={`Abrir nota nueva${notas.length > 1 ? ` (${notas.length})` : ""}`}
            className="mg-nota-aviso absolute z-20 w-[min(104px,25vw)] -translate-x-1/2 translate-y-[-105%] sm:w-32"
            style={{ left: `${ancla.x * 100 + 15}%`, top: `${ancla.y * 100}%` }}
          >
            <span className="mg-nota-flota block overflow-hidden rounded-md shadow-2xl">
              <img
                src="/cartas/sobre.webp"
                alt=""
                width={640}
                height={426}
                className="block aspect-[3/2] w-full object-cover"
              />
            </span>
            <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white shadow-lg">
              {(() => {
                const S = sello(notas[0]!.emoji).Icono;
                return <S size={13} strokeWidth={2.4} aria-hidden="true" />;
              })()}
              {notas.length > 1 ? notas.length : ""}
            </span>
          </button>
        )}
        {sobreVolando > 0 && (
          <img
            key={sobreVolando}
            src="/cartas/sobre.webp"
            alt=""
            aria-hidden="true"
            className="mg-sobre-vuela pointer-events-none absolute z-20 w-[min(90px,22vw)] rounded-md shadow-2xl"
            style={{ left: `${ancla.x * 100}%`, top: `${ancla.y * 100 - 30}%` }}
          />
        )}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {MOTAS.map(([x, y, delay, dur], i) => (
            <span
              key={i}
              className="mg-mota absolute rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                animationDelay: `${delay}s`,
                animationDuration: `${dur}s`,
              }}
            />
          ))}
        </div>
        {/* Capa de mensajes y partículas: misma geometría, por encima de la luz. */}
        <div
          className="mg-lienzo mg-kb pointer-events-none"
          style={lienzoEstilo(fondos.ar)}
          aria-hidden="true"
        >
          <div className="mg-ancla absolute aspect-square" style={anclaEstilo(ancla)}>
            {particulas.map((p) => (
              <ParticulaVisual key={p.id} p={p} />
            ))}
            <div className="absolute inset-x-[-60%] bottom-[96%] flex justify-center">
              {globo ? (
                <p className="mg-globo mg-vidrio-fuerte mg-mensaje rounded-2xl px-4 py-1.5 text-center text-sm font-bold text-white">
                  {globo}
                </p>
              ) : (
                toast && (
                  <p
                    key={toast.id}
                    className="mg-toast mg-vidrio-fuerte mg-mensaje rounded-2xl px-4 py-1.5 text-center text-sm font-bold text-white"
                  >
                    {toast.texto}
                  </p>
                )
              )}
            </div>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {globo ?? toast?.texto ?? ""}
        </p>
        <div className="mg-fundido pointer-events-none absolute inset-x-0 bottom-0 h-16" />
      </div>

      {/* Barras */}
      <div
        className={`mg-contenido absolute left-1/2 top-[calc(env(safe-area-inset-top)+96px)] z-10 w-full max-w-[352px] -translate-x-1/2 px-4 text-white sm:top-[calc(env(safe-area-inset-top)+116px)] ${
          listo ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="mg-stats w-full px-4 pb-3.5 pt-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            {editandoNombre ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  guardarNombre();
                }}
              >
                <input
                  autoFocus
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  onBlur={guardarNombre}
                  onKeyDown={(e) => e.key === "Escape" && setEditandoNombre(false)}
                  maxLength={14}
                  aria-label="Nombre de la mascota"
                  className="min-w-0 flex-1 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-base font-bold text-white outline-none focus:border-white"
                />
                <button
                  type="submit"
                  aria-label="Guardar nombre"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/30"
                >
                  <Check size={15} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setBorrador(nombre);
                  setEditandoNombre(true);
                }}
                className="group flex min-w-0 items-center gap-1.5"
                title="Cambiar nombre"
              >
                <span className="truncate text-lg font-bold leading-none tracking-wide">
                  {nombre}
                </span>
                <Pencil
                  size={13}
                  className="shrink-0 opacity-60 transition group-hover:opacity-100"
                />
              </button>
            )}
            {!editandoNombre && (
              <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                {racha > 0 && (
                  <span
                    className="mg-pastilla flex items-center gap-1 rounded-full px-2 py-0.5"
                    title={`${racha} ${racha === 1 ? "día" : "días"} seguidos cuidándolo`}
                  >
                    <Flame size={12} className="text-orange-300" />
                    {racha}
                  </span>
                )}
                <span
                  className="mg-pastilla flex items-center gap-1 rounded-full px-2 py-0.5"
                  title="Bienestar"
                >
                  <HeartPulse size={12} className="text-rose-300" />
                  {bienestar}%
                </span>
                <button
                  type="button"
                  onClick={() => setPanelLogros(true)}
                  className="mg-pastilla flex items-center gap-1 rounded-full px-2 py-0.5 transition hover:bg-white/30"
                  aria-label={`Logros: ${progreso.logros.length} de ${LOGROS.length}`}
                >
                  <Trophy size={12} className="text-amber-200" />
                  {progreso.logros.length}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {STATS.map((s) => {
              const v = stats[s.key];
              const c = colorNivel(v);
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-[12px] font-semibold">
                    <span className="flex items-center gap-1.5 text-white/90">
                      <s.Icono size={13} style={{ color: s.color }} aria-hidden="true" />
                      {s.label}
                    </span>
                    <span key={`${s.key}-${v}`} className="mg-valor tabular-nums text-white/80">
                      {v}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-white/20"
                    role="progressbar"
                    aria-label={s.label}
                    aria-valuenow={v}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`mg-barra h-full rounded-full ${v <= 30 ? "mg-barra-baja" : ""}`}
                      style={{
                        width: `${v}%`,
                        background: c,
                        boxShadow: `0 0 10px ${c}, 0 0 3px ${c}`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controles: una columna a la izquierda, por encima de la cabeza de
          Snoopy. Así no lo tapan ni chocan con el clima (que va a la derecha). */}
      <div
        className={`mg-contenido mg-columna absolute z-10 flex flex-col items-center gap-1.5 text-white ${
          listo ? "opacity-100" : "opacity-0"
        }`}
      >
        {botones.map((b) => {
          const activo =
            (b.tipo === "dormir" && dormido) || (accion !== null && accion.tipo === b.tipo);
          const lamparaEncendida = b.tipo === "dormir" && !dormido;
          return (
            <div key={b.tipo} className="flex w-16 flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => ejecutar(b.tipo)}
                aria-label={b.tipo === "alimentar" ? "Alimentar" : b.label}
                aria-pressed={b.tipo === "dormir" ? dormido : undefined}
                className={`mg-boton mg-boton-transparente relative grid h-12 w-12 shrink-0 place-items-center overflow-visible rounded-full ${
                  activo ? "mg-boton-activo" : ""
                } ${b.necesita && !activo ? "mg-boton-necesita" : ""} ${
                  accion !== null && accion.tipo === b.tipo ? "mg-boton-cargando" : ""
                }`}
              >
                <b.Icono
                  size={22}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className={
                    lamparaEncendida ? "mg-lampara-on" : b.tipo === "dormir" ? "opacity-60" : ""
                  }
                />
              </button>
              <span className="whitespace-nowrap text-[10.5px] font-semibold leading-tight text-white/80">
                {b.label}
              </span>
            </div>
          );
        })}
        {micDisponible && (
          <div className="flex w-16 flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={() => (escuchando ? apagarMic() : void prenderMic())}
              aria-pressed={escuchando}
              aria-label={escuchando ? "Terminar de hablar" : `Háblale a ${nombre}`}
              title={escuchando ? "Terminar de hablar" : "Háblale: te repite"}
              className={`mg-boton relative grid h-12 w-12 shrink-0 place-items-center rounded-full ${
                escuchando ? "mg-mic-activo" : "mg-boton-transparente"
              }`}
            >
              {escuchando ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <span className="whitespace-nowrap text-[10.5px] font-semibold leading-tight text-white/80">
              {escuchando ? "Terminar" : "Háblale"}
            </span>
          </div>
        )}
      </div>

      {/* Escribir una nota: Snoopy se la lleva al otro celular. */}
      {escribiendo && (
        <div
          className="mg-panel-fondo fixed inset-0 z-[66] flex justify-center overflow-y-auto bg-black/60 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+96px)] backdrop-blur-sm sm:pt-[calc(env(safe-area-inset-top)+116px)]"
          onClick={() => setEscribiendo(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Escribir una nota"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void enviarNotaSnoopy();
            }}
            className="mg-panel mg-vidrio-oscuro my-auto flex h-fit w-full max-w-sm flex-col gap-3 rounded-3xl px-5 pb-5 pt-4 text-white"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-lg font-bold leading-tight">
                <Mail size={18} className="text-pink-200" /> Nota con {nombre}
              </p>
              <button
                type="button"
                onClick={() => setEscribiendo(false)}
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-white/70">
              Le llega un aviso al otro celular. Es temporal: cuando la lea y la cierre, se borra
              para siempre.
            </p>
            {/* Post-it morado: solo se escribe lo que cabe dentro del cuadro. */}
            <div className="mg-postit mx-auto">
              {(() => {
                const S = sello(emojiNota).Icono;
                return (
                  <span key={emojiNota} className="mg-postit-sello" aria-hidden="true">
                    <S strokeWidth={2.2} />
                  </span>
                );
              })()}
              <textarea
                autoFocus
                value={textoNota}
                onChange={(e) => {
                  const el = e.target;
                  const valor = el.value.slice(0, NOTA_MAX);
                  // Si el texto nuevo ya no cabe en el cuadro, no se acepta.
                  if (valor.length > textoNota.length && el.scrollHeight > el.clientHeight + 1) {
                    el.value = textoNota;
                    setNotaLlena(true);
                    return;
                  }
                  setNotaLlena(false);
                  setTextoNota(valor);
                }}
                maxLength={NOTA_MAX}
                placeholder="Escribe algo bonito…"
                aria-label="Texto de la nota"
                className="mg-postit-texto"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div
                className="flex gap-0.5 sm:gap-1"
                role="radiogroup"
                aria-label="Sello de la nota"
              >
                {Object.entries(SELLOS).map(([id, { nombre: nombreSello, Icono }]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={emojiNota === id}
                    aria-label={`Sello: ${nombreSello}`}
                    title={nombreSello}
                    onClick={() => {
                      setEmojiNota(id);
                      sonar("caricia");
                    }}
                    className={`mg-sello-opcion grid h-9 w-9 place-items-center rounded-full ${
                      emojiNota === id ? "activo" : ""
                    }`}
                  >
                    <Icono size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <span
                className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-pink-200"
                aria-live="polite"
              >
                {notaLlena ? "Nota llena" : ""}
              </span>
            </div>
            <button
              type="submit"
              disabled={!textoNota.trim()}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-400 to-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-45"
            >
              <Send size={16} />
              {`Que ${nombre} la lleve`}
            </button>
          </form>
        </div>
      )}

      {/* Leer una nota recibida: al cerrarla se borra. */}
      {notaAbierta && (
        <div
          className="mg-panel-fondo fixed inset-0 z-[66] flex justify-center overflow-y-auto bg-black/65 px-5 pb-5 pt-[calc(env(safe-area-inset-top)+104px)] backdrop-blur-sm sm:pt-[calc(env(safe-area-inset-top)+124px)]"
          onClick={cerrarNotaAbierta}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nota recibida"
            onClick={(e) => e.stopPropagation()}
            className="mg-nota-abre my-auto h-fit w-full max-w-sm"
          >
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.18em] text-white/80">
              {nombre} te trajo esta nota
            </p>
            <div className="mg-postit mx-auto">
              {(() => {
                const S = sello(notaAbierta.emoji).Icono;
                return (
                  <span className="mg-postit-sello" aria-hidden="true">
                    <S strokeWidth={2.2} />
                  </span>
                );
              })()}
              <p className="mg-postit-texto">{notaAbierta.texto}</p>
            </div>
            <p className="mt-3 text-center text-[11px] text-white/60">
              {new Date(notaAbierta.createdAt).toLocaleString("es-ES", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <button
              type="button"
              autoFocus
              onClick={cerrarNotaAbierta}
              className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-white/90 px-5 py-2.5 text-sm font-bold text-[#3a260f] shadow-lg transition hover:bg-white"
            >
              <Check size={16} /> Ya la leí · cerrar y borrar
            </button>
          </div>
        </div>
      )}

      {/* Panel de logros */}
      {panelLogros && (
        <div
          className="mg-panel-fondo fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPanelLogros(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Logros"
            onClick={(e) => e.stopPropagation()}
            className="mg-panel mg-vidrio-oscuro flex max-h-[82svh] w-full max-w-sm flex-col overflow-hidden rounded-3xl text-white"
          >
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <div>
                <p className="flex items-center gap-2 text-lg font-bold leading-tight">
                  <Trophy size={18} className="text-amber-200" /> Logros
                </p>
                <p className="text-xs text-white/70">
                  {progreso.logros.length} de {LOGROS.length} · Racha {racha} · Mejor{" "}
                  {progreso.mejorRacha}
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setPanelLogros(false)}
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-3">
              {LOGROS.map((l) => {
                const hecho = progreso.logros.includes(l.id);
                const v = Math.min(l.meta, l.valor(progreso, bienestar));
                return (
                  <li
                    key={l.id}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                      hecho ? "bg-white/[0.16]" : "bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-2xl ${
                        hecho ? "mg-insignia" : "mg-insignia-bloqueada"
                      }`}
                      aria-hidden="true"
                    >
                      {l.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-bold">
                        {l.titulo}
                        {hecho && <Check size={14} className="text-emerald-300" />}
                      </p>
                      <p className="text-[11px] text-white/70">{hecho ? l.mensaje : l.desc}</p>
                      {!hecho && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                            <div
                              className="h-full rounded-full bg-amber-300"
                              style={{ width: `${(v / l.meta) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-white/65">
                            {v}/{l.meta}
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-white/15 px-4 py-3">
              <button
                type="button"
                onClick={() => void alternarAvisos()}
                aria-pressed={avisos}
                className="flex w-full items-center gap-3 rounded-2xl bg-white/10 px-3 py-2.5 text-left transition hover:bg-white/15"
              >
                {avisos ? <Bell size={18} /> : <BellOff size={18} className="opacity-70" />}
                <span className="flex-1 text-sm font-semibold">
                  Avisarme cuando {nombre} me necesite
                </span>
                <span className={`mg-switch ${avisos ? "encendido" : ""}`} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logro desbloqueado */}
      {celebrando && (
        <div
          className="mg-panel-fondo fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-6"
          onClick={() => setCola((c) => c.slice(1))}
          role="alertdialog"
          aria-label={`Logro desbloqueado: ${celebrando.titulo}`}
        >
          <div
            key={celebrando.id}
            className="mg-celebra mg-vidrio-oscuro w-full max-w-[300px] rounded-3xl px-6 py-6 text-center text-white"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
              ¡Logro desbloqueado!
            </p>
            <div className="mg-celebra-emoji mx-auto my-3 grid h-20 w-20 place-items-center rounded-full text-5xl">
              {celebrando.emoji}
            </div>
            <p className="text-xl font-bold">{celebrando.titulo}</p>
            <p className="mt-2 text-sm text-white/90">“{celebrando.mensaje}”</p>
            <p className="mt-1 text-xs text-white/65">— {nombre}</p>
            <p className="mt-4 text-[11px] text-white/55">Toca para continuar</p>
          </div>
        </div>
      )}
    </section>
  );
}

const CSS = `
.mg-raiz { text-shadow: 0 1px 2px rgba(0,0,0,0.35); touch-action: manipulation; }
.mg-contenido { transition: opacity 0.5s ease; }

.mg-vidrio {
  background: rgba(255,255,255,0.14);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,0.28);
  box-shadow: 0 10px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.22);
}
.mg-vidrio-fuerte {
  background: rgba(255,255,255,0.22);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.4);
  box-shadow: 0 8px 24px rgba(0,0,0,0.22);
}
.mg-vidrio-oscuro {
  background: rgba(22,26,52,0.82);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255,255,255,0.22);
  box-shadow: 0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15);
}
.mg-stats {
  text-shadow: 0 2px 5px rgba(0,0,0,0.62);
}
.mg-pastilla { background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22); }

/* Escena */
.mg-escena { container-type: size; overflow: hidden; }
.mg-lienzo { position: absolute; left: 50%; bottom: 0; translate: -50% 0; }
.mg-fondo { transition: opacity 0.7s ease; }
.mg-desenfoque { filter: blur(22px) brightness(0.5) saturate(1.2); transform: scale(1.15); }
.mg-kb { animation: mg-kb 34s ease-in-out infinite alternate; transform-origin: 50% 100%; }
.mg-overlay { transition: background-color 1.2s ease; }
.mg-vineta { background: radial-gradient(ellipse at 50% 40%, transparent 50%, rgba(0,0,0,0.35) 100%); }
.mg-fundido { background: linear-gradient(to bottom, transparent, rgba(10,12,32,0.55)); }
.mg-escena::before {
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  height: 18%;
  pointer-events: none;
  content: "";
  background: linear-gradient(to bottom, rgba(8,12,26,0.14), transparent);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
}
.mg-valor {
  display: inline-block;
  animation: mg-valor-cambio 0.5s ease both;
}
.mg-mota {
  width: 4px; height: 4px; opacity: 0;
  background: rgba(255,255,255,0.9);
  box-shadow: 0 0 8px 2px rgba(255,255,255,0.55);
  animation: mg-mota 12s ease-in-out infinite;
}
.patio .mg-mota { background: rgba(255,236,170,0.95); box-shadow: 0 0 8px 2px rgba(255,214,120,0.6); }

/* Snoopy apoyado en el piso: el ancla es el punto bajo sus patas. */
.mg-ancla {
  translate: -50% -100%;
  transition: left 0.6s ease, top 0.6s ease, width 0.6s ease;
  -webkit-tap-highlight-color: transparent;
}
/* Sombra de contacto en dos capas: núcleo oscuro bajo las patas y penumbra
   amplia y suave. Se encoge cuando Snoopy se despega del piso. */
.mg-sombra {
  translate: -50% 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 32%, rgba(0,0,0,0) 70%);
}
.mg-sombra::after {
  content: ""; position: absolute; inset: -70% -28%; border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(12,10,40,0.26), rgba(12,10,40,0) 68%);
}
/* Cambio de pose: se asienta con un leve aplastar y estirar, sin saltos bruscos. */
.mg-pop { animation: mg-asentar 0.55s cubic-bezier(.22,1,.36,1) both; transform-origin: 50% 100%; }

/* Curvas tipo seno (ease-in-out suave) para todo lo que respira o se mece. */
.mg-respirar { animation: mg-respirar 3.8s cubic-bezier(.45,.05,.55,.95) infinite; transform-origin: 50% 100%; }
.mg-bounce { animation: mg-bounce 0.62s linear infinite; transform-origin: 50% 100%; }
.mg-wiggle { animation: mg-wiggle 0.95s cubic-bezier(.45,.05,.55,.95) infinite; transform-origin: 50% 100%; }
.mg-breathe { animation: mg-breathe 4.6s cubic-bezier(.45,.05,.55,.95) infinite; transform-origin: 50% 100%; }
.mg-shake { animation: mg-suspiro 3.4s cubic-bezier(.45,.05,.55,.95) infinite; transform-origin: 50% 100%; }
.mg-walk { animation: mg-walk 0.42s linear infinite; transform-origin: 50% 100%; }
.mg-tilt { animation: mg-tilt 2.8s cubic-bezier(.45,.05,.55,.95) infinite; transform-origin: 50% 100%; }
.mg-entregar { animation: mg-entregar 0.9s linear 2 both; transform-origin: 50% 100%; }
.mg-sombra-respira { animation: mg-sombra-respira 3.8s cubic-bezier(.45,.05,.55,.95) infinite; }
.mg-sombra-camina { animation: mg-sombra-camina 0.42s linear infinite; }
.mg-sombra-salta { animation: mg-sombra-salta 0.62s linear infinite; }

/* Paseo: se aleja hacia el fondo o llega caminando, con aceleración natural */
.mg-irse { animation: mg-irse 1.9s cubic-bezier(.55,0,.45,1) both; }
.mg-llegar { animation: mg-llegar 1.9s cubic-bezier(.22,1,.36,1) both; }

/* Partículas y mensajes */
.mg-toast { animation: mg-toast 0.35s cubic-bezier(.2,.9,.3,1.3) both; }
.mg-globo { animation: mg-popIn 0.35s ease both; }
.mg-carta-aviso {
  animation: mg-carta-aviso 0.55s cubic-bezier(.2,.9,.3,1.2) both;
  transform-origin: 50% 100%;
}
.mg-nota-aviso { animation: mg-carta-aviso 0.6s cubic-bezier(.2,.9,.3,1.2) both; transform-origin: 50% 100%; }
.mg-aviso-nota { animation: mg-aviso-entra 0.45s cubic-bezier(.2,.9,.3,1.2) both; transform-origin: 100% 50%; }
.mg-aviso-punto { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: #fb7185; box-shadow: 0 0 0 3px rgba(251,113,133,0.25); }
.mg-aviso-nota.envio .mg-aviso-punto { background: #f9a8d4; animation: mg-parpadeo 1s ease-in-out infinite; }
.mg-aviso-nota.ok .mg-aviso-punto { background: #7dd3fc; box-shadow: 0 0 0 3px rgba(125,211,252,0.25); }
.mg-aviso-nota.leida .mg-aviso-punto { background: #f0abfc; box-shadow: 0 0 0 3px rgba(240,171,252,0.3); }
.mg-aviso-nota.error .mg-aviso-punto { background: #fcd34d; box-shadow: 0 0 0 3px rgba(252,211,77,0.25); }
@keyframes mg-aviso-entra {
  0% { opacity: 0; transform: translateX(14px) scale(0.85); }
  100% { opacity: 1; transform: none; }
}
.mg-racha-badge.encendida { background: linear-gradient(180deg, #fb923c, #ea580c); box-shadow: 0 0 0 2px rgba(15,19,40,0.6), 0 0 10px rgba(249,115,22,0.6); }
.mg-racha-badge.tibia { background: rgba(124,45,18,0.9); box-shadow: 0 0 0 2px rgba(15,19,40,0.6); color: #fed7aa; }
.mg-nota-badge { animation: mg-latido-badge 1.6s ease-in-out infinite; box-shadow: 0 0 0 2px rgba(15,19,40,0.6); }
@keyframes mg-latido-badge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
.mg-nota-flota { animation: mg-nota-flota 3.2s cubic-bezier(.45,.05,.55,.95) 0.6s infinite; }
.mg-sobre-vuela { translate: -50% 0; animation: mg-sobre-vuela 1.6s cubic-bezier(.5,0,.75,0) both; }
.mg-nota-abre { animation: mg-nota-abre 0.5s cubic-bezier(.22,1,.36,1) both; }
/* Post-it rojo translúcido, como vidrio teñido. Todo se mide en cqw (ancho del
   cuadro): la letra y el margen (~0,5 cm) quedan iguales en cualquier celular,
   así lo que cupo al escribir cabe exacto al leer. */
.mg-postit {
  position: relative;
  container-type: inline-size;
  width: min(78vw, 300px);
  aspect-ratio: 1;
  border-radius: 3px;
  background:
    linear-gradient(to bottom, rgba(255,228,230,0.22) 0 12.5%, rgba(255,228,230,0) 13.5%),
    radial-gradient(120% 90% at 18% 0%, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%),
    linear-gradient(155deg, rgba(251,113,133,0.62), rgba(225,29,72,0.52) 62%, rgba(159,18,57,0.6));
  -webkit-backdrop-filter: blur(12px) saturate(1.3);
  backdrop-filter: blur(12px) saturate(1.3);
  border: 1px solid rgba(255,205,210,0.4);
  box-shadow:
    0 24px 36px -16px rgba(60,5,20,0.8),
    0 2px 6px rgba(60,5,20,0.3),
    inset 0 1px 0 rgba(255,255,255,0.35),
    inset 0 -18px 30px -18px rgba(80,0,20,0.45);
  rotate: -1.2deg;
}
.mg-postit-texto {
  position: absolute; inset: 0; margin: 0; display: block;
  width: 100%; height: 100%;
  padding: 7.5cqw 6.5cqw 6.5cqw;
  font-family: "Patrick Hand", cursive;
  font-size: 7cqw; line-height: 1.38;
  color: #fff;
  text-shadow: 0 1px 2px rgba(40,10,80,0.5);
  background: transparent; border: 0; outline: none; resize: none;
  overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere;
  caret-color: #fbcfe8;
}
.mg-postit-texto::placeholder { color: rgba(255,255,255,0.6); }
p.mg-postit-texto { overflow-y: auto; }
/* Sello de cera rojo con el ícono elegido. */
.mg-postit-sello {
  position: absolute; left: 50%; top: 0; translate: -50% -55%; z-index: 1;
  display: grid; place-items: center; width: 13cqw; height: 13cqw;
  border-radius: 999px; color: #fff1f2;
  background: radial-gradient(circle at 35% 30%, #fb7185, #e11d48 55%, #9f1239);
  box-shadow: 0 6px 14px rgba(60,5,20,0.45), inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(80,0,20,0.5);
  animation: mg-sello-pone 0.45s cubic-bezier(.2,.9,.3,1.3) both;
}
.mg-postit-sello > svg { width: 55%; height: 55%; filter: drop-shadow(0 1px 1px rgba(80,0,20,0.5)); }
@keyframes mg-sello-pone {
  0% { opacity: 0; transform: scale(1.8) rotate(-25deg); }
  60% { opacity: 1; transform: scale(0.92) rotate(4deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
}
.mg-sello-opcion {
  color: rgba(255,255,255,0.75);
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  transition: transform 0.2s cubic-bezier(.2,.9,.3,1.3), background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}
.mg-sello-opcion:hover { background: rgba(255,255,255,0.14); color: #fff; }
.mg-sello-opcion:active { transform: scale(0.9); }
.mg-sello-opcion.activo {
  color: #fff;
  background: radial-gradient(circle at 35% 30%, #fb7185, #e11d48 60%, #9f1239);
  border-color: rgba(255,205,210,0.7);
  box-shadow: 0 4px 12px rgba(225,29,72,0.5);
  transform: scale(1.08);
}

/* Barras */
.mg-barra { transition: width 0.7s cubic-bezier(.22,1,.36,1), background-color 0.5s ease, box-shadow 0.5s ease; }
.mg-barra-baja { animation: mg-parpadeo 1.4s ease-in-out infinite; }

/* Botones */
.mg-boton { transition: transform 0.22s cubic-bezier(.2,.9,.3,1.2), box-shadow 0.22s ease, background-color 0.22s ease, opacity 0.25s ease; }
.mg-boton-transparente {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 9999px;
  box-shadow: 0 8px 22px rgba(0,0,0,0.12);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
@media (hover: hover) {
  .mg-boton:not(:disabled):hover {
    transform: translateY(-4px) scale(1.06);
    background: rgba(255,255,255,0.22);
    box-shadow: 0 16px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.3);
  }
  .mg-boton:not(:disabled):hover span { color: rgba(255,255,255,0.9); }
}
.mg-boton:not(:disabled):active { transform: scale(0.97); }
.mg-boton:disabled { cursor: not-allowed; opacity: 0.45; }
.mg-boton.mg-boton-activo { opacity: 1; background: rgba(255,255,255,0.24); }
.mg-boton-transparente.mg-boton-activo { background: rgba(255,255,255,0.1); }
.mg-boton-cargando::before {
  content: "";
  position: absolute;
  inset: -4px;
  z-index: 0;
  border-radius: inherit;
  background: conic-gradient(from 0deg, transparent 0 18%, rgba(255,255,255,0.98) 30%, #67e8f9 42%, transparent 58% 100%);
  filter: drop-shadow(0 0 5px rgba(103,232,249,0.95)) drop-shadow(0 0 10px rgba(255,255,255,0.65));
  padding: 3px;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: mg-carga 1.05s linear infinite;
}
.mg-boton > svg { position: relative; z-index: 1; }
.mg-boton:focus-visible { outline: 2px solid rgba(255,255,255,0.9); outline-offset: 2px; }
.mg-boton-necesita { animation: mg-necesita 1.6s ease-in-out infinite; }
.mg-lampara-on { color: #fde68a; filter: drop-shadow(0 0 6px rgba(253,230,138,0.85)); }
.mg-progreso { width: 0; animation: mg-progreso linear both; }
.mg-redondo { transition: transform 0.2s ease, opacity 0.2s ease; }
.mg-redondo:not(:disabled):hover { transform: scale(1.08); }
.mg-mic-activo { background: #f43f5e; border: 1px solid rgba(255,255,255,0.5); animation: mg-latido 1.3s ease-in-out infinite; }

/* Logros */
.mg-panel-fondo { animation: mg-aparecer 0.2s ease both; }
.mg-panel { animation: mg-popIn 0.3s cubic-bezier(.2,.9,.3,1.2) both; }
.mg-insignia { background: radial-gradient(circle, rgba(253,224,71,0.45), rgba(253,224,71,0.08)); box-shadow: 0 0 0 1px rgba(253,224,71,0.6), 0 0 16px rgba(253,224,71,0.35); }
.mg-insignia-bloqueada { background: rgba(255,255,255,0.08); filter: grayscale(1); opacity: 0.55; }
.mg-celebra { animation: mg-popIn 0.45s cubic-bezier(.2,.9,.3,1.4) both; }
.mg-celebra-emoji {
  background: radial-gradient(circle, rgba(253,224,71,0.5), rgba(253,224,71,0.05) 70%);
  box-shadow: 0 0 0 2px rgba(253,224,71,0.7), 0 0 34px rgba(253,224,71,0.55);
  animation: mg-brillo 1.6s ease-in-out infinite;
}
/* Columna de botones a la izquierda, a la misma altura que el clima (derecha). */
.mg-columna {
  left: max(12px, calc(50% - 250px));
  top: calc(env(safe-area-inset-top) + 260px);
}
@media (min-width: 640px) { .mg-columna { top: calc(env(safe-area-inset-top) + 286px); } }
/* Mensajes angostos para no chocar con la columna; si no caben, bajan de línea. */
.mg-mensaje { width: max-content; max-width: min(300px, calc(100vw - 170px)); }

.mg-switch {
  position: relative; width: 38px; height: 22px; border-radius: 999px;
  background: rgba(255,255,255,0.25); transition: background-color 0.2s ease; flex-shrink: 0;
}
.mg-switch::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
  border-radius: 999px; background: #fff; transition: transform 0.2s ease;
}
.mg-switch.encendido { background: #34d399; }
.mg-switch.encendido::after { transform: translateX(16px); }

/* Respirar: el pecho sube y el cuerpo se estira apenas (volumen, no "zoom"). */
@keyframes mg-respirar {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  45% { transform: translateY(-0.25%) scale(1.008, 1.02); }
}
@keyframes mg-sombra-respira { 0%, 100% { transform: scale(1); opacity: 1; } 45% { transform: scale(1.03); opacity: 0.92; } }
/* Comer: anticipación (se agacha), impulso, caída y amortiguación. */
@keyframes mg-bounce {
  0%, 100% { transform: translateY(0) scale(1, 1); animation-timing-function: cubic-bezier(.33,0,.67,1); }
  22% { transform: translateY(0) scale(1.035, 0.95); animation-timing-function: cubic-bezier(.2,.7,.35,1); }
  55% { transform: translateY(-4%) scale(0.985, 1.025); animation-timing-function: cubic-bezier(.6,0,.85,.4); }
  82% { transform: translateY(0) scale(1.025, 0.97); animation-timing-function: cubic-bezier(.33,0,.67,1); }
}
@keyframes mg-sombra-salta {
  0%, 22%, 100% { transform: scale(1); opacity: 1; animation-timing-function: cubic-bezier(.2,.7,.35,1); }
  55% { transform: scale(0.84); opacity: 0.7; animation-timing-function: cubic-bezier(.6,0,.85,.4); }
  82% { transform: scale(1.03); opacity: 1; }
}
/* Baño: se sacude el agua como un perro de verdad, con fuerza que se va apagando. */
@keyframes mg-wiggle {
  0%, 100% { transform: rotate(0) translateX(0); }
  12% { transform: rotate(-5deg) translateX(-1%); }
  28% { transform: rotate(4.5deg) translateX(1%); }
  44% { transform: rotate(-3.2deg) translateX(-0.6%); }
  60% { transform: rotate(2deg) translateX(0.4%); }
  76% { transform: rotate(-0.9deg); }
  88% { transform: rotate(0.3deg); }
}
/* Dormir: respiración lenta y profunda. */
@keyframes mg-breathe {
  0%, 100% { transform: scale(1, 1); }
  40%, 55% { transform: scale(1.012, 1.03); }
}
/* Triste: suspira, se hunde un poco y se mece despacio (antes temblaba). */
@keyframes mg-suspiro {
  0%, 100% { transform: translateY(0) rotate(0) scale(1, 1); }
  30% { transform: translateY(0.6%) rotate(-1.2deg) scale(1.01, 0.985); }
  62% { transform: translateY(1%) rotate(0.8deg) scale(0.996, 0.975); }
}
/* Caminar: rebote con contacto firme en cada paso (en sincronía con las patas). */
@keyframes mg-walk {
  0%, 100% { transform: translateY(0) rotate(-1.4deg) scale(1.012, 0.99); animation-timing-function: cubic-bezier(.2,.6,.4,1); }
  50% { transform: translateY(-2.6%) rotate(1.4deg) scale(0.996, 1.01); animation-timing-function: cubic-bezier(.6,0,.8,.4); }
}
@keyframes mg-sombra-camina {
  0%, 100% { transform: scale(1); opacity: 1; animation-timing-function: cubic-bezier(.2,.6,.4,1); }
  50% { transform: scale(0.9); opacity: 0.78; animation-timing-function: cubic-bezier(.6,0,.8,.4); }
}
/* Escuchar: ladea la cabeza, se queda un momento atento y vuelve. */
@keyframes mg-tilt {
  0%, 100% { transform: rotate(-3deg); }
  38%, 58% { transform: rotate(3.5deg) translateY(-0.4%); }
}
/* Entregar una nota: pequeño salto contento. */
@keyframes mg-entregar {
  0%, 100% { transform: none; animation-timing-function: cubic-bezier(.33,0,.67,1); }
  18% { transform: scale(1.04, 0.94); animation-timing-function: cubic-bezier(.2,.7,.35,1); }
  45% { transform: translateY(-6%) rotate(-2.5deg) scale(0.97, 1.04); animation-timing-function: cubic-bezier(.6,0,.85,.4); }
  68% { transform: translateY(0) scale(1.03, 0.97); animation-timing-function: cubic-bezier(.33,0,.67,1); }
  84% { transform: scale(0.995, 1.008); }
}
@keyframes mg-irse {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  65% { transform: translateY(-12%) scale(0.6); opacity: 0; }
  100% { transform: translateY(-12%) scale(0.6); opacity: 0; }
}
@keyframes mg-llegar {
  0% { transform: translateX(-70%) scale(0.92); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: translateX(0) scale(1); opacity: 1; }
}
@keyframes mg-asentar {
  0% { opacity: 0.35; transform: translateY(1.5%) scale(0.97, 0.95); }
  38% { opacity: 1; transform: translateY(0) scale(1.015, 0.985); }
  68% { transform: scale(0.996, 1.008); }
  100% { opacity: 1; transform: none; }
}
@keyframes mg-nota-flota {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-6%) rotate(2deg); }
}
@keyframes mg-sobre-vuela {
  0% { transform: translate(0, 0) rotate(0) scale(0.6); opacity: 0; }
  12% { transform: translate(0, -10px) rotate(-6deg) scale(1); opacity: 1; }
  100% { transform: translate(55vw, -70vh) rotate(28deg) scale(0.45); opacity: 0; }
}
@keyframes mg-nota-abre {
  0% { opacity: 0; transform: translateY(24px) rotate(-4deg) scale(0.9); }
  100% { opacity: 1; transform: none; }
}
@keyframes mg-popIn {
  0% { transform: scale(0.8); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes mg-carta-aviso {
  0% { opacity: 0; transform: translateY(18px) rotate(-8deg) scale(0.72); }
  70% { opacity: 1; transform: translateY(-4px) rotate(-2deg) scale(1.05); }
  100% { opacity: 1; transform: translateY(0) rotate(-3deg) scale(1); }
}
@keyframes mg-toast {
  0% { transform: translateY(8px) scale(0.8); opacity: 0; }
  60% { transform: translateY(-2px) scale(1.06); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes mg-kb { from { transform: scale(1.02); } to { transform: scale(1.07); } }
@keyframes mg-mota {
  0% { transform: translate(0, 0); opacity: 0; }
  20% { opacity: 0.85; }
  80% { opacity: 0.6; }
  100% { transform: translate(18px, -90px); opacity: 0; }
}
@keyframes mg-parpadeo { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes mg-progreso { from { width: 0; } to { width: 100%; } }
@keyframes mg-carga { to { transform: rotate(360deg); } }
@keyframes mg-necesita {
  0%, 100% { box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 0 0 0 rgba(255,255,255,0.0); }
  50% { box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 0 0 2px rgba(255,255,255,0.5); }
}
@keyframes mg-valor-cambio {
  0% { opacity: 0.55; transform: translateY(2px) scale(0.96); }
  60% { opacity: 1; transform: translateY(-1px) scale(1.08); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes mg-latido { 0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.6); } 50% { box-shadow: 0 0 0 10px rgba(244,63,94,0); } }
@keyframes mg-aparecer { from { opacity: 0; } to { opacity: 1; } }
@keyframes mg-brillo { 0%, 100% { transform: scale(1) rotate(-4deg); } 50% { transform: scale(1.08) rotate(4deg); } }

@media (prefers-reduced-motion: reduce) {
  .mg-kb, .mg-mota, .mg-respirar, .mg-breathe, .mg-tilt, .mg-shake, .mg-wiggle, .mg-bounce, .mg-walk,
  .mg-entregar, .mg-sombra-respira, .mg-sombra-camina, .mg-sombra-salta, .mg-nota-flota, .mg-barra-baja, .mg-boton-necesita, .mg-mic-activo,
  .mg-celebra-emoji, .mg-boton-cargando::before { animation: none; }
  .mg-pop, .mg-toast, .mg-panel, .mg-celebra, .mg-nota-abre, .mg-sobre-vuela { animation-duration: 0.01s; }
}
`;
