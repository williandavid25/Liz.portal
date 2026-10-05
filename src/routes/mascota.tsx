import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Pencil, Check } from "lucide-react";
import {
  SnoopyEscena,
  type AccionTecho,
  type EstadoHueso,
  type EstadoSuelo,
  type OidoMascota,
} from "@/components/SnoopyEscena";
import { useMascota, type Mascota } from "@/lib/mascota";
import { VozMascota } from "@/lib/voz-mascota";

export const Route = createFileRoute("/mascota")({
  head: () => ({
    meta: [
      { title: "Mi mascota · Snoopy's House 🐶" },
      {
        name: "description",
        content: "Cuida a Snoopy: lánzale un hueso, báñalo, apaga la luz para que duerma y háblale.",
      },
    ],
  }),
  component: MiMascota,
});

const FRASES = [
  "¡Qué lindo día! ☀️",
  "Woodstock es mi mejor amigo 🐤",
  "¿Me lanzas un hueso? 🦴",
  "¡Te quiero mucho! ❤️",
  "Tócame, ¡me da cosquillas!",
  "Háblame, yo te repito 🎤",
  "Toca la lámpara si tengo sueño 💡",
];

const CASA_X = 800; // frente de la casita
const PUNTO_ESCUCHA = 945; // donde se para a escucharte
const TINA_X = 960;

function globoPorNecesidad(m: Mascota): string | null {
  if (m.durmiendo) return "Zzz… 💤";
  if (m.comida < 35) return "¡Tengo hambre! 🦴";
  if (m.energia < 25) return "Tengo sueño… 😴";
  if (m.higiene < 35) return "Necesito un baño 🛁";
  if (m.felicidad < 35) return "Juega conmigo 🥺";
  return null;
}

/** Pausa/reanuda la música de fondo del sitio (vive en __root.tsx). */
const musica = (accion: "pausar" | "reanudar") =>
  window.dispatchEvent(new CustomEvent("liz:musica", { detail: accion }));

const SUELO_INICIAL: EstadoSuelo = { pose: "techo", x: CASA_X, dir: 1, anim: "parado", dur: 0 };

