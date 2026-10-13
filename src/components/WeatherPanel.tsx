import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Snowflake,
  Sun,
  X,
} from "lucide-react";
import { ubicacionAproximada } from "@/lib/cloud";

interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number;
  weatherCode: number;
  location: string;
  updatedAt: string;
}

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    precipitation_probability: number[];
  };
}

function weatherDescription(code: number) {
  if (code === 0) return "Soleado";
  if (code <= 3) return "Parcialmente nublado";
  if (code <= 48) return "Nublado";
  if (code <= 57) return "Llovizna";
  if (code <= 77) return "Nieve";
  if (code <= 82) return "Lluvia";
  if (code >= 95) return "Tormenta";
  return "Variable";
}

function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  if (code === 0) return <Sun size={size} className="text-amber-200" aria-hidden="true" />;
  if (code <= 3) return <CloudSun size={size} className="text-amber-100" aria-hidden="true" />;
  if (code <= 48) return <Cloud size={size} className="text-slate-200" aria-hidden="true" />;
  if (code <= 77) return <Snowflake size={size} className="text-cyan-100" aria-hidden="true" />;
  if (code <= 82) return <CloudRain size={size} className="text-sky-200" aria-hidden="true" />;
  return <CloudLightning size={size} className="text-violet-200" aria-hidden="true" />;
}

async function readWeather(
  latitude: number,
  longitude: number,
  location: string,
  signal: AbortSignal,
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: "temperature_2m,apparent_temperature,weather_code",
    hourly: "precipitation_probability",
    forecast_days: "1",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error(`Weather request failed with status ${response.status}`);
  const data = (await response.json()) as OpenMeteoResponse;
  // La hora actual (antes se tomaba siempre la de medianoche).
  const hora = data.hourly.time.indexOf(`${data.current.time.slice(0, 13)}:00`);
  const probability = data.hourly.precipitation_probability[Math.max(0, hora)] ?? 0;
  return {
    temperature: Math.round(data.current.temperature_2m),
    apparentTemperature: Math.round(data.current.apparent_temperature),
    precipitationProbability: probability,
    weatherCode: data.current.weather_code,
    location,
    updatedAt: new Intl.DateTimeFormat("es", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date()),
  };
}

type Lugar = { latitude: number; longitude: number; label: string };
const CACHE_KEY = "liz-clima-cache";
const LUGAR_KEY = "liz-clima-lugar";

function leer<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function guardar(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento bloqueado */
  }
}

