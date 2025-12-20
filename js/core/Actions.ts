import type { Direction } from "./Types";

export const ActionType = {
  MOVE: 'MOVE',
  WAIT: 'WAIT',
  EQUIP: 'EQUIP',
  USE_CONSUMABLE: 'USE_CONSUMABLE',
  DROP: 'DROP',
  OPEN_DOOR: 'OPEN_DOOR',
  CLOSE_DOOR: 'CLOSE_DOOR',
  FIRE_ARROW: 'FIRE_ARROW',
  SAVE_GAME: 'SAVE_GAME',
  LOAD_GAME: 'LOAD_GAME',
  VIEW_LOG: 'VIEW_LOG',
  OPEN_INVENTORY: 'OPEN_INVENTORY',
  TOGGLE_AUTO_PICKUP: 'TOGGLE_AUTO_PICKUP',
} as const;

export type Action =
  | { type: typeof ActionType.MOVE; delta: Direction }
  | { type: typeof ActionType.WAIT }
  | { type: typeof ActionType.EQUIP }
  | { type: typeof ActionType.USE_CONSUMABLE }
  | { type: typeof ActionType.DROP }
  | { type: typeof ActionType.OPEN_DOOR }
  | { type: typeof ActionType.CLOSE_DOOR }
  | { type: typeof ActionType.FIRE_ARROW }
  | { type: typeof ActionType.SAVE_GAME }
  | { type: typeof ActionType.LOAD_GAME }
  | { type: typeof ActionType.VIEW_LOG }
  | { type: typeof ActionType.OPEN_INVENTORY }
  | { type: typeof ActionType.TOGGLE_AUTO_PICKUP };
