// Declaraciones mínimas para el motor 3D del océano (código JavaScript importado).
declare module "@/ocean/Game/Game.class" {
  export default class Game {
    constructor(canvas: HTMLCanvasElement, resources: unknown, debugMode?: boolean);
    destroy(): void;
  }
}

declare module "@/ocean/Game/Utils/ResourceLoader.class" {
  export default class ResourceLoader {
    constructor(assets: unknown, isDebugMode?: boolean);
    on<T = unknown>(event: string, cb: (payload: T) => void): void;
    off(event: string): void;
  }
}

declare module "@/ocean/assets" {
  const ASSETS: unknown;
  export default ASSETS;
}
