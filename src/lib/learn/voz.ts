// Voz de Snoopy Learn: una chica latinoamericana lee cada pregunta antes de
// responder. Usa las voces que ya trae el celular (gratis, sin descargar):
// se elige la mejor voz femenina en español de América; las palabras en
// inglés se dicen con una voz en inglés para que la pronunciación sea real.

export type Idioma = "es" | "en";
export interface Segmento {
  texto: string;
  idioma: Idioma;
}

const disponible = () => typeof window !== "undefined" && "speechSynthesis" in window;

let voces: SpeechSynthesisVoice[] = [];
function cargarVoces() {
  if (!disponible()) return voces;
  const v = speechSynthesis.getVoices();
  if (v.length) voces = v;
  return voces;
}
if (disponible()) {
  cargarVoces();
  speechSynthesis.addEventListener?.("voiceschanged", cargarVoces);
}

// Voces femeninas conocidas en español latino (iOS/macOS, Windows, Android/Chrome).
const LATINAS = [
  "paulina",
  "dalia",
  "sabina",
  "angélica",
  "angelica",
  "marisol",
  "camila",
  "valentina",
  "francisca",
  "catalina",
  "elena",
  "salome",
  "salomé",
  "paloma",
  "lupe",
  "renata",
  "andrea",
  "sofia",
  "sofía",
  "karla",
  "karina",
  "paola",
  "tania",
  "lorena",
  "margarita",
  "yolanda",
  "ramona",
  "marta",
  "maría",
  "google español de estados unidos",
];

/** País del celular (es-EC → "EC"): se prefiere una voz con ese acento. */
function regionDelCelular(): string | null {
  if (typeof navigator === "undefined") return null;
  const l = (navigator.languages ?? [navigator.language]).find((x) => /^es[-_]/i.test(x));
  return l ? l.split(/[-_]/)[1]!.toUpperCase() : null;
}
const MASCULINAS =
  /jorge|raul|raúl|pablo|diego|carlos|juan|enrique|alvaro|álvaro|jose|josé|gerardo|tomas|tomás|andres|andrés|alonso|reed|eddy/i;
const AMERICA = /^es[-_](MX|US|419|CO|AR|CL|PE|VE|EC|UY|PY|BO|CR|DO|GT|HN|NI|PA|PR|SV|CU)\b/i;

function puntuarEspanol(v: SpeechSynthesisVoice) {
  const nombre = v.name.toLowerCase();
  let p = 0;
  if (LATINAS.some((n) => nombre.includes(n))) p += 100;
  if (AMERICA.test(v.lang)) p += 50;
  if (MASCULINAS.test(nombre)) p -= 80;
  if (/natural|neural|online|premium|enhanced|mejorada/i.test(nombre)) p += 15;
  if (/^es[-_]ES/i.test(v.lang)) p -= 10; // España: solo si no hay de América
  const region = regionDelCelular();
  if (region && v.lang.toUpperCase().endsWith(region)) p += 30; // mismo acento del país
  return p;
}

const INGLESAS = [
  "samantha",
  "aria",
  "jenny",
  "zira",
  "ava",
  "allison",
  "susan",
  "google us english",
];
function puntuarIngles(v: SpeechSynthesisVoice) {
  const nombre = v.name.toLowerCase();
  let p = 0;
  if (INGLESAS.some((n) => nombre.includes(n))) p += 100;
  if (/^en[-_]US/i.test(v.lang)) p += 40;
  if (/natural|neural|online|premium|enhanced/i.test(nombre)) p += 15;
  if (/david|mark|guy|daniel|fred|alex\b/i.test(nombre)) p -= 60;
  return p;
}

function mejor(lang: RegExp, puntuar: (v: SpeechSynthesisVoice) => number) {
  const candidatas = cargarVoces().filter((v) => lang.test(v.lang));
  if (candidatas.length === 0) return null;
  return candidatas.reduce((a, b) => (puntuar(b) > puntuar(a) ? b : a));
}

export const vozLatina = () => mejor(/^es/i, puntuarEspanol);
export const vozIngles = () => mejor(/^en/i, puntuarIngles);

/** Dice los segmentos en orden, cada uno con su voz. */
export function hablar(segmentos: Segmento[]) {
  if (!disponible()) return;
  callar();
  const es = vozLatina();
  const en = vozIngles();
  for (const s of segmentos) {
    const texto = s.texto.replace(/___/g, ", … ,").replace(/…/g, ",").trim();
    if (!texto) continue;
    const u = new SpeechSynthesisUtterance(texto);
    if (s.idioma === "en") {
      u.lang = en?.lang ?? "en-US";
      if (en) u.voice = en;
      u.rate = 0.9;
    } else {
      u.lang = es?.lang ?? "es-MX";
      if (es) u.voice = es;
      u.rate = 1;
      u.pitch = 1.08;
    }
    speechSynthesis.speak(u);
  }
}

export function callar() {
  if (disponible()) speechSynthesis.cancel();
}

/**
 * iPhone solo deja hablar si el primer audio sale de un toque: se llama al
 * tocar "Empezar" para que luego las preguntas se lean solas.
 */
export function desbloquearVoz() {
  if (!disponible()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}

/**
 * Parte un texto en español donde lo que va entre comillas simples está en
 * inglés: "¿Qué significa 'Nice to meet you'?" → es + en + es.
 */
export function partirComillas(texto: string, comillasEnIngles: boolean): Segmento[] {
  if (!comillasEnIngles) return [{ texto, idioma: "es" }];
  const out: Segmento[] = [];
  texto.split(/('[^']+')/).forEach((parte) => {
    if (!parte) return;
    const ingles = /^'[^']+'$/.test(parte);
    out.push({ texto: ingles ? parte.slice(1, -1) : parte, idioma: ingles ? "en" : "es" });
  });
  return out;
}

/** ¿El texto está escrito en inglés? (para las preguntas que van enteras en inglés) */
export const pareceIngles = (t: string) =>
  /^[A-Za-z0-9][A-Za-z0-9\s,'.?!:()-]*$/.test(t.replace(/___/g, "")) && !/[áéíóúñ¿¡]/i.test(t);
