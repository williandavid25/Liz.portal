import EventEmitter from "./EventEmitter.class";

export default class Time extends EventEmitter {
  constructor() {
    super();

    this.start = Date.now();
    this.current = this.start;
    this.elapsedTime = 0;
    this.delta = 34;
    // Milisegundos reales entre un cuadro y el siguiente (sin el tope de
    // `delta`): sirve para medir si el equipo llega a dibujar fluido.
    this.frameMs = 16.7;
    this.stopped = false;
    this.hidden = document.hidden;
    // Fuera de la pantalla (la página avisa con setActive) no se dibuja nada.
    this.active = true;
    this._raf = 0;
    this._onVisibilityChange = () => {
      this.hidden = document.hidden;
      this._schedule();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);

    this._tick = () => this.animate();
    this._schedule();
  }

  /** Detiene o reanuda el dibujo (p. ej. cuando el océano sale de la pantalla). */
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this._schedule();
  }

  _running() {
    return !this.stopped && !this.hidden && this.active;
  }

  _schedule() {
    if (this._raf || !this._running()) return;
    // Al volver, el primer cuadro sigue desde donde quedó: sin saltos.
    this.current = Date.now();
    this._raf = window.requestAnimationFrame(this._tick);
  }

  stop() {
    this.stopped = true;
    if (this._raf) window.cancelAnimationFrame(this._raf);
    this._raf = 0;
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
  }

  animate() {
    this._raf = 0;
    // En pausa el bucle se apaga del todo (antes seguía despertando al
    // celular 60 veces por segundo aunque no dibujara nada).
    if (!this._running()) return;
    const currentTime = Date.now();
    this.frameMs = currentTime - this.current;
    this.delta = Math.min(this.frameMs / 1000, 0.05);
    this.current = currentTime;
    this.elapsedTime = (this.current - this.start) / 1000;
    this.trigger("animate");

    if (this._running()) this._raf = window.requestAnimationFrame(this._tick);
  }
}
