// Efectos de sonido de la mascota, sintetizados con Web Audio: no hay archivos
// que descargar y suenan al instante. El AudioContext se crea en el primer
// toque (requisito de los navegadores móviles).

export type Sonido =
  | "comer"
  | "banar"
  | "dormir"
  | "despertar"
  | "pasear"
  | "caricia"
  | "ladrido"
  | "triste"
  | "logro"
  | "aviso-hambre"
  | "aviso-sueno";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ruidoBuffer: AudioBuffer | null = null;

function audio(): { c: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { c: ctx, out: master! };
}

interface OpTono {
  f: number;
  f2?: number;
  t?: number;
  dur: number;
  tipo?: OscillatorType;
  vol?: number;
  ataque?: number;
  filtro?: number;
}

function tono(c: AudioContext, out: AudioNode, o: OpTono) {
  const osc = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + (o.t ?? 0);
  osc.type = o.tipo ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + (o.ataque ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  if (o.filtro) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.filtro;
    osc.connect(lp).connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

function ruido(
  c: AudioContext,
  out: AudioNode,
  o: { t?: number; dur: number; vol: number; frec: number; q?: number; tipo?: BiquadFilterType },
) {
  if (!ruidoBuffer) {
    ruidoBuffer = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = ruidoBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = ruidoBuffer;
  const f = c.createBiquadFilter();
  f.type = o.tipo ?? "bandpass";
  f.frequency.value = o.frec;
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const t0 = c.currentTime + (o.t ?? 0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

export function reproducir(s: Sonido) {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  switch (s) {
    case "comer":
      for (const t of [0, 0.24, 0.48]) {
        ruido(c, out, { t, dur: 0.08, vol: 0.35, frec: 1900, q: 0.8 });
        tono(c, out, { t, f: 480, f2: 330, dur: 0.09, tipo: "triangle", vol: 0.12 });
      }
      tono(c, out, { t: 0.78, f: 620, f2: 940, dur: 0.16, vol: 0.18 });
      break;
    case "banar":
      for (let i = 0; i < 7; i++) {
        const f = 320 + Math.random() * 520;
        tono(c, out, { t: i * 0.12 + Math.random() * 0.04, f, f2: f * 2.3, dur: 0.09, vol: 0.14 });
      }
      ruido(c, out, { t: 0, dur: 0.5, vol: 0.06, frec: 3200, q: 0.5, tipo: "highpass" });
      break;
    case "dormir":
      [784, 659, 523, 392].forEach((f, i) =>
        tono(c, out, { t: i * 0.42, f, dur: 0.6, vol: 0.11, ataque: 0.06, tipo: "sine" }),
      );
      break;
    case "despertar":
      [523, 659, 784, 1047].forEach((f, i) =>
        tono(c, out, { t: i * 0.09, f, dur: 0.18, vol: 0.12, tipo: "triangle" }),
      );
      break;
    case "pasear":
      for (const t of [0, 0.22, 0.44, 0.66])
        ruido(c, out, { t, dur: 0.07, vol: 0.3, frec: 260, tipo: "lowpass" });
      [659, 784, 988].forEach((f, i) =>
        tono(c, out, { t: 0.9 + i * 0.09, f, dur: 0.16, vol: 0.1, tipo: "triangle" }),
      );
      break;
    case "caricia":
      tono(c, out, { f: 700, f2: 1150, dur: 0.12, vol: 0.14 });
      tono(c, out, { t: 0.12, f: 900, f2: 1450, dur: 0.14, vol: 0.12 });
      break;
    case "ladrido":
      // "¡Guau, guau!": diente de sierra que cae de tono + golpe de aire.
      for (const t of [0, 0.22]) {
        tono(c, out, { t, f: 560, f2: 250, dur: 0.15, tipo: "sawtooth", vol: 0.16, filtro: 1400 });
        ruido(c, out, { t, dur: 0.06, vol: 0.18, frec: 950, q: 1.2 });
      }
      break;
    case "triste":
      tono(c, out, { f: 620, f2: 400, dur: 0.45, vol: 0.12, ataque: 0.04 });
      tono(c, out, { t: 0.42, f: 520, f2: 320, dur: 0.6, vol: 0.1, ataque: 0.04 });
      break;
    case "logro":
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tono(c, out, { t: i * 0.08, f, dur: 0.22, vol: 0.12, tipo: "triangle" }),
      );
      tono(c, out, { t: 0.42, f: 2093, dur: 0.5, vol: 0.06 });
      tono(c, out, { t: 0.5, f: 2637, dur: 0.45, vol: 0.05 });
      break;
    case "aviso-hambre":
      tono(c, out, { f: 880, f2: 1047, dur: 0.16, tipo: "triangle", vol: 0.16 });
      tono(c, out, { t: 0.2, f: 1047, f2: 1319, dur: 0.2, tipo: "triangle", vol: 0.14 });
      tono(c, out, { t: 0.46, f: 784, f2: 659, dur: 0.28, tipo: "sine", vol: 0.12 });
      break;
    case "aviso-sueno":
      tono(c, out, { f: 523, f2: 392, dur: 0.42, tipo: "sine", vol: 0.11 });
      tono(c, out, { t: 0.48, f: 392, f2: 294, dur: 0.56, tipo: "sine", vol: 0.09 });
      break;
  }
}
