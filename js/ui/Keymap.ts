import { Action, ActionType } from "../core/Actions";
import { InputHandler } from "./InputHandler";

export function keyEventToAction(event: KeyboardEvent): Action | null {
  const moveDelta = InputHandler.getMovementDelta(event);
  if (moveDelta) return { type: ActionType.MOVE, delta: moveDelta };

  if (event.code === "Numpad5" || event.key === "5") {
    return { type: "WAIT" };
  }

  switch (event.key.toLowerCase()) {
    case "e":
      return { type: ActionType.EQUIP };
    case "u":
      return { type: ActionType.USE_CONSUMABLE };
    case "o":
      return { type: ActionType.OPEN_DOOR };
    case "c":
      return { type: ActionType.CLOSE_DOOR };
    case "f":
      return { type: ActionType.FIRE_ARROW };
    case "p":
      return { type: ActionType.SAVE_GAME };
    case "r":
      return { type: ActionType.LOAD_GAME };
    case "m":
      return { type: ActionType.VIEW_LOG };
    case "i":
      return { type: ActionType.OPEN_INVENTORY };
    case "@":
      return { type: ActionType.TOGGLE_AUTO_PICKUP };
    default:
      return null;
  }
}
