import EventEmitter from './EventEmitter.class';

export default class Time extends EventEmitter {
  constructor() {
    super();

    this.start = Date.now();
    this.current = this.start;
    this.elapsedTime = 0;
    this.delta = 34;
    this.stopped = false;

    window.requestAnimationFrame(() => {
      this.animate();
    });
  }

  stop() {
    this.stopped = true;
  }

  animate() {
    if (this.stopped) return;
    const currentTime = Date.now();
    this.delta = Math.min((currentTime - this.current) / 1000, 0.05);
    this.current = currentTime;
    this.elapsedTime = (this.current - this.start) / 1000;

    this.trigger('animate');

    window.requestAnimationFrame(() => {
      this.animate();
    });
  }
}
