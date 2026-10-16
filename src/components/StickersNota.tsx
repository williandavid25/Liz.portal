import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCw, Trash2, X } from "lucide-react";
import { agregarStickerFn, borrarStickerFn, listarStickersFn } from "@/lib/cloud";
import {
  ANCHO_MAX,
  ANCHO_MIN,
  MAX_BYTES_STICKER,
  type Sticker,
  type StickerEnNota,
} from "@/lib/stickers";

/* This module intentionally exports sticker helpers used by MascotaGame. */
/* eslint-disable react-refresh/only-export-components */

// Stickers de las notitas: una colección compartida (los dos celulares ven la
// misma) y una capa sobre el post-it donde se pegan, mueven, agrandan y giran.

const CACHE_KEY = "liz-stickers";

function leerCache(): Sticker[] {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    return Array.isArray(v) ? (v as Sticker[]) : [];
  } catch {
    return [];
  }
}

/** La colección: primero la copia del celular (al instante), luego la nube. */
export function useColeccionStickers(activo: boolean) {
  const [stickers, setStickers] = useState<Sticker[]>(() =>
    typeof window === "undefined" ? [] : leerCache(),
  );
  const guardar = (lista: Sticker[]) => {
    setStickers(lista);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(lista));
    } catch {
      /* sin espacio */
    }
  };
  const recargar = useCallback(() => {
    listarStickersFn()
      .then((r) => r.ok && guardar(r.stickers))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (activo) recargar();
  }, [activo, recargar]);
  return { stickers, guardar, recargar };
}

/** ¿Es un WebP animado? (tiene el bloque "ANIM") */
async function esAnimado(file: File): Promise<boolean> {
  if (file.type === "image/gif") return true;
  if (file.type !== "image/webp") return false;
  const cabecera = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return new TextDecoder().decode(cabecera).includes("ANIM");
}

/**
 * Deja el sticker listo para subir: los animados y livianos se conservan tal
 * cual (para que sigan moviéndose); los demás se ajustan a 512 px sin perder
 * la transparencia.
 */
export async function prepararSticker(file: File): Promise<File | null> {
  if (!file.type.startsWith("image/")) return null;
  if ((await esAnimado(file)) && file.size <= MAX_BYTES_STICKER) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file.size <= MAX_BYTES_STICKER ? file : null;
  const escala = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const aBlob = (tipo: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, 0.9));
  // WebP si el celular lo sabe escribir; si no, PNG (los dos con transparencia).
  let blob = await aBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await aBlob("image/png");
  if (!blob || blob.size > MAX_BYTES_STICKER) return null;
  return new File([blob], `sticker.${blob.type === "image/webp" ? "webp" : "png"}`, {
    type: blob.type,
  });
}

export async function subirSticker(file: File): Promise<Sticker | null> {
  const listo = await prepararSticker(file);
  if (!listo) return null;
  const fd = new FormData();
  fd.append("file", listo);
  const r = await agregarStickerFn({ data: fd }).catch(() => null);
  return r?.ok ? r.sticker : null;
}

/* ---------------- Colección ---------------- */

