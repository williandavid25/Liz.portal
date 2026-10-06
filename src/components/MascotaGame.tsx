import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Mic, MicOff } from "lucide-react";
import { VozMascota, type EstadoVoz } from "@/lib/voz-mascota";

// Mascota virtual tipo Tamagotchi. Las barras bajan solas cada 30 s y se
// guardan en este dispositivo; todas las animaciones son CSS puro (abajo).

type StatKey = "hambre" | "felicidad" | "higiene" | "energia";
type Stats = Record<StatKey, number>;
type Escena = "dormitorio" | "patio";
type TipoAccion = "alimentar" | "banar" | "dormir" | "pasear";
type Pose =
  | "frente"
  | "comiendo"
  | "banando"
  | "durmiendo"
  | "triste"
  | "espalda"
  | "mira-derecha"
  | "mira-izquierda";
type Anim = "float" | "bounce" | "wiggle" | "breathe" | "shake" | "walk" | "tilt";

interface Accion {
  tipo: TipoAccion;
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

const KEY = "liz-mascota-juego";
const DECAY_MS = 30_000;
const UMBRAL_TRISTE = 20;
const INICIAL: Stats = { hambre: 80, felicidad: 85, higiene: 75, energia: 80 };

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
const img = (p: Pose) => `/mascota/${p}.webp`;

const FONDOS: Record<
  Escena,
  { vertical: string; horizontal: string; nombre: string; icono: string }
> = {
  dormitorio: {
    vertical: "/mascota/dormitorio-vertical.webp",
    horizontal: "/mascota/dormitorio-horizontal.webp",
    nombre: "Dormitorio",
    icono: "🏠",
  },
  patio: {
    vertical: "/mascota/patio-vertical.webp",
    horizontal: "/mascota/patio-horizontal.webp",
    nombre: "Patio",
    icono: "🌳",
  },
};

const STATS: Array<{ key: StatKey; icono: string; label: string; color: string }> = [
  { key: "hambre", icono: "🍖", label: "Hambre", color: "#f87171" },
  { key: "felicidad", icono: "😊", label: "Felicidad", color: "#facc15" },
  { key: "higiene", icono: "🛁", label: "Higiene", color: "#4ade80" },
  { key: "energia", icono: "⚡", label: "Energía", color: "#60a5fa" },
];

const ACCIONES: Record<
  Exclude<TipoAccion, "pasear">,
  {
    pose: Pose;
    anim: Anim;
    dur: number;
    delta: Partial<Stats>;
    particulas: string[];
    frases: string[];
  }
> = {
  alimentar: {
    pose: "comiendo",
    anim: "bounce",
    dur: 2600,
    delta: { hambre: 30, felicidad: 8 },
    particulas: ["🍖", "🦴", "✨", "⭐", "🍗"],
    frases: ["¡Qué rico! 😋", "¡Ñam, ñam! 🍖", "¡Mi favorito! 🦴"],
  },
  banar: {
    pose: "banando",
    anim: "wiggle",
    dur: 2800,
    delta: { higiene: 30, felicidad: 8 },
    particulas: ["💧", "🫧", "💦"],
    frases: ["¡Splash! 💦", "¡Burbujas! 🫧", "¡Quedé brillante! ✨"],
  },
  dormir: {
    pose: "durmiendo",
    anim: "breathe",
    dur: 5000,
    delta: { energia: 40, felicidad: 8 },
    particulas: ["💤", "Z", "z", "😴"],
    frases: ["Buenas noches… 🌙", "Zzz… 💤"],
  },
};

const ANIM_CLASE: Record<Anim, string> = {
  float: "mg-float",
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

export function MascotaGame() {
  const [stats, setStats] = useState<Stats>(INICIAL);
  const [escena, setEscena] = useState<Escena>("dormitorio");
  const [nombre, setNombre] = useState("Snoopy");
  const [listo, setListo] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [mirada, setMirada] = useState<"mira-derecha" | "mira-izquierda" | null>(null);
  const [particulas, setParticulas] = useState<Particula[]>([]);
  const [toast, setToast] = useState<{ id: number; texto: string } | null>(null);
  const [toques, setToques] = useState(0);
  const [oido, setOido] = useState<EstadoVoz>("inactivo");
  const [textoOido, setTextoOido] = useState<string | null>(null);
  const [micDisponible, setMicDisponible] = useState(false);

  const idRef = useRef(0);
  const timers = useRef(new Set<number>());
  const vozRef = useRef<VozMascota | null>(null);
  const hablaRef = useRef<HTMLDivElement>(null);
  const ultimaCaricia = useRef(0);
  const durmiendoRef = useRef(false);
  durmiendoRef.current = accion?.tipo === "dormir";

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

  /* ---------------- Carga, guardado y desgaste ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const g = JSON.parse(raw) as { stats?: Partial<Stats>; escena?: Escena; ts?: number };
        // Lo que bajó mientras la app estaba cerrada, con tope para no
        // encontrarla siempre en cero al volver.
        const pasos = g.ts ? Math.floor((Date.now() - g.ts) / DECAY_MS) : 0;
        const perdida = -Math.min(40, pasos * 5.5);
        setStats(
          aplicar(
            { ...INICIAL, ...g.stats },
            { hambre: perdida, felicidad: perdida, higiene: perdida, energia: perdida },
          ),
        );
        if (g.escena === "patio" || g.escena === "dormitorio") setEscena(g.escena);
      }
      const vieja = localStorage.getItem("liz-mascota");
      const n = vieja ? (JSON.parse(vieja) as { nombre?: unknown }).nombre : null;
      if (typeof n === "string" && n.trim()) setNombre(n.trim());
    } catch {
      /* datos corruptos o almacenamiento bloqueado: se empieza de cero */
    }
    setMicDisponible(VozMascota.disponible());
    setListo(true);
    // Precarga de poses: sin parpadeo blanco al cambiar de estado.
    for (const p of POSES) {
      const i = new Image();
      i.decoding = "async";
      i.src = img(p);
    }
  }, []);

  useEffect(() => {
    if (!listo) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ stats, escena, ts: Date.now() }));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [listo, stats, escena]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStats((s) => ({
        hambre: clamp(s.hambre - baja()),
        felicidad: clamp(s.felicidad - baja()),
        higiene: clamp(s.higiene - baja()),
        energia: durmiendoRef.current ? s.energia : clamp(s.energia - baja()),
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

  /* ---------------- Estado visible ---------------- */

  const masBaja = STATS.reduce((a, b) => (stats[b.key] < stats[a.key] ? b : a)).key;
  const necesitada = stats[masBaja] < UMBRAL_TRISTE;
  const escuchando = oido !== "inactivo";
  const ocupada = accion !== null || escuchando;

  let pose: Pose = "frente";
  let anim: Anim = "float";
  if (accion) {
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

  // Avisa una vez al ponerse triste.
  const avisoTriste = useRef(false);
  useEffect(() => {
    if (!listo) return;
    if (necesitada && !accion && !avisoTriste.current) {
      avisoTriste.current = true;
      decir(FRASES_TRISTE[masBaja], 3200);
    }
    if (!necesitada) avisoTriste.current = false;
  }, [listo, necesitada, accion, masBaja, decir]);

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
          }, 1500);
        },
        6500 + Math.random() * 4500,
      );
    };
    ciclo();
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [enReposo]);

  /* ---------------- Acciones ---------------- */

  const ejecutar = (tipo: TipoAccion) => {
    if (ocupada) return;
    setMirada(null);

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
    lanzar(c.particulas);
    decir(elegir(c.frases), Math.min(c.dur, 2600));
    programar(() => {
      setAccion(null);
      if (tipo === "dormir") decir("¡Buenos días! ☀️");
    }, c.dur);
  };

  const acariciar = () => {
    if (ocupada) return;
    const ahora = Date.now();
    if (ahora - ultimaCaricia.current < 700) return;
    ultimaCaricia.current = ahora;
    setToques((t) => t + 1);
    setStats((s) => aplicar(s, { felicidad: 3 }));
    lanzar(["💛", "❤️", "💕", "✨"], 6);
    decir(elegir(FRASES_CARICIA), 1800);
  };

  /* ---------------- Háblale (repite tu voz) ---------------- */

  const apagarMic = () => {
    vozRef.current?.detener();
    vozRef.current = null;
    setOido("inactivo");
    setTextoOido(null);
    hablaRef.current?.style.setProperty("--boca", "0");
    musica("reanudar");
    decir("¡Me encantó hablar contigo! 💛", 2200);
  };

  const prenderMic = async () => {
    if (ocupada) return;
    const voz = new VozMascota({
      onEstado: (e) => {
        if (e === "inactivo") return;
        setOido(e);
        if (e === "hablando") setStats((s) => aplicar(s, { felicidad: 2 }));
        if (e === "oyendo") setTextoOido(null);
      },
      onBoca: (nivel) => hablaRef.current?.style.setProperty("--boca", String(nivel)),
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

  const bienestar = Math.round(
    (stats.hambre + stats.felicidad + stats.higiene + stats.energia) / 4,
  );
  const animo = necesitada ? "🥺" : bienestar > 75 ? "🥰" : bienestar > 45 ? "🙂" : "😕";

  const botones: Array<{
    tipo: TipoAccion;
    icono: string;
    label: string;
    hint: string;
    necesita: boolean;
  }> = [
    {
      tipo: "alimentar",
      icono: "🍖",
      label: "Alimentar",
      hint: "+30 hambre",
      necesita: stats.hambre <= 30,
    },
    {
      tipo: "banar",
      icono: "🛁",
      label: "Bañar",
      hint: "+30 higiene",
      necesita: stats.higiene <= 30,
    },
    {
      tipo: "dormir",
      icono: "😴",
      label: "Dormir",
      hint: "+40 energía",
      necesita: stats.energia <= 30,
    },
    escena === "dormitorio"
      ? {
          tipo: "pasear",
          icono: "🌳",
          label: "Pasear",
          hint: "+20 felicidad",
          necesita: stats.felicidad <= 30,
        }
      : {
          tipo: "pasear",
          icono: "🏠",
          label: "Casa",
          hint: "+20 felicidad",
          necesita: stats.felicidad <= 30,
        },
  ];

  const sombraClase =
    anim === "float" || anim === "tilt"
      ? "mg-sombra-float"
      : anim === "breathe"
        ? "mg-sombra-breathe"
        : "";

  return (
    <section
      className={`mascota-ui mg-raiz relative -mb-px min-h-[100svh] overflow-hidden bg-[#141b33] ${escena}`}
    >
      <style>{CSS}</style>

      {/* Fondos: ambos montados para que el cambio sea un fundido suave. */}
      <div className="absolute inset-0" aria-hidden="true">
        {(Object.keys(FONDOS) as Escena[]).map((e) => (
          <picture
            key={e}
            className="mg-fondo absolute inset-0 block"
            style={{ opacity: escena === e ? 1 : 0 }}
          >
            <source media="(min-aspect-ratio: 1/1)" srcSet={FONDOS[e].horizontal} />
            <img
              src={FONDOS[e].vertical}
              alt=""
              decoding="async"
              fetchPriority={e === "dormitorio" ? "high" : "low"}
              className="mg-kb h-full w-full object-cover"
            />
          </picture>
        ))}
        <div
          className="mg-overlay absolute inset-0"
          style={{
            background: accion?.tipo === "dormir" ? "rgba(6,10,38,0.55)" : "rgba(0,0,0,0.22)",
          }}
        />
        <div className="mg-vineta absolute inset-0" />
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

      <div
        className={`mg-contenido relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[352px] flex-col items-center justify-center gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+100px)] text-white sm:pt-[calc(env(safe-area-inset-top)+120px)] ${
          listo ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Barras */}
        <div className="mg-vidrio w-full rounded-3xl px-4 pb-3.5 pt-3">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-lg font-bold leading-none tracking-wide">{nombre}</p>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
              <span className="text-base leading-none" aria-hidden="true">
                {animo}
              </span>
              Bienestar {bienestar}%
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {STATS.map((s) => {
              const v = stats[s.key];
              const c = colorNivel(v);
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-[12px] font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="grid h-5 w-5 place-items-center rounded-full text-[11px]"
                        style={{ background: `${s.color}40`, boxShadow: `0 0 0 1px ${s.color}80` }}
                        aria-hidden="true"
                      >
                        {s.icono}
                      </span>
                      {s.label}
                    </span>
                    <span className="tabular-nums text-white/90">{v}</span>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-white/20"
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

        {/* Mascota */}
        <div className="relative h-[260px] w-[260px] shrink-0">
          <div
            key={`${accion?.tipo ?? "x"}-${accion?.mover ?? ""}`}
            className={`absolute inset-0 ${accion?.mover ? `mg-${accion.mover}` : ""}`}
            style={
              accion?.mover
                ? ({ animationDuration: `${accion.dur}ms` } as CSSProperties)
                : undefined
            }
          >
            <div
              className={`mg-sombra absolute -bottom-2 left-1/2 h-[20px] w-[170px] rounded-[50%] ${sombraClase}`}
            />
            <button
              type="button"
              onClick={acariciar}
              disabled={ocupada}
              aria-label={`Acariciar a ${nombre}`}
              className="absolute inset-x-0 bottom-0 mx-auto flex h-[240px] w-[240px] items-end justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-default"
            >
              <div
                ref={hablaRef}
                className={`${ANIM_CLASE[anim]} ${oido === "hablando" ? "mg-habla" : ""}`}
              >
                <div key={`${pose}-${toques}`} className="mg-pop">
                  <img
                    src={img(pose)}
                    alt=""
                    width={220}
                    height={220}
                    draggable={false}
                    className="mg-personaje h-[220px] w-[220px] select-none"
                    style={{ objectFit: "contain" }}
                  />
                </div>
              </div>
            </button>
          </div>

          {/* Partículas */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {particulas.map((p) => (
              <span
                key={p.id}
                className="mg-particula absolute bottom-[38%] font-bold"
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
          </div>

          {/* Globo / toast */}
          <div className="pointer-events-none absolute inset-x-0 -top-3 flex justify-center">
            {globo ? (
              <p className="mg-globo mg-vidrio-fuerte whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold">
                {globo}
              </p>
            ) : (
              toast && (
                <p
                  key={toast.id}
                  className="mg-toast mg-vidrio-fuerte max-w-[280px] truncate rounded-full px-4 py-1.5 text-sm font-bold"
                >
                  {toast.texto}
                </p>
              )
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {globo ?? toast?.texto ?? ""}
          </p>

          {/* Micrófono */}
          {micDisponible && (
            <button
              type="button"
              onClick={() => (escuchando ? apagarMic() : void prenderMic())}
              disabled={!escuchando && accion !== null}
              aria-pressed={escuchando}
              aria-label={escuchando ? "Terminar de hablar" : `Háblale a ${nombre}`}
              title={escuchando ? "Terminar de hablar" : "Háblale: te repite"}
              className={`mg-mic absolute -right-2 top-9 grid h-11 w-11 place-items-center rounded-full disabled:opacity-40 ${
                escuchando ? "mg-mic-activo" : "mg-vidrio"
              }`}
            >
              {escuchando ? <MicOff size={19} /> : <Mic size={19} />}
            </button>
          )}
        </div>

        {/* Botones */}
        <div className="grid w-full grid-cols-2 gap-3">
          {botones.map((b) => {
            const activo = accion?.tipo === b.tipo;
            return (
              <button
                key={b.tipo}
                type="button"
                onClick={() => ejecutar(b.tipo)}
                disabled={ocupada}
                className={`mg-boton mg-vidrio relative flex h-[76px] flex-col items-center justify-center overflow-hidden rounded-2xl ${
                  activo ? "mg-boton-activo" : ""
                } ${b.necesita && !ocupada ? "mg-boton-necesita" : ""}`}
              >
                <span className="flex items-center gap-2 text-[15px] font-bold">
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {b.icono}
                  </span>
                  {b.label}
                </span>
                <span className="mt-0.5 text-[11px] font-semibold text-white/75">{b.hint}</span>
                {activo && accion && (
                  <span
                    className="mg-progreso absolute bottom-0 left-0 h-[3px] bg-white/85"
                    style={{ animationDuration: `${accion.dur}ms` }}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Escenario actual */}
        <p className="mg-vidrio flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold">
          <span aria-hidden="true">{FONDOS[escena].icono}</span>
          {FONDOS[escena].nombre}
          <span className="h-1 w-1 rounded-full bg-white/60" aria-hidden="true" />
          <span className="text-white/80">
            {escena === "patio" ? "Día soleado ☀️" : "Noche tranquila 🌙"}
          </span>
        </p>
      </div>
    </section>
  );
}

const CSS = `
.mg-raiz { text-shadow: 0 1px 2px rgba(0,0,0,0.35); }
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

/* Fondo */
.mg-fondo { transition: opacity 0.7s ease; }
.mg-kb { animation: mg-kb 32s ease-in-out infinite alternate; transform-origin: 50% 60%; }
.mg-overlay { transition: background-color 0.9s ease; }
.mg-vineta { background: radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.38) 100%); }
.mg-mota {
  width: 4px; height: 4px; opacity: 0;
  background: rgba(255,255,255,0.9);
  box-shadow: 0 0 8px 2px rgba(255,255,255,0.55);
  animation: mg-mota 12s ease-in-out infinite;
}
.patio .mg-mota { background: rgba(255,236,170,0.95); box-shadow: 0 0 8px 2px rgba(255,214,120,0.6); }

/* Personaje */
.mg-personaje { filter: drop-shadow(0 10px 14px rgba(0,0,0,0.35)) drop-shadow(0 2px 3px rgba(0,0,0,0.25)); }
.mg-sombra {
  translate: -50% 0;
  background: rgba(0,0,0,0.45);
  filter: blur(9px);
  opacity: 0.55;
}
.mg-pop { animation: mg-popIn 0.35s cubic-bezier(.2,.9,.3,1.3) both; transform-origin: 50% 85%; }

.mg-float { animation: mg-float 3.2s ease-in-out infinite; }
.mg-bounce { animation: mg-bounce 0.5s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-wiggle { animation: mg-wiggle 0.45s ease-in-out infinite alternate; transform-origin: 50% 95%; }
.mg-breathe { animation: mg-breathe 4s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-shake { animation: mg-shake 0.6s ease-in-out infinite; }
.mg-walk { animation: mg-walk 0.42s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-tilt { animation: mg-tilt 2.4s ease-in-out infinite; transform-origin: 50% 100%; }
.mg-sombra-float { animation: mg-sombra-float 3.2s ease-in-out infinite; }
.mg-sombra-breathe { animation: mg-sombra-breathe 4s ease-in-out infinite; }
.mg-habla img {
  transform: scale(calc(1 + var(--boca, 0) * 0.07), calc(1 + var(--boca, 0) * 0.04));
  transform-origin: 50% 90%;
  transition: transform 60ms linear;
}

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
}
.mg-boton:not(:disabled):active { transform: scale(0.97); }
.mg-boton:disabled { cursor: not-allowed; opacity: 0.5; }
.mg-boton.mg-boton-activo { opacity: 1; background: rgba(255,255,255,0.26); }
.mg-boton:focus-visible { outline: 2px solid rgba(255,255,255,0.9); outline-offset: 2px; }
.mg-boton-necesita { animation: mg-necesita 1.6s ease-in-out infinite; }
.mg-progreso { width: 0; animation: mg-progreso linear both; }
.mg-mic { transition: transform 0.2s ease, opacity 0.2s ease; }
.mg-mic:not(:disabled):hover { transform: scale(1.08); }
.mg-mic-activo { background: #f43f5e; border: 1px solid rgba(255,255,255,0.5); animation: mg-latido 1.3s ease-in-out infinite; }

@keyframes mg-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
@keyframes mg-sombra-float { 0%, 100% { transform: scale(1); opacity: 0.55; } 50% { transform: scale(0.78); opacity: 0.32; } }
@keyframes mg-bounce {
  0%, 100% { transform: translateY(0) scaleY(1) scaleX(1); }
  30% { transform: translateY(0) scaleY(0.92) scaleX(1.05); }
  60% { transform: translateY(-12px) scaleY(1.04) scaleX(0.98); }
}
@keyframes mg-wiggle { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }
@keyframes mg-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes mg-sombra-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
@keyframes mg-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-7px); } 40% { transform: translateX(7px); }
  60% { transform: translateX(-7px); } 80% { transform: translateX(7px); }
}
@keyframes mg-walk {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-7px) rotate(2deg); }
}
@keyframes mg-tilt { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes mg-irse {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  65% { transform: translateY(-26px) scale(0.6); opacity: 0; }
  100% { transform: translateY(-26px) scale(0.6); opacity: 0; }
}
@keyframes mg-llegar {
  0% { transform: translateX(-150px); opacity: 0; }
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
@keyframes mg-kb { from { transform: scale(1.04); } to { transform: scale(1.1) translate(-1%, -1%); } }
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
  50% { box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 0 0 3px rgba(255,255,255,0.55); }
}
@keyframes mg-latido { 0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.6); } 50% { box-shadow: 0 0 0 10px rgba(244,63,94,0); } }

@media (prefers-reduced-motion: reduce) {
  .mg-kb, .mg-mota, .mg-float, .mg-breathe, .mg-tilt, .mg-shake, .mg-wiggle, .mg-bounce, .mg-walk,
  .mg-sombra-float, .mg-sombra-breathe, .mg-barra-baja, .mg-boton-necesita, .mg-mic-activo { animation: none; }
  .mg-pop, .mg-toast { animation-duration: 0.01s; }
}
`;
