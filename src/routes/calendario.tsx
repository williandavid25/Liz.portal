import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarHeart,
  Plus,
  Trash2,
  ExternalLink,
  Cloud,
  CloudOff,
  Sparkles,
  X,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { loadStoreShared, saveEventos, queuePendingEventos, type CalendarEvent } from "@/lib/cloud";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendario · Feliz Cumpleaños" },
      { name: "description", content: "Fechas importantes para no olvidar nunca." },
      { property: "og:title", content: "Calendario" },
      { property: "og:description", content: "Nuestras fechas especiales, siempre a la vista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarioPage,
});

const EVENTOS_KEY = "birthday-eventos-cloud";

// Fechas especiales sembradas la primera vez que alguien abre el calendario, así
// quedan guardadas en la nube y se ven igual en todos los dispositivos.
const SEED_EVENTS: CalendarEvent[] = [
  {
    id: "seed-13-mensual",
    title: "Nuestro 13 💕",
    type: "monthly",
    date: "13",
    note: "Desde que nos hicimos novios, los 13 de cada mes se volvieron un día especial.",
    special: true,
    createdAt: 0,
  },
  {
    id: "seed-cumple-agosto",
    title: "Cumpleaños 🎂",
    type: "yearly",
    date: "08-17",
    note: "Nació el 17 de agosto de 2005. ¡El día más especial del año!",
    special: true,
    createdAt: 0,
  },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Próxima fecha (hoy o futuro) en que cae este evento, o null si ya no puede repetirse. */
function nextOccurrence(ev: CalendarEvent, from: Date): Date | null {
  const today = startOfDay(from);
  if (ev.type === "once") {
    const [y, m, d] = ev.date.split("-").map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return date >= today ? date : null;
  }
  if (ev.type === "monthly") {
    const day = Number(ev.date);
    if (!day) return null;
    let candidate = new Date(today.getFullYear(), today.getMonth(), day);
    if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
    return candidate;
  }
  // yearly: "MM-DD"
  const [mm, dd] = ev.date.split("-").map(Number);
  if (!mm || !dd) return null;
  let candidate = new Date(today.getFullYear(), mm - 1, dd);
  if (candidate < today) candidate = new Date(today.getFullYear() + 1, mm - 1, dd);
  return candidate;
}

/** Todas las fechas en que cae este evento dentro del mes mostrado (para pintar el calendario). */
function occurrencesInMonth(ev: CalendarEvent, month: Date): Date[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  if (ev.type === "once") {
    const [oy, om, od] = ev.date.split("-").map(Number);
    if (oy === y && om - 1 === m) return [new Date(oy, om - 1, od)];
    return [];
  }
  if (ev.type === "monthly") {
    const day = Number(ev.date);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    if (!day || day > daysInMonth) return [];
    return [new Date(y, m, day)];
  }
  const [mm, dd] = ev.date.split("-").map(Number);
  if (mm - 1 !== m) return [];
  return [new Date(y, m, dd)];
}

function daysUntilLabel(target: Date, from: Date) {
  const diff = Math.round((startOfDay(target).getTime() - startOfDay(from).getTime()) / 86400000);
  if (diff === 0) return "¡Hoy! 🎉";
  if (diff === 1) return "Mañana";
  return `En ${diff} días`;
}

function formatLong(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function googleCalendarUrl(ev: CalendarEvent, occurrence: Date) {
  const start = occurrence;
  const end = new Date(occurrence);
  end.setDate(end.getDate() + 1);
  const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  if (ev.note) params.set("details", ev.note);
  if (ev.type === "monthly") params.set("recur", "RRULE:FREQ=MONTHLY");
  if (ev.type === "yearly") params.set("recur", "RRULE:FREQ=YEARLY");
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

type FormState = {
  title: string;
  type: CalendarEvent["type"];
  date: string;
  note: string;
  special: boolean;
};

const EMPTY_FORM: FormState = { title: "", type: "once", date: "", note: "", special: false };

function CalendarioPage() {
  const [eventos, setEventos] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudOn, setCloudOn] = useState<boolean | null>(null);
  const [month, setMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const today = useMemo(() => new Date(), []);

  // Si falla (sin conexión), queda anotado para reintentarlo apenas vuelva
  // el internet.
  const persist = async (next: CalendarEvent[]) => {
    setEventos(next);
    localStorage.setItem(EVENTOS_KEY, JSON.stringify(next));
    try {
      await saveEventos({ data: next });
    } catch (e) {
      console.error("No se pudo guardar en la nube:", e);
      queuePendingEventos(next);
    }
  };

  useEffect(() => {
    let local: CalendarEvent[] = [];
    try {
      const raw = localStorage.getItem(EVENTOS_KEY);
      if (raw) {
        local = JSON.parse(raw);
        setEventos(local);
      }
    } catch {
      /* ignore */
    }

    loadStoreShared()
      .then((s) => {
        if (!s.configured) {
          setCloudOn(false);
          if (local.length === 0) setEventos(SEED_EVENTS);
          return;
        }
        setCloudOn(true);
        if (s.eventos.length > 0) {
          setEventos(s.eventos);
          localStorage.setItem(EVENTOS_KEY, JSON.stringify(s.eventos));
        } else {
          // Primera vez: sembramos las fechas especiales para que se vean en todos los dispositivos.
          persist(local.length > 0 ? local : SEED_EVENTS);
        }
      })
      .catch(() => {
        setCloudOn(false);
        if (local.length === 0) setEventos(SEED_EVENTS);
      })
      .finally(() => setLoading(false));
  }, []);

  const upcoming = useMemo(() => {
    return eventos
      .map((ev) => ({ ev, next: nextOccurrence(ev, today) }))
      .filter((x): x is { ev: CalendarEvent; next: Date } => x.next !== null)
      .sort((a, b) => a.next.getTime() - b.next.getTime());
  }, [eventos, today]);

  const specialDatesInMonth = useMemo(
    () => eventos.filter((e) => e.special).flatMap((e) => occurrencesInMonth(e, month)),
    [eventos, month],
  );
  const otherDatesInMonth = useMemo(
    () => eventos.filter((e) => !e.special).flatMap((e) => occurrencesInMonth(e, month)),
    [eventos, month],
  );

  const handleDelete = (id: string) => persist(eventos.filter((e) => e.id !== id));

  const handleAdd = () => {
    const title = form.title.trim();
    if (!title) return;

    let date = form.date;
    if (form.type === "monthly") {
      const day = Number(date);
      if (!day || day < 1 || day > 31) return;
      date = String(day);
    } else if (form.type === "yearly") {
      const parts = date.split("-"); // input date da "YYYY-MM-DD"
      if (parts.length !== 3) return;
      date = `${parts[1]}-${parts[2]}`;
    } else if (!date) {
      return;
    }

    const nuevo: CalendarEvent = {
      id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      title,
      type: form.type,
      date,
      note: form.note.trim() || undefined,
      special: form.special,
      createdAt: Date.now(),
    };
    persist([nuevo, ...eventos]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  return (
    <section className="relative py-28 px-4 sm:px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <h2 className="font-display text-5xl md:text-6xl text-gradient-cosmic">Calendario</h2>
          <p className="mt-3 text-foreground/75 font-medium">
            Las fechas que no nos podemos olvidar
          </p>
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
        </motion.div>

        <div className="mt-10 grid lg:grid-cols-[auto_1fr] gap-8 items-start">
          {/* Calendario visual */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="glass rounded-3xl p-4 mx-auto"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <Calendar
              mode="single"
              selected={undefined}
              month={month}
              onMonthChange={setMonth}
              modifiers={{ special: specialDatesInMonth, evento: otherDatesInMonth }}
              modifiersClassNames={{
                special: "!bg-primary/25 !text-primary font-extrabold",
                evento: "!bg-accent/50 font-bold",
              }}
            />
            <div className="flex items-center gap-4 justify-center mt-2 text-[11px] text-popover-foreground/60">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary/60" /> Especial
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-accent" /> Fecha guardada
              </span>
            </div>
          </motion.div>

          {/* Próximas fechas */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <div className="mb-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
              <h3 className="font-display text-2xl text-foreground/90 flex items-center gap-2">
                <CalendarHeart size={20} className="text-primary" /> Próximas fechas
              </h3>
              <button
                onClick={() => setShowForm((s) => !s)}
                className="flex w-full items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-white transition hover:scale-105 sm:w-auto"
                style={{ background: "var(--gradient-rose)" }}
              >
                {showForm ? <X size={14} /> : <Plus size={14} />}
                {showForm ? "Cerrar" : "Añadir fecha"}
              </button>
            </div>

            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="glass rounded-2xl p-4 space-y-3">
                    <input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Título (ej. Aniversario)"
                      className="w-full bg-white/70 text-popover-foreground rounded-full px-4 py-2 text-sm outline-none border border-primary/20 focus:border-primary"
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={form.type}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            type: e.target.value as CalendarEvent["type"],
                            date: "",
                          }))
                        }
                        className="bg-white/70 text-popover-foreground rounded-full px-3 py-2 text-sm outline-none border border-primary/20 focus:border-primary"
                      >
                        <option value="once">Una vez</option>
                        <option value="monthly">Cada mes (mismo día)</option>
                        <option value="yearly">Cada año (mismo día y mes)</option>
                      </select>

                      {form.type === "monthly" ? (
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={form.date}
                          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                          placeholder="Día (1-31)"
                          className="w-32 bg-white/70 text-popover-foreground rounded-full px-4 py-2 text-sm outline-none border border-primary/20 focus:border-primary"
                        />
                      ) : (
                        <input
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                          className="bg-white/70 text-popover-foreground rounded-full px-4 py-2 text-sm outline-none border border-primary/20 focus:border-primary"
                        />
                      )}
                    </div>
                    <input
                      value={form.note}
                      onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="Nota (opcional)"
                      className="w-full bg-white/70 text-popover-foreground rounded-full px-4 py-2 text-sm outline-none border border-primary/20 focus:border-primary"
                    />
                    <label className="flex items-center gap-2 text-sm text-popover-foreground/80 px-1">
                      <input
                        type="checkbox"
                        checked={form.special}
                        onChange={(e) => setForm((f) => ({ ...f, special: e.target.checked }))}
                      />
                      Marcar como fecha especial 💗
                    </label>
                    <button
                      onClick={handleAdd}
                      className="w-full px-5 py-2.5 rounded-full text-sm font-bold text-white hover:scale-[1.02] transition"
                      style={{ background: "var(--gradient-rose)" }}
                    >
                      Guardar fecha
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <p className="text-center text-muted-foreground text-sm py-8">Cargando fechas…</p>
            ) : upcoming.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                Aún no hay fechas guardadas. Añade la primera arriba.
              </p>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {upcoming.map(({ ev, next }) => (
                    <motion.div
                      key={ev.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`relative rounded-2xl p-4 glass flex flex-col sm:flex-row sm:items-center gap-3 ${
                        ev.special ? "border-2 border-primary/30" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-popover-foreground/90 flex items-center gap-1.5 truncate">
                          {ev.special && <Sparkles size={14} className="text-primary shrink-0" />}
                          {ev.title}
                        </p>
                        <p className="text-xs text-popover-foreground/60 mt-0.5">
                          {formatLong(next)}
                        </p>
                        {ev.note && (
                          <p className="text-xs text-popover-foreground/60 mt-1 line-clamp-2">
                            {ev.note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                          style={{ background: "var(--gradient-rose)" }}
                        >
                          {daysUntilLabel(next, today)}
                        </span>
                        <a
                          href={googleCalendarUrl(ev, next)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full bg-white/70 border border-black/5 hover:bg-white transition text-popover-foreground/70"
                          title="Agregar a Google Calendar"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => handleDelete(ev.id)}
                          className="p-2 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/15 transition"
                          title="Eliminar fecha"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
