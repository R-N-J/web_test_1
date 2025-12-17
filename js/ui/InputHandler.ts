export type Direction = { x: number; y: number };

export class InputHandler {
  private readonly down = new Set<string>();
  constructor(onKeyDown: (event: KeyboardEvent) => void) {
    window.addEventListener("keydown", (event) => {
      // One action per press:
      // - ignore OS key-repeat
      if (event.repeat) return;

      // - ignore if we already consider this key held
      //   (covers edge cases + prevents duplicates if logic changes later)
      const keyId = event.code || event.key;
      if (this.down.has(keyId)) return;
      this.down.add(keyId);

      onKeyDown(event);
    });

    window.addEventListener("keyup", (event) => {
      const keyId = event.code || event.key;
      this.down.delete(keyId);
    });

    // Optional safety: if the tab loses focus while holding a key, clear state
    window.addEventListener("blur", () => {
      this.down.clear();
    });
  }


  public static getMovementDelta(event: KeyboardEvent): Direction | null {
    switch (event.key) {
      case "ArrowUp":
      case "k":
        return {x: 0, y: -1};
      case "ArrowDown":
      case "j":
        return {x: 0, y: 1};
      case "ArrowLeft":
      case "h":
        return {x: -1, y: 0};
      case "ArrowRight":
      case "l":
        return {x: 1, y: 0};
    }
      // 2) Numpad diagonals/cardinals (support both event.code and event.key)
      switch (event.code) {
        case "Numpad7":
          return { x: -1, y: -1 };
        case "Numpad8":
          return { x: 0, y: -1 };
        case "Numpad9":
          return { x: 1, y: -1 };
        case "Numpad4":
          return { x: -1, y: 0 };
        case "Numpad6":
          return { x: 1, y: 0 };
        case "Numpad1":
          return { x: -1, y: 1 };
        case "Numpad2":
          return { x: 0, y: 1 };
        case "Numpad3":
          return { x: 1, y: 1 };
      }
    //  3) Numpad diagonals/cardinals (only event.key)
    switch (event.key) {
      case "7":
        return { x: -1, y: -1 };
      case "8":
        return { x: 0, y: -1 };
      case "9":
        return { x: 1, y: -1 };
      case "4":
        return { x: -1, y: 0 };
      case "6":
        return { x: 1, y: 0 };
      case "1":
        return { x: -1, y: 1 };
      case "2":
        return { x: 0, y: 1 };
      case "3":
        return { x: 1, y: 1 };
      default:
        return null;
    }
  }
}
