/* This module intentionally exports the speech helper used by SnoopyLearn. */
/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Volume2 } from "lucide-react";
import type { Ejercicio, Vocabulario } from "@/lib/learn/tipos";

// Cada tipo de ejercicio en su propia pantalla. El componente solo reporta la
// respuesta elegida; corregir y avanzar lo decide la sesión.

export type Respuesta = number | string | string[] | null;

/** Pronuncia con la voz del celular (gratis, sin descargar audios). */
export function pronunciar(texto: string, lang = "en-US") {
  try {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto.replace(/…/g, ""));
    u.lang = lang;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch {
    /* sin lector de voz */
  }
}

export function BotonVoz({ texto, lang }: { texto: string; lang: string }) {
  return (
    <button
      type="button"
      onClick={() => pronunciar(texto, lang)}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-95"
      aria-label={`Escuchar: ${texto}`}
    >
      <Volume2 size={18} />
    </button>
  );
}

const chip =
  "rounded-2xl border px-4 py-3 text-left text-[15px] font-semibold transition-[transform,background-color,border-color,box-shadow] duration-200 active:scale-[0.97]";

function claseOpcion(elegida: boolean, revisada: boolean, correcta: boolean) {
  if (revisada && correcta)
    return "border-emerald-300/80 bg-emerald-400/25 text-white shadow-[0_0_0_3px_rgba(52,211,153,0.25)]";
  if (revisada && elegida) return "border-rose-300/80 bg-rose-500/25 text-white";
  if (elegida)
    return "border-[var(--acento)] bg-white/20 text-white shadow-[0_0_0_3px_var(--acento-suave)]";
  return "border-white/15 bg-white/[0.07] text-white/90 hover:bg-white/[0.12]";
}

/* ---------------- Tarjeta de vocabulario ---------------- */

export function TarjetaVocab({ v, voz }: { v: Vocabulario; voz?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="lrn-tarjeta rounded-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[26px] font-bold leading-tight text-white">{v.term}</p>
          {voz && <BotonVoz texto={v.term} lang={voz} />}
        </div>
        <p className="mt-2 text-lg text-white/80">{v.translation}</p>
        {v.example_en && (
          <div className="mt-5 rounded-2xl bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-white">{v.example_en}</p>
              {voz && <BotonVoz texto={v.example_en} lang={voz} />}
            </div>
            {v.example_es && <p className="mt-1 text-sm text-white/65">{v.example_es}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Ejercicios ---------------- */

export function VistaEjercicio({
  ej,
  respuesta,
  revisada,
  voz,
  onRespuesta,
  onErrorPareja,
}: {
  ej: Ejercicio;
  respuesta: Respuesta;
  revisada: boolean;
  voz?: string;
  onRespuesta: (r: Respuesta) => void;
  onErrorPareja: () => void;
}) {
  switch (ej.type) {
    case "multiple_choice":
      return (
        <div className="flex flex-col gap-4">
          <Enunciado texto={ej.question} voz={voz} />
          <div className="grid gap-2.5">
            {ej.options.map((op, i) => (
              <button
                key={op}
                type="button"
                disabled={revisada}
                onClick={() => onRespuesta(i)}
                className={`${chip} ${claseOpcion(respuesta === i, revisada, i === ej.correct_index)}`}
              >
                {op}
              </button>
            ))}
          </div>
        </div>
      );
    case "fill_blank": {
      const [antes, despues] = ej.sentence.split("___");
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/55">
            Completa la frase
          </p>
          <p className="lrn-tarjeta rounded-3xl p-5 text-xl font-semibold leading-relaxed text-white">
            {antes}
            <span
              className={`mx-1 inline-block min-w-[5.5rem] rounded-xl border-b-2 px-2 text-center ${
                respuesta ? "border-[var(--acento)] bg-white/15" : "border-white/40"
              }`}
            >
              {typeof respuesta === "string" ? respuesta : " "}
            </span>
            {despues}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {ej.options.map((op) => (
              <button
                key={op}
                type="button"
                disabled={revisada}
                onClick={() => onRespuesta(op)}
                className={`${chip} ${claseOpcion(respuesta === op, revisada, op === ej.correct)}`}
              >
                {op}
              </button>
            ))}
          </div>
          {ej.hint && !revisada && <p className="text-xs text-white/55">Pista: {ej.hint}</p>}
        </div>
      );
    }
    case "word_order":
      return (
        <Ordenar
          ej={ej}
          respuesta={respuesta}
          revisada={revisada}
          onRespuesta={onRespuesta}
          voz={voz}
        />
      );
    case "word_match":
      return <Emparejar ej={ej} onRespuesta={onRespuesta} onError={onErrorPareja} />;
  }
}

function Enunciado({ texto, voz }: { texto: string; voz?: string }) {
  // Solo se lee en voz alta lo que está en inglés (entre comillas simples o la frase entera).
  const enIngles = voz
    ? (texto.match(/'([^']+)'/)?.[1] ?? (/^[A-Za-z][\w\s,'.?!-]*$/.test(texto) ? texto : null))
    : null;
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-xl font-bold leading-snug text-white">{texto}</p>
      {voz && enIngles && <BotonVoz texto={enIngles} lang={voz} />}
    </div>
  );
}

