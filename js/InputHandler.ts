export type Direction = { x: number; y: number };

export class InputHandler {
  constructor(onKeyDown: (event: KeyboardEvent) => void) {
    window.addEventListener("keydown", (event) => {
      onKeyDown(event);
    });
  }

  public static getMovementDelta(event: KeyboardEvent): Direction | null {
    switch (event.key) {
      case "ArrowUp":
      case "k":
        return { x: 0, y: -1 };
      case "ArrowDown":
      case "j":
        return { x: 0, y: 1 };
      case "ArrowLeft":
      case "h":
        return { x: -1, y: 0 };
      case "ArrowRight":
      case "l":
        return { x: 1, y: 0 };
      default:
        return null;
    }
  }
}
