import * as THREE from "three";
import Sizes from "./Utils/Sizes.class";
import Time from "./Utils/Time.class";
import Mouse from "./Input/Mouse.class";
import Keyboard from "./Input/Keyboard.class";
import Camera from "./Core/Camera.class";
import Renderer from "./Core/Renderer.class";
import PostProcessing from "./Systems/PostProcessing.class";
import World from "./World/World.scene";

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

    this.time.on("animate", () => {
      this.update();
    });
    this.sizes.on("resize", () => {
      this.resize();
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
