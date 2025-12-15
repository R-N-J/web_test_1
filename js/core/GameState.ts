import type { DungeonMap } from "../map/DungeonMap";
import type { Entity } from "../entities/Entity";
import type { Item, Inventory } from "../items/Item";
import type { MessageLog } from "./MessageLog";

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
}
