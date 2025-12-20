import { GameState, LevelSnapshot } from "./GameState";
import { DungeonMap } from "../map/DungeonMap";
import { createFreshLevel } from "../systems/LevelSystem";
import { CONFIG } from "./Config";
import { COLOR } from "./Colors";

export class DungeonManager {
  // The cache of visited levels
  public levels: Record<string, LevelSnapshot> = {};

  constructor(private config: typeof CONFIG) {}

  public saveLevelSnapshot(state: GameState): void {
    this.levels[String(state.currentLevel)] = {
      mapData: state.map.mapData,
      monsters: state.monsters,
      itemsOnMap: state.itemsOnMap,
    };
  }

  public descend(state: GameState, logMessage: (msg: string, color?: string) => void): void {
    this.saveLevelSnapshot(state);

    const nextLevel = state.currentLevel + 1;
    state.currentLevel = nextLevel;

    logMessage(`You descend to Level ${state.currentLevel}!`, COLOR.YELLOW);

    const cached = this.levels[String(nextLevel)];
    if (cached) {
      this.hydrateLevel(state, cached);
    } else {
      const fresh = createFreshLevel({
        width: this.config.WIDTH,
        mapHeight: this.config.MAP_HEIGHT,
        level: nextLevel,
        inventory: state.inventory,
      });
      state.map = fresh.map;
      state.monsters = fresh.monsters;
      state.itemsOnMap = fresh.itemsOnMap;

      // Save the newly created level immediately so it exists in cache
      this.saveLevelSnapshot(state);
    }

    this.placePlayerOnTileOrFloor(state, "STAIRS_UP");
  }

  public ascend(state: GameState, logMessage: (msg: string, color?: string) => void): void {
    if (state.currentLevel <= 1) {
      logMessage("You are already on Level 1.", COLOR.GRAY);
      return;
    }

    this.saveLevelSnapshot(state);

    const prevLevel = state.currentLevel - 1;
    state.currentLevel = prevLevel;

    logMessage(`You ascend to Level ${state.currentLevel}!`, COLOR.YELLOW);

    const cached = this.levels[String(prevLevel)];
    if (!cached) {
      logMessage("No saved data for that level (unexpected).", COLOR.RED);
      return;
    }

    this.hydrateLevel(state, cached);
    this.placePlayerOnTileOrFloor(state, "STAIRS_DOWN");
  }

  private hydrateLevel(state: GameState, snapshot: LevelSnapshot): void {
    state.map = DungeonMap.fromSnapshot(this.config.WIDTH, this.config.MAP_HEIGHT, snapshot.mapData);
    state.monsters = snapshot.monsters;
    state.itemsOnMap = snapshot.itemsOnMap;
  }

  private placePlayerOnTileOrFloor(state: GameState, type: "STAIRS_UP" | "STAIRS_DOWN"): void {
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (state.map.get(x, y)?.type === type) {
          state.player.x = x;
          state.player.y = y;
          return;
        }
      }
    }

    // fallback: find any floor
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (state.map.get(x, y)?.type === "FLOOR") {
          state.player.x = x;
          state.player.y = y;
          return;
        }
      }
    }
  }
}
