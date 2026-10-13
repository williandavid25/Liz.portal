// Motor de "háblale y te repite" (estilo Talking Tom) para la mascota.
//
// Escucha el micrófono, detecta solo cuándo empiezas y terminas de hablar, y
// repite lo grabado más agudo y rápido. Se graba el audio crudo (no con
// MediaRecorder) para guardar también ~0,35 s ANTES de detectar la voz: así no
// se corta la primera sílaba, y no depende de qué formatos sepa decodificar
// cada navegador (iPhone incluido).

export type EstadoVoz = "inactivo" | "escuchando" | "oyendo" | "hablando";

type Opciones = {
  onEstado: (e: EstadoVoz) => void;
  /** 0..1, para mover la boca mientras repite. */
  onBoca: (nivel: number) => void;
  /** Texto reconocido (solo en navegadores que lo permiten sin pelear por el micrófono). */
  onTexto?: (t: string) => void;
};

const PREROLL_S = 0.35;
const SILENCIO_FIN_MS = 900;
const MAX_MS = 8000;
const MIN_S = 0.35;
const TONO = 1.5; // más agudo y rápido, como una mascota

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export class VozMascota {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private proc: ScriptProcessorNode | null = null;
  private salida: AnalyserNode | null = null;
  private preroll: Float32Array[] = [];
  private segmento: Float32Array[] = [];
  private grabando = false;
  private reproduciendo = false;
  private inicio = 0;
  private ultimoSonido = 0;
  private ignorarHasta = 0;
  private ruido = 0.01;
  private bocaRaf = 0;
  private reco: SpeechRecognitionLike | null = null;
  private activo = false;
  /** Sube en cada iniciar/detener: descarta un permiso que llega tarde. */
  private gen = 0;

  constructor(private op: Opciones) {}

  static disponible() {
    return (
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!(
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
      )
    );
  }

  /** Debe llamarse desde un toque/clic (requisito de audio en iPhone). */
  async iniciar() {
    if (this.activo || this.ctx) return;
    const turno = ++this.gen;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // El AudioContext se crea dentro del mismo toque, antes de cualquier await.
    this.ctx = new Ctx();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      if (turno === this.gen) {
        await this.ctx?.close().catch(() => {});
        this.ctx = null;
      }
      throw e;
    }
    // Se detuvo (o se salió de la página) mientras se pedía el permiso:
    // se apaga el micrófono que acaba de abrirse.
    if (turno !== this.gen || !this.ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    await this.ctx.resume().catch(() => {});
    this.activo = true;

    const ctx = this.ctx;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.proc = ctx.createScriptProcessor(2048, 1, 1);
    this.proc.onaudioprocess = (ev) =>
      this.procesar(ev.inputBuffer.getChannelData(0), ctx.sampleRate);
    this.source.connect(this.proc);
    this.proc.connect(ctx.destination); // necesario para que procese (la salida va en silencio)

    this.salida = ctx.createAnalyser();
    this.salida.fftSize = 512;
    this.salida.connect(ctx.destination);

    this.iniciarTexto();
    this.op.onEstado("escuchando");
  }

  detener() {
    this.gen++;
    this.activo = false;
    cancelAnimationFrame(this.bocaRaf);
    try {
      this.reco?.stop();
    } catch {
      /* ignore */
    }
    this.reco = null;
    this.proc?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = this.stream = this.source = this.proc = this.salida = null;
    this.preroll = [];
    this.segmento = [];
    this.grabando = this.reproduciendo = false;
    this.op.onBoca(0);
    this.op.onEstado("inactivo");
  }

  private procesar(data: Float32Array, sr: number) {
    if (!this.activo || this.reproduciendo) return;
    const ahora = performance.now();
    if (ahora < this.ignorarHasta) return;

    const bloque = new Float32Array(data);
    let suma = 0;
    for (let i = 0; i < bloque.length; i++) suma += bloque[i]! * bloque[i]!;
    const rms = Math.sqrt(suma / bloque.length);
    const umbral = Math.max(0.018, this.ruido * 3.2);

    if (!this.grabando) {
      this.preroll.push(bloque);
      const maxBloques = Math.ceil((PREROLL_S * sr) / bloque.length);
      while (this.preroll.length > maxBloques) this.preroll.shift();
      if (rms > umbral) {
        this.grabando = true;
        this.segmento = [...this.preroll];
        this.preroll = [];
        this.inicio = this.ultimoSonido = ahora;
        this.op.onEstado("oyendo");
      } else {
        // Se adapta al ruido del ambiente (ventilador, calle...).
        this.ruido = this.ruido * 0.97 + rms * 0.03;
      }
      return;
    }

    this.segmento.push(bloque);
    if (rms > umbral * 0.7) this.ultimoSonido = ahora;
    if (ahora - this.ultimoSonido > SILENCIO_FIN_MS || ahora - this.inicio > MAX_MS) {
      this.terminar(sr, bloque.length);
    }
  }

  private terminar(sr: number, tamBloque: number) {
    this.grabando = false;
    // Quita casi todo el silencio final que se usó para saber que terminaste.
    const sobran = Math.floor(((SILENCIO_FIN_MS - 200) / 1000) * (sr / tamBloque));
    const partes = this.segmento.slice(0, Math.max(1, this.segmento.length - sobran));
    this.segmento = [];
    const total = partes.reduce((a, p) => a + p.length, 0);
    if (total / sr < MIN_S || !this.ctx || !this.salida) {
      this.op.onEstado("escuchando");
      return;
    }

    const buffer = this.ctx.createBuffer(1, total, sr);
    const canal = buffer.getChannelData(0);
    let off = 0;
    for (const p of partes) {
      canal.set(p, off);
      off += p.length;
    }
    // Pequeño fundido al inicio y al final para que no "chasquee".
    const fade = Math.min(400, Math.floor(total / 10));
    for (let i = 0; i < fade; i++) {
      canal[i]! *= i / fade;
      canal[total - 1 - i]! *= i / fade;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = TONO;
    const ganancia = this.ctx.createGain();
    ganancia.gain.value = 1.6;
    src.connect(ganancia);
    ganancia.connect(this.salida);

    this.reproduciendo = true;
    this.op.onEstado("hablando");
    const datos = new Uint8Array(this.salida.fftSize);
    const animarBoca = () => {
      if (!this.salida || !this.reproduciendo) return;
      this.salida.getByteTimeDomainData(datos);
      let s = 0;
      for (let i = 0; i < datos.length; i++) {
        const v = (datos[i]! - 128) / 128;
        s += v * v;
      }
      this.op.onBoca(Math.min(1, Math.sqrt(s / datos.length) * 5));
      this.bocaRaf = requestAnimationFrame(animarBoca);
    };
    this.bocaRaf = requestAnimationFrame(animarBoca);

    src.onended = () => {
      this.reproduciendo = false;
      cancelAnimationFrame(this.bocaRaf);
      this.op.onBoca(0);
      // Que no se escuche a sí mismo (eco del parlante).
      this.ignorarHasta = performance.now() + 450;
      this.preroll = [];
      if (this.activo) this.op.onEstado("escuchando");
    };
    src.start();
  }

  /** Transcripción (solo computador: en celulares pelea por el micrófono). */
  private iniciarTexto() {
    if (!this.op.onTexto) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const reco = new SR();
      reco.lang = "es-ES";
      reco.continuous = true;
      reco.interimResults = false;
      reco.onresult = (e) => {
        const ultimo = e.results[e.results.length - 1];
        if (ultimo?.isFinal && ultimo[0]) this.op.onTexto?.(ultimo[0].transcript.trim());
      };
      reco.onerror = () => {};
      reco.onend = () => {
        // Chrome la corta sola cada tanto: se reanuda mientras siga activo.
        if (this.activo && this.reco === reco) {
          try {
            reco.start();
          } catch {
            /* ignore */
          }
        }
      };
      reco.start();
      this.reco = reco;
    } catch {
      this.reco = null;
    }
  }
}
