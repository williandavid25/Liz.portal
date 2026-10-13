import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PapyrusCard, type PapyrusData } from "@/components/Papyrus";

export const Route = createFileRoute("/cartas")({
  head: () => ({
    meta: [
      { title: "Cartas de Snoopy · Feliz Cumpleaños" },
      { name: "description", content: "Cartas mágicas editables. Escribe y guarda tantos papiros como quieras." },
      { property: "og:title", content: "Cartas de Snoopy" },
      { property: "og:description", content: "Papiros editables con mensajes de cumpleaños." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cartas,
});

const STORAGE_KEY = "birthday-papyri-v1";

function Cartas() {
  const [papyri, setPapyri] = useState<PapyrusData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPapyri(JSON.parse(raw));
      else setPapyri([{
        id: crypto.randomUUID(),
        title: "Feliz Cumpleaños 💗",
        message: "Que este día se llene de flores, luz y sonrisas.\nHoy el universo celebra que existes.\nCon todo mi cariño 🌸",
      }]);
    } catch {
      /* datos guardados dañados: se empieza de cero */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(papyri));
  }, [papyri, loaded]);

  const addPapyrus = () =>
    setPapyri((p) => [...p, { id: crypto.randomUUID(), title: "Nueva carta", message: "" }]);
  const updatePapyrus = (d: PapyrusData) =>
    setPapyri((p) => p.map((x) => (x.id === d.id ? d : x)));
  const deletePapyrus = (id: string) =>
    setPapyri((p) => p.filter((x) => x.id !== id));

  return (
    <section className="relative py-28 px-6 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="font-display text-5xl md:text-6xl text-gradient-rose"
          >
            Cartas de Snoopy
          </motion.h2>
          <p className="mt-3 text-muted-foreground">Toca cada carta para abrirla. Edita y crea tantas como quieras 💌</p>
          <button onClick={addPapyrus} className="mt-6 px-6 py-3 rounded-full text-white font-bold hover:scale-105 transition" style={{ background: "var(--gradient-rose)", boxShadow: "var(--shadow-glow)" }}>
            ＋ Añadir carta
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 pt-8">
          {papyri.map((p) => (
            <PapyrusCard key={p.id} data={p} onChange={updatePapyrus} onDelete={() => deletePapyrus(p.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}
