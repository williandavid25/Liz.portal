import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Trash2,
  X,
  Link as LinkIcon,
  ImagePlus,
  ImageOff,
  Cloud,
  CloudOff,
  ExternalLink,
  Images,
} from "lucide-react";
import {
  loadStoreShared,
  saveFotos,
  queuePendingFotos,
  uploadImage,
  resolvePreview,
  type PhotoMeta,
} from "@/lib/cloud";
import { compressImage, getPhotoDate } from "@/lib/image";

export const Route = createFileRoute("/recuerdos")({
  head: () => ({
    meta: [
      { title: "Recuerdos · Feliz Cumpleaños" },
      { name: "description", content: "Galería de fotos favoritas, guardadas en la nube." },
      { property: "og:title", content: "Recuerdos" },
      { property: "og:description", content: "Álbum de recuerdos de cumpleaños." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Recuerdos,
});

const FOTOS_KEY = "birthday-fotos-cloud";

// ¿La URL es una imagen directa (foto real) o un enlace de álbum/página?
const isDirectImage = (u: string) =>
  /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(u) ||
  /(googleusercontent|blob\.vercel-storage)\.com/i.test(u);

function Recuerdos() {
  const [fotos, setFotos] = useState<PhotoMeta[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cloudOn, setCloudOn] = useState<boolean | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lista siempre al día: una subida tarda varios segundos y no debe guardar
  // encima una copia vieja (eso borraba fotos de la nube).
  const fotosRef = useRef<PhotoMeta[]>([]);
  fotosRef.current = fotos;
  // Hasta que no llegue la lista de la nube no se guarda nada encima.
  const cargaInicial = useRef<Promise<unknown>>(Promise.resolve());

  // Guarda en la nube + espejo local. Si falla (sin conexión o la nube no
  // responde), queda anotado para reintentarlo solo apenas vuelva.
  const persist = async (next: PhotoMeta[]) => {
    fotosRef.current = next;
    setFotos(next);
    localStorage.setItem(FOTOS_KEY, JSON.stringify(next));
    const r = await saveFotos({ data: next }).catch(() => ({ ok: false }));
    if (!r.ok) {
      console.error("No se pudo guardar en la nube; se reintentará.");
      queuePendingFotos(next);
    }
  };

  useEffect(() => {
    // Espejo local primero (rápido), luego la nube (fuente de verdad)
    let local: PhotoMeta[] = [];
    try {
      const m = localStorage.getItem(FOTOS_KEY);
      if (m) {
        local = JSON.parse(m);
        setFotos(local);
      }
    } catch {
      /* ignore */
    }
    cargaInicial.current = loadStoreShared()
      .then((s) => {
        if (!s.configured) {
          setCloudOn(false);
          return;
        }
        setCloudOn(true);
        if (s.fotos.length > 0) {
          fotosRef.current = s.fotos;
          setFotos(s.fotos);
          localStorage.setItem(FOTOS_KEY, JSON.stringify(s.fotos));
        } else if (local.length > 0) {
          // Nube vacía pero hay fotos locales (enlaces): las subimos (migración)
          saveFotos({ data: local }).catch(() => {});
        }
      })
      .catch(() => setCloudOn(false))
      .finally(() => setLoading(false));
  }, []);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    setBusy(true);
    setStatus("Subiendo tus fotos…");
    const nuevas: PhotoMeta[] = [];
    let error = false;
    for (const f of arr) {
      try {
        // Fecha real de captura (EXIF) leída del archivo ORIGINAL antes de comprimir
        const takenAt = await getPhotoDate(f);
        const small = await compressImage(f);
        const fd = new FormData();
        fd.append("file", small);
        const { url } = await uploadImage({ data: fd });
        if (url) {
          nuevas.push({
            id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
            url,
            date: takenAt,
          });
        } else {
          error = true;
        }
      } catch (e) {
        console.error("Error al subir foto:", e);
        error = true;
      }
    }
    await cargaInicial.current.catch(() => {});
    if (nuevas.length) await persist([...nuevas, ...fotosRef.current]);
    setBusy(false);
    setStatus(
      error
        ? "Algunas fotos no se subieron. Activa el Almacenamiento (Blob) en Vercel para guardarlas en la nube."
        : null,
    );
  };

  const addLink = async () => {
    const u = linkInput.trim();
    if (!u) return;
    setLinkInput("");
    const parts = u.split(/[\s,]+/).filter(Boolean);
    const isImageUrl = (s: string) => /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(s);
    setBusy(true);
    setStatus("Cargando vista previa…");
    const nuevas: PhotoMeta[] = [];
    for (const raw of parts) {
      // "www.sitio.com/foto.jpg" sin https:// no pasa la validación de la nube
      // y bloqueaba todos los guardados siguientes.
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        new URL(url);
      } catch {
        continue;
      }
      const base = { id: `url-${Date.now()}-${Math.round(Math.random() * 1e9)}`, date: Date.now() };
      if (isImageUrl(url)) {
        nuevas.push({ ...base, url });
      } else {
        // Enlace de álbum/página (ej. Google Fotos): sacar miniatura de vista previa
        try {
          const { thumbnail } = await resolvePreview({ data: url });
          nuevas.push({ ...base, url: thumbnail || url, link: url });
        } catch {
          nuevas.push({ ...base, url, link: url });
        }
      }
    }
    await cargaInicial.current.catch(() => {});
    if (nuevas.length) await persist([...nuevas, ...fotosRef.current]);
    setBusy(false);
    setStatus(nuevas.length ? null : "Ese enlace no es válido.");
  };

  const handleDelete = async (id: string) => {
    await persist(fotosRef.current.filter((f) => f.id !== id));
    setLightbox((cur) => (cur === id ? null : cur));
  };

  // Fotos que ya no se pueden mostrar (el almacenamiento antiguo dejó de
  // entregarlas) se ocultan en vez de dejar cuadros vacíos.
  const sorted = useMemo(
    () =>
      [...fotos]
        .filter((f) => !(failed[f.id] && !f.link && isDirectImage(f.url)))
        .sort((a, b) => b.date - a.date),
    [fotos, failed],
  );

  const hiddenCount = fotos.length - sorted.length;

  const groups = useMemo(() => {
    const map = new Map<string, PhotoMeta[]>();
    for (const p of sorted) {
      const key = new Date(p.date).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()];
  }, [sorted]);

  const lightboxSrc = fotos.find((f) => f.id === lightbox)?.url;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <section className="relative py-28 px-4 sm:px-6 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Encabezado */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <h2 className="font-display text-5xl md:text-6xl text-gradient-cosmic">Recuerdos</h2>
          <p className="mt-3 text-foreground/75 font-medium">
            Todas nuestras fotos favoritas, en un solo lugar
          </p>

          {/* Estado de la nube */}
          {cloudOn === true && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary/80">
              <Cloud size={14} /> Guardado en la nube · se ve en todos tus dispositivos
            </p>
          )}
          {cloudOn === false && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CloudOff size={14} /> Nube no activada aún · guardando solo en este dispositivo
            </p>
          )}
          {hiddenCount > 0 && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff size={14} /> {hiddenCount}{" "}
              {hiddenCount === 1
                ? "foto antigua no está disponible"
                : "fotos antiguas no están disponibles"}{" "}
              · vuelve a subirlas para verlas aquí
            </p>
          )}
        </motion.div>

        {/* Subir fotos */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-10"
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-300 glass ${
              dragOver ? "border-primary scale-[1.01]" : "border-primary/25 hover:border-primary/50"
            }`}
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const elegidos = Array.from(e.target.files ?? []);
                // Permite volver a elegir el mismo archivo.
                e.target.value = "";
                void handleFiles(elegidos);
              }}
            />
            <motion.div
              animate={busy ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: busy ? Infinity : 0, duration: 1 }}
              className="mx-auto w-16 h-16 rounded-full grid place-items-center text-white mb-4"
              style={{ background: "var(--gradient-rose)", boxShadow: "var(--shadow-glow)" }}
            >
              {busy ? <ImagePlus size={28} /> : <Upload size={28} />}
            </motion.div>
            <p className="font-bold text-lg text-popover-foreground/90">
              {busy ? "Subiendo tus fotos…" : "Sube tus fotos aquí"}
            </p>
            <p className="text-sm text-popover-foreground/60 mt-1">
              Toca para elegir o arrastra las imágenes · se guardan solas
            </p>
          </div>

          {status && <p className="mt-3 text-center text-sm text-primary">{status}</p>}

          {/* Agregar por enlace de imagen */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2 max-w-2xl mx-auto">
            <div className="flex-1 flex items-center gap-2 bg-white/70 rounded-full px-4 py-1 border border-primary/20 focus-within:border-primary">
              <LinkIcon size={16} className="text-popover-foreground/50 shrink-0" />
              <input
                type="url"
                placeholder="Pega el enlace de una imagen y presiona Agregar"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLink()}
                className="flex-1 bg-transparent py-2 outline-none text-sm text-popover-foreground"
              />
            </div>
            <button
              onClick={addLink}
              className="px-6 py-3 rounded-full text-white font-bold text-sm hover:scale-105 transition shrink-0"
              style={{ background: "var(--gradient-rose)" }}
            >
              Agregar enlace
            </button>
          </div>
        </motion.div>

        {/* Galería agrupada por fecha */}
        <div className="mt-12">
          {loading ? (
            <p className="text-center text-muted-foreground">Cargando recuerdos…</p>
          ) : fotos.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-muted-foreground py-12"
            >
              Aún no hay fotos. Sube las primeras o pega un enlace y aparecerán aquí, ordenadas por
              fecha.
            </motion.div>
          ) : (
            <div className="space-y-10">
              {groups.map(([date, items], gi) => (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.5, delay: gi * 0.05 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className="text-sm font-bold px-3 py-1 rounded-full text-white capitalize"
                      style={{ background: "var(--gradient-rose)" }}
                    >
                      {date}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? "foto" : "fotos"}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {items.map((p, i) => {
                      // Si no es una imagen directa (ej. enlace de álbum), al tocar abre el enlace.
                      const linkTarget = p.link ?? (isDirectImage(p.url) ? null : p.url);
                      return (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, scale: 0.85 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.04 }}
                          whileHover={{ scale: 1.03 }}
                          className="group relative aspect-square rounded-2xl overflow-hidden glass cursor-pointer"
                          style={{ boxShadow: "var(--shadow-soft)" }}
                          onClick={() => {
                            if (linkTarget) window.open(linkTarget, "_blank", "noopener");
                            else if (!failed[p.id]) setLightbox(p.id);
                          }}
                        >
                          {!failed[p.id] ? (
                            <img
                              src={p.url}
                              alt="Recuerdo"
                              loading="lazy"
                              decoding="async"
                              onError={() => setFailed((f) => ({ ...f, [p.id]: true }))}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                          ) : linkTarget ? (
                            <div
                              className="w-full h-full grid place-items-center text-center text-white p-3 gap-1"
                              style={{ background: "var(--gradient-rose)" }}
                            >
                              <Images size={26} />
                              <span className="text-[11px] font-bold leading-tight">Ver álbum</span>
                            </div>
                          ) : (
                            <div className="w-full h-full grid place-items-center text-center text-popover-foreground/60 p-3 gap-1">
                              <ImageOff size={22} />
                              <span className="text-[10px] leading-tight">No se pudo cargar</span>
                            </div>
                          )}
                          {linkTarget && !failed[p.id] && (
                            <span className="absolute bottom-2 left-2 p-1 rounded-full bg-black/50 text-white">
                              <ExternalLink size={12} />
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(p.id);
                            }}
                            className="absolute top-2 right-2 p-2 rounded-full bg-black/55 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-destructive transition-all"
                            aria-label="Eliminar foto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm grid place-items-center p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={lightboxSrc}
              alt="Recuerdo"
              className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-5 right-5 p-3 rounded-full bg-white/15 text-white hover:bg-white/30 transition"
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
