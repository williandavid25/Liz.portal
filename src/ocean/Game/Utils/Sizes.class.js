import EventEmitter from "./EventEmitter.class";

// En pantallas chicas limitamos más el pixel ratio: renderizar el post-procesado
// a 3x en un celular de gama media cuesta mucho más de lo que se nota a simple vista.
function maxPixelRatio() {
  return window.innerWidth < 768 ? 1 : 1.5;
}

// En el celular la barra del navegador aparece y se esconde al deslizar, y
// cada vez cambia el alto de la ventana unos 50-120 px. Antes cada uno de esos
// cambios rehacía todos los búferes de dibujo del océano en pleno scroll (se
// notaba como tirones). Ahora esos cambios chicos de alto se ignoran (la
// sección del océano mide 100svh, el alto con la barra visible, así que el
// lienzo la sigue cubriendo) y los demás se aplican una vez que la ventana
// dejó de cambiar.
const CAMBIO_ALTO_IGNORADO = 160;
const ESPERA_MS = 180;

export default class Sizes extends EventEmitter {
  constructor() {
    super();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.basePixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio());
    // Fracción de la resolución con la que se dibuja (1 = completa). Baja sola
    // en equipos que no llegan a dibujar fluido (ver Game.medirFluidez).
    this.quality = 1;
    this.pixelRatio = this.basePixelRatio;
    this._timer = 0;
    // Solo en pantallas táctiles: en computador un cambio de alto es la
    // ventana que se agrandó de verdad y hay que seguirla.
    this._tactil = window.matchMedia?.("(pointer: coarse)").matches ?? false;

    this._apply = () => {
      this._timer = 0;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const base = Math.min(window.devicePixelRatio, maxPixelRatio());
      if (
        this._tactil &&
        width === this.width &&
        base === this.basePixelRatio &&
        Math.abs(height - this.height) < CAMBIO_ALTO_IGNORADO
      ) {
        return;
      }
      this.width = width;
      this.height = height;
      this.basePixelRatio = base;
      this.pixelRatio = base * this.quality;
      this.trigger("resize");
    };

    this._onResize = () => {
      window.clearTimeout(this._timer);
      this._timer = window.setTimeout(this._apply, ESPERA_MS);
    };

    window.addEventListener("resize", this._onResize);
  }

  /** Cambia la fracción de resolución (0-1) y avisa para redimensionar. */
  setQuality(quality) {
    if (quality === this.quality) return;
    this.quality = quality;
    this.pixelRatio = this.basePixelRatio * quality;
    this.trigger("resize");
  }

  destroy() {
    window.clearTimeout(this._timer);
    window.removeEventListener("resize", this._onResize);
  }
}
