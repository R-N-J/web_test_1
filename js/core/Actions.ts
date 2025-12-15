export type Direction = { x: number; y: number };

export type Action =
  | { type: 'MOVE'; delta: Direction }
  | { type: "WAIT" }
  | { type: 'EQUIP' }
  | { type: 'USE_CONSUMABLE' }
  | { type: 'OPEN_DOOR' }
  | { type: 'CLOSE_DOOR' }
  | { type: "FIRE_ARROW" };
