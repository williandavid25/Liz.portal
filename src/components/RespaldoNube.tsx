import { useEffect, useState } from "react";
import { guardarRespaldoFn, leerRespaldoFn } from "@/lib/cloud";

// Respalda en la nube lo que solo vive en el celular (Snoopy y Snoopy Learn),
// uno por persona. La primera vez pregunta de quién es el celular; si ya había
// un respaldo más nuevo (por ejemplo, después de reinstalar), lo recupera.

type Dueno = "liz" | "david";

const CLAVES = ["liz-mascota-juego", "snoopy-learn-v1"];
const DUENO_KEY = "liz-dueno";
const TS_KEY = "liz-respaldo-ts";
const CADA_MS = 60_000;

function leerLocal(): Record<string, string> {
  const datos: Record<string, string> = {};
  for (const k of CLAVES) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) datos[k] = v;
    } catch {
      /* sin acceso al almacenamiento */
    }
  }
  return datos;
}

function leer(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function escribir(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modo privado */
  }
}

export function RespaldoNube() {
  // undefined: aún no se leyó; null: falta elegir.
  const [dueno, setDueno] = useState<Dueno | null | undefined>(undefined);
  const [preguntar, setPreguntar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const d = leer(DUENO_KEY);
    setDueno(d === "liz" || d === "david" ? d : null);
  }, []);

  // La pregunta aparece cuando la pantalla ya cargó, no encima del inicio.
  useEffect(() => {
    if (dueno !== null) return;
    const t = window.setTimeout(() => setPreguntar(true), 1500);
    return () => window.clearTimeout(t);
  }, [dueno]);

  // Respaldo automático: cada minuto si algo cambió, y al salir de la app.
  useEffect(() => {
    if (!dueno) return;
    let subido = "";
    let enCurso = false;
    const subir = async () => {
      const datos = leerLocal();
      const s = JSON.stringify(datos);
      if (enCurso || s === subido || !Object.keys(datos).length) return;
      enCurso = true;
      const actualizado = Date.now();
      try {
        const r = await guardarRespaldoFn({ data: { dueno, datos, actualizado } });
        if (r.ok) {
          subido = s;
          escribir(TS_KEY, String(actualizado));
        }
      } catch {
        /* sin internet: se intenta en la próxima vuelta */
      } finally {
        enCurso = false;
      }
    };
    const alOcultar = () => {
      if (document.visibilityState === "hidden") void subir();
    };
    const primero = window.setTimeout(() => void subir(), 5000);
    const reloj = window.setInterval(() => void subir(), CADA_MS);
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", alOcultar);
    return () => {
      window.clearTimeout(primero);
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", alOcultar);
    };
  }, [dueno]);

  const elegir = async (d: Dueno) => {
    setOcupado(true);
    escribir(DUENO_KEY, d);
    try {
      const r = await leerRespaldoFn({ data: d });
      const nube = r.ok ? r.respaldo : null;
      const localTs = Number(leer(TS_KEY) ?? 0);
      if (nube && Object.keys(nube.datos).length && nube.actualizado > localTs) {
        // Hay un respaldo más nuevo: se recupera y se recarga para usarlo.
        for (const [k, v] of Object.entries(nube.datos)) {
          if (CLAVES.includes(k)) escribir(k, v);
        }
        escribir(TS_KEY, String(nube.actualizado));
        window.location.reload();
        return;
      }
    } catch {
      /* sin internet: se respalda lo de este celular cuando vuelva */
    }
    setPreguntar(false);
    setOcupado(false);
    setDueno(d);
  };

  if (!preguntar || dueno) return null;

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 px-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="respaldo-titulo"
        className="w-full max-w-xs rounded-3xl border border-white/15 bg-[#1b1230]/90 p-5 text-center text-white shadow-2xl backdrop-blur-xl"
      >
        <img src="/mascota/frente.webp" alt="" className="mx-auto h-20 w-20 object-contain" />
        <p id="respaldo-titulo" className="mt-2 text-lg font-extrabold">
          ¿De quién es este celular?
        </p>
        <p className="mt-1 text-[13px] leading-snug text-white/70">
          Así guardo tu Snoopy y tu racha en la nube, y no se pierden nunca.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void elegir("liz")}
            className="rounded-2xl bg-gradient-to-r from-pink-400 to-rose-500 py-3 font-extrabold shadow-lg transition hover:brightness-110 active:scale-95 disabled:opacity-60"
          >
            Liz
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void elegir("david")}
            className="rounded-2xl bg-gradient-to-r from-sky-400 to-indigo-500 py-3 font-extrabold shadow-lg transition hover:brightness-110 active:scale-95 disabled:opacity-60"
          >
            David
          </button>
        </div>
      </div>
    </div>
  );
}
