import type { Action } from "../core/Actions";
import { InputHandler } from "./InputHandler";

export function keyEventToAction(event: KeyboardEvent): Action | null {
  const moveDelta = InputHandler.getMovementDelta(event);
  if (moveDelta) return { type: "MOVE", delta: moveDelta };

  if (event.code === "Numpad5" || event.key === "5") {
    return { type: "WAIT" };
  }

  switch (event.key.toLowerCase()) {
    case "e":
      return { type: "EQUIP" };
    case "u":
      return { type: "USE_CONSUMABLE" };
    case "o":
      return { type: "OPEN_DOOR" };
    case "c":
      return { type: "CLOSE_DOOR" };
    case "f":
      return { type: "FIRE_ARROW" };
    case "p":
      return { type: "SAVE_GAME" };
    case "r":
      return { type: "LOAD_GAME" };
    default:
      return null;
  }
}
