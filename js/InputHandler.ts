export type Direction = { x: number; y: number };

export class InputHandler {
  // We accept a callback function: "What should I do when the player moves?"
  constructor(onInput: (delta: Direction) => void) {
    window.addEventListener("keydown", (event) => {
      let delta: Direction = { x: 0, y: 0 };

      switch (event.key) {
        // Arrow Keys
        case "ArrowUp":
        case "k": // Vim keys for UP
          delta = { x: 0, y: -1 };
          break;
        case "ArrowDown":
        case "j": // Vim keys for DOWN
          delta = { x: 0, y: 1 };
          break;
        case "ArrowLeft":
        case "h": // Vim keys for LEFT
          delta = { x: -1, y: 0 };
          break;
        case "ArrowRight":
        case "l": // Vim keys for RIGHT
          delta = { x: 1, y: 0 };
          break;
        default:
          return; // Ignore other keys
      }

      // Prevent the browser from scrolling when using arrow keys
      event.preventDefault();

      // Trigger the callback
      onInput(delta);
    });
  }
}
