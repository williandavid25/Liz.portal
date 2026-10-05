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

  const botones: Array<{ icono: string; label: string; color: string; fn: () => void; necesita: boolean }> = [
    { icono: "🦴", label: "Lanzar hueso", color: "#e2483d", fn: lanzarHueso, necesita: !m.durmiendo && m.comida < 35 },
    { icono: "🛁", label: "Bañar", color: "#7cc4e4", fn: banar, necesita: !m.durmiendo && m.higiene < 35 },
    m.durmiendo
      ? { icono: "💡", label: "Encender luz", color: "#f2c23a", fn: tocarLampara, necesita: m.energia >= 100 }
      : { icono: "🌙", label: "Apagar luz", color: "#b07cd6", fn: tocarLampara, necesita: m.energia < 25 },
  ];

  const guardarNombre = () => {
    const n = nombreDraft.trim().slice(0, 14);
    if (n) cambiar(() => ({ nombre: n }));
    setEditandoNombre(false);
  };

  return (
    <section
      className={`relative -mb-px min-h-[100svh] overflow-hidden transition-colors duration-1000 ${
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
              className={`m-titulo font-display text-5xl font-bold tracking-wide drop-shadow-[0_2px_0_rgba(255,255,255,0.8)] sm:text-6xl ${
                m.durmiendo ? "text-[#c9d6ff]" : "text-[#1f3fa0]"
              }`}
            >
              {listo ? m.nombre.toUpperCase() : " "}
            </span>
            <Pencil size={16} className="text-white/80 opacity-60 transition group-hover:opacity-100" />
          </button>
        )}
        <p className={`-mt-1 text-xl font-extrabold sm:text-2xl ${m.durmiendo ? "text-white/85" : "text-[#26201c]"}`}>
          Snoopy&apos;s House
        </p>
      </div>

      {/* Escena */}
      <div className="relative z-0 -mt-4 h-[clamp(320px,52svh,580px)] w-full">
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
        />
      </div>

      {/* Pasto con barras y botones */}
      <div
        className={`relative pb-10 transition-colors duration-1000 ${
          m.durmiendo ? "bg-[#2a4a24]" : "bg-gradient-to-b from-[#4b8a2d] to-[#3f7a26]"
        }`}
      >
        <div className="mx-auto w-full max-w-xl px-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-3xl border border-white/25 bg-black/15 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-sm">
            {barras.map(([icono, label, valor, color], i) => {
              const bajo = valor < 25;
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="m-icono-barra text-2xl drop-shadow" style={{ animationDelay: `${-i * 0.6}s` }} aria-hidden="true">
                    {icono}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold uppercase tracking-wide text-white drop-shadow">{label}</p>
                    <div
                      className={`relative h-5 overflow-hidden rounded-full border-2 border-[#2b211b] bg-white/85 ${bajo ? "animate-pulse" : ""}`}
                      role="progressbar"
                      aria-label={label}
                      aria-valuenow={Math.round(valor)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="m-barra-relleno h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${valor}%`, backgroundColor: bajo ? "#e5484d" : color }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-extrabold text-[#2b211b]">
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
                className={`m-boton flex aspect-square flex-col items-center justify-center gap-1 rounded-3xl border-[3px] border-[#2b211b] text-[#1d1612] shadow-[0_6px_0_#2b211b] disabled:cursor-wait disabled:opacity-70 sm:aspect-[4/3] ${
                  b.necesita ? "necesita" : ""
                }`}
                style={{ background: b.color }}
              >
                <span className="m-boton-icono text-4xl drop-shadow-sm sm:text-5xl" aria-hidden="true">
                  {b.icono}
                </span>
                <span className="text-center text-[13px] font-black uppercase leading-tight tracking-wide sm:text-base">
                  {b.label}
                </span>
              </button>
            ))}
          </div>

          {VozMascota.disponible() || !listo ? (
            <button
              type="button"
              onClick={() => (oido === "inactivo" ? prenderMic() : apagarMic())}
              disabled={oido === "inactivo" && ocupado}
              className={`m-boton mt-5 flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-[#2b211b] px-5 py-3.5 text-base font-black shadow-[0_5px_0_#2b211b] disabled:opacity-70 ${
                oido === "inactivo" ? "bg-[#fff6e3] text-[#2b211b]" : "bg-[#ff6b6b] text-white"
              }`}
            >
              {oido === "inactivo" ? (
                <>
                  <Mic size={20} className="m-boton-icono" /> Háblale a Snoopy
                </>
              ) : (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                  </span>
                  {oido === "hablando" ? "Snoopy te repite…" : "Te escucha… toca para terminar"}
                  <MicOff size={18} className="opacity-80" />
                </>
              )}
            </button>
          ) : null}
          {errorMic && <p className="mt-2 text-center text-sm font-semibold text-yellow-100">{errorMic}</p>}
          <p className="mt-3 text-center text-xs text-white/75">
            Toca a Snoopy para jugar 🐾 · Toca la lámpara para apagar o encender la luz 💡
          </p>
        </div>
      </div>
    </section>
  );
}
