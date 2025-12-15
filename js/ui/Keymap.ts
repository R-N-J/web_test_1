import type { Action } from "../core/Actions";
import { InputHandler } from "./InputHandler";

export function keyEventToAction(event: KeyboardEvent): Action | null {
  const moveDelta = InputHandler.getMovementDelta(event);
  if (moveDelta) return { type: "MOVE", delta: moveDelta };

  switch (event.key.toLowerCase()) {
    case "e":
      return { type: "EQUIP" };
    case "u":
      return { type: "USE_CONSUMABLE" };
    case "o":
      return { type: "OPEN_DOOR" };
    case "c":
      return { type: "CLOSE_DOOR" };
    default:
      return null;
  }
}
