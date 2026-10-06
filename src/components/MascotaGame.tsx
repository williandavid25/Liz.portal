import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Bath,
  Bell,
  BellOff,
  Bone,
  Check,
  Droplets,
  Drumstick,
  Flame,
  HeartPulse,
  House,
  Lamp,
  Mic,
  MicOff,
  Moon,
  Pencil,
  Smile,
  Sun,
  Trees,
  Trophy,
  Volume2,
  VolumeX,
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
import { SNOOPY_CSS, SnoopyVivo, imgPose, type Pose } from "@/components/SnoopyVivo";
import { Snoopy3D } from "@/components/Snoopy3D";
import { WeatherPanel } from "@/components/WeatherPanel";

// Mascota virtual tipo Tamagotchi. Snoopy vive "dentro" del fondo: se ubica en
// coordenadas de la imagen (sobre la cama o el pasto), así siempre toca el piso
// sin importar el tamaño de pantalla. Los controles van en su propia franja.

type StatKey = "hambre" | "felicidad" | "higiene" | "energia";
type Stats = Record<StatKey, number>;
type Escena = "dormitorio" | "patio";
type TipoAccion = "alimentar" | "banar" | "dormir" | "pasear";
type Anim = "respirar" | "bounce" | "wiggle" | "breathe" | "shake" | "walk" | "tilt";
type Orientacion = "v" | "h";

interface Accion {
  tipo: Exclude<TipoAccion, "dormir">;
  pose: Pose;
  anim: Anim;
  dur: number;
  /** Desplazamiento de toda la mascota (al salir o volver del paseo). */
  mover?: "irse" | "llegar";
}

interface Particula {
  id: number;
  emoji: string;
  x: number;
  delay: number;
  size: number;
  dx: number;
  rot: number;
}

interface Guardado {
  version?: number;
  stats?: Partial<Stats>;
  escena?: Escena;
  ts?: number;
  nombre?: string;
  progreso?: Partial<Progreso>;
  sonido?: boolean;
  avisos?: boolean;
  dormido?: boolean;
}

/** Punto de apoyo en la imagen: x, y (fracciones) y lado del cuadro de Snoopy. */
interface Ancla {
  x: number;
  y: number;
  s: number;
}

const KEY = "liz-mascota-juego";
const GUARDADO_VERSION = 2;
const DECAY_MS = 5 * 60_000;
const UMBRAL_TRISTE = 20;
/** Con la app cerrada baja más lento, pero sí puede llegar a ponerse triste. */
const OFFLINE_POR_HORA = 3;
const OFFLINE_MAX = 85;
const INICIAL: Stats = { hambre: 80, felicidad: 85, higiene: 75, energia: 80 };
const COMIDAS = [
  { hora: 8, nombre: "desayuno" },
  { hora: 13, nombre: "almuerzo" },
  { hora: 19, nombre: "merienda" },
] as const;
/** Alto de la franja de controles. */
const PANEL = "calc(206px + env(safe-area-inset-bottom))";

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

/** De día arranca en el patio y de noche en el dormitorio. */
const escenaPorHora = (): Escena => {
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "patio" : "dormitorio";
};

const esHorarioDescanso = (hora = new Date().getHours()) => hora >= 19 || hora < 7;

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
    particulas: string[];
    frases: string[];
    sonido: Sonido;
  }
