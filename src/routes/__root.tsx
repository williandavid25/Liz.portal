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
import { lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, Settings, X, Volume2, VolumeX, Play, Pause, Check, Sparkles } from "lucide-react";
import { upload } from "@vercel/blob/client";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { NotificationBell } from "../components/NotificationBell";
import { FallingStars } from "../components/FallingStars";
import { DismissLayer } from "../components/DismissLayer";
import { Splash } from "../components/Splash";
import { useAjustes, setAjustes, hydrateAjustes } from "../lib/ajustes";
import { PORTADAS } from "../lib/portadas";
import {
  loadStoreShared,
  saveMusica,
  queuePendingMusica,
  flushPendingSync,
  uploadAudio,
} from "../lib/cloud";

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

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(err, { boundary: "tanstack_root_error_component" });
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

const LazyErrorComponent = lazy(async () => ({ default: ErrorComponent }));

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Feliz Cumpleaños ✨" },
      { name: "description", content: "Una sorpresa mágica de cumpleaños con recuerdos y cartas." },
      { name: "author", content: "Made with love" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#02020a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Liz" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preload",
        href: "/fonts/great-vibes-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "preload", href: "/icons/logo-liz.jpg", as: "image" },
      { rel: "icon", href: "/favicon.ico?v=2", type: "image/x-icon" },
      { rel: "icon", href: "/icons/liz-192.png", type: "image/png", sizes: "192x192" },
      { rel: "manifest", href: "/manifest.webmanifest?v=2" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Karla:wght@400;500;600;700&family=Patrick+Hand&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: LazyErrorComponent,
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
function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`,
    );
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0]?.split("?")[0];
      return id && id.length === 11 ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v && v.length === 11 ? v : null;
      }
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function isValidMusicUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  if (extractYouTubeId(trimmed)) return true;
  try {
    const parsed = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`,
    );
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    if (!host || host.endsWith(".") || !host.includes(".")) return false;
    if (host.includes("youtube.com") || host === "youtu.be") {
      return !!extractYouTubeId(trimmed);
    }
    return true;
  } catch {
    return false;
  }
}

