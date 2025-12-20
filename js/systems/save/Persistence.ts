import type { GameState, SaveData, LevelSnapshot } from "../../core/GameState";

const STORAGE_KEY = "rogue1.save";
const CURRENT_VERSION = 2;

/**
 * Builds a serializable object from the current game state.
 */
export function buildSaveData(state: GameState, levels: Record<string, LevelSnapshot>): SaveData {
  return {
    version: CURRENT_VERSION,
    currentLevel: state.currentLevel,
    player: state.player,
    inventory: {
      items: state.inventory.items,
      equipment: state.inventory.equipment,
    },
    log: state.log.getHistory(),
    levels,
  };
}

/**
 * Persists the save data to browser local storage.
 */
export function saveToLocalStorage(save: SaveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

/**
 * Retrieves and parses save data from local storage.
 * Returns null if no save exists or if the version is incompatible.
 */
export function loadFromLocalStorage(): SaveData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SaveData;
    // Basic version check: we only support the current version.
    if (parsed.version !== CURRENT_VERSION) {
      console.warn(`Incompatible save version: ${parsed.version}. Expected: ${CURRENT_VERSION}`);
      return null;
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse save data:", e);
    return null;
  }
}
