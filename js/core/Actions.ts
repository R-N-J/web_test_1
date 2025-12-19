import type { Direction } from "./Types";

export type Action =
  | { type: 'MOVE'; delta: Direction }
  | { type: "WAIT" }
  | { type: 'EQUIP' }
  | { type: 'USE_CONSUMABLE' }
  | { type: 'OPEN_DOOR' }
  | { type: 'CLOSE_DOOR' }
  | { type: "FIRE_ARROW" }
  | { type: "SAVE_GAME" }
  | { type: "LOAD_GAME" }
  | { type: "VIEW_LOG" }
  | { type: "OPEN_INVENTORY" }
  | { type: "TOGGLE_AUTO_PICKUP" };
