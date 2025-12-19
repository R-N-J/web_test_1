import type { DungeonMap, TileState } from "../map/DungeonMap";
import type { Entity } from "../entities/Entity";
import type { Item, Inventory, InventoryItem, EquippableSlot } from "../items/Item";
import type { MessageLog } from "./MessageLog";
import type { AsciiRenderer } from "../ui/AsciiRenderer";


export interface Projectile {
  x: number;
  y: number;
  char: string;
  color: string;
}


export interface UiOverlay {
  readonly kind: string;

  render(state: GameState, display: AsciiRenderer): void;

  /**
   * Return true to consume the key (so the game doesn't handle it).
   * The overlay is allowed to mutate state (e.g., close itself).
   */
  onKeyDown(state: GameState, event: KeyboardEvent): boolean;
}

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
  uiStack: UiOverlay[];
  screenShake: { x: number, y: number }; // Pixel offset for juice effects
  autoPickup: boolean; // Toggle for automatic item collection
}

/**
 * Represents a frozen state of a single dungeon level.
 */
export interface LevelSnapshot {
  mapData: TileState[][];
  monsters: Entity[];
  itemsOnMap: Item[];
}

/**
 * The root object for a complete game save file.
 */
export interface SaveData {
  version: number;
  currentLevel: number;
  player: Entity;
  inventory: {
    items: InventoryItem[];
    equipment: Partial<Record<EquippableSlot, InventoryItem>>;
  };
  log: Array<{ text: string, color: string }>;
  levels: Record<string, LevelSnapshot>;
}
