import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { loadStore, type SavedLetter } from "@/lib/cloud";
import { enablePush } from "@/lib/push-client";

// Cada dispositivo recuerda hasta qué momento ya revisó las cartas. Como no hay
// cuentas de usuario, esto es lo más simple que funciona: el dispositivo que
// escribe ve la carta como "vista" al guardarla; el otro dispositivo la ve como
// nueva hasta que abre la campanita.
const LAST_SEEN_KEY = "birthday-letters-last-seen";
const POLL_MS = 15000;

function getLastSeen() {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  return raw ? Number(raw) : 0;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "justo ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  return `hace ${days} d`;
}

export function NotificationBell({ isHome }: { isHome: boolean }) {
  const navigate = useNavigate();
  const [letters, setLetters] = useState<SavedLetter[]>([]);
  const [lastSeen, setLastSeen] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null);
  const notifiedIds = useRef<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastSeen(getLastSeen());
    if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);

    let cancelled = false;
    const poll = () => {
      loadStore()
        .then((s) => {
          if (cancelled || !s.configured) return;
          setLetters(s.cartas);

          // Notificación para cartas nuevas que aún no vimos. Se muestra a
          // través del service worker (registration.showNotification): la
          // app instalada (y varios navegadores móviles) no permiten usar
          // `new Notification(...)` directo y la descartan en silencio.
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const seen = getLastSeen();
            const nuevas = s.cartas.filter(
              (l) => (l.createdAt ?? 0) > seen && !notifiedIds.current.has(l.id),
            );
            if (nuevas.length > 0) {
              nuevas.forEach((l) => notifiedIds.current.add(l.id));
              const show = (reg: ServiceWorkerRegistration | undefined) => {
                for (const l of nuevas) {
                  const opts = { body: l.title || "Alguien te escribió una carta", tag: l.id };
                  try {
                    if (reg) reg.showNotification("💌 Nueva carta para ti", opts);
                    else new Notification("💌 Nueva carta para ti", opts);
                  } catch {
                    /* ignore */
                  }
                }
              };
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.ready.then(show).catch(() => show(undefined));
              } else {
                show(undefined);
              }
            }
          }
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unseen = letters
    .filter((l) => (l.updatedAt ?? l.createdAt ?? 0) > lastSeen)
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));

  const recent = [...letters]
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
    .slice(0, 8);

  const askPush = () => {
    enablePush()
      .then(() => {
        if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);
      })
      .catch(() => {});
  };

  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          askPush();
        }
        // Abrir la campanita ya cuenta como "leídas": se limpia el aviso.
        markAllSeen();
      }
      return next;
    });
  };

  const markAllSeen = () => {
    const now = Date.now();
    localStorage.setItem(LAST_SEEN_KEY, String(now));
    setLastSeen(now);
  };

  const openLetter = (l: SavedLetter) => {
    markAllSeen();
    setOpen(false);
    navigate({ to: "/bienvenida", search: { open: l.id } });
  };

  const btnClasses = isHome
    ? "bg-white/5 hover:bg-white/15 text-white border-white/25 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]"
    : "bg-white/60 hover:bg-white/80 text-popover-foreground/80 hover:text-popover-foreground border-black/5";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggleOpen}
        className={`relative p-2 sm:p-3 rounded-full transition-all duration-300 hover:scale-105 flex items-center justify-center border ${btnClasses}`}
        aria-label="Notificaciones de cartas"
      >
        <Bell size={18} className="sm:w-5 sm:h-5" />
        {unseen.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold grid place-items-center leading-none">
            {unseen.length > 9 ? "9+" : unseen.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[min(300px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] max-h-[min(70vh,32rem)] overflow-y-auto glass rounded-2xl p-3 z-50 text-left"
          >
            <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-black/5">
              <p className="font-display text-sm text-popover-foreground/90">Cartas</p>
              {unseen.length > 0 && (
                <button
                  onClick={markAllSeen}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Marcar vistas
                </button>
              )}
            </div>

            {recent.length === 0 ? (
              <p className="text-xs text-popover-foreground/60 px-1 py-3 text-center">
                Todavía no hay cartas guardadas.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {recent.map((l) => {
                  const stamp = l.updatedAt ?? l.createdAt ?? 0;
                  const isNew = stamp > lastSeen;
                  return (
                    <button
                      key={l.id}
                      onClick={() => openLetter(l)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl transition hover:bg-black/5 flex items-start gap-2 ${
                        isNew ? "bg-primary/5" : ""
                      }`}
                    >
                      {isNew && (
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      <span className={`flex-1 min-w-0 ${isNew ? "" : "pl-3.5"}`}>
                        <span className="block text-xs font-bold text-popover-foreground/90 truncate">
                          {l.title || "Sin título"}
                        </span>
                        <span className="block text-[10px] text-popover-foreground/60">
                          {stamp ? timeAgo(stamp) : l.date}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {notifPermission !== "granted" && typeof Notification !== "undefined" && (
              <button
                onClick={askPush}
                className="mt-2 w-full text-[10px] text-center text-popover-foreground/60 hover:text-popover-foreground py-1"
              >
                Activar avisos en este celular
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