function AppShell() {
  const routerState = useRouterState();
  const isHome = routerState.location.pathname === "/";
  const [musicUrl, setMusicUrl] = useState("");
  const [draftMusicUrl, setDraftMusicUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  // Un solo panel abierto a la vez: menú, ajustes o campanita.
  const [panel, setPanel] = useState<null | "menu" | "ajustes" | "avisos">(null);
  const showNavMenu = panel === "menu";
  const showMusic = panel === "ajustes";
  const closePanel = useCallback(() => setPanel(null), []);
  const ajustes = useAjustes();
  const [draftPortadaUrl, setDraftPortadaUrl] = useState("");
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeId = extractYouTubeId(musicUrl);
  const [ytReady, setYtReady] = useState(false);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);

  // Registra el service worker para poder instalar el sitio como app y
  // abrirlo aunque no haya internet (después de haberlo visitado una vez).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // updateViaCache "none" + update(): cada vez que se abre la app se
      // revisa si hay versión nueva (portada, íconos, fotos) sin esperar al
      // caché del navegador.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => reg.update())
        .catch(() => {});
    }
  }, []);

  // Al cambiar de página se cierra cualquier panel que haya quedado abierto.
  const pathname = routerState.location.pathname;
  useEffect(() => {
    setPanel(null);
  }, [pathname]);

  useEffect(() => {
    if (showMusic) setDraftPortadaUrl(ajustes.portadaUrl ?? "");
  }, [showMusic]);

  // Si guardaste algo (carta, foto, evento, música) sin conexión, esto lo
  // reintenta solo apenas vuelve el internet.
  useEffect(() => {
    flushPendingSync().catch(() => {});
    const onOnline = () => flushPendingSync().catch(() => {});
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const playTrack = (targetUrl?: string) => {
    const activeUrl = (targetUrl ?? musicUrl).trim() || DEFAULT_MUSIC;
    const ytId = extractYouTubeId(activeUrl);

    if (ytId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.loadVideoById(ytId);
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        } catch {}
      }
    } else {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }
      const a = audioRef.current;
      if (a) {
        if (a.src !== activeUrl && !a.src.endsWith(activeUrl)) {
          a.src = activeUrl;
        }
        a.play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn("Autoplay diferido hasta interacción del usuario:", err);
            setIsPlaying(false);
          });
      }
    }
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    setIsPlaying(false);
  };

  // Otras páginas (Mi mascota, al usar el micrófono) piden pausar la música y
  // luego reanudarla. Mientras está suspendida, ningún toque la vuelve a
  // prender (ver "desbloqueo pasivo" más abajo).
  const musicaSuspendida = useRef(false);
  const sonabaAntes = useRef(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const controlRef = useRef({ playTrack, pauseTrack });
  controlRef.current = { playTrack, pauseTrack };
  useEffect(() => {
    const onMusica = (e: Event) => {
      const accion = (e as CustomEvent<"pausar" | "reanudar">).detail;
      if (accion === "pausar" && !musicaSuspendida.current) {
        musicaSuspendida.current = true;
        sonabaAntes.current = isPlayingRef.current;
        controlRef.current.pauseTrack();
      } else if (accion === "reanudar" && musicaSuspendida.current) {
        musicaSuspendida.current = false;
        if (sonabaAntes.current) controlRef.current.playTrack();
      }
    };
    window.addEventListener("liz:musica", onMusica);
    return () => window.removeEventListener("liz:musica", onMusica);
  }, []);

  // Carga inicial: espejo local primero, luego la nube verificando validez
  useEffect(() => {
    const rawLocal = localStorage.getItem(MUSIC_KEY);
    const hasLocal = isValidMusicUrl(rawLocal);
    if (rawLocal && !hasLocal) {
      localStorage.removeItem(MUSIC_KEY);
    }
    // Si no hay nada guardado en este dispositivo NO se pone la canción por
    // defecto de inmediato: antes eso descargaba 3 MB (video-portada.mp4)
    // compitiendo con la portada, para luego cambiarla por la de la nube.
    if (hasLocal) {
      setMusicUrl(rawLocal!);
      setDraftMusicUrl(rawLocal!);
    }
    const useDefault = () => {
      if (hasLocal) return;
      setMusicUrl(DEFAULT_MUSIC);
      setDraftMusicUrl(DEFAULT_MUSIC);
    };

    loadStoreShared()
      .then((s) => {
        if (!s.configured) return useDefault();
        hydrateAjustes(s.ajustes);
        if (!s.musica) return useDefault();
        if (s.musica && isValidMusicUrl(s.musica)) {
          setMusicUrl(s.musica);
          setDraftMusicUrl(s.musica);
          localStorage.setItem(MUSIC_KEY, s.musica);
        } else if (s.musica && !isValidMusicUrl(s.musica)) {
          setMusicUrl(DEFAULT_MUSIC);
          setDraftMusicUrl(DEFAULT_MUSIC);
          localStorage.setItem(MUSIC_KEY, DEFAULT_MUSIC);
        }
      })
      .catch(useDefault);
  }, []);

  // Iniciar reproducción cuando se define la música
  useEffect(() => {
    if (!musicUrl) return;
    playTrack(musicUrl);
  }, [musicUrl, youtubeId]);

  // Carga la API de YouTube solo cuando hace falta
  useEffect(() => {
    if (!youtubeId) return;
    if (window.YT?.Player) {
      setYtReady(true);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      setYtReady(true);
    };
    // El reproductor de YouTube pesa ~1.4 MB: se carga cuando la página ya
    // terminó de cargar y el celular está libre, para no frenar la portada.
    // (Los navegadores igual no dejan sonar música antes del primer toque.)
    let idleId: number | undefined;
    const inject = () => {
      if (document.getElementById("youtube-iframe-api")) return;
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    };
    const schedule = () => {
      idleId =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(inject, { timeout: 2500 })
          : window.setTimeout(inject, 800);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    // Si la persona toca antes, se carga en ese momento.
    window.addEventListener("pointerdown", inject, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      window.removeEventListener("pointerdown", inject);
      if (idleId !== undefined) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
        window.clearTimeout(idleId);
      }
    };
  }, [youtubeId]);

  // Reproductor de YouTube persistente
  useEffect(() => {
    if (!youtubeId || !ytReady || !ytContainerRef.current) return;
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.loadVideoById(youtubeId);
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      } catch {}
      return;
    }
    ytPlayerRef.current = new window.YT!.Player(ytContainerRef.current, {
      videoId: youtubeId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        playsinline: 1,
        loop: 1,
        playlist: youtubeId,
      },
      events: {
        onReady: (e: { target: YTPlayer }) => {
          try {
            e.target.playVideo();
            setIsPlaying(true);
          } catch {}
        },
        onStateChange: (e: { data: number; target: YTPlayer }) => {
          const YT = window.YT!;
          if (e.data === YT.PlayerState.PLAYING) {
            setIsPlaying(true);
          } else if (e.data === YT.PlayerState.PAUSED) {
            setIsPlaying(false);
          } else if (e.data === YT.PlayerState.ENDED) {
            e.target.seekTo(0, true);
            e.target.playVideo();
          }
        },
      },
    });
  }, [youtubeId, ytReady]);

  // Desbloqueo pasivo de autoplay al primer toque/tecla del usuario
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (musicaSuspendida.current) return;
      if (youtubeId) {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getPlayerState === "function") {
          try {
            if (ytPlayerRef.current.getPlayerState() !== 1) {
              ytPlayerRef.current.playVideo();
              setIsPlaying(true);
            }
          } catch {}
        }
      } else if (audioRef.current && audioRef.current.paused && musicUrl) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    };
    window.addEventListener("pointerdown", handleFirstInteraction, { passive: true });
    window.addEventListener("keydown", handleFirstInteraction, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [youtubeId, musicUrl]);

  const saveMusic = (url: string) => {
    setMusicUrl(url);
    localStorage.setItem(MUSIC_KEY, url);
    saveMusica({ data: url }).catch(() => queuePendingMusica(url));
  };

  const saveMusicChanges = () => {
    const nextUrl = draftMusicUrl.trim();
    if (!nextUrl) {
      setMusicError("Ingresa un enlace o sube un archivo.");
      return;
    }
    if (!isValidMusicUrl(nextUrl)) {
      setMusicError(
        "Por favor ingresa un enlace válido (archivo de audio o enlace de YouTube completo).",
      );
      return;
    }
    setMusicError(null);
    saveMusic(nextUrl);
    setPanel(null);
    playTrack(nextUrl);
  };

  const uploadMusicFile = async (file: File) => {
    setUploadingMusic(true);
    setMusicError(null);
    try {
      let finalUrl: string | null = null;
      // 1. Subir a Supabase (rápido y sin límites de Vercel Blob)
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await uploadAudio({ data: formData });
        if (res?.url) {
          finalUrl = res.url;
        }
      } catch (supaErr) {
        console.warn("Subida a Supabase falló, intentando Vercel Blob:", supaErr);
      }

      // 2. Respaldo secundario: Vercel Blob
      if (!finalUrl) {
        const path = `musica/${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.name}`;
        const blob = await upload(path, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
        });
        finalUrl = blob.url;
      }

      if (finalUrl) {
        setDraftMusicUrl(finalUrl);
        saveMusic(finalUrl);
        playTrack(finalUrl);
      }
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
    ["/mascota", "Mi mascota 🐶"],
  ];

  return (
    <div className="relative min-h-screen">
      <Splash />
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

      {/* Panel transparente detrás del logo y los íconos de arriba. Solo es
          decorativo (no recibe toques); respeta el notch del iPhone. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-1.5 top-[calc(env(safe-area-inset-top)+6px)] z-40 h-[80px] rounded-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md sm:inset-x-3 sm:top-[calc(env(safe-area-inset-top)+10px)] sm:h-[96px] ${
          isHome ? "border-white/15 bg-black/25" : "border-white/40 bg-white/25"
        }`}
      />

      {/* Logo */}
      <Link
        to="/"
        className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-4 sm:top-[calc(env(safe-area-inset-top)+20px)] sm:left-7 z-50 flex flex-col items-center gap-0.5 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] transition-transform hover:scale-105"
        aria-label="Ir al inicio"
      >
        <span className="block h-12 w-12 overflow-hidden rounded-full border-2 border-white/50 shadow-glow sm:h-14 sm:w-14">
          <img
            src="/icons/logo-liz.jpg"
            alt=""
            width={256}
            height={256}
            decoding="async"
            className="h-full w-full object-cover"
          />
        </span>
        <span className="text-xs font-bold leading-none sm:text-sm">Inicio</span>
      </Link>

      {/* Capa para cerrar cualquier panel abierto tocando fuera de él. */}
      {panel && <DismissLayer onDismiss={closePanel} />}

      {/* Nav */}
      <nav className="fixed top-[calc(env(safe-area-inset-top)+17px)] right-4 sm:top-[calc(env(safe-area-inset-top)+27px)] sm:right-7 z-50 flex items-center gap-2 text-[11px] sm:text-xs font-bold">
        <button
          onClick={() => setPanel((p) => (p === "menu" ? null : "menu"))}
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
          <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+94px)] flex max-h-[calc(100svh-7rem)] w-auto flex-col gap-1 overflow-y-auto rounded-2xl glass p-2 shadow-xl sm:left-auto sm:right-6 sm:top-[calc(env(safe-area-inset-top)+114px)] sm:w-56">
            {links.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                onClick={closePanel}
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
              onClick={() => setPanel("ajustes")}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-popover-foreground transition-colors hover:bg-primary/10"
            >
              <Settings size={16} />
              Ajustes
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (isPlaying) pauseTrack();
            else playTrack(musicUrl || DEFAULT_MUSIC);
          }}
          className={`p-2.5 rounded-full transition-all duration-300 hover:scale-105 flex items-center justify-center border ${
            isHome
              ? "bg-white/5 hover:bg-white/15 text-white border-white/25 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]"
              : "bg-white/60 hover:bg-white/80 text-popover-foreground/80 hover:text-popover-foreground border-black/5"
          }`}
          aria-label={isPlaying ? "Pausar música" : "Reproducir música"}
          title={isPlaying ? "Pausar música" : "Reproducir música"}
        >
          {isPlaying ? (
            <Volume2 size={20} className="text-pink-300 animate-pulse" />
          ) : (
            <VolumeX size={20} />
          )}
        </button>
        <NotificationBell
          isHome={isHome}
          open={panel === "avisos"}
          onOpenChange={(open) => setPanel(open ? "avisos" : null)}
        />
      </nav>

      {showMusic && (
        <div
          role="dialog"
          aria-label="Ajustes"
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+94px)] z-50 max-h-[calc(100svh-7rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 overflow-y-auto overscroll-contain glass rounded-2xl p-4 shadow-xl sm:top-[calc(env(safe-area-inset-top)+114px)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-xl text-popover-foreground">Ajustes</p>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-full p-1.5 text-popover-foreground/70 transition hover:bg-black/5 hover:text-popover-foreground"
              aria-label="Cerrar ajustes"
            >
              <X size={20} />
            </button>
          </div>

          {/* ===== Portada ===== */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-popover-foreground/60">
            Portada del inicio
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {[...PORTADAS, { id: "personalizada", nombre: "Mi video" } as const].map((p) => {
              const active = ajustes.portada === p.id;
              const mini = "miniatura" in p ? p.miniatura : undefined;
              return (
                <button
                  key={p.id}
                  type="button"
                  // "Mi video" sin link todavía sigue mostrando la flor de loto
                  // hasta que se pegue uno abajo (ver resolvePortada).
                  onClick={() => setAjustes({ portada: p.id })}
                  className={`group flex flex-col items-center gap-1 rounded-xl p-1 text-[10px] font-semibold text-popover-foreground/80 transition ${
                    active ? "bg-primary/15 ring-2 ring-primary" : "hover:bg-black/5"
                  }`}
                  aria-pressed={active}
                >
                  <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-lg bg-[#02020a]">
                    {mini ? (
                      <img
                        src={mini}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : p.id === "galaxia" ? (
                      <span className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_45%,#fde047_0%,#b45309_22%,#1e1b4b_55%,#02020a_80%)] text-lg">
                        🌼
                      </span>
                    ) : p.id === "oceano" ? (
                      <span className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_40%,#5eead4_0%,#0e7490_28%,#172554_62%,#02020a_90%)] text-lg">
                        🐬
                      </span>
                    ) : (
                      <span className="grid h-full w-full place-items-center text-white/70">
                        <Sparkles size={18} />
                      </span>
                    )}
                    {active && (
                      <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-white">
                        <Check size={11} />
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 w-full text-center leading-tight">{p.nombre}</span>
                </button>
              );
            })}
          </div>
          {ajustes.portada === "personalizada" && (
            <div className="mt-2 flex gap-2">
              <input
                type="url"
                placeholder="https://... (link directo a un .mp4)"
                value={draftPortadaUrl}
                onChange={(e) => setDraftPortadaUrl(e.target.value)}
                className="min-w-0 flex-1 rounded-full border border-primary/20 bg-white/60 px-4 py-2 text-sm text-popover-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={!/^https?:\/\/\S+$/i.test(draftPortadaUrl.trim())}
                onClick={() =>
                  setAjustes({ portada: "personalizada", portadaUrl: draftPortadaUrl.trim() })
                }
                className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
                style={{ background: "var(--gradient-rose)" }}
              >
                Usar
              </button>
            </div>
          )}

          {/* ===== Secciones ===== */}
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-popover-foreground/60">
            Secciones del inicio
          </p>
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["mostrarGalaxia", "Universo de las rosas amarillas"],
                ["mostrarOceano", "Océano del delfín"],
              ] as const
            ).map(([key, text]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-black/5 bg-white/40 px-3 py-2 text-sm text-popover-foreground/85"
              >
                {text}
                <input
                  type="checkbox"
                  role="switch"
                  checked={ajustes[key]}
                  onChange={(e) => setAjustes({ [key]: e.target.checked })}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="relative h-6 w-11 shrink-0 rounded-full bg-black/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary"
                />
              </label>
            ))}
          </div>

          {/* ===== Música ===== */}
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-popover-foreground/60">
            Música de fondo
          </p>
          <div className="flex flex-col gap-2.5">
            {/* Estado y control rápido */}
            <div className="flex items-center justify-between rounded-xl bg-white/40 px-3 py-2 border border-black/5">
              <span className="text-xs font-semibold text-popover-foreground/80 flex items-center gap-1.5">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isPlaying ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
                  }`}
                />
                {isPlaying ? "Reproduciendo música" : "Música pausada"}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) {
                    pauseTrack();
                  } else {
                    playTrack(draftMusicUrl.trim() || musicUrl || DEFAULT_MUSIC);
                  }
                }}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/10 transition"
              >
                {isPlaying ? (
                  <>
                    <Pause size={13} /> Pausar
                  </>
                ) : (
                  <>
                    <Play size={13} /> Reproducir
                  </>
                )}
              </button>
            </div>

            <input
              type="url"
              placeholder="https://... (mp3 o link de YouTube)"
              value={draftMusicUrl}
              onChange={(e) => {
                setDraftMusicUrl(e.target.value);
                if (musicError) setMusicError(null);
              }}
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
              disabled={uploadingMusic || !draftMusicUrl.trim()}
              className="rounded-full border border-primary/30 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Guardar y Reproducir
            </button>
            <p className="text-xs text-popover-foreground/60 text-center">
              Pega un enlace de YouTube o archivo mp3. Se guardará en la nube y seguirá reproduciéndose de fondo sin interrupción.
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
        // Sin canción decidida aún no hay src: no se descarga nada de más.
        src={youtubeId || !musicUrl ? undefined : musicUrl}
        loop
        autoPlay
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          console.warn("Audio falló al cargar, restaurando música por defecto");
          if (musicUrl !== DEFAULT_MUSIC) {
            setMusicUrl(DEFAULT_MUSIC);
            localStorage.setItem(MUSIC_KEY, DEFAULT_MUSIC);
            playTrack(DEFAULT_MUSIC);
          }
        }}
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
