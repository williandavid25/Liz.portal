import * as THREE from "three";
import Sizes from "./Utils/Sizes.class";
import Time from "./Utils/Time.class";
import Mouse from "./Input/Mouse.class";
import Keyboard from "./Input/Keyboard.class";
import Camera from "./Core/Camera.class";
import Renderer from "./Core/Renderer.class";
import PostProcessing from "./Systems/PostProcessing.class";
import World from "./World/World.scene";

// Resolución mínima a la que baja el océano en equipos lentos (ver medirFluidez).
const CALIDAD_MINIMA = 0.75;

export default class Game {
  constructor(canvas, resources, debugMode) {
    if (Game.instance) {
      Game.instance.destroy();
    }
    Game.instance = this;

    this.isDebugEnabled = false;

    this.canvas = canvas;
    this.resources = resources;

    this.sizes = new Sizes();
    this.time = new Time();
    this.mouse = new Mouse();
    this.keyboard = new Keyboard();
    this.scene = new THREE.Scene();
    this.camera = new Camera();
    this.renderer = new Renderer();
    this.world = new World();
    this.postProcessing = new PostProcessing();

    this._muestras = [];
    this.time.on("animate", () => {
      this.update();
      this.medirFluidez(this.time.frameMs);
    });
    this.sizes.on("resize", () => {
      this.resize();
    });
  }

  /** Pausa (false) o reanuda (true) el dibujo, p. ej. cuando sale de la pantalla. */
  setActive(active) {
    this.time?.setActive(active);
    // Al volver se empieza a medir de cero (el primer cuadro trae la pausa).
    if (this._muestras) this._muestras.length = 0;
  }

  /**
   * Resolución adaptable: cada ~90 cuadros mira la mediana del tiempo por
   * cuadro. Si pasa de 24 ms (menos de ~42 por segundo) dibuja con un 15 %
   * menos de resolución, hasta un mínimo del 75 % (más abajo el delfín ya se
   * ve dentado). La animación, la cantidad de partículas y su tamaño en
   * pantalla quedan iguales; en un celular que no da abasto solo se pierde un
   * poco de nitidez y vuelve a ir fluido. En un equipo que va bien nunca se activa.
   */
  medirFluidez(frameMs) {
    const sizes = this.sizes;
    if (!sizes || sizes.quality <= CALIDAD_MINIMA || !(frameMs > 0)) return;
    // Saltos largos (pestaña recién mostrada, carga) no cuentan.
    if (frameMs > 250) return;
    const muestras = this._muestras;
    muestras.push(frameMs);
    if (muestras.length < 90) return;
    const orden = muestras.slice().sort((a, b) => a - b);
    muestras.length = 0;
    if (orden[45] > 24) {
      sizes.setQuality(Math.max(CALIDAD_MINIMA, Math.round((sizes.quality - 0.15) * 100) / 100));
    }
  }

  /**
   * Los puntos (fondo marino, estela, destellos) miden su tamaño en píxeles
   * del lienzo: al bajar la resolución se escalan igual para que en pantalla
   * se vean del mismo tamaño que antes.
   */
  ajustarTamanoPuntos() {
    const quality = this.sizes.quality;
    this.scene.traverse((child) => {
      const uniform = child.material?.uniforms?.uPixelRatio;
      if (!uniform) return;
      if (child.material.userData.basePixelRatio === undefined) {
        child.material.userData.basePixelRatio = uniform.value;
      }
      uniform.value = child.material.userData.basePixelRatio * quality;
    });
  }

  static getInstance() {
    if (!Game.instance) {
      Game.instance = new Game();
    }
    return Game.instance;
  }

  resize() {
    this.camera.resize();
    this.renderer.resize();
    this.postProcessing.resize();
    this.ajustarTamanoPuntos();
  }

  update() {
    this.mouse.update(this.time.delta);
    this.camera.update(this.mouse, this.time.delta);
    this.world.update();
    this.postProcessing.update(this.time.elapsed, this.time.delta);
    this.renderer.update();
  }

  destroy() {
    this.sizes.off("resize");
    this.sizes.destroy();
    this.time.off("animate");
    this.time.stop();
    this.mouse.destroy();
    this.keyboard.destroy();

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();

        for (const key in child.material) {
          const value = child.material[key];

          if (typeof value?.dispose === "function") {
            value.dispose();
          }
        }
      }
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          for (const key in m) {
            const prop = m[key];
            if (prop && prop.isTexture) prop.dispose();
          }
          m.dispose();
        });
      }
    });

    this.camera.controls.dispose();
    this.renderer.rendererInstance.dispose();
    this.postProcessing.dispose();
    if (this.debug) this.debug.dispose();

    this.canvas = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.postProcessing = null;
    this.world = null;
    this.debug = null;
    this.mouse = null;
    this.keyboard = null;
    Game.instance = null;
  }
}
