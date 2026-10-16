import type { Sinte } from "./audio";
import {
  COLORES,
  DIFICULTADES,
  ENTRADA,
  LINEA,
  puntosGood,
  puntosPerfect,
  type Cancion,
  type Stats,
} from "./canciones";

// Motor del juego en canvas. Todo el estado vive aquí (fuera de React) y se
// dibuja con requestAnimationFrame; React solo recibe puntos/combo y el final.

type Juicio = "perfect" | "good" | "miss";

interface Ficha {
  c: number;
  n: string;
  /** Segundo en que llega a la línea (sin contar la entrada). */
  t: number;
  /** Largo en segundos (ya limitado para no pisar a la siguiente). */
  largo: number;
  dur: number;
  /** 0 pendiente, 1 tocada, 2 fallada */
  estado: 0 | 1 | 2;
  /** Tiempo de juego en que se tocó. */
  tg: number;
}

interface Onda {
  x: number;
  y: number;
  vida: number;
  color: string;
  fuerte: boolean;
}
interface Chispa {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  max: number;
  color: string;
  r: number;
}
interface Texto {
  x: number;
  y: number;
  vida: number;
  txt: string;
  color: string;
}
interface Bokeh {
  x: number;
  y: number;
  r: number;
  a: number;
  vy: number;
  fase: number;
  color: number;
}

export interface Eventos {
  onHud: (puntos: number, combo: number) => void;
  onFin: (s: Stats) => void;
}

