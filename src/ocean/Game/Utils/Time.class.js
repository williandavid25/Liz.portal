import EventEmitter from "./EventEmitter.class";

export default class Time extends EventEmitter {
  constructor() {
    super();

    this.start = Date.now();
    this.current = this.start;
    this.elapsedTime = 0;
    this.delta = 34;
    this.stopped = false;
    this.hidden = document.hidden;
    this._onVisibilityChange = () => {
      this.hidden = document.hidden;
      // Evita un salto de tiempo al volver a la pestaña.
      if (!this.hidden) this.current = Date.now();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);

    window.requestAnimationFrame(() => {
      this.animate();
    });
  }

  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
  }

  animate() {
    if (this.stopped) return;
    if (!this.hidden) {
      const currentTime = Date.now();
      this.delta = Math.min((currentTime - this.current) / 1000, 0.05);
      this.current = currentTime;
      this.elapsedTime = (this.current - this.start) / 1000;
      this.trigger("animate");
    }

    window.requestAnimationFrame(() => {
      this.animate();
    });
  }
}
