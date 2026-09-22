const KEY_MAP = {
  forward: ["ArrowUp", "KeyW"],
  backward: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["Space"],
  down: ["ShiftLeft", "ShiftRight"],
};

export default class Keyboard {
  constructor() {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
    };

    this._onKeyDown = (event) => this._setKey(event.code, true);
    this._onKeyUp = (event) => this._setKey(event.code, false);

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  _setKey(code, pressed) {
    for (const action in KEY_MAP) {
      if (KEY_MAP[action].includes(code)) {
        this.keys[action] = pressed;
      }
    }
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