function Ordenar({
  ej,
  respuesta,
  revisada,
  onRespuesta,
  voz,
}: {
  ej: Extract<Ejercicio, { type: "word_order" }>;
  respuesta: Respuesta;
  revisada: boolean;
  onRespuesta: (r: Respuesta) => void;
  voz?: string;
}) {
  // Se guardan índices (puede haber palabras repetidas).
  const [usadas, setUsadas] = useState<number[]>([]);
  const armar = (idx: number[]) => {
    setUsadas(idx);
    onRespuesta(idx.length === ej.words.length ? idx.map((i) => ej.words[i]!) : null);
  };
  void respuesta;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/55">
            Ordena la frase
          </p>
          {ej.translation && <p className="mt-1 text-lg font-bold text-white">{ej.translation}</p>}
        </div>
        {voz && revisada && <BotonVoz texto={ej.correct} lang={voz} />}
      </div>
      <div className="lrn-tarjeta flex min-h-[64px] flex-wrap content-start gap-2 rounded-3xl p-3">
        {usadas.length === 0 && (
          <span className="px-2 py-2 text-sm text-white/45">Toca las palabras en orden…</span>
        )}
        {usadas.map((i) => (
          <motion.button
            layout
            key={`u-${i}`}
            type="button"
            disabled={revisada}
            onClick={() => armar(usadas.filter((x) => x !== i))}
            className="rounded-xl border border-white/25 bg-white/20 px-3 py-2 text-[15px] font-semibold text-white"
          >
            {ej.words[i]}
          </motion.button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {ej.words.map((w, i) => {
          const usada = usadas.includes(i);
          return (
            <motion.button
              layout
              key={`b-${i}`}
              type="button"
              disabled={usada || revisada}
              onClick={() => armar([...usadas, i])}
              className={`rounded-xl border px-3 py-2 text-[15px] font-semibold transition ${
                usada
                  ? "border-white/5 bg-white/5 text-transparent"
                  : "border-white/15 bg-white/[0.08] text-white hover:bg-white/15"
              }`}
            >
              {w}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function Emparejar({
  ej,
  onRespuesta,
  onError,
}: {
  ej: Extract<Ejercicio, { type: "word_match" }>;
  onRespuesta: (r: Respuesta) => void;
  onError: () => void;
}) {
  const derecha = useMemo(() => {
    const a = ej.pairs.map((p) => p[1]);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }, [ej]);
  const [izq, setIzq] = useState<string | null>(null);
  const [hechas, setHechas] = useState<string[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);

  const elegirDerecha = (d: string) => {
    if (!izq) return;
    const par = ej.pairs.find((p) => p[0] === izq);
    if (par && par[1] === d) {
      const nuevas = [...hechas, izq];
      setHechas(nuevas);
      setIzq(null);
      if (nuevas.length === ej.pairs.length) onRespuesta("ok");
    } else {
      setFallo(d);
      onError();
      setTimeout(() => setFallo(null), 450);
    }
  };

  const base =
    "w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold transition duration-200";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl font-bold text-white">Une cada pareja</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="grid gap-2.5">
          {ej.pairs.map(([a]) => {
            const hecha = hechas.includes(a);
            return (
              <button
                key={a}
                type="button"
                disabled={hecha}
                onClick={() => setIzq(a)}
                className={`${base} ${
                  hecha
                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100/70"
                    : izq === a
                      ? "border-[var(--acento)] bg-white/20 text-white shadow-[0_0_0_3px_var(--acento-suave)]"
                      : "border-white/15 bg-white/[0.07] text-white"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
        <div className="grid gap-2.5">
          {derecha.map((d) => {
            const hecha = ej.pairs.some(([a, b]) => b === d && hechas.includes(a));
            return (
              <button
                key={d}
                type="button"
                disabled={hecha}
                onClick={() => elegirDerecha(d)}
                className={`${base} ${
                  hecha
                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100/70"
                    : fallo === d
                      ? "lrn-sacudir border-rose-300/80 bg-rose-500/25 text-white"
                      : "border-white/15 bg-white/[0.07] text-white"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
