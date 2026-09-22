import EventEmitter from "./EventEmitter.class";

// En pantallas chicas limitamos más el pixel ratio: renderizar el post-procesado
// a 3x en un celular de gama media cuesta mucho más de lo que se nota a simple vista.
function maxPixelRatio() {
  return window.innerWidth < 768 ? 1 : 1.5;
}

export default class Sizes extends EventEmitter {
  constructor() {
    super();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio());

    this._onResize = () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio());

      this.trigger("resize");
    };

    window.addEventListener("resize", this._onResize);
  }

  destroy() {
    window.removeEventListener("resize", this._onResize);
  }
}
