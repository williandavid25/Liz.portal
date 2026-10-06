import { useCallback, useEffect, useState } from "react";
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
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
  };
  hourly: {
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
  const probability = data.hourly.precipitation_probability[0] ?? 0;
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

export function WeatherPanel() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [visible, setVisible] = useState(true);

  const loadWeather = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const fetchFor = (location: { latitude: number; longitude: number; label: string }) =>
      readWeather(location.latitude, location.longitude, location.label, controller.signal)
        .then((next) => {
          setWeather(next);
          setUsingFallback(false);
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          console.warn("No se pudo cargar el clima:", reason);
          setError("No se pudo consultar el clima");
        })
        .finally(() => setLoading(false));

    let locationChosen = false;
    const chooseLocation = (location: { latitude: number; longitude: number; label: string }) => {
      if (locationChosen) return;
      locationChosen = true;
      window.clearTimeout(fallbackTimer);
      void fetchFor(location);
    };
    const fallbackTimer = window.setTimeout(() => {
      locationChosen = true;
      setLoading(false);
      setError("Activa la ubicación del móvil para consultar el clima de tu zona.");
    }, 5000);

    if (!("geolocation" in navigator)) {
      setLoading(false);
      setError("Este dispositivo no permite consultar su ubicación.");
    } else
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          chooseLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            label: "Tu ubicación",
          }),
        () => {
          locationChosen = true;
          window.clearTimeout(fallbackTimer);
          setLoading(false);
          setError("Permite la ubicación para mostrar el clima de tu zona.");
        },
        { enableHighAccuracy: false, maximumAge: 15 * 60_000, timeout: 5000 },
      );
    return () => {
      controller.abort();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    const cancel = loadWeather();
    const refresh = window.setInterval(loadWeather, 15 * 60_000);
    return () => {
      cancel?.();
      window.clearInterval(refresh);
    };
  }, [loadWeather]);

  useEffect(() => {
    const toggle = window.setInterval(() => setVisible((current) => !current), 5000);
    return () => window.clearInterval(toggle);
  }, []);

  const position =
    "absolute right-4 top-[calc(env(safe-area-inset-top)+300px)] z-10 sm:right-6 sm:top-[calc(env(safe-area-inset-top)+326px)]";

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
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
      className={`mg-clima mg-vidrio ${position} w-[min(220px,calc(100%-2rem))] rounded-2xl px-3 py-2.5 text-white`}
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
            onClick={loadWeather}
            disabled={loading}
            aria-label="Actualizar clima"
            title="Actualizar clima"
            className="rounded-full p-1 text-white/70 transition hover:bg-white/20 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
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
            <span>{usingFallback ? "Ubicación del móvil" : weather.location}</span>
            <span>{weather.updatedAt}</span>
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-white/75">{error}</p>
      )}
    </aside>
  );
}
