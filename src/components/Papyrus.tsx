import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type PapyrusData = { id: string; title: string; message: string };

export function PapyrusCard({
  data,
  onChange,
  onDelete,
}: {
  data: PapyrusData;
  onChange: (d: PapyrusData) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="relative flex flex-col items-center">
      {/* Snoopy holder */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="relative z-10 -mb-6 grid place-items-center"
        aria-label="Abrir carta"
      >
        <div className="text-6xl drop-shadow-lg animate-float">🐶</div>
        <div className="absolute -top-3 -right-2 text-2xl animate-shimmer">💗</div>
      </motion.button>

      {/* Envelope / Papiro */}
      <motion.div
        layout
        onClick={() => !open && setOpen(true)}
        className="relative w-full cursor-pointer rounded-3xl overflow-hidden glass"
        style={{
          background: "linear-gradient(180deg, oklch(0.98 0.02 340) 0%, oklch(0.94 0.06 350) 100%)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        {/* Ribbon */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 text-3xl">🎀</div>

        {/* Closed state: envelope flap */}
        <AnimatePresence initial={false}>
          {!open && (
            <motion.div
              key="flap"
              initial={{ rotateX: 0 }}
              exit={{ rotateX: -180, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
              style={{ transformOrigin: "top", transformStyle: "preserve-3d" }}
              className="relative h-56 w-full"
            >
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center px-6">
                  <p className="font-display text-2xl text-gradient-rose">Toca para abrir</p>
                  <p className="text-sm text-popover-foreground/60 mt-2">
                    Un mensaje especial te espera ✨
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Open state: papyrus content */}
        <AnimatePresence>
          {open && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="p-8 pt-10">
                {editing ? (
                  <div className="space-y-3">
                    <input
                      value={data.title}
                      onChange={(e) => onChange({ ...data, title: e.target.value })}
                      placeholder="Título"
                      className="w-full bg-transparent border-b border-primary/40 focus:border-primary outline-none font-display text-2xl text-gradient-rose py-1"
                    />
                    <textarea
                      value={data.message}
                      onChange={(e) => onChange({ ...data, message: e.target.value })}
                      placeholder="Escribe aquí tus deseos..."
                      rows={7}
                      className="w-full bg-white/50 rounded-xl p-4 border border-primary/20 focus:border-primary outline-none font-script text-2xl leading-relaxed text-popover-foreground resize-none"
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="font-display text-3xl text-gradient-rose mb-3">
                      {data.title || "Sin título"}
                    </h3>
                    <p className="font-script text-3xl leading-snug text-popover-foreground/90 whitespace-pre-wrap">
                      {data.message || "Escribe algo bonito..."}
                    </p>
                  </>
                )}

                <div className="mt-6 flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing((v) => !v);
                    }}
                    className="px-4 py-2 rounded-full text-sm font-semibold text-white hover:scale-105 transition"
                    style={{ background: "var(--gradient-rose)" }}
                  >
                    {editing ? "✓ Guardar" : "✏️ Editar"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      setEditing(false);
                    }}
                    className="px-4 py-2 rounded-full text-sm font-semibold text-popover-foreground glass hover:scale-105 transition"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="px-4 py-2 rounded-full text-sm font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decorative wax seal */}
        <div
          className="absolute bottom-3 right-3 h-10 w-10 rounded-full grid place-items-center text-white text-lg"
          style={{ background: "var(--gradient-rose)", boxShadow: "var(--shadow-glow)" }}
        >
          ♥
        </div>
      </motion.div>
    </div>
  );
}