function MiMascota() {
  const { m, listo, cambiar, consumirDesperto } = useMascota();
  const [accionTecho, setAccionTecho] = useState<AccionTecho>(null);
  const [suelo, setSuelo] = useState<EstadoSuelo>(SUELO_INICIAL);
  const [hueso, setHueso] = useState<EstadoHueso>({ estado: "oculto", x: 1000 });
  const [tina, setTina] = useState(false);
  const [oido, setOido] = useState<OidoMascota>("inactivo");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [frase, setFrase] = useState(0);
  const [texto, setTexto] = useState<string | null>(null);
  const [errorMic, setErrorMic] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreDraft, setNombreDraft] = useState("");
  const bocaRef = useRef<SVGEllipseElement>(null);
  const vozRef = useRef<VozMascota | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Secuencias (correr, comer, bañarse...): una a la vez, cancelables.
  const secuencia = useRef(0);
  const sueloRef = useRef(suelo);
  sueloRef.current = suelo;
  const [ocupado, setOcupado] = useState(false);

  // Pausa las animaciones de la escena cuando no se ve (ahorra batería).
  const escenaRef = useRef<HTMLDivElement>(null);
  const [escenaVisible, setEscenaVisible] = useState(true);
  useEffect(() => {
    const el = escenaRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setEscenaVisible(!!e?.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Las rayas de una barra solo se mueven un momento, cuando sube su valor.
  const [cambiando, setCambiando] = useState<Record<string, boolean>>({});
  const previos = useRef<Record<string, number>>({});

  useEffect(() => {
    const id = window.setInterval(() => setFrase((f) => (f + 1) % FRASES.length), 7000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!m.durmiendo && consumirDesperto()) decir("¡Buenos días! ☀️", 3500);
  }, [m.durmiendo, consumirDesperto]);

  // Al salir de la página: cortar secuencias, micrófono y devolver la música.
  useEffect(
    () => () => {
      secuencia.current++;
      window.clearTimeout(timer.current);
      if (vozRef.current) {
        vozRef.current.detener();
        vozRef.current = null;
        musica("reanudar");
      }
    },
    [],
  );

  const decir = (t: string, ms = 2600) => {
    setMensaje(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMensaje(null), ms);
  };

  /* ---------------- Movimiento de Snoopy ---------------- */

  const esperar = (ms: number, id: number) =>
    new Promise<void>((resolve, reject) =>
      window.setTimeout(() => (id === secuencia.current ? resolve() : reject(new Error("cancelada"))), ms),
    );

  const bajar = async (id: number) => {
    setSuelo({ pose: "bajando", x: CASA_X, dir: 1, anim: "parado", dur: 0 });
    await esperar(620, id);
    setSuelo((s) => ({ ...s, pose: "suelo" }));
  };

  const correrA = async (x: number, id: number) => {
    const actual = sueloRef.current.x;
    const distancia = Math.abs(x - actual);
    if (distancia < 2) return;
    const dur = Math.round(distancia * 4.2);
    setSuelo((s) => ({ ...s, anim: "correr", dir: x > actual ? 1 : -1, x, dur }));
    await esperar(dur, id);
    setSuelo((s) => ({ ...s, anim: "parado", dur: 0 }));
  };

  const subir = async (id: number) => {
    await correrA(CASA_X, id);
    setSuelo((s) => ({ ...s, pose: "subiendo", anim: "parado", dir: -1 }));
    await esperar(600, id);
    setSuelo(SUELO_INICIAL);
  };

  /** Ejecuta una secuencia; si otra la reemplaza, se corta sin errores. */
  const correrSecuencia = async (fn: (id: number) => Promise<void>) => {
    const id = ++secuencia.current;
    setOcupado(true);
    try {
      await fn(id);
    } catch {
      /* cancelada */
    } finally {
      if (id === secuencia.current) setOcupado(false);
    }
  };

  /* ---------------- Acciones ---------------- */

  const lanzarHueso = () => {
    if (m.durmiendo) return decir("Shh… está durmiendo 💤 Enciende la lámpara");
    if (ocupado || oido !== "inactivo") return;
    if (m.comida >= 95) return decir("¡Estoy lleno! 😋");
    const x = 985 + Math.round(Math.random() * 30);
    void correrSecuencia(async (id) => {
      setHueso({ estado: "volando", x });
      decir("¡Un hueso! 🦴", 1800);
      await esperar(350, id);
      await bajar(id);
      setHueso({ estado: "suelo", x });
      await correrA(x - 46, id);
      setSuelo((s) => ({ ...s, anim: "comer", dir: 1 }));
      setHueso({ estado: "comiendo", x });
      decir("¡Ñam, ñam! 😋", 2000);
      cambiar((p) => ({ comida: p.comida + 30, felicidad: p.felicidad + 6 }));
      await esperar(1900, id);
      setHueso({ estado: "oculto", x });
      setSuelo((s) => ({ ...s, anim: "parado" }));
      await esperar(250, id);
      await subir(id);
    });
  };

  const banar = () => {
    if (m.durmiendo) return decir("Shh… está durmiendo 💤 Enciende la lámpara");
    if (ocupado || oido !== "inactivo") return;
    void correrSecuencia(async (id) => {
      decir("¿Un baño? 🛁", 1800);
      await bajar(id);
      setTina(true);
      await correrA(TINA_X, id);
      setSuelo((s) => ({ ...s, anim: "tina", dir: 1 }));
      decir("¡Splash! 💦", 3200);
      cambiar((p) => ({ higiene: 100, felicidad: p.felicidad + 4, energia: p.energia - 3 }));
      await esperar(3300, id);
      setTina(false);
      setSuelo((s) => ({ ...s, anim: "sacudir", dir: -1 }));
      decir("¡Sacudida! 💦", 1200);
      await esperar(1000, id);
      setSuelo((s) => ({ ...s, anim: "parado" }));
      await subir(id);
    });
  };

  const tocarLampara = () => {
    if (ocupado || oido !== "inactivo") return decir("Espera, estoy ocupado 🐾");
    if (m.durmiendo) {
      cambiar(() => ({ durmiendo: false }));
      decir("¡Buenos días! ☀️");
    } else {
      cambiar(() => ({ durmiendo: true }));
      decir("Buenas noches… 🌙");
    }
  };

  const tocarSnoopy = () => {
    if (m.durmiendo) return decir("Zzz… déjame dormir 😴");
    if (ocupado) return;
    cambiar((p) => ({ felicidad: p.felicidad + 4 }));
    setAccionTecho("feliz");
    window.setTimeout(() => setAccionTecho(null), 1300);
    decir(["¡Jiji! 💛", "¡Me haces cosquillas!", "¡Te quiero! ❤️", "¡Otra vez!"][Math.floor(Math.random() * 4)]!);
  };

  /* ---------------- Háblale ---------------- */

  const ponerBoca = useCallback((nivel: number) => {
    bocaRef.current?.setAttribute("ry", String(1 + nivel * 9));
  }, []);

  const apagarMic = () => {
    vozRef.current?.detener();
    vozRef.current = null;
    setOido("inactivo");
    setTexto(null);
    musica("reanudar");
    void correrSecuencia(async (id) => {
      setSuelo((s) => ({ ...s, anim: "parado" }));
      decir("¡Me encantó hablar contigo! 💛", 2200);
      await esperar(300, id);
      await subir(id);
    });
  };

  const prenderMic = async () => {
    if (m.durmiendo) return decir("Shh… está durmiendo 💤 Enciende la lámpara");
    if (ocupado) return;
    setErrorMic(null);
    const voz = new VozMascota({
      onEstado: (e) => {
        if (e === "inactivo") return;
        setOido(e);
        if (e === "hablando") cambiar((p) => ({ felicidad: p.felicidad + 2 }));
        if (e === "oyendo") setTexto(null);
      },
      onBoca: ponerBoca,
      onTexto: (t) => setTexto(t),
    });
    vozRef.current = voz;
    musica("pausar");
    try {
      await voz.iniciar();
    } catch {
      vozRef.current = null;
      musica("reanudar");
      setOido("inactivo");
      setErrorMic("Permite el micrófono en tu navegador para hablarle a Snoopy.");
      return;
    }
    // Baja del techo, se para frente a ti y te escucha.
    void correrSecuencia(async (id) => {
      await bajar(id);
      await correrA(PUNTO_ESCUCHA, id);
      setSuelo((s) => ({ ...s, anim: "frente" }));
      setOcupado(false);
    });
  };

  /* ---------------- Vista ---------------- */

  const globo = (() => {
    if (oido === "hablando") return texto ? `«${texto}»` : "🎵 ¡Te lo repito!";
    if (oido === "oyendo") return "👂 …";
    if (oido === "escuchando") return "Te escucho… 👂";
    if (mensaje) return mensaje;
    return globoPorNecesidad(m) ?? FRASES[frase]!;
  })();

  const contento =
    !m.durmiendo && m.felicidad >= 70 && m.comida >= 40 && m.higiene >= 40 && m.energia >= 30;

  const barras: Array<[string, string, number, string]> = [
    ["🥣", "Comida", m.comida, "#7cc04a"],
    ["❤️", "Felicidad", m.felicidad, "#e8578a"],
    ["🚿", "Higiene", m.higiene, "#5ab6e0"],
    ["🌙", "Energía", m.energia, "#f2c23a"],
  ];

  useEffect(() => {
    if (!listo) return;
    const valores: Record<string, number> = {
      Comida: m.comida,
      Felicidad: m.felicidad,
      Higiene: m.higiene,
      Energía: m.energia,
    };
    const subieron = Object.keys(valores).filter(
      (k) => previos.current[k] !== undefined && valores[k]! - previos.current[k]! > 0.5,
    );
    previos.current = valores;
    if (subieron.length === 0) return;
    setCambiando((c) => ({ ...c, ...Object.fromEntries(subieron.map((k) => [k, true])) }));
    const t = window.setTimeout(
      () => setCambiando((c) => ({ ...c, ...Object.fromEntries(subieron.map((k) => [k, false])) })),
      1400,
    );
    return () => window.clearTimeout(t);
  }, [listo, m.comida, m.felicidad, m.higiene, m.energia]);

  const botones: Array<{ icono: string; label: string; color: string; fn: () => void; necesita: boolean }> = [
    { icono: "🦴", label: "Hueso", color: "#e2483d", fn: lanzarHueso, necesita: !m.durmiendo && m.comida < 35 },
    { icono: "🛁", label: "Bañar", color: "#7cc4e4", fn: banar, necesita: !m.durmiendo && m.higiene < 35 },
    m.durmiendo
      ? { icono: "💡", label: "Encender", color: "#f2c23a", fn: tocarLampara, necesita: m.energia >= 100 }
      : { icono: "🌙", label: "Apagar", color: "#b07cd6", fn: tocarLampara, necesita: m.energia < 25 },
  ];

  const guardarNombre = () => {
    const n = nombreDraft.trim().slice(0, 14);
    if (n) cambiar(() => ({ nombre: n }));
    setEditandoNombre(false);
  };

  return (
    <section
      className={`mascota-ui relative -mb-px min-h-[100svh] overflow-hidden transition-colors duration-1000 ${
        m.durmiendo ? "bg-[#1b2554]" : "bg-[#6fa8d8]"
      }`}
    >
      {/* Título */}
      <div className="relative z-10 px-4 pt-[calc(env(safe-area-inset-top)+98px)] text-center sm:pt-[calc(env(safe-area-inset-top)+118px)]">
        {editandoNombre ? (
          <form
            className="mx-auto flex max-w-xs items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              guardarNombre();
            }}
          >
            <input
              autoFocus
              value={nombreDraft}
              onChange={(e) => setNombreDraft(e.target.value)}
              maxLength={14}
              className="min-w-0 flex-1 rounded-full border-2 border-[#1f3fa0]/40 bg-white/85 px-4 py-2 text-center text-xl font-bold text-[#1f3fa0] outline-none focus:border-[#1f3fa0]"
              aria-label="Nombre"
            />
            <button type="submit" className="rounded-full bg-[#1f3fa0] p-2.5 text-white" aria-label="Guardar nombre">
              <Check size={18} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNombreDraft(m.nombre);
              setEditandoNombre(true);
            }}
            className="group inline-flex items-center gap-2"
            title="Cambiar nombre"
          >
            <span
              className={`m-titulo text-5xl font-bold tracking-wider drop-shadow-[0_3px_0_rgba(255,255,255,0.85)] sm:text-6xl ${
                m.durmiendo ? "text-[#c9d6ff]" : "text-[#1f3fa0]"
              }`}
            >
              {listo ? m.nombre.toUpperCase() : " "}
            </span>
            <Pencil size={16} className="text-white/80 opacity-60 transition group-hover:opacity-100" />
          </button>
        )}
        <p className={`-mt-1 text-lg font-semibold sm:text-2xl ${m.durmiendo ? "text-white/85" : "text-[#26201c]"}`}>
          Snoopy&apos;s House
        </p>
        {/* Lo que dice Snoopy, para lectores de pantalla. */}
        <p className="sr-only" aria-live="polite">
          {globo}
        </p>
      </div>

      {/* Escena */}
      <div ref={escenaRef} className="relative z-0 -mt-4 h-[clamp(320px,52svh,580px)] w-full">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b to-transparent transition-colors duration-1000 ${
            m.durmiendo ? "from-[#1b2554]" : "from-[#6fa8d8]"
          }`}
        />
        <SnoopyEscena
          nombre={m.nombre}
          durmiendo={m.durmiendo}
          accionTecho={accionTecho}
          oido={oido}
          contento={contento}
          globo={globo}
          suelo={suelo}
          hueso={hueso}
          tina={tina}
          bocaRef={bocaRef}
          onTocarSnoopy={tocarSnoopy}
          onTocarLampara={tocarLampara}
          pausada={!escenaVisible}
        />

        {/* Micrófono flotante: siempre a mano, sin bajar la página. */}
        {(VozMascota.disponible() || !listo) && (
          <button
            type="button"
            onClick={() => (oido === "inactivo" ? prenderMic() : apagarMic())}
            disabled={oido === "inactivo" && ocupado}
            aria-pressed={oido !== "inactivo"}
            aria-label={oido === "inactivo" ? "Háblale a Snoopy" : "Terminar de hablar"}
            className={`m-mic absolute left-4 top-6 z-20 flex items-center gap-2 rounded-full border-[3px] border-[#2b211b] py-2 pl-2.5 pr-4 text-sm font-semibold shadow-[0_4px_0_#2b211b] disabled:opacity-60 sm:left-8 sm:top-10 sm:text-base ${
              oido === "inactivo" ? "bg-[#fff6e3] text-[#2b211b]" : "bg-[#ff6b6b] text-white"
            }`}
          >
            <span className="relative grid h-7 w-7 place-items-center">
              {oido !== "inactivo" && (
                <span className="m-mic-onda absolute inset-0 rounded-full bg-white/70" aria-hidden="true" />
              )}
              {oido === "inactivo" ? <Mic size={20} /> : <MicOff size={18} />}
            </span>
            {oido === "inactivo" ? "Háblale" : oido === "hablando" ? "Te repite…" : "Escuchando"}
          </button>
        )}
      </div>

      {/* Pasto con barras y botones */}
      <div
        className={`relative pb-10 transition-colors duration-1000 ${
          m.durmiendo ? "bg-[#2a4a24]" : "bg-gradient-to-b from-[#4b8a2d] to-[#3f7a26]"
        }`}
      >
        <div className="mx-auto w-full max-w-xl px-4 pt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-3xl border border-white/25 bg-black/20 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-sm">
            {barras.map(([icono, label, valor, color]) => {
              const bajo = valor < 25;
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="m-icono-barra text-xl drop-shadow" aria-hidden="true">
                    {icono}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-white/95 drop-shadow">
                      {label}
                    </p>
                    <div
                      className={`relative h-4 overflow-hidden rounded-full border-2 border-[#2b211b] bg-white/85 ${bajo ? "animate-pulse" : ""}`}
                      role="progressbar"
                      aria-label={label}
                      aria-valuenow={Math.round(valor)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`m-barra-relleno h-full rounded-full transition-[width] duration-700 ease-out ${cambiando[label] ? "cambiando" : ""}`}
                        style={{ width: `${valor}%`, backgroundColor: bajo ? "#e5484d" : color }}
                      />
                      <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-semibold text-[#2b211b]">
                        {Math.round(valor)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {botones.map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={b.fn}
                disabled={ocupado && !m.durmiendo}
                className={`m-boton flex h-24 flex-col items-center justify-center gap-1 rounded-3xl border-[3px] border-[#2b211b] text-[#1d1612] shadow-[0_6px_0_#2b211b] disabled:cursor-wait disabled:opacity-70 sm:h-28 ${
                  b.necesita ? "necesita" : ""
                }`}
                style={{ background: b.color }}
              >
                <span className="m-boton-icono text-[2.6rem] leading-none drop-shadow-sm sm:text-5xl" aria-hidden="true">
                  {b.icono}
                </span>
                <span className="text-[15px] font-bold uppercase tracking-wide sm:text-base">{b.label}</span>
              </button>
            ))}
          </div>
          {errorMic && <p className="mt-3 text-center text-sm font-semibold text-yellow-100">{errorMic}</p>}
        </div>
      </div>
    </section>
  );
}
