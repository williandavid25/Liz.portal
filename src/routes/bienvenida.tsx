import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Printer, Trash2, Plus, Save, Check, Pencil, Cloud, CloudOff } from "lucide-react";
import { loadStoreShared, saveCartas, queuePendingCartas, type SavedLetter } from "@/lib/cloud";

export const Route = createFileRoute("/bienvenida")({
  validateSearch: (search: Record<string, unknown>): { open?: string } => ({
    open: typeof search.open === "string" ? search.open : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Carta · Feliz Cumpleaños ✨" },
      { name: "description", content: "Una carta especial de cumpleaños hecha con cariño." },
      { property: "og:title", content: "Feliz Cumpleaños ✨" },
      { property: "og:description", content: "Una sorpresa hecha con cariño." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Bienvenida,
});

const STORAGE_KEY = "birthday-saved-letters";

// Puntos y corazones decorativos del papel
const SPRINKLES = [
  { x: 35, y: 5, type: "red-dot", size: 4 },
  { x: 72, y: 4, type: "black-dot", size: 3 },
  { x: 88, y: 6, type: "red-dot", size: 4 },
  { x: 55, y: 7, type: "black-dot", size: 3 },
  { x: 4, y: 25, type: "red-dot", size: 5 },
  { x: 3, y: 30, type: "heart", size: 12 },
  { x: 7, y: 42, type: "black-dot", size: 3 },
  { x: 5, y: 55, type: "red-dot", size: 4 },
  { x: 8, y: 75, type: "heart", size: 10 },
  { x: 92, y: 15, type: "black-dot", size: 4 },
  { x: 95, y: 22, type: "red-dot", size: 5 },
  { x: 96, y: 35, type: "heart", size: 12 },
  { x: 94, y: 52, type: "black-dot", size: 3 },
  { x: 91, y: 68, type: "red-dot", size: 4 },
  { x: 93, y: 88, type: "heart", size: 10 },
  { x: 30, y: 22, type: "heart", size: 10 },
  { x: 33, y: 35, type: "red-dot", size: 4 },
  { x: 62, y: 18, type: "red-dot", size: 4 },
  { x: 58, y: 28, type: "black-dot", size: 3 },
  { x: 42, y: 52, type: "heart", size: 12 },
  { x: 38, y: 70, type: "red-dot", size: 4 },
  { x: 52, y: 72, type: "black-dot", size: 3 },
  { x: 62, y: 82, type: "heart", size: 12 },
];

// Formatos de papel disponibles para escribir la carta.
// `dark: true` = fondo oscuro → el texto se pinta en blanco para que se lea bien.
// `snoopy: true` = se muestran los stickers de Snoopy en las 4 esquinas (como en el Clásico).
const LETTER_FORMATS = [
  {
    id: "pergamino",
    name: "Clásico",
    image: "/pergamino.jpeg",
    dark: false,
    size: "100% 100%",
    snoopy: true,
  },
  {
    id: "cumpleanos",
    name: "Cumpleaños",
    image: "/formatos/formato-cumpleanos.jpeg",
    dark: true,
    size: "cover",
    snoopy: true,
  },
  {
    id: "pluma-blanco",
    name: "Pluma y tintero",
    image: "/formatos/formato-pluma-blanco.jpeg",
    dark: false,
    size: "cover",
  },
  {
    id: "huella-corazon",
    name: "Huella de corazón",
    image: "/formatos/formato-huella-corazon.jpeg",
    dark: false,
    size: "cover",
  },
  {
    id: "corazones-crema",
    name: "Corazones crema",
    image: "/formatos/formato-corazones-crema.jpeg",
    dark: false,
    size: "cover",
  },
  {
    id: "escritora-gris",
    name: "Escritora",
    image: "/formatos/formato-escritora-gris.jpeg",
    dark: false,
    size: "cover",
  },
  {
    id: "lino-lazos",
    name: "Lino con lazos",
    image: "/formatos/formato-lino-lazos.jpeg",
    dark: false,
    size: "cover",
  },
  {
    id: "vino-tinto",
    name: "Vino tinto",
    image: "/formatos/formato-vino-tinto.jpeg",
    dark: true,
    size: "cover",
  },
  {
    id: "rojo-palomas",
    name: "Rojo palomas",
    image: "/formatos/formato-rojo-palomas.jpeg",
    dark: true,
    size: "cover",
  },
  {
    id: "azul-noche",
    name: "Azul noche",
    image: "/formatos/formato-azul-noche.jpeg",
    dark: true,
    size: "cover",
  },
  {
    id: "magenta-tulipanes",
    name: "Magenta tulipanes",
    image: "/formatos/formato-magenta-tulipanes.jpeg",
    dark: true,
    size: "cover",
  },
] as const;

function todayStr() {
  return new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function Bienvenida() {
  const { open } = Route.useSearch();
  const [letters, setLetters] = useState<SavedLetter[]>([]);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<string>(LETTER_FORMATS[0].id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [cloudOn, setCloudOn] = useState<boolean | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openedFromNotification = useRef<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el temporizador de la animación del sobre si el componente se desmonta
  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    };
  }, []);

  // Cargar cartas: espejo local primero (rápido), luego la nube (fuente de verdad)
  useEffect(() => {
    let local: SavedLetter[] = [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        local = JSON.parse(raw);
        setLetters(local);
      } catch (e) {
        console.error("Error al leer cartas:", e);
      }
    }
    loadStoreShared()
      .then((s) => {
        if (!s.configured) {
          setCloudOn(false);
          return;
        }
        setCloudOn(true);
        if (s.cartas.length > 0) {
          setLetters(s.cartas);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(s.cartas));
        } else if (local.length > 0) {
          // Nube vacía pero hay cartas locales: las subimos (migración, sin perderlas)
          saveCartas({ data: local }).catch(() => {});
        }
      })
      .catch(() => setCloudOn(false));
  }, []);

  // Guarda en la nube + espejo local. Si falla (sin conexión), queda anotado
  // para reintentarlo solo apenas vuelva el internet.
  const persist = (next: SavedLetter[]) => {
    setLetters(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    saveCartas({ data: next }).catch((e) => {
      console.error("No se pudo guardar en la nube:", e);
      queuePendingCartas(next);
    });
  };

  // Guardar la carta actual (nueva o edición de una existente)
  const handleSave = () => {
    const text = editorRef.current?.innerText.trim() ?? "";
    const t = title.trim();
    if (!t && !text) return; // no guardar cartas vacías

    if (editingId) {
      persist(
        letters.map((l) =>
          l.id === editingId
            ? { ...l, title: t || l.title, text, format, updatedAt: Date.now() }
            : l,
        ),
      );
    } else {
      const now = Date.now();
      const nueva: SavedLetter = {
        id: now.toString(),
        title: t || `Carta ${letters.length + 1}`,
        text,
        format,
        date: todayStr(),
        createdAt: now,
        updatedAt: now,
      };
      persist([nueva, ...letters]); // las más nuevas arriba
      localStorage.setItem(
        "liz-carta-pendiente",
        JSON.stringify({ title: nueva.title, text: nueva.text, format: nueva.format }),
      );
      setEditingId(nueva.id);
      setTitle(nueva.title);
    }

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  // Empezar una carta nueva (limpia el editor)
  const handleNew = () => {
    setTitle("");
    setEditingId(null);
    setFormat(LETTER_FORMATS[0].id);
    if (editorRef.current) editorRef.current.innerText = "";
    editorRef.current?.focus();
  };

  // Abrir una carta guardada para verla / editarla
  const handleOpen = (l: SavedLetter) => {
    setTitle(l.title);
    setEditingId(l.id);
    setFormat(l.format || LETTER_FORMATS[0].id);
    if (editorRef.current) editorRef.current.innerText = l.text;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reproduce la animación de "abrir sobre" y luego carga la carta en el editor
  const handleEnvelopeClick = (l: SavedLetter) => {
    if (openingId) return;
    setOpeningId(l.id);
    openTimer.current = setTimeout(() => {
      handleOpen(l);
      setOpeningId(null);
    }, 1000);
  };

  // Si venimos de la campanita de notificaciones (?open=<id>), abrimos esa carta.
  useEffect(() => {
    if (!open || open === openedFromNotification.current || letters.length === 0) return;
    const target = letters.find((l) => l.id === open);
    if (target) {
      openedFromNotification.current = open;
      handleOpen(target);
    }
  }, [open, letters]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persist(letters.filter((l) => l.id !== id));
    if (editingId === id) handleNew();
  };

  const handlePrint = () => window.print();

  const activeDate = editingId ? letters.find((l) => l.id === editingId)?.date : todayStr();
  const activeFormat = LETTER_FORMATS.find((f) => f.id === format) ?? LETTER_FORMATS[0];
  const isDark = activeFormat.dark;
  const showSprinkles = activeFormat.id === "pergamino";
  const showSnoopy = "snoopy" in activeFormat && activeFormat.snoopy;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-start px-4 pt-28 pb-16 overflow-x-hidden print:p-0 print:bg-white print:min-h-0">
      {/* Barra de acciones (oculta al imprimir) */}
      <div className="relative z-10 w-full max-w-[680px] mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/70 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-black/5 shadow-soft print:hidden">
        <div className="flex items-center gap-2 text-sm font-bold text-popover-foreground/70">
          {editingId ? (
            <>
              <Pencil size={15} /> Editando carta
            </>
          ) : (
            <>
              <Plus size={15} /> Carta nueva
            </>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            onClick={handleNew}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/5 bg-white px-3.5 py-2 text-xs font-bold text-popover-foreground transition hover:bg-black/5 sm:flex-none"
            title="Escribir una carta nueva"
          >
            <Plus size={14} /> Nueva
          </button>
          <button
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/5 bg-white px-3.5 py-2 text-xs font-bold text-popover-foreground transition hover:bg-black/5 sm:flex-none"
            title="Imprimir o guardar como PDF"
          >
            <Printer size={14} /> PDF
          </button>
          <button
            onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-white shadow-glow transition hover:scale-105 sm:flex-none"
            style={{
              background: justSaved
                ? "linear-gradient(135deg,#16a34a,#22c55e)"
                : "var(--gradient-rose)",
            }}
          >
            {justSaved ? (
              <>
                <Check size={15} /> ¡Guardada!
              </>
            ) : (
              <>
                <Save size={15} /> Guardar carta
              </>
            )}
          </button>
        </div>
      </div>

      {/* Selector de formato de papel (oculto al imprimir) */}
      <div className="relative z-10 w-full max-w-[860px] mb-6 print:hidden">
        <p className="text-xs font-bold text-foreground/60 mb-2 text-center sm:text-left">
          Elige el formato de la carta
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-1 px-0.5">
          {LETTER_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              title={f.name}
              className={`relative shrink-0 w-14 h-20 rounded-lg overflow-hidden border-2 transition ${
                format === f.id
                  ? "border-primary ring-2 ring-primary/40 scale-105"
                  : "border-black/10 hover:border-black/30"
              }`}
            >
              <img src={f.image} alt={f.name} className="w-full h-full object-cover" />
              {format === f.id && (
                <span className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <Check size={16} className="text-white drop-shadow" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pergamino editable (imagen de fondo) */}
      <div className="relative z-10 w-full max-w-[860px] print:max-w-none print:shadow-none print:border-none print:m-0 print:p-0">
        {/* Cuerpo de la carta: imagen del formato elegido */}
        <div className="relative z-10 w-full min-h-[74vh] rounded-xl overflow-hidden shadow-[0_22px_55px_-12px_rgba(70,45,18,0.45)] px-7 sm:px-14 pt-9 sm:pt-12 pb-12 sm:pb-16 flex flex-col print:bg-white print:shadow-none print:rounded-none print:p-8 print:min-h-0">
          {/* Fondo del formato, semi-transparente para que se note el fondo
              cósmico del sitio detrás del papel. En impresión vuelve a quedar
              opaco (no tiene sentido "transparentar" una hoja impresa). */}
          <div
            className="absolute inset-0 z-0 opacity-55 print:opacity-100"
            style={{
              backgroundImage: `url('${activeFormat.image}')`,
              backgroundPosition: "center",
              backgroundSize: activeFormat.size,
              backgroundRepeat: "no-repeat",
            }}
          />

          {showSprinkles && (
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
              {SPRINKLES.map((s, idx) => {
                if (s.type === "heart") {
                  return (
                    <span
                      key={idx}
                      className="absolute text-red-500/80 transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${s.x}%`, top: `${s.y}%`, fontSize: `${s.size}px` }}
                    >
                      ❤️
                    </span>
                  );
                }
                return (
                  <div
                    key={idx}
                    className={`absolute rounded-full transform -translate-x-1/2 -translate-y-1/2 ${
                      s.type === "red-dot" ? "bg-red-500/70" : "bg-black/60"
                    }`}
                    style={{
                      left: `${s.x}%`,
                      top: `${s.y}%`,
                      width: `${s.size}px`,
                      height: `${s.size}px`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {showSnoopy && (
            <>
              {/* Stickers de Snoopy en las 4 esquinas */}
              <div className="absolute top-[4%] left-[5%] w-20 sm:w-28 pointer-events-none select-none z-10 mix-blend-multiply rotate-[-4deg]">
                <img
                  src="/snoopy-heart-top-left.png"
                  alt="Snoopy"
                  className="w-full h-auto object-contain"
                />
              </div>
              <div className="absolute top-[4%] right-[5%] w-20 sm:w-28 pointer-events-none select-none z-10 mix-blend-multiply rotate-[4deg]">
                <img
                  src="/snoopy-balloons-bottom-left.png"
                  alt="Snoopy"
                  className="w-full h-auto object-contain"
                />
              </div>
              <div className="absolute bottom-[5%] left-[5%] w-24 sm:w-32 pointer-events-none select-none z-10 mix-blend-multiply rotate-[3deg]">
                <img
                  src="/snoopy-heart-pile-right.png"
                  alt="Snoopy"
                  className="w-full h-auto object-contain"
                />
              </div>
              <div className="absolute bottom-[6%] right-[5%] w-20 sm:w-28 pointer-events-none select-none z-10 mix-blend-multiply rotate-[-3deg]">
                <img
                  src="/snoopy-heart-top-left.png"
                  alt="Snoopy"
                  className="w-full h-auto object-contain scale-x-[-1]"
                />
              </div>
            </>
          )}

          {/* Fecha */}
          <div
            className={`relative z-20 text-right text-sm font-handwritten mb-2 pl-24 print:text-black ${
              isDark ? "text-white/90" : "text-[#7a5729]"
            }`}
          >
            {activeDate}
          </div>

          {/* Título editable */}
          <div className="relative z-20 pl-24 sm:pl-32 mb-6">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full bg-transparent border-b border-dashed focus:outline-none text-2xl font-bold font-handwritten print:border-none print:text-black ${
                isDark
                  ? "border-white/50 focus:border-white text-white placeholder:text-white/50"
                  : "border-[#b8935a]/60 focus:border-[#8a5a2a] text-[#3a260f]"
              }`}
              placeholder="Título de la carta..."
            />
          </div>

          {/* Texto editable con renglones (tinta sobre el papel) */}
          <div
            ref={editorRef}
            contentEditable
            className={`relative z-20 flex-grow w-full focus:outline-none font-handwritten text-xl whitespace-pre-wrap select-text break-words print:text-black ${
              isDark ? "text-white caret-white" : "text-[#3a260f] caret-[#8a5a2a]"
            }`}
            style={{
              minHeight: "600px",
              lineHeight: "2.6rem",
              paddingTop: "0.3rem",
              backgroundImage: isDark
                ? "repeating-linear-gradient(to bottom, transparent 0, transparent calc(2.6rem - 1px), rgba(255,255,255,0.25) calc(2.6rem - 1px), rgba(255,255,255,0.25) 2.6rem)"
                : "repeating-linear-gradient(to bottom, transparent 0, transparent calc(2.6rem - 1px), rgba(120,80,30,0.25) calc(2.6rem - 1px), rgba(120,80,30,0.25) 2.6rem)",
              backgroundPositionY: "1rem",
            }}
            data-placeholder="Escribe tu carta aquí..."
          />
        </div>
      </div>

      {/* ===== Todas las cartas guardadas ===== */}
      <div className="relative z-10 w-full max-w-[680px] mt-10 print:hidden">
        <h3 className="font-display text-2xl text-gradient-cosmic mb-1 text-center">
          Tus cartas guardadas {letters.length > 0 && letters.length}
        </h3>
        {cloudOn === true && (
          <p className="mb-4 text-center inline-flex w-full items-center justify-center gap-1.5 text-xs text-primary/80">
            <Cloud size={14} /> Guardadas en la nube · se ven en todos tus dispositivos
          </p>
        )}
        {cloudOn === false && (
          <p className="mb-4 text-center inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <CloudOff size={14} /> Nube no activada aún · guardando solo en este dispositivo
          </p>
        )}

        {letters.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
            Escribe tu primera carta arriba y toca <strong>“Guardar carta”</strong>. Se irán
            guardando todas aquí, sin límite. 💌
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <AnimatePresence>
              {letters.map((l, i) => {
                const isOpening = openingId === l.id;
                return (
                  <motion.div
                    key={l.id}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.06, ease: "easeOut" }}
                    className={`group relative rounded-2xl border bg-white/25 p-2.5 shadow-[0_10px_30px_-12px_rgba(40,10,40,0.45)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-white/35 hover:shadow-[0_18px_40px_-14px_rgba(120,40,90,0.55)] ${
                      editingId === l.id
                        ? "border-primary/70 ring-2 ring-primary/30"
                        : "border-white/35"
                    }`}
                  >
                    <span
                      onClick={(e) => handleDelete(l.id, e)}
                      className="absolute top-2 right-2 z-30 p-1.5 rounded-full text-destructive bg-white/80 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-destructive/15 transition shadow-sm cursor-pointer"
                      title="Eliminar carta"
                    >
                      <Trash2 size={14} />
                    </span>

                    <button
                      type="button"
                      onClick={() => handleEnvelopeClick(l)}
                      disabled={!!openingId}
                      className="w-full text-left"
                      title="Abrir carta"
                    >
                      {/* Sobre crema con sello de cera. Flota suavemente; al
                          abrirlo el sello se rompe y la carta sale del sobre. */}
                      <div
                        className="sobre-flotar relative mb-2 mt-1 aspect-[640/498] w-full overflow-visible"
                        style={{ animationDelay: `${-(i % 6) * 0.8}s` }}
                      >
                        {/* Carta dentro del sobre (se transparenta un poco) */}
                        <motion.div
                          className="absolute left-[11%] right-[11%] top-[7%] z-0 flex h-[80%] items-start justify-center rounded-[3px] bg-[#fbf6ea] px-2 pt-[9%] shadow-[0_4px_14px_rgba(60,35,10,0.25)]"
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(to bottom, transparent 0, transparent 13px, rgba(150,110,60,0.18) 13px, rgba(150,110,60,0.18) 14px)",
                          }}
                          initial={false}
                          animate={isOpening ? { y: "-52%", rotate: -2 } : { y: "0%", rotate: 0 }}
                          transition={{
                            duration: 0.6,
                            delay: isOpening ? 0.3 : 0,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <span
                            className="line-clamp-2 text-center text-[15px] leading-tight text-[#5a3a1a] sm:text-lg"
                            style={{ fontFamily: '"Great Vibes", cursive' }}
                          >
                            {l.title || "Sin título"}
                          </span>
                        </motion.div>

                        {/* Sobre (un poco transparente) */}
                        <motion.img
                          src="/cartas/sobre.webp"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="absolute inset-0 z-10 h-full w-full select-none rounded-lg object-cover shadow-[0_10px_24px_-10px_rgba(70,40,15,0.55)]"
                          initial={false}
                          animate={
                            isOpening ? { opacity: 0.55, y: "6%" } : { opacity: 0.9, y: "0%" }
                          }
                          transition={{ duration: 0.55, delay: isOpening ? 0.25 : 0 }}
                        />

                        {/* Destello que cruza el sobre al pasar el mouse */}
                        <span className="sobre-brillo pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-lg" />

                        {/* Sello de cera: late despacito y se rompe al abrir */}
                        <span className="pointer-events-none absolute left-[52.3%] top-[57.6%] z-30 w-[18.5%] -translate-x-1/2 -translate-y-1/2">
                          <motion.img
                            src="/cartas/sello.webp"
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                            className="sello-latir block w-full select-none"
                            initial={false}
                            animate={
                              isOpening
                                ? { scale: 1.45, rotate: 18, opacity: 0 }
                                : { scale: 1, rotate: 0, opacity: 1 }
                            }
                            transition={{ duration: 0.35, ease: "easeOut" }}
                          />
                        </span>
                      </div>

                      <div className="px-1">
                        <span
                          className="block truncate text-lg leading-tight text-popover-foreground/90"
                          style={{ fontFamily: '"Great Vibes", cursive' }}
                        >
                          {l.title || "Sin título"}
                        </span>
                        <span className="block text-[11px] tracking-wide text-popover-foreground/60">
                          {l.date}
                        </span>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Ir a recuerdos */}
      <div className="relative z-10 mt-10 flex justify-center print:hidden">
        <Link
          to="/recuerdos"
          className="px-8 py-3.5 rounded-full text-white font-bold hover:scale-105 transition flex items-center gap-2 shadow-glow"
          style={{ background: "var(--gradient-rose)" }}
        >
          Ver Recuerdos
        </Link>
      </div>
    </section>
  );
}
