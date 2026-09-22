import * as THREE from "three";
import EventEmitter from "../Utils/EventEmitter.class";

export default class Mouse extends EventEmitter {
  constructor() {
    super();

    this.mousePosition = new THREE.Vector2(0, 0);
    this.smoothedMousePosition = new THREE.Vector2(0, 0);
    this.smoothingFactor = 5;
    this.targetActive = false;

    this.setupEventListeners();
  }

  setupEventListeners() {
    this._onMouseMove = (event) => {
      this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousePosition.y = (event.clientY / window.innerHeight) * 2 - 1;
      this.targetActive = true;

      this.trigger("mousemove", [this.mousePosition]);
    };

    this._onTouchStart = (event) => {
      this.targetActive = true;
      this._updateTouchPosition(event);
    };

    this._onTouchMove = (event) => {
      this._updateTouchPosition(event);
    };

    this._onTouchEnd = () => {
      this.targetActive = false;
    };

    window.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("touchstart", this._onTouchStart, { passive: true });
    window.addEventListener("touchmove", this._onTouchMove);
    window.addEventListener("touchend", this._onTouchEnd);
    window.addEventListener("touchcancel", this._onTouchEnd);
  }

  _updateTouchPosition(event) {
    if (event.touches.length === 0) return;
    const touch = event.touches[0];
    this.mousePosition.x = (touch.clientX / window.innerWidth) * 2 - 1;
    this.mousePosition.y = (touch.clientY / window.innerHeight) * 2 - 1;
    this.targetActive = true;
    this.trigger("touchmove", [this.mousePosition]);
  }

  destroy() {
    window.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("touchstart", this._onTouchStart);
    window.removeEventListener("touchmove", this._onTouchMove);
    window.removeEventListener("touchend", this._onTouchEnd);
    window.removeEventListener("touchcancel", this._onTouchEnd);
  }

  update(deltaTime) {
    this.smoothedMousePosition.x +=
      (this.mousePosition.x - this.smoothedMousePosition.x) * this.smoothingFactor * deltaTime;
    this.smoothedMousePosition.y +=
      (this.mousePosition.y - this.smoothedMousePosition.y) * this.smoothingFactor * deltaTime;
  }
}