export function ColeccionStickers({
  stickers,
  onCambio,
  onElegir,
  lleno,
}: {
  stickers: Sticker[];
  onCambio: (lista: Sticker[]) => void;
  onElegir: (s: Sticker) => void;
  lleno: boolean;
}) {
  const [subiendo, setSubiendo] = useState(0);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const agregar = async (archivos: File[]) => {
    const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
    if (imagenes.length === 0) return;
    setSubiendo((n) => n + imagenes.length);
    let lista = stickers;
    let fallidos = 0;
    for (const f of imagenes) {
      const s = await subirSticker(f);
      if (s) lista = [s, ...lista];
      else fallidos++;
      setSubiendo((n) => n - 1);
      onCambio(lista);
    }
    setAviso(fallidos ? "Algún sticker no se pudo subir (muy pesado o sin conexión)" : null);
  };

  // Pegar un sticker copiado (Ctrl+V / mantener presionado → Pegar).
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const archivos = [...(e.clipboardData?.files ?? [])];
      if (archivos.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        void agregar(archivos);
      }
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  });

  const borrar = async (s: Sticker) => {
    onCambio(stickers.filter((x) => x.id !== s.id));
    await borrarStickerFn({ data: s.id }).catch(() => null);
  };

  return (
    <div className="rounded-2xl bg-white/[0.06] p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
          Tus stickers
        </p>
        {stickers.length > 0 && (
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white/70 hover:bg-white/10"
          >
            {editando ? "Listo" : "Editar"}
          </button>
        )}
      </div>
      <div className="grid max-h-36 grid-cols-5 gap-1.5 overflow-y-auto pr-0.5">
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="grid aspect-square place-items-center rounded-xl border border-dashed border-white/30 text-white/70 transition hover:bg-white/10"
          aria-label="Agregar stickers desde el celular"
          title="Agregar stickers (también puedes pegarlos)"
        >
          {subiendo > 0 ? (
            <span className="text-[10px] font-bold">{subiendo}…</span>
          ) : (
            <ImagePlus size={20} />
          )}
        </button>
        {stickers.map((s) => (
          <div key={s.id} className="relative">
            <button
              type="button"
              disabled={lleno && !editando}
              onClick={() => (editando ? void borrar(s) : onElegir(s))}
              className={`grid aspect-square w-full place-items-center rounded-xl bg-white/[0.04] p-1 transition hover:bg-white/10 active:scale-90 disabled:opacity-40 ${
                editando ? "mg-sticker-temblor" : ""
              }`}
              aria-label={editando ? "Quitar de la colección" : "Pegar este sticker"}
            >
              <img
                src={s.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="max-h-full max-w-full object-contain"
              />
            </button>
            {editando && (
              <span className="pointer-events-none absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white">
                <X size={10} />
              </span>
            )}
          </div>
        ))}
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const archivos = [...(e.target.files ?? [])];
          e.target.value = "";
          void agregar(archivos);
        }}
      />
      {stickers.length === 0 && subiendo === 0 && (
        <p className="mt-2 text-[11px] leading-snug text-white/55">
          Agrega stickers desde tus fotos o archivos. En Android, los de WhatsApp están en{" "}
          <span className="font-semibold text-white/75">
            Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Stickers
          </span>
          .
        </p>
      )}
      {lleno && !editando && (
        <p className="mt-2 text-[11px] text-amber-200">Esta nota ya tiene el máximo de stickers.</p>
      )}
      {aviso && <p className="mt-2 text-[11px] text-amber-200">{aviso}</p>}
    </div>
  );
}

/* ---------------- Capa sobre el post-it ---------------- */

