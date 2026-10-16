import { frecuencia } from "./canciones";

// Sintetizador simple: un triángulo con una senoidal una octava arriba y una
// envolvente corta tipo piano. El AudioContext se crea con el primer toque
// (los navegadores no dejan sonar sin un gesto del usuario).

type ACtor = typeof AudioContext;

export class Sinte {
  private ctx: AudioContext | null = null;
  private salida: GainNode | null = null;

  /** Crea/reanuda el contexto. Llamarlo dentro de un gesto del usuario. */
  preparar(): AudioContext | null {
    if (!this.ctx) {
      const w = window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) return null;
      try {
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        const salida = ctx.createGain();
        salida.gain.value = 0.9;
        salida.connect(comp);
        comp.connect(ctx.destination);
        this.ctx = ctx;
        this.salida = salida;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Toca una nota ("C#5") durante `dur` segundos. */
  tocar(nota: string, dur = 0.5, vol = 0.32) {
    const ctx = this.preparar();
    const f = frecuencia(nota);
    if (!ctx || !this.salida || f === null) return;
    const t = ctx.currentTime;
    const fin = Math.max(dur, 0.12);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.01);
    env.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t + fin);
    env.connect(this.salida);

    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = f;
    o1.connect(env);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o2.connect(g2);
    g2.connect(env);

    o1.start(t);
    o2.start(t);
    o1.stop(t + fin + 0.05);
    o2.stop(t + fin + 0.05);
    o1.onended = () => {
      env.disconnect();
      g2.disconnect();
    };
  }

  cerrar() {
    const ctx = this.ctx;
    this.ctx = null;
    this.salida = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
}
