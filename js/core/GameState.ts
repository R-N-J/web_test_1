import type { DungeonMap } from "../map/DungeonMap";
import type { Entity } from "../entities/Entity";
import type { Item, Inventory } from "../items/Item";
import type { MessageLog } from "./MessageLog";


export interface Projectile {
  x: number;
  y: number;
  char: string;
  color: string;
}

export type UiMode =
  | { kind: "NONE" }
  | {
  kind: "PICKLIST";
  title: string;
  selected: number;
  entries: Array<{ label: string; text: string; inventoryIndex: number }>;
};

export interface GameState {
  width: number;
  height: number;     // screen height (chars)
  mapHeight: number;  // playable map height (chars)
  fovRadius: number;

  currentLevel: number;

  map: DungeonMap;
  player: Entity;
  monsters: Entity[];
  itemsOnMap: Item[];
  inventory: Inventory;
  log: MessageLog;
  projectiles: Projectile[]; // transient render-layer
  ui: UiMode;

}