> = {
  alimentar: {
    pose: "comiendo",
    anim: "bounce",
    dur: 2600,
    delta: { hambre: 30, felicidad: 8 },
    particulas: ["🍖", "🦴", "✨", "⭐", "🍗"],
    frases: ["¡Qué rico! 😋", "¡Ñam, ñam! 🍖", "¡Mi favorito! 🦴"],
    sonido: "comer",
  },
  banar: {
    pose: "banando",
    anim: "wiggle",
    dur: 2800,
    delta: { higiene: 30, felicidad: 8 },
    particulas: ["💧", "🫧", "💦"],
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
};

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
const baja = () => 5 + Math.round(Math.random()); // 5 o 6 puntos

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

export function MascotaGame() {
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
  const [mirada, setMirada] = useState<"mira-derecha" | "mira-izquierda" | null>(null);
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

  const raizRef = useRef<HTMLElement>(null);
  const idRef = useRef(0);
  const timers = useRef(new Set<number>());
  const vozRef = useRef<VozMascota | null>(null);
  const bocaRef = useRef<HTMLDivElement>(null);
  const ultimaCaricia = useRef(0);
  const durmiendoRef = useRef(false);
  const descansoAutomaticoRef = useRef(false);
  const ultimaAlertaRef = useRef<Partial<Record<"hambre" | "sueno", number>>>({});
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
      setToast({ id, texto });
      programar(() => setToast((t) => (t?.id === id ? null : t)), ms);
    },
    [programar],
  );

  const sonar = useCallback((s: Sonido) => {
    if (sonidoRef.current && interactuo.current) reproducir(s);
  }, []);

  const lanzar = useCallback(
    (emojis: readonly string[], n = 10) => {
      const nuevas: Particula[] = Array.from({ length: n }, () => ({
        id: ++idRef.current,
        emoji: elegir(emojis),
        x: 14 + Math.random() * 72,
        delay: Math.random() * 0.55,
        size: 18 + Math.random() * 14,
        dx: (Math.random() - 0.5) * 70,
        rot: (Math.random() - 0.5) * 60,
      }));
      setParticulas((p) => [...p, ...nuevas]);
      const ids = new Set(nuevas.map((p) => p.id));
      programar(() => setParticulas((p) => p.filter((q) => !ids.has(q.id))), 3200);
    },
    [programar],
  );

  const registrar = useCallback((k: keyof Contadores) => {
    setProgreso((p) => registrarCuidado(p, k));
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
    let perdida = 0;
    let volvio = false;
    try {
      const raw = localStorage.getItem(KEY);
      const g: Guardado = raw ? (JSON.parse(raw) as Guardado) : {};
      volvio = !!raw;
      const ahora = Date.now();
      if (g.ts) perdida = Math.min(OFFLINE_MAX, ((ahora - g.ts) / 3_600_000) * OFFLINE_POR_HORA);
      setStats(
        aplicar(
          { ...INICIAL, ...g.stats },
          { hambre: -perdida, felicidad: -perdida, higiene: -perdida, energia: -perdida },
        ),
      );
      // Si volvió hace poco sigue donde estaba; si no, el escenario va con la hora.
      const reciente = g.ts && ahora - g.ts < 20 * 60_000;
      setEscena(
        reciente && (g.escena === "patio" || g.escena === "dormitorio")
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
      if (typeof g.dormido === "boolean") {
        setDormido(g.dormido);
        descansoAutomaticoRef.current = g.dormido && esHorarioDescanso();
      } else if (!reciente && esHorarioDescanso()) {
        setDormido(true);
        descansoAutomaticoRef.current = true;
      }
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
    if (perdida >= 30) decir("¡Te extrañé mucho! 🥺", 3200);
    else if (volvio) decir("¡Hola de nuevo! 💛", 2600);
    else decir("¡Hola! Cuídame mucho 🐶", 2800);
    // Precarga de poses: sin parpadeo blanco al cambiar de estado.
    for (const p of POSES) {
      const i = new Image();
      i.decoding = "async";
      i.src = imgPose(p);
    }
  }, [decir]);

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

  useEffect(() => {
    const id = window.setInterval(() => {
      setStats((s) => ({
        hambre: clamp(s.hambre - baja()),
        felicidad: clamp(s.felicidad - baja()),
        higiene: clamp(s.higiene - baja()),
        energia: durmiendoRef.current ? clamp(s.energia + 1) : clamp(s.energia - baja()),
      }));
    }, DECAY_MS);
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

  const raf = useRef(0);
  const mirar = (e: React.PointerEvent) => {
    const el = raizRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${(x * 26).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
      el.style.setProperty("--hx", `${(x * 2).toFixed(2)}%`);
      el.style.setProperty("--hy", `${(y * 1.4).toFixed(2)}%`);
    });
  };
  const soltarMirada = () => {
    const el = raizRef.current;
    if (!el) return;
    for (const v of ["--ry", "--rx", "--hx", "--hy"]) el.style.removeProperty(v);
  };

  /* ---------------- Estado visible ---------------- */

  const masBaja = STATS.reduce((a, b) => (stats[b.key] < stats[a.key] ? b : a)).key;
  const necesitada = stats[masBaja] < UMBRAL_TRISTE;
  const escuchando = oido !== "inactivo";
  const ocupada = accion !== null || escuchando || dormido;
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
  } else if (escuchando) {
    anim = "tilt";
  } else if (necesitada) {
    pose = "triste";
    anim = "shake";
  } else if (mirada) {
    pose = mirada;
  }
  const animo = pose === "triste" ? "triste" : bienestar > 70 ? "feliz" : "normal";

  // Mantiene un ciclo diario amable: actividad de 7:00 a 19:00 y descanso
  // nocturno de 12 horas, sin forzar a despertar un descanso manual.
  useEffect(() => {
    if (!listo) return;
    const revisarHorario = () => {
      const debeDormir = esHorarioDescanso();
      if (debeDormir && !durmiendoRef.current && !accion && !escuchando) {
        descansoAutomaticoRef.current = true;
        setEscena("dormitorio");
        setDormido(true);
        decir("Es hora de descansar… 🌙", 2600);
        sonar("aviso-sueno");
      } else if (!debeDormir && durmiendoRef.current && descansoAutomaticoRef.current) {
        descansoAutomaticoRef.current = false;
        setDormido(false);
        decir("¡Buenos días! ☀️", 2400);
        sonar("despertar");
      }
    };
    revisarHorario();
    const id = window.setInterval(revisarHorario, 60_000);
    return () => window.clearInterval(id);
  }, [listo, accion, escuchando, decir, sonar]);

  // Avisa una vez al ponerse triste (y al celular si la app está de fondo).
  const avisoTriste = useRef(false);
  useEffect(() => {
    if (!listo) return;
    if (accion || dormido) return;
    const ahora = Date.now();
    const alertar = (tipo: "hambre" | "sueno", texto: string, sonidoAviso: Sonido) => {
      const ultima = ultimaAlertaRef.current[tipo] ?? 0;
      if (ahora - ultima < 4 * 60 * 60_000) return;
      ultimaAlertaRef.current[tipo] = ahora;
      decir(texto, 3200);
      sonar(sonidoAviso);
      avisar(texto);
    };
    if (stats.hambre <= UMBRAL_TRISTE) {
      alertar("hambre", FRASES_TRISTE.hambre, "aviso-hambre");
    } else if (stats.energia <= UMBRAL_TRISTE) {
      alertar("sueno", FRASES_TRISTE.energia, "aviso-sueno");
    } else if (necesitada && !avisoTriste.current) {
      avisoTriste.current = true;
      decir(FRASES_TRISTE[masBaja], 3200);
      sonar("triste");
      avisar(FRASES_TRISTE[masBaja]);
    }
    if (!necesitada) avisoTriste.current = false;
  }, [
    listo,
    stats.hambre,
    stats.energia,
    necesitada,
    accion,
    dormido,
    masBaja,
    decir,
    sonar,
    avisar,
  ]);

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

  // En reposo mira de vez en cuando a los lados: se siente viva.
  const enReposo = listo && !ocupada && !necesitada;
  useEffect(() => {
    if (!enReposo) {
      setMirada(null);
      return;
    }
    let t1 = 0;
    let t2 = 0;
    const ciclo = () => {
      t1 = window.setTimeout(
        () => {
          setMirada(Math.random() < 0.5 ? "mira-derecha" : "mira-izquierda");
          t2 = window.setTimeout(() => {
            setMirada(null);
            ciclo();
          }, 1400);
        },
        8000 + Math.random() * 5000,
      );
    };
    ciclo();
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [enReposo]);

  // Ladridos ocasionales para que Snoopy se sienta vivo, sin interrumpir
  // acciones, sueño, voz ni otros sonidos del juego.
  useEffect(() => {
    if (!enReposo) return;
    let id = 0;
    const programarLadrido = () => {
      id = window.setTimeout(
        () => {
          if (interactuo.current && sonidoRef.current) {
            setLadrando(true);
            sonar("ladrido");
            decir(Math.random() < 0.5 ? "¡Guau! 🐶" : "¡Guau, guau! 🐾", 1500);
            window.setTimeout(() => setLadrando(false), 520);
          }
          programarLadrido();
        },
        25_000 + Math.random() * 20_000,
      );
    };
    programarLadrido();
    return () => window.clearTimeout(id);
  }, [enReposo, sonar, decir]);

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
    sonar("despertar");
    decir("¡Buenos días! ☀️");
  }, [sonar, decir]);

  // Mientras duerme recupera energía; con la barra llena enciende la luz solo.
  useEffect(() => {
    if (!dormido) return;
    const id = window.setInterval(() => {
      setStats((s) => aplicar(s, { energia: 6 }));
      lanzar(["💤", "z", "Z"], 2);
    }, 2000);
    return () => window.clearInterval(id);
  }, [dormido, lanzar]);
  useEffect(() => {
    if (dormido && stats.energia >= 100) despertar();
  }, [dormido, stats.energia, despertar]);

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
    lanzar(["🎉", "✨", "⭐", "💛", celebrando.emoji], 14);
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

  /* ---------------- Acciones ---------------- */

  const lampara = () => {
    if (dormido) {
      despertar();
      return;
    }
    if (accion || escuchando) return;
    setMirada(null);
    registrar("dormir");
    setStats((s) => aplicar(s, { felicidad: 8 }));
    sonar("dormir");
    decir("Buenas noches… 🌙", 2600);
    // Se va a su cama: si estaba en el patio, vuelve al dormitorio.
    setEscena("dormitorio");
    descansoAutomaticoRef.current = false;
    setDormido(true);
  };

  const ejecutar = (tipo: TipoAccion) => {
    if (tipo === "dormir") return lampara();
    if (ocupada) return;
    setMirada(null);
    registrar(tipo);

    if (tipo === "pasear") {
      const destino: Escena = escena === "dormitorio" ? "patio" : "dormitorio";
      const dur = 1900;
      const alPatio = destino === "patio";
      setAccion({
        tipo,
        pose: alPatio ? "espalda" : "mira-derecha",
        anim: "walk",
        dur,
        mover: alPatio ? "irse" : "llegar",
      });
      setStats((s) => aplicar(s, { felicidad: 20 }));
      sonar("pasear");
      decir(alPatio ? "¡Vamos al patio! 🌳" : "¡De vuelta a casa! 🏠", 1700);
      lanzar(alPatio ? ["🌳", "🌸", "🦋", "🍃", "☀️"] : ["🏠", "💛", "✨", "🌙"]);
      // El fondo cambia a mitad de camino, mientras va caminando.
      programar(() => setEscena(destino), dur * 0.35);
      programar(() => {
        setAccion(null);
        decir(alPatio ? "¡Qué lindo día! ☀️🦋" : "Hogar, dulce hogar 💛");
      }, dur);
      return;
    }

    const c = ACCIONES[tipo];
    setAccion({ tipo, pose: c.pose, anim: c.anim, dur: c.dur });
    setStats((s) => aplicar(s, c.delta));
    sonar(c.sonido);
    lanzar(c.particulas);
    decir(elegir(c.frases), Math.min(c.dur, 2600));
    programar(() => setAccion(null), c.dur);
  };

  const acariciar = () => {
    if (dormido) return decir("Shh… está durmiendo 💤", 1800);
    if (ocupada) return;
    const ahora = Date.now();
    if (ahora - ultimaCaricia.current < 700) return;
    ultimaCaricia.current = ahora;
    setToques((t) => t + 1);
    setStats((s) => aplicar(s, { felicidad: 3 }));
    registrar("caricias");
    lanzar(["💛", "❤️", "💕", "✨"], 6);
    if (Math.random() < 0.4) {
      setLadrando(true);
      programar(() => setLadrando(false), 520);
      sonar("ladrido");
      decir("¡Guau, guau! 🐶", 1800);
    } else {
      sonar("caricia");
      decir(elegir(FRASES_CARICIA), 1800);
    }
  };

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
    vozRef.current?.detener();
    vozRef.current = null;
    setOido("inactivo");
    setTextoOido(null);
    bocaRef.current?.style.setProperty("--boca", "0");
    musica("reanudar");
    decir("¡Me encantó hablar contigo! 💛", 2200);
  };

  const prenderMic = async () => {
    if (ocupada) return;
    const voz = new VozMascota({
      onEstado: (e) => {
        if (e === "inactivo") return;
        setOido(e);
        if (e === "hablando") {
          setStats((s) => aplicar(s, { felicidad: 2 }));
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
        : "🎵 ¡Te lo repito!"
      : oido === "oyendo"
        ? "👂 …"
        : "Te escucho… 👂"
    : null;

  const botones: Array<{
    tipo: TipoAccion;
    Icono: LucideIcon;
    label: string;
    necesita: boolean;
    habilitado: boolean;
  }> = [
    {
      tipo: "alimentar",
      Icono: Bone,
      label: "Alimentar",
      necesita: stats.hambre <= 30,
      habilitado: !ocupada,
    },
    {
      tipo: "banar",
      Icono: Bath,
      label: "Bañar",
      necesita: stats.higiene <= 30,
      habilitado: !ocupada,
    },
    {
      tipo: "dormir",
      Icono: Lamp,
      label: dormido ? "Encender" : "Dormir",
      necesita: stats.energia <= 30,
      habilitado: dormido || (!accion && !escuchando),
    },
    {
      tipo: "pasear",
      Icono: escena === "dormitorio" ? Trees : House,
      label: escena === "dormitorio" ? "Pasear" : "Casa",
      necesita: stats.felicidad <= 30,
      habilitado: !ocupada,
    },
  ];

  const fondos = FONDOS[orient];
  const ancla = dormido ? ANCLAS[orient].cama : ANCLAS[orient][escena];
  const sombraAncha = pose === "durmiendo" || pose === "banando";
  const { Icono: IconoEscena, IconoAmb } = ESCENAS[escena];

  return (
    <section
      ref={raizRef}
      className={`mascota-ui mg-raiz relative -mb-px h-[100svh] min-h-[600px] overflow-hidden bg-[#0f1328] ${escena}`}
      onPointerDownCapture={() => (interactuo.current = true)}
      onKeyDownCapture={() => (interactuo.current = true)}
      onPointerMove={mirar}
      onPointerLeave={soltarMirada}
    >
      <style>{CSS + SNOOPY_CSS}</style>
      <WeatherPanel />

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
      <div className="mg-escena absolute inset-x-0 top-0" style={{ bottom: PANEL }}>
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
                } ${anim === "respirar" || anim === "breathe" ? "mg-sombra-respira" : ""}`}
                aria-hidden="true"
              />
              <div className={`absolute inset-0 ${ANIM_CLASE[anim]}`}>
                <div key={`${pose}-${toques}`} className="mg-pop absolute inset-0">
                  <div className="absolute inset-0 opacity-0" aria-hidden="true">
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
                  <div className="absolute inset-[8%] opacity-100 transition-opacity duration-500">
                    <Snoopy3D caminando={anim === "walk"} durmiendo={dormido} ladrando={ladrando} />
                  </div>
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
              <span
                key={p.id}
                className="mg-particula absolute bottom-[45%] font-bold"
                style={
                  {
                    left: `${p.x}%`,
                    fontSize: p.size,
                    animationDelay: `${p.delay}s`,
                    "--dx": `${p.dx}px`,
                    "--rot": `${p.rot}deg`,
                  } as CSSProperties
                }
              >
                {p.emoji}
              </span>
            ))}
            <div className="absolute inset-x-[-60%] bottom-[96%] flex justify-center">
              {globo ? (
                <p className="mg-globo mg-vidrio-fuerte whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold text-white">
                  {globo}
                </p>
              ) : (
                toast && (
                  <p
                    key={toast.id}
                    className="mg-toast mg-vidrio-fuerte max-w-[300px] truncate rounded-full px-4 py-1.5 text-sm font-bold text-white"
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
        <div className="mg-vidrio w-full rounded-3xl px-4 pb-3.5 pt-3">
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
                    <span className="tabular-nums text-white/80">{v}</span>
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

      {/* Controles */}
      <div
        className={`mg-panel-abajo mg-contenido absolute inset-x-0 bottom-0 z-10 text-white ${
          listo ? "opacity-100" : "opacity-0"
        }`}
        style={{ height: PANEL }}
      >
        <div className="mx-auto flex w-full max-w-[352px] flex-col gap-2.5 px-4 pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            {botones.map((b) => {
              const activo =
                (b.tipo === "dormir" && dormido) || (accion !== null && accion.tipo === b.tipo);
              const lamparaEncendida = b.tipo === "dormir" && !dormido;
              return (
                <button
                  key={b.tipo}
                  type="button"
                  onClick={() => ejecutar(b.tipo)}
                  disabled={!b.habilitado}
                  aria-pressed={b.tipo === "dormir" ? dormido : undefined}
                  className={`mg-boton mg-vidrio relative flex h-[62px] items-center justify-center gap-2.5 overflow-hidden rounded-2xl ${
                    activo ? "mg-boton-activo" : ""
                  } ${b.necesita && b.habilitado && !activo ? "mg-boton-necesita" : ""}`}
                >
                  <b.Icono
                    size={24}
                    strokeWidth={1.7}
                    aria-hidden="true"
                    className={
                      lamparaEncendida ? "mg-lampara-on" : b.tipo === "dormir" ? "opacity-60" : ""
                    }
                  />
                  <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60">
                    {b.label}
                  </span>
                  {accion !== null && accion.tipo === b.tipo && (
                    <span
                      className="mg-progreso absolute bottom-0 left-0 h-[2px] bg-white/80"
                      style={{ animationDuration: `${accion.dur}ms` }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSonido((s) => !s)}
              aria-pressed={sonido}
              aria-label={sonido ? "Silenciar sonidos" : "Activar sonidos"}
              title={sonido ? "Silenciar sonidos" : "Activar sonidos"}
              className="mg-redondo mg-vidrio grid h-9 w-9 shrink-0 place-items-center rounded-full"
            >
              {sonido ? <Volume2 size={16} /> : <VolumeX size={16} className="opacity-70" />}
            </button>
            <p className="mg-vidrio flex h-9 flex-1 items-center justify-center gap-2 rounded-full text-[12px] font-semibold text-white/75">
              <IconoEscena size={14} aria-hidden="true" />
              {ESCENAS[escena].nombre}
              <span className="h-1 w-1 rounded-full bg-white/50" aria-hidden="true" />
              <IconoAmb size={13} aria-hidden="true" />
              {dormido ? "Luz apagada" : ESCENAS[escena].ambiente}
            </p>
            {micDisponible ? (
              <button
                type="button"
                onClick={() => (escuchando ? apagarMic() : void prenderMic())}
                disabled={!escuchando && (accion !== null || dormido)}
                aria-pressed={escuchando}
                aria-label={escuchando ? "Terminar de hablar" : `Háblale a ${nombre}`}
                title={escuchando ? "Terminar de hablar" : "Háblale: te repite"}
                className={`mg-redondo grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-40 ${
                  escuchando ? "mg-mic-activo" : "mg-vidrio"
                }`}
              >
                {escuchando ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            ) : (
              <span className="h-9 w-9 shrink-0" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

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
.mg-panel-abajo {
  background: linear-gradient(to bottom, rgba(10,12,32,0.55), rgba(10,12,32,0.72));
  border-top: 1px solid rgba(255,255,255,0.12);
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
.mg-sombra {
  translate: -50% 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%);
}
.mg-pop { animation: mg-popIn 0.35s cubic-bezier(.2,.9,.3,1.3) both; transform-origin: 50% 100%; }

.mg-respirar { animation: mg-respirar 3.6s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-bounce { animation: mg-bounce 0.5s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-wiggle { animation: mg-wiggle 0.45s ease-in-out infinite alternate; transform-origin: 50% 100%; }
.mg-breathe { animation: mg-breathe 4s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-shake { animation: mg-shake 0.6s ease-in-out infinite; }
.mg-walk { animation: mg-walk 0.42s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-tilt { animation: mg-tilt 2.4s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-sombra-respira { animation: mg-sombra-respira 3.6s ease-in-out infinite; }

/* Paseo: se va de espaldas o llega caminando */
.mg-irse { animation: mg-irse 1.9s ease-in-out both; }
.mg-llegar { animation: mg-llegar 1.9s ease-out both; }

/* Partículas y mensajes */
.mg-particula { opacity: 0; animation: mg-goUp 2.6s ease-out both; text-shadow: 0 2px 6px rgba(0,0,0,0.3); }
.mg-toast { animation: mg-toast 0.35s cubic-bezier(.2,.9,.3,1.3) both; }
.mg-globo { animation: mg-popIn 0.35s ease both; }

/* Barras */
.mg-barra { transition: width 0.7s cubic-bezier(.22,1,.36,1), background-color 0.5s ease, box-shadow 0.5s ease; }
.mg-barra-baja { animation: mg-parpadeo 1.4s ease-in-out infinite; }

/* Botones */
.mg-boton { transition: transform 0.22s cubic-bezier(.2,.9,.3,1.2), box-shadow 0.22s ease, background-color 0.22s ease, opacity 0.25s ease; }
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

@keyframes mg-respirar { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.012, 1.022); } }
@keyframes mg-sombra-respira { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes mg-bounce {
  0%, 100% { transform: translateY(0) scaleY(1) scaleX(1); }
  30% { transform: translateY(0) scaleY(0.94) scaleX(1.04); }
  60% { transform: translateY(-5%) scaleY(1.03) scaleX(0.98); }
}
@keyframes mg-wiggle { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
@keyframes mg-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes mg-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3%); } 40% { transform: translateX(3%); }
  60% { transform: translateX(-3%); } 80% { transform: translateX(3%); }
}
@keyframes mg-walk {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-3%) rotate(2deg); }
}
@keyframes mg-tilt { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes mg-irse {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  65% { transform: translateY(-12%) scale(0.6); opacity: 0; }
  100% { transform: translateY(-12%) scale(0.6); opacity: 0; }
}
@keyframes mg-llegar {
  0% { transform: translateX(-70%); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: translateX(0); opacity: 1; }
}
@keyframes mg-goUp {
  0% { transform: translate(0, 0) scale(0.6) rotate(0); opacity: 0; }
  15% { transform: translate(0, -14px) scale(1) rotate(0); opacity: 1; }
  100% { transform: translate(var(--dx), -130px) scale(0.9) rotate(var(--rot)); opacity: 0; }
}
@keyframes mg-popIn {
  0% { transform: scale(0.8); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
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
@keyframes mg-necesita {
  0%, 100% { box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 0 0 0 rgba(255,255,255,0.0); }
  50% { box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 0 0 2px rgba(255,255,255,0.5); }
}
@keyframes mg-latido { 0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.6); } 50% { box-shadow: 0 0 0 10px rgba(244,63,94,0); } }
@keyframes mg-aparecer { from { opacity: 0; } to { opacity: 1; } }
@keyframes mg-brillo { 0%, 100% { transform: scale(1) rotate(-4deg); } 50% { transform: scale(1.08) rotate(4deg); } }

@media (prefers-reduced-motion: reduce) {
  .mg-kb, .mg-mota, .mg-respirar, .mg-breathe, .mg-tilt, .mg-shake, .mg-wiggle, .mg-bounce, .mg-walk,
  .mg-sombra-respira, .mg-barra-baja, .mg-boton-necesita, .mg-mic-activo,
  .mg-celebra-emoji { animation: none; }
  .mg-pop, .mg-toast, .mg-panel, .mg-celebra { animation-duration: 0.01s; }
}
`;
