import type { GameState } from "../../core/GameState";
import { DungeonMap } from "../../map/DungeonMap";
import { Inventory } from "../../items/Item";
import { MessageLog } from "../../core/MessageLog";

type LevelSnapshot = {
  mapData: GameState["map"]["mapData"];
  monsters: GameState["monsters"];
  itemsOnMap: GameState["itemsOnMap"];
};

export type SaveData = {
  version: 1;
  currentLevel: number;
  player: GameState["player"];
  inventory: {
    items: GameState["inventory"]["items"];
    equipment: GameState["inventory"]["equipment"];
  };
  levels: Record<string, LevelSnapshot>; // key = level number as string
};

const STORAGE_KEY = "rogue1.save";

export function buildSaveData(state: GameState, levels: Record<string, LevelSnapshot>): SaveData {
  return {
    version: 1,
    currentLevel: state.currentLevel,
    player: state.player,
    inventory: {
      items: state.inventory.items,
      equipment: state.inventory.equipment,
    },
    levels,
  };
}

export function saveToLocalStorage(save: SaveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function loadFromLocalStorage(): SaveData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as SaveData;
  if (parsed.version !== 1) return null;

  return parsed;
}

export function hydrateLevel(
  width: number,
  height: number,
  snapshot: LevelSnapshot
): { map: DungeonMap; monsters: GameState["monsters"]; itemsOnMap: GameState["itemsOnMap"] } {
  const map = new DungeonMap(width, height);
  map.mapData = snapshot.mapData;
  return { map, monsters: snapshot.monsters, itemsOnMap: snapshot.itemsOnMap };
}

export function hydrateInventory(log: MessageLog, inv: SaveData["inventory"]): Inventory {
  const inventory = new Inventory(log);
  inventory.items = inv.items;
  inventory.equipment = inv.equipment;
  return inventory;
}