export function WeatherPanel() {
  const VISIBILITY_KEY = "liz-weather-panel-visible";
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(VISIBILITY_KEY);
    if (saved !== null) setVisible(saved === "true");
  }, []);

  // Primero se muestra el último clima guardado (aparece al instante), luego
  // se actualiza: ubicación exacta si el celular la da; si no la da (permiso
  // negado, GPS apagado o tarda mucho), la ubicación aproximada por la
  // conexión; y si tampoco, la última ubicación conocida.
  const loadWeather = useCallback(() => {
    const controller = new AbortController();
    let terminado = false;
    setLoading(true);
    setError(null);

    const usar = async (lugar: Lugar, aproximada: boolean) => {
      if (terminado) return;
      terminado = true;
      window.clearTimeout(tiempoGps);
      try {
        const next = await readWeather(
          lugar.latitude,
          lugar.longitude,
          lugar.label,
          controller.signal,
        );
        setWeather(next);
        setUsingFallback(aproximada);
        setError(null);
        guardar(CACHE_KEY, { weather: next, aproximada, at: Date.now() });
        if (!aproximada) guardar(LUGAR_KEY, lugar);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        console.warn("No se pudo cargar el clima:", reason);
        setError("No se pudo consultar el clima. Revisa tu internet.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const respaldo = async () => {
      if (terminado) return;
      const aprox = await ubicacionAproximada().catch(() => null);
      if (terminado || controller.signal.aborted) return;
      if (aprox) return usar({ ...aprox, label: `Cerca de ${aprox.label}` }, true);
      const ultimo = leer<Lugar>(LUGAR_KEY);
      if (ultimo) return usar(ultimo, false);
      terminado = true;
      setLoading(false);
      setError("No se pudo saber tu ubicación. Activa la ubicación y toca actualizar.");
    };

    // Si el GPS no responde en 8 s, se usa la ubicación aproximada.
    const tiempoGps = window.setTimeout(() => void respaldo(), 8000);
    if (!("geolocation" in navigator)) {
      void respaldo();
    } else {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          void usar(
            { latitude: coords.latitude, longitude: coords.longitude, label: "Tu ubicación" },
            false,
          ),
        () => void respaldo(),
        { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 7000 },
      );
    }
    return () => {
      terminado = true;
      controller.abort();
      window.clearTimeout(tiempoGps);
    };
  }, []);

  const cancelarClima = useRef<(() => void) | null>(null);
  const recargar = useCallback(() => {
    cancelarClima.current?.();
    cancelarClima.current = loadWeather();
  }, [loadWeather]);
  useEffect(() => {
    const guardado = leer<{ weather: WeatherData; aproximada: boolean; at: number }>(CACHE_KEY);
    if (guardado && Date.now() - guardado.at < 6 * 60 * 60_000) {
      setWeather(guardado.weather);
      setUsingFallback(guardado.aproximada);
    }
    recargar();
    const refresh = window.setInterval(recargar, 15 * 60_000);
    // Al volver a la app se actualiza si pasó un buen rato.
    const alVolver = () => {
      const g = leer<{ at: number }>(CACHE_KEY);
      if (!document.hidden && (!g || Date.now() - g.at > 10 * 60_000)) recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelarClima.current?.();
      cancelarClima.current = null;
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar]);

  // La posición la da la columna derecha de MascotaGame (clima arriba y el
  // botón de notas debajo), así el botón nunca tapa el panel.
  const position = "relative";

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => {
          setVisible(true);
          window.localStorage.setItem(VISIBILITY_KEY, "true");
        }}
        className={`${position} rounded-full bg-black/35 p-2 text-white/80 shadow-lg backdrop-blur-md transition hover:bg-black/50 hover:text-white`}
        aria-label="Mostrar pronóstico del clima"
        title="Mostrar clima"
      >
        <CloudSun size={18} aria-hidden="true" />
      </button>
    );
  }

  return (
    <aside
      className={`mg-clima mg-vidrio ${position} w-[min(220px,calc(100vw-2rem))] rounded-2xl px-3 py-2.5 text-white`}
      aria-live="polite"
      aria-label="Pronóstico del clima"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">
          <MapPin size={13} aria-hidden="true" />
          Clima
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={recargar}
            disabled={loading}
            aria-label="Actualizar clima"
            title="Actualizar clima"
            className="rounded-full p-1 text-white/70 transition hover:bg-white/20 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              window.localStorage.setItem(VISIBILITY_KEY, "false");
            }}
            aria-label="Ocultar panel del clima"
            title="Ocultar clima"
            className="rounded-full p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
      {loading && !weather ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-white/75">
          <LoaderCircle size={16} className="animate-spin" /> Consultando…
        </p>
      ) : weather ? (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <WeatherIcon code={weather.weatherCode} size={29} />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none">{weather.temperature}°C</p>
              <p className="truncate text-xs text-white/80">
                {weatherDescription(weather.weatherCode)}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-white/70">
            Lluvia: {weather.precipitationProbability}% · Sensación {weather.apparentTemperature}°C
          </p>
          <p className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/50">
            <span className="truncate">
              {weather.location}
              {usingFallback ? " (aprox.)" : ""}
            </span>
            <span>{weather.updatedAt}</span>
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-white/75">{error}</p>
      )}
    </aside>
  );
}
