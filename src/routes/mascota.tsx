import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Pencil, Check } from "lucide-react";
import { SnoopyEscena, type AccionMascota, type OidoMascota } from "@/components/SnoopyEscena";
import { useMascota, type Mascota } from "@/lib/mascota";
import { VozMascota } from "@/lib/voz-mascota";

export const Route = createFileRoute("/mascota")({
  head: () => ({
    meta: [
      { title: "Mi mascota · Snoopy's House 🐶" },
      { name: "description", content: "Cuida a Snoopy: dale de comer, báñalo, hazlo dormir y háblale." },
    ],
  }),
  component: MiMascota,
});

const FRASES = [
  "¡Qué lindo día! ☀️",
  "Woodstock es mi mejor amigo 🐤",
  "¿Me das una galleta? 🍪",
  "¡Te quiero mucho! ❤️",
  "Tócame, ¡me da cosquillas!",
  "Háblame, yo te repito 🎤",
];

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

function MiMascota() {
  const { m, listo, cambiar, consumirDesperto } = useMascota();
  const [accion, setAccion] = useState<AccionMascota>(null);
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

  // Frase de relleno que va cambiando.
  useEffect(() => {
    const id = window.setInterval(() => setFrase((f) => (f + 1) % FRASES.length), 7000);
    return () => window.clearInterval(id);
  }, []);

  // Si se despertó sola mientras mirabas.
  useEffect(() => {
    if (!m.durmiendo && consumirDesperto()) decir("¡Buenos días! ☀️", 3500);
  }, [m.durmiendo, consumirDesperto]);

  // Al salir de la página: apagar el micrófono y devolver la música.
  useEffect(
    () => () => {
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

  const hacer = (a: Exclude<AccionMascota, null>, ms: number) => {
    setAccion(a);
    window.setTimeout(() => setAccion((cur) => (cur === a ? null : cur)), ms);
  };

  const ocupado = accion !== null || oido === "hablando";

  const alimentar = () => {
    if (m.durmiendo) return decir("Shh… está durmiendo 💤");
    if (ocupado) return;
    if (m.comida >= 95) return decir("¡Estoy lleno! 😋");
    cambiar((p) => ({ comida: p.comida + 30, felicidad: p.felicidad + 5 }));
    hacer("comiendo", 2600);
    decir("¡Ñam, ñam! 🦴", 2600);
  };

  const banar = () => {
    if (m.durmiendo) return decir("Shh… está durmiendo 💤");
    if (ocupado) return;
    cambiar((p) => ({ higiene: 100, felicidad: p.felicidad + 3, energia: p.energia - 3 }));
    hacer("banando", 3400);
    decir("¡Splash! 🫧", 3400);
  };

  const dormir = () => {
    if (ocupado) return;
    if (m.durmiendo) {
      cambiar(() => ({ durmiendo: false }));
      decir("¡Buenos días! ☀️");
    } else {
      if (vozRef.current) apagarMic();
      cambiar(() => ({ durmiendo: true }));
      decir("Buenas noches… 🌙");
    }
  };

  const tocarSnoopy = () => {
    if (m.durmiendo) return decir("Zzz… déjame dormir 😴");
    if (ocupado) return;
    cambiar((p) => ({ felicidad: p.felicidad + 4 }));
    hacer("feliz", 1300);
    decir(["¡Jiji! 💛", "¡Me haces cosquillas!", "¡Te quiero! ❤️", "¡Otra vez!"][Math.floor(Math.random() * 4)]!);
  };

  const ponerBoca = useCallback((nivel: number) => {
    const boca = bocaRef.current;
    if (boca) boca.setAttribute("ry", String(1 + nivel * 9));
  }, []);

  const apagarMic = () => {
    vozRef.current?.detener();
    vozRef.current = null;
    setOido("inactivo");
    setTexto(null);
    musica("reanudar");
  };

  const prenderMic = async () => {
    if (m.durmiendo) return decir("Shh… está durmiendo 💤");
    setErrorMic(null);
    const voz = new VozMascota({
      onEstado: (e) => {
        setOido(e);
        if (e === "hablando") {
          cambiar((p) => ({ felicidad: p.felicidad + 2 }));
        }
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
    }
  };

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
              className={`font-display text-5xl font-bold tracking-wide drop-shadow-[0_2px_0_rgba(255,255,255,0.8)] sm:text-6xl ${
                m.durmiendo ? "text-[#c9d6ff]" : "text-[#1f3fa0]"
              }`}
            >
              {listo ? m.nombre.toUpperCase() : " "}
            </span>
            <Pencil size={16} className="text-white/80 opacity-60 transition group-hover:opacity-100" />
          </button>
        )}
        <p
          className={`-mt-1 text-xl font-extrabold sm:text-2xl ${
            m.durmiendo ? "text-white/85" : "text-[#26201c]"
          }`}
        >
          Snoopy&apos;s House
        </p>
      </div>

      {/* Escena */}
      <div className="relative z-0 -mt-4 h-[clamp(300px,50svh,560px)] w-full">
        {/* Funde el cielo del título con el de la escena (en pantallas anchas
            la escena se recorta arriba y los tonos no coinciden exacto). */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b to-transparent transition-colors duration-1000 ${
            m.durmiendo ? "from-[#1b2554]" : "from-[#6fa8d8]"
          }`}
        />
        <SnoopyEscena
          nombre={m.nombre}
          durmiendo={m.durmiendo}
          accion={accion}
          oido={oido}
          contento={contento}
          globo={globo}
          bocaRef={bocaRef}
          onTocarSnoopy={tocarSnoopy}
        />
      </div>

      {/* Pasto con las barras y los botones */}
      <div
        className={`relative pb-10 transition-colors duration-1000 ${
          m.durmiendo ? "bg-[#2a4a24]" : "bg-gradient-to-b from-[#4b8a2d] to-[#3f7a26]"
        }`}
      >
        <div className="mx-auto w-full max-w-xl px-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-3xl border border-white/25 bg-black/15 p-4 backdrop-blur-sm">
            {barras.map(([icono, label, valor, color]) => {
              const bajo = valor < 25;
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-2xl drop-shadow" aria-hidden="true">
                    {icono}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold uppercase tracking-wide text-white drop-shadow">
                      {label}
                    </p>
                    <div
                      className={`relative h-5 overflow-hidden rounded-full border-2 border-[#2b211b] bg-white/85 ${
                        bajo ? "animate-pulse" : ""
                      }`}
                      role="progressbar"
                      aria-label={label}
                      aria-valuenow={Math.round(valor)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${valor}%`, background: bajo ? "#e5484d" : color }}
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
            {(
              [
                ["🍖", "Alimentar", "#e2483d", alimentar],
                ["🛁", "Bañar", "#7cc4e4", banar],
                m.durmiendo
                  ? ["☀️", "Despertar", "#f2c23a", dormir]
                  : ["🌙", "Dormir", "#b07cd6", dormir],
              ] as Array<[string, string, string, () => void]>
            ).map(([icono, label, color, fn]) => (
              <button
                key={label}
                type="button"
                onClick={fn}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-3xl border-[3px] border-[#2b211b] text-[#1d1612] shadow-[0_6px_0_#2b211b] transition active:translate-y-1.5 active:shadow-[0_0_0_#2b211b] disabled:opacity-60 sm:aspect-[4/3]"
                style={{ background: color }}
              >
                <span className="text-4xl drop-shadow-sm sm:text-5xl" aria-hidden="true">
                  {icono}
                </span>
                <span className="text-sm font-black uppercase tracking-wide sm:text-base">{label}</span>
              </button>
            ))}
          </div>

          {/* Háblale */}
          {VozMascota.disponible() || !listo ? (
            <button
              type="button"
              onClick={() => (oido === "inactivo" ? prenderMic() : apagarMic())}
              className={`mt-5 flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-[#2b211b] px-5 py-3.5 text-base font-black shadow-[0_5px_0_#2b211b] transition active:translate-y-1 active:shadow-none ${
                oido === "inactivo" ? "bg-[#fff6e3] text-[#2b211b]" : "bg-[#ff6b6b] text-white"
              }`}
            >
              {oido === "inactivo" ? (
                <>
                  <Mic size={20} /> Háblale a Snoopy
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
            Toca a Snoopy para jugar. Sus barras bajan con el tiempo, ¡no lo olvides! 🐾
          </p>
        </div>
      </div>
    </section>
  );
}