type Gesto =
  | { tipo: "mover"; i: number; x0: number; y0: number; px: number; py: number }
  | { tipo: "pellizco"; i: number; d0: number; a0: number; w0: number; r0: number }
  | { tipo: "manija"; i: number; d0: number; a0: number; w0: number; r0: number };

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function CapaStickers({
  stickers,
  editable = false,
  seleccion = null,
  onSeleccion,
  onCambio,
}: {
  stickers: StickerEnNota[];
  editable?: boolean;
  seleccion?: number | null;
  onSeleccion?: (i: number | null) => void;
  onCambio?: (lista: StickerEnNota[]) => void;
}) {
  const capa = useRef<HTMLDivElement>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<Gesto | null>(null);
  const actual = useRef(stickers);
  actual.current = stickers;

  const cambiar = (i: number, parcial: Partial<StickerEnNota>) => {
    const lista = actual.current.map((s, k) => (k === i ? { ...s, ...parcial } : s));
    onCambio?.(lista);
  };

  const centroEnPantalla = (i: number) => {
    const r = capa.current!.getBoundingClientRect();
    const s = actual.current[i]!;
    return { cx: r.left + s.x * r.width, cy: r.top + s.y * r.height, ancho: r.width };
  };

  const empezarPellizco = (i: number) => {
    const [a, b] = [...punteros.current.values()];
    if (!a || !b) return;
    const s = actual.current[i]!;
    gesto.current = {
      tipo: "pellizco",
      i,
      d0: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      a0: Math.atan2(b.y - a.y, b.x - a.x),
      w0: s.w,
      r0: s.r,
    };
  };

  const alBajar = (e: React.PointerEvent, i: number, manija = false) => {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* el dedo ya se levantó */
    }
    onSeleccion?.(i);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = actual.current[i]!;
    if (manija) {
      const { cx, cy } = centroEnPantalla(i);
      gesto.current = {
        tipo: "manija",
        i,
        d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
        a0: Math.atan2(e.clientY - cy, e.clientX - cx),
        w0: s.w,
        r0: s.r,
      };
    } else if (punteros.current.size >= 2) {
      empezarPellizco(i);
    } else {
      gesto.current = { tipo: "mover", i, x0: s.x, y0: s.y, px: e.clientX, py: e.clientY };
    }
  };

  const alMover = (e: React.PointerEvent) => {
    const g = gesto.current;
    if (!g || !punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = capa.current!.getBoundingClientRect();
    if (g.tipo === "mover") {
      cambiar(g.i, {
        x: limitar(g.x0 + (e.clientX - g.px) / r.width, 0, 1),
        y: limitar(g.y0 + (e.clientY - g.py) / r.height, 0, 1),
      });
    } else if (g.tipo === "pellizco") {
      const [a, b] = [...punteros.current.values()];
      if (!a || !b) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      cambiar(g.i, {
        w: limitar((g.w0 * d) / g.d0, ANCHO_MIN, ANCHO_MAX),
        r: g.r0 + ((ang - g.a0) * 180) / Math.PI,
      });
    } else {
      const { cx, cy } = centroEnPantalla(g.i);
      const d = Math.hypot(e.clientX - cx, e.clientY - cy);
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
      cambiar(g.i, {
        w: limitar((g.w0 * d) / g.d0, ANCHO_MIN, ANCHO_MAX),
        r: g.r0 + ((ang - g.a0) * 180) / Math.PI,
      });
    }
  };

  const alSubir = (e: React.PointerEvent) => {
    punteros.current.delete(e.pointerId);
    const g = gesto.current;
    if (!g) return;
    // Si queda un dedo después de pellizcar, sigue moviendo desde ahí.
    const resto = [...punteros.current.values()][0];
    if (resto && g.tipo === "pellizco") {
      const s = actual.current[g.i]!;
      gesto.current = { tipo: "mover", i: g.i, x0: s.x, y0: s.y, px: resto.x, py: resto.y };
    } else if (punteros.current.size === 0) {
      gesto.current = null;
    }
  };

  return (
    <div ref={capa} className="pointer-events-none absolute inset-0 z-[2]">
      {stickers.map((s, i) => {
        const elegido = editable && seleccion === i;
        return (
          <div
            key={i}
            className={`absolute ${editable ? "pointer-events-auto touch-none" : ""}`}
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              width: `${s.w * 100}%`,
              transform: `translate(-50%, -50%) rotate(${s.r}deg)`,
            }}
            onPointerDown={(e) => alBajar(e, i)}
            onPointerMove={alMover}
            onPointerUp={alSubir}
            onPointerCancel={alSubir}
          >
            <img
              src={s.u}
              alt=""
              draggable={false}
              className={`mg-sticker block w-full select-none ${elegido ? "elegido" : ""}`}
            />
            {elegido && (
              <>
                <button
                  type="button"
                  aria-label="Quitar sticker"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCambio?.(actual.current.filter((_, k) => k !== i));
                    onSeleccion?.(null);
                  }}
                  className="absolute -left-3 -top-3 grid h-7 w-7 place-items-center rounded-full bg-rose-500 text-white shadow-lg"
                  style={{ transform: `rotate(${-s.r}deg)` }}
                >
                  <Trash2 size={13} />
                </button>
                <span
                  role="button"
                  aria-label="Girar y cambiar tamaño"
                  onPointerDown={(e) => alBajar(e, i, true)}
                  onPointerMove={alMover}
                  onPointerUp={alSubir}
                  onPointerCancel={alSubir}
                  className="absolute -bottom-3 -right-3 grid h-7 w-7 touch-none place-items-center rounded-full bg-white text-[#3a1030] shadow-lg"
                >
                  <RotateCw size={13} />
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const STICKERS_CSS = `
.mg-sticker { filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35)); transition: filter 0.2s ease; }
.mg-sticker.elegido { filter: drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 6px 10px rgba(0,0,0,0.45)); }
.mg-sticker-temblor { animation: mg-sticker-temblor 0.28s ease-in-out infinite alternate; }
@keyframes mg-sticker-temblor { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
.mg-sticker-entra { animation: mg-sticker-entra 0.35s cubic-bezier(.2,.9,.3,1.4) both; }
@keyframes mg-sticker-entra { 0% { transform: scale(0.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mg-sticker-temblor { animation: none; } }
`;
