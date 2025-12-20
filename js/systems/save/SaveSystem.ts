import { EventBus } from "../../core/EventBus";
import { GameState, LevelSnapshot, SaveData } from "../../core/GameState";
import { MessageLog } from "../../core/MessageLog";
import { Inventory } from "../../items/Item";
import { DungeonMap } from "../../map/DungeonMap";
import { buildSaveData, loadFromLocalStorage, saveToLocalStorage } from "./Persistence";
import { CONFIG } from "../../core/Config";

export class SaveSystem {

  /**
   * Orchestrates the saving process.
   * 1. Converts runtime objects into raw data (SaveData).
   * 2. Persists to LocalStorage.
   */
  static save(state: GameState, levels: Record<string, LevelSnapshot>): void {
    const data = buildSaveData(state, levels);
    saveToLocalStorage(data);
  }

  /**
   * Orchestrates the loading process.
   * 1. Loads raw JSON.
   * 2. Re-instantiates classes (Inventory, Map, Log) with methods.
   * 3. Wires up dependencies.
   */
  static load(config: typeof CONFIG): { state: GameState, levels: Record<string, LevelSnapshot> } | null {
    const loaded: SaveData | null = loadFromLocalStorage();
    if (!loaded) return null;

    // 1. Reconstruct Log (and restore history)
    const log = new MessageLog();
    log.setHistory(loaded.log || []);

    // 2. Reconstruct Inventory
    // Inventory needs the active 'log' instance so it can print messages later.
    const inventory = Inventory.fromSnapshot(log, loaded.inventory);

    // 3. Retrieve Level Data
    const levels = loaded.levels;
    const currentLevelSnapshot = levels[String(loaded.currentLevel)];

    if (!currentLevelSnapshot) {
      console.error(`Save file corrupt: Missing data for level ${loaded.currentLevel}`);
      return null;
    }

    // 4. Reconstruct Map
    const map = DungeonMap.fromSnapshot(
      config.WIDTH,
      config.MAP_HEIGHT,
      currentLevelSnapshot.mapData
    );

    // 5. Assemble the complete GameState
    const state: GameState = {
      width: config.WIDTH,
      height: config.HEIGHT,
      mapHeight: config.MAP_HEIGHT,
      fovRadius: config.FOV_RADIUS,
      currentLevel: loaded.currentLevel,
      map: map,
      player: loaded.player,
      monsters: currentLevelSnapshot.monsters,
      itemsOnMap: currentLevelSnapshot.itemsOnMap,
      inventory: inventory,
      log: log,
      events: undefined as unknown as EventBus, // Injected by Game class during load

      // Initialize transient fields (stuff that isn't saved)
      projectiles: [],
      uiStack: [],
      screenShake: { x: 0, y: 0 },
      autoPickup: true, // Defaults to true since it's not currently in SaveData
    };

    return { state, levels };
  }
}