const FUENTE = "Orbitron, system-ui, sans-serif";
const ROJO = "#ff4d6d";
const ORO = "#ffd166";

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Motor {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private raf = 0;
  private ultimo = 0;

  private fichas: Ficha[] = [];
  private viaje = 2;
  private vPerfect = 0.08;
  private vGood = 0.16;
  private inicio = 0;
  private pausaDesde = 0;
  private terminado = false;
  private fin = 0;

  private puntos = 0;
  private combo = 0;
  private comboMax = 0;
  private cuenta = { perfect: 0, good: 0, miss: 0 };

  private presionados = new Map<number, number>();
  private destello = [0, 0, 0, 0];
  private ondas: Onda[] = [];
  private chispas: Chispa[] = [];
  private textos: Texto[] = [];
  private bokeh: Bokeh[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private gradCol: CanvasGradient[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private sinte: Sinte,
    private ev: Eventos,
    private barra: HTMLElement | null,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;
    this.sprites = COLORES.map((c) => {
      const s = document.createElement("canvas");
      s.width = s.height = 128;
      const g = s.getContext("2d");
      if (g) {
        const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        rg.addColorStop(0, rgba(c, 0.9));
        rg.addColorStop(0.45, rgba(c, 0.35));
        rg.addColorStop(1, rgba(c, 0));
        g.fillStyle = rg;
        g.fillRect(0, 0, 128, 128);
      }
      return s;
    });
    this.bokeh = Array.from({ length: 18 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 30 + Math.random() * 90,
      a: 0.05 + Math.random() * 0.12,
      vy: 0.004 + Math.random() * 0.012,
      fase: Math.random() * Math.PI * 2,
      color: i % 4,
    }));
  }

  get pausado() {
    return this.pausaDesde > 0;
  }

  redimensionar(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hy = h * LINEA;
    this.gradCol = COLORES.map((c) => {
      const g = this.ctx.createLinearGradient(0, 0, 0, hy);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(1, rgba(c, 0.09));
      return g;
    });
    if (this.pausado || this.terminado) this.dibujar(this.tiempo());
  }

  iniciar(cancion: Cancion, dif: number) {
    const d = DIFICULTADES[dif] ?? DIFICULTADES[1];
    this.viaje = d.viaje;
    this.vPerfect = d.perfect / 1000;
    this.vGood = d.good / 1000;
    const spb = 60 / cancion.bpm;
    const orden = [...cancion.tiles].sort((a, b) => a.b - b.b || a.c - b.c);
    this.fichas = orden.map((t) => ({
      c: Math.max(0, Math.min(3, Math.round(t.c))),
      n: t.n,
      t: t.b * spb,
      largo: Math.max(0, t.d * spb),
      dur: Math.min(2.4, Math.max(0.25, t.d * spb * 1.1)),
      estado: 0,
      tg: 0,
    }));
    // Que una ficha larga no se meta debajo de la siguiente de su columna.
    for (let i = 0; i < this.fichas.length; i++) {
      const f = this.fichas[i];
      const sig = this.fichas.find((g, j) => j > i && g.c === f.c);
      if (sig) f.largo = Math.min(f.largo, Math.max(0, sig.t - f.t - 0.06));
    }
    this.fin = this.fichas.reduce((m, f) => Math.max(m, f.t), 0) + 0.9;
    this.puntos = this.combo = this.comboMax = 0;
    this.cuenta = { perfect: 0, good: 0, miss: 0 };
    this.terminado = false;
    this.pausaDesde = 0;
    this.inicio = performance.now();
    this.ultimo = this.inicio;
    this.ev.onHud(0, 0);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.bucle);
  }

  /** Tiempo de juego en segundos (negativo durante la entrada). */
  private tiempo(ahora = performance.now()) {
    const ref = this.pausaDesde > 0 ? this.pausaDesde : ahora;
    return (ref - this.inicio) / 1000 - ENTRADA;
  }

  pausar() {
    if (this.pausaDesde > 0 || this.terminado) return;
    this.pausaDesde = performance.now();
    this.presionados.clear();
  }

  reanudar() {
    if (this.pausaDesde === 0) return;
    const ahora = performance.now();
    this.inicio += ahora - this.pausaDesde;
    this.pausaDesde = 0;
    this.ultimo = ahora;
  }

  destruir() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.terminado = true;
  }

  // ------------------------------------------------------------ entrada

  presionar(id: number, col: number) {
    this.presionados.set(id, col);
    this.tocar(col);
  }

  soltar(id: number) {
    this.presionados.delete(id);
  }

  tocar(col: number) {
    if (this.pausado || this.terminado || col < 0 || col > 3) return;
    const t = this.tiempo();
    this.destello[col] = 1;
    let mejor: Ficha | null = null;
    for (const f of this.fichas) {
      if (f.estado !== 0 || f.c !== col) continue;
      if (Math.abs(t - f.t) <= this.vGood) {
        mejor = f;
        break;
      }
      if (f.t - t > this.vGood) break;
    }
    const cx = (col + 0.5) * (this.w / 4);
    const cy = this.h * LINEA;
    if (!mejor) {
      this.ondas.push({ x: cx, y: cy, vida: 0, color: COLORES[col], fuerte: false });
      return;
    }
    const dt = Math.abs(t - mejor.t);
    mejor.estado = 1;
    mejor.tg = t;
    this.combo++;
    this.comboMax = Math.max(this.comboMax, this.combo);
    const juicio: Juicio = dt <= this.vPerfect ? "perfect" : "good";
    if (juicio === "perfect") {
      this.cuenta.perfect++;
      this.puntos += puntosPerfect(this.combo);
    } else {
      this.cuenta.good++;
      this.puntos += puntosGood(this.combo);
    }
    this.sinte.tocar(mejor.n, mejor.dur);
    this.efectos(col, juicio);
    this.ev.onHud(this.puntos, this.combo);
  }

  private efectos(col: number, j: Juicio) {
    const color = COLORES[col];
    const cx = (col + 0.5) * (this.w / 4);
    const cy = this.h * LINEA;
    if (j === "miss") {
      this.textos.push({ x: cx, y: cy - 30, vida: 0, txt: "MISS", color: ROJO });
      return;
    }
    const fuerte = j === "perfect";
    this.ondas.push({ x: cx, y: cy, vida: 0, color, fuerte });
    const n = fuerte ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = 140 + Math.random() * (fuerte ? 320 : 200);
      const max = 0.35 + Math.random() * 0.35;
      this.chispas.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vida: max,
        max,
        color: Math.random() < 0.3 ? "#ffffff" : color,
        r: 1.5 + Math.random() * 2.2,
      });
    }
    this.textos.push({
      x: cx,
      y: cy - 34,
      vida: 0,
      txt: fuerte ? "PERFECT" : "GOOD",
      color: fuerte ? color : ORO,
    });
  }

  // ------------------------------------------------------------ bucle

  private bucle = (ahora: number) => {
    this.raf = requestAnimationFrame(this.bucle);
    if (this.pausado) return;
    const dt = Math.min(0.05, Math.max(0, (ahora - this.ultimo) / 1000));
    this.ultimo = ahora;
    const t = this.tiempo(ahora);
    this.actualizar(t, dt);
    this.dibujar(t);
    if (this.barra && this.fin > 0) {
      const p = Math.max(0, Math.min(1, t / this.fin));
      this.barra.style.transform = `scaleX(${p})`;
    }
  };

  private actualizar(t: number, dt: number) {
    let pendientes = 0;
    for (const f of this.fichas) {
      if (f.estado !== 0) continue;
      if (t - f.t > this.vGood) {
        f.estado = 2;
        f.tg = t;
        this.cuenta.miss++;
        this.combo = 0;
        this.efectos(f.c, "miss");
        this.ev.onHud(this.puntos, 0);
      } else pendientes++;
    }
    for (let i = 0; i < 4; i++) this.destello[i] = Math.max(0, this.destello[i] - dt * 4);
    for (const o of this.ondas) o.vida += dt;
    this.ondas = this.ondas.filter((o) => o.vida < 0.55);
    for (const c of this.chispas) {
      c.vida -= dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 620 * dt;
      c.vx *= 1 - 2 * dt;
    }
    this.chispas = this.chispas.filter((c) => c.vida > 0);
    for (const x of this.textos) x.vida += dt;
    this.textos = this.textos.filter((x) => x.vida < 0.7);
    for (const b of this.bokeh) {
      b.y -= b.vy * dt;
      if (b.y < -0.2) {
        b.y = 1.2;
        b.x = Math.random();
      }
    }

    if (!this.terminado && pendientes === 0 && t >= this.fin) {
      this.terminado = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.ev.onFin({
        puntos: this.puntos,
        comboMax: this.comboMax,
        ...this.cuenta,
        total: this.fichas.length,
      });
    }
  }

  // ------------------------------------------------------------ dibujo

  private dibujar(t: number) {
    const { ctx, w, h } = this;
    if (w === 0 || h === 0) return;
    const cw = w / 4;
    const hy = h * LINEA;
    const pps = hy / this.viaje;
    const reloj = performance.now() / 1000;

    // Fondo
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    const fondo = ctx.createLinearGradient(0, 0, 0, h);
    fondo.addColorStop(0, "#0b0a24");
    fondo.addColorStop(0.6, "#07071a");
    fondo.addColorStop(1, "#05050f");
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bokeh) {
      const r = b.r * (0.9 + 0.1 * Math.sin(reloj * 0.8 + b.fase));
      ctx.globalAlpha = b.a;
      ctx.drawImage(this.sprites[b.color], b.x * w - r, b.y * h - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Columnas
    for (let i = 0; i < 4; i++) {
      if (this.gradCol[i]) {
        ctx.fillStyle = this.gradCol[i];
        ctx.fillRect(i * cw, 0, cw, hy);
      }
      if (this.destello[i] > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, hy);
        g.addColorStop(0, rgba(COLORES[i], 0));
        g.addColorStop(1, rgba(COLORES[i], 0.28 * this.destello[i]));
        ctx.fillStyle = g;
        ctx.fillRect(i * cw, 0, cw, hy);
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(i * cw) - 0.5, 0, 1, h);

    // Zona bajo la línea
    const bajo = ctx.createLinearGradient(0, hy, 0, h);
    bajo.addColorStop(0, "rgba(10,8,30,0.55)");
    bajo.addColorStop(1, "rgba(3,3,10,0.9)");
    ctx.fillStyle = bajo;
    ctx.fillRect(0, hy, w, h - hy);

    // Fichas
    const pad = Math.max(5, cw * 0.07);
    const minH = Math.max(46, Math.min(70, h * 0.075));
    for (const f of this.fichas) {
      const yb = hy - (f.t - t) * pps;
      if (yb < -10) break;
      const alto = Math.max(minH, f.largo * pps);
      if (yb - alto > h) continue;
      const x = f.c * cw + pad;
      const ancho = cw - pad * 2;
      const color = COLORES[f.c];
      if (f.estado === 1) {
        const k = (t - f.tg) / 0.22;
        if (k >= 1) continue;
        const ya = hy - (f.t - f.tg) * pps;
        const s = 1 + k * 0.18;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        ctx.fillStyle = rgba(color, 0.9);
        const aw = ancho * s;
        const ah = alto * (1 - k * 0.5);
        rect(ctx, x + ancho / 2 - aw / 2, ya - ah, aw, ah, 12);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        rect(ctx, x + ancho / 2 - aw / 2, ya - ah, aw, ah, 12);
        ctx.fill();
        ctx.restore();
        continue;
      }
      const fallada = f.estado === 2;
      const y = yb - alto;
      ctx.save();
      if (fallada) {
        ctx.globalAlpha = Math.max(0, 0.55 - (t - f.tg) * 0.9);
        const g = ctx.createLinearGradient(0, y, 0, yb);
        g.addColorStop(0, "rgba(90,30,50,0.6)");
        g.addColorStop(1, "rgba(255,77,109,0.75)");
        ctx.fillStyle = g;
        rect(ctx, x, y, ancho, alto, 12);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      const g = ctx.createLinearGradient(0, y, 0, yb);
      g.addColorStop(0, rgba(color, 0.35));
      g.addColorStop(0.7, rgba(color, 0.85));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      rect(ctx, x, y, ancho, alto, 12);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Brillo interior
      const hl = Math.min(alto * 0.4, 22);
      const gh = ctx.createLinearGradient(0, y + 2, 0, y + 2 + hl);
      gh.addColorStop(0, "rgba(255,255,255,0.32)");
      gh.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gh;
      rect(ctx, x + 3, y + 3, ancho - 6, hl, 9);
      ctx.fill();
      // Borde fino y "tapa" luminosa abajo
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      rect(ctx, x + 0.5, y + 0.5, ancho - 1, alto - 1, 11.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      rect(ctx, x + ancho * 0.2, yb - 5, ancho * 0.6, 2.5, 1.25);
      ctx.fill();
      ctx.restore();
    }

    // Línea de golpe
    ctx.save();
    const lg = ctx.createLinearGradient(0, 0, w, 0);
    COLORES.forEach((c, i) => lg.addColorStop(i / 3, c));
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = lg;
    ctx.fillRect(0, hy - 1.5, w, 3);
    ctx.restore();

    // Círculos de golpe
    const presion = [false, false, false, false];
    for (const c of this.presionados.values()) presion[c] = true;
    const rc = Math.min(cw * 0.3, 32);
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * cw;
      const color = COLORES[i];
      const on = presion[i] || this.destello[i] > 0.6;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = on ? 26 : 10;
      ctx.beginPath();
      ctx.arc(cx, hy, rc * (on ? 1.08 : 1), 0, Math.PI * 2);
      ctx.fillStyle = on ? rgba(color, 0.4) : "rgba(7,7,26,0.75)";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(color, on ? 1 : 0.7);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx, hy, rc * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, on ? 0.9 : 0.25);
      ctx.fill();
      ctx.restore();
    }

    // Ondas
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const o of this.ondas) {
      const k = o.vida / 0.55;
      ctx.globalAlpha = (1 - k) * (o.fuerte ? 0.95 : 0.5);
      ctx.strokeStyle = o.color;
      ctx.lineWidth = (o.fuerte ? 4 : 2) * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(o.x, o.y, rc + k * (o.fuerte ? 70 : 40), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Chispas
    for (const c of this.chispas) {
      ctx.globalAlpha = Math.max(0, c.vida / c.max);
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Textos flotantes
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const x of this.textos) {
      const k = x.vida / 0.7;
      const pop = k < 0.15 ? 0.7 + (k / 0.15) * 0.4 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3);
      const tam = Math.round(Math.min(cw * 0.2, 18) * pop);
      ctx.font = `900 ${tam}px ${FUENTE}`;
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.shadowColor = x.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = x.color;
      ctx.fillText(x.txt, x.x, x.y - k * 46);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.globalAlpha *= 0.55;
      ctx.fillText(x.txt, x.x, x.y - k * 46);
    }
    ctx.restore();

    // Entrada
    if (t < 0) {
      const k = -t / ENTRADA;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.font = `900 ${Math.round(Math.min(w * 0.08, 34))}px ${FUENTE}`;
      ctx.shadowColor = "#ff00cc";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#ffffff";
      ctx.fillText("PREPÁRATE", w / 2, h * 0.4);
      ctx.restore();
    }
  }
}
