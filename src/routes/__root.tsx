import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, Settings, X } from "lucide-react";
import { upload } from "@vercel/blob/client";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { NotificationBell } from "../components/NotificationBell";
import { FallingStars } from "../components/FallingStars";
import { loadStore, saveMusica, queuePendingMusica, flushPendingSync } from "../lib/cloud";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass rounded-3xl p-10 max-w-md text-center">
        <h1 className="font-display text-7xl text-gradient-rose">404</h1>
        <p className="mt-4 text-popover-foreground/60">Esta página no existe.</p>
        <Link
          to="/"
          className="mt-6 inline-block px-6 py-3 rounded-full text-white font-bold"
          style={{ background: "var(--gradient-rose)" }}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass rounded-3xl p-10 max-w-md text-center">
        <h1 className="font-display text-2xl text-gradient-rose">Algo salió mal</h1>
        <p className="mt-2 text-sm text-popover-foreground/60">
          Intenta de nuevo o vuelve al inicio.
        </p>
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="px-4 py-2 rounded-full text-white font-semibold"
            style={{ background: "var(--gradient-rose)" }}
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-full glass text-popover-foreground font-semibold"
          >
            Inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Feliz Cumpleaños ✨" },
      { name: "description", content: "Una sorpresa mágica de cumpleaños con recuerdos y cartas." },
      { name: "author", content: "Made with love" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#1e1428" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Liz" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Karla:wght@400;500;600;700&family=Patrick+Hand&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const MUSIC_KEY = "birthday-music-url";
const DEFAULT_MUSIC = "/video-portada.mp4";

// Soporte mínimo para pegar un link de YouTube en vez de un mp3: se reproduce
// en un reproductor oculto que se repite solo, sin depender de Vercel Blob.
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  loadVideoById(id: string): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function AppShell() {
  const routerState = useRouterState();
  const isHome = routerState.location.pathname === "/";
  const [musicUrl, setMusicUrl] = useState("");
  const [draftMusicUrl, setDraftMusicUrl] = useState("");
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicPanelRef = useRef<HTMLDivElement>(null);
  const youtubeId = extractYouTubeId(musicUrl);
  const [ytReady, setYtReady] = useState(false);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);

  // Registra el service worker para poder instalar el sitio como app y
  // abrirlo aunque no haya internet (después de haberlo visitado una vez).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!showMusic) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (musicPanelRef.current && !musicPanelRef.current.contains(event.target as Node)) {
        setShowMusic(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [showMusic]);

  // Si guardaste algo (carta, foto, evento, música) sin conexión, esto lo
  // reintenta solo apenas vuelve el internet.
  useEffect(() => {
    flushPendingSync().catch(() => {});
    const onOnline = () => flushPendingSync().catch(() => {});
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    // Espejo local primero (rápido), luego la nube (fuente de verdad: se
    // escucha la misma música elegida en cualquier dispositivo).
    const localMusic = localStorage.getItem(MUSIC_KEY) || DEFAULT_MUSIC;
    setMusicUrl(localMusic);
    setDraftMusicUrl(localMusic);
    loadStore()
      .then((s) => {
        if (!s.configured) return;
        if (s.musica) {
          setMusicUrl(s.musica);
          setDraftMusicUrl(s.musica);
          localStorage.setItem(MUSIC_KEY, s.musica);
        }
      })
      .catch(() => {});
  }, []);

  // Cambiar la fuente también debe iniciar la nueva música inmediatamente.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !musicUrl || youtubeId) return;
    a.load();
    a.play().catch(() => {});
  }, [musicUrl, youtubeId]);

  // Carga la API de YouTube solo cuando hace falta (link de YouTube pegado).
  useEffect(() => {
    if (!youtubeId) return;
    if (window.YT?.Player) {
      setYtReady(true);
      return;
    }
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      setYtReady(true);
    };
  }, [youtubeId]);

  // Crea el reproductor de YouTube (oculto) una vez, y después solo le pide
  // que cargue el nuevo video cuando cambias de link.
  useEffect(() => {
    if (!youtubeId || !ytReady || !ytContainerRef.current) return;
    if (ytPlayerRef.current) {
      ytPlayerRef.current.loadVideoById(youtubeId);
      ytPlayerRef.current.playVideo();
      return;
    }
    ytPlayerRef.current = new window.YT!.Player(ytContainerRef.current, {
      videoId: youtubeId,
      playerVars: { autoplay: 1, controls: 0, playsinline: 1, loop: 1, playlist: youtubeId },
      events: {
        onStateChange: (e: { data: number; target: YTPlayer }) => {
          const YT = window.YT!;
          if (e.data === YT.PlayerState.ENDED) {
            e.target.seekTo(0, true);
            e.target.playVideo();
          }
        },
      },
    });
  }, [youtubeId, ytReady]);

  const saveMusic = (url: string) => {
    setMusicUrl(url);
    localStorage.setItem(MUSIC_KEY, url);
    saveMusica({ data: url }).catch(() => queuePendingMusica(url));
  };

  const saveMusicChanges = () => {
    const nextUrl = draftMusicUrl.trim();
    if (!nextUrl) return;
    saveMusic(nextUrl);
    setShowMusic(false);
  };

  // Solo hay una canción activa a la vez: subir un archivo nuevo reemplaza
  // (descarta) la que sonaba antes, no se guarda un banco con historial.
  const uploadMusicFile = async (file: File) => {
    setUploadingMusic(true);
    setMusicError(null);
    try {
      // Sube directo del navegador a Vercel Blob (sin pasar el archivo entero
      // por el servidor): un mp3 de varios MB fallaba o se colgaba antes,
      // porque iba y volvía completo a través de la función del servidor.
      const path = `musica/${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.name}`;
      const blob = await upload(path, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });
      setDraftMusicUrl(blob.url);
    } catch (err) {
      console.error("No se pudo subir la música:", err);
      const detail = err instanceof Error ? err.message : String(err);
      setMusicError(`No se pudo subir el archivo: ${detail}`);
    } finally {
      setUploadingMusic(false);
    }
  };

  const links: Array<[string, string]> = [
    ["/bienvenida", "Carta"],
    ["/recuerdos", "Recuerdos"],
    ["/calendario", "Calendario"],
  ];

  return (
    <div className="relative min-h-screen">
      {/* Foto de Snoopy en la cama con luz violeta, difuminada para que el texto se lea bien. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden bg-cosmos">
        <img
          src="/snoopy-fondo.jpg"
          alt=""
          aria-hidden="true"
          width={736}
          height={981}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-photo-overlay" />
        <div className="absolute inset-0 bg-cosmos-vignette" />
      </div>

      {/* Estrellas que caen como nieve. */}
      <FallingStars className="pointer-events-none fixed inset-0 z-0 overflow-hidden" />

      {/* Logo */}
      <Link
        to="/"
        className="fixed top-3 left-3 sm:top-6 sm:left-6 z-50 flex flex-col items-center gap-0.5 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] transition-transform hover:scale-105"
        aria-label="Ir al inicio"
      >
        <span className="block h-12 w-12 overflow-hidden rounded-full border-2 border-white/50 shadow-glow sm:h-14 sm:w-14">
          <img src="/logo.jpg" alt="" className="h-full w-full object-cover" />
        </span>
        <span className="text-xs font-bold leading-none sm:text-sm">Inicio</span>
      </Link>

      {/* Nav */}
      <nav className="fixed top-3 right-3 sm:top-6 sm:right-6 z-50 flex items-center gap-2 text-[11px] sm:text-xs font-bold">
        <button
          onClick={() => setShowNavMenu((open) => !open)}
          className={`p-2.5 rounded-full transition-all duration-300 hover:scale-105 flex items-center justify-center border ${
            isHome
              ? "bg-white/5 hover:bg-white/15 text-white border-white/25 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]"
              : "bg-white/60 hover:bg-white/80 text-popover-foreground/80 hover:text-popover-foreground border-black/5"
          }`}
          aria-label={showNavMenu ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={showNavMenu}
        >
          {showNavMenu ? <X size={20} /> : <Menu size={20} />}
        </button>
        {showNavMenu && (
          <div className="fixed left-3 right-3 top-16 flex max-h-[calc(100svh-5rem)] w-auto flex-col gap-1 overflow-y-auto rounded-2xl glass p-2 shadow-xl sm:left-auto sm:right-6 sm:top-20 sm:w-56">
            {links.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                onClick={() => setShowNavMenu(false)}
                className="rounded-xl px-3 py-2 text-popover-foreground transition-colors hover:bg-primary/10"
                activeProps={{
                  className: "rounded-xl px-3 py-2 text-primary-foreground",
                  style: { background: "var(--gradient-rose)" },
                }}
              >
                {label}
              </Link>
            ))}
            <button
              onClick={() => {
                setShowMusic((open) => !open);
                setShowNavMenu(false);
              }}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-popover-foreground transition-colors hover:bg-primary/10"
            >
              <Settings size={16} />
              Configuración
            </button>
          </div>
        )}
        <NotificationBell isHome={isHome} />
      </nav>

      {showMusic && (
        <div
          ref={musicPanelRef}
          className="fixed left-1/2 top-16 z-50 max-h-[calc(100svh-5rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 overflow-y-auto glass rounded-2xl p-4 shadow-xl sm:top-20"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-lg text-popover-foreground">Música</p>
            <button
              type="button"
              onClick={() => setShowMusic(false)}
              className="rounded-full p-1.5 text-popover-foreground/70 transition hover:bg-black/5 hover:text-popover-foreground"
              aria-label="Cerrar configuración de música"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <input
              type="url"
              placeholder="https://... (mp3 o link de YouTube)"
              value={draftMusicUrl}
              onChange={(e) => setDraftMusicUrl(e.target.value)}
              className="w-full bg-white/60 text-popover-foreground rounded-full px-4 py-2 text-sm outline-none border border-primary/20 focus:border-primary"
            />
            <label
              className={`px-4 py-2 rounded-full text-sm font-semibold text-white text-center ${
                uploadingMusic ? "opacity-60 cursor-wait" : "cursor-pointer"
              }`}
              style={{ background: "var(--gradient-rose)" }}
            >
              {uploadingMusic ? "Subiendo…" : "📁 Subir archivo mp3"}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={uploadingMusic}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  uploadMusicFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={saveMusicChanges}
              disabled={uploadingMusic || !draftMusicUrl.trim() || draftMusicUrl === musicUrl}
              className="rounded-full border border-primary/30 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Guardar cambios
            </button>
            <p className="text-xs text-popover-foreground/60 text-center">
              También puedes pegar un link de YouTube: se repite solo, sin necesidad de subir
              archivos. Se guarda en la nube para escucharla en cualquier dispositivo que abra la
              página.
            </p>
            {musicError && (
              <p className="text-xs text-destructive text-center font-semibold">{musicError}</p>
            )}
          </div>
        </div>
      )}

      <audio
        id="global-bg-audio"
        ref={audioRef}
        src={youtubeId ? undefined : musicUrl || undefined}
        loop
        autoPlay
        preload="auto"
      />
      {/* Reproductor de YouTube oculto: solo se usa cuando la música es un link de YouTube. */}
      <div
        ref={ytContainerRef}
        aria-hidden="true"
        className="fixed bottom-0 right-0 overflow-hidden opacity-0 pointer-events-none"
        style={{ width: 2, height: 2 }}
      />

      <main className="relative z-10">
        <Outlet />
      </main>

      {!isHome && (
        <footer className="relative z-10 py-10 text-center text-sm text-muted-foreground">
          Creado por{" "}
          <a
            href="mailto:willian.ushinia@upec.edu.ec"
            className="font-semibold hover:text-foreground transition-colors"
          >
            willian.ushinia@upec.edu.ec
          </a>
        </footer>
      )}
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
