import { World, WorldSnapshot } from "./World";

export interface SaveMetadata {
  name: string;
  timestamp: number;
  engineVersion: number;
}

/**
 * Standard Service: StorageManager
 * Handles persistence of World snapshots to browser storage.
 */
export class StorageManager {
  private readonly PREFIX = "rogue1_save_";

  constructor(private world: World) {}

  /**
   * Returns true if a save with this name exists.
   */
  public exists(saveName: string): boolean {
    return localStorage.getItem(this.PREFIX + saveName) !== null;
  }

  /**
   * Captures the current world state and saves it to localStorage.
   */
  public save(saveName: string): void {
    try {
      const snapshot = this.world.saveSnapshot();
      const data = JSON.stringify(snapshot);

      // Quota check: localStorage usually has a 5MB limit.
      // A Pro engine warns the dev if the snapshot is getting too large.
      const sizeInMb = (data.length * 2) / (1024 * 1024); // UTF-16 strings use 2 bytes per char
      if (sizeInMb > 4) {
        console.warn(`[StorageManager] Save file '${saveName}' is very large (${sizeInMb.toFixed(2)}MB). LocalStorage might fail.`);
      }

      localStorage.setItem(this.PREFIX + saveName, data);

      const meta: SaveMetadata = {
        name: saveName,
        timestamp: Date.now(),
        engineVersion: snapshot.version
      };
      localStorage.setItem(this.PREFIX + saveName + "_meta", JSON.stringify(meta));

      console.log(`[StorageManager] World saved: ${saveName}`);
    } catch (e) {
      if ((e as Error).name === 'QuotaExceededError') {
        console.error(`[StorageManager] FAILED: Browser storage quota exceeded! Try deleting old saves.`);
      } else {
        console.error(`[StorageManager] Failed to save world: ${saveName}`, e);
      }
    }
  }


  /**
   * Standard Service: Retrieves metadata for a specific save without loading the full data.
   */
  public getMetadata(saveName: string): SaveMetadata | undefined {
    const data = localStorage.getItem(this.PREFIX + saveName + "_meta");
    return data ? JSON.parse(data) as SaveMetadata : undefined;
  }

  /**
   * Standard Service: Wipes ALL game saves from this origin.
   * Use with caution!
   */
  public clearAllSaves(): void {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.PREFIX)) keysToDelete.push(key);
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
    console.log(`[StorageManager] All saves deleted.`);
  }


  /**
   * Loads a snapshot from storage and applies it to the world.
   */
  public load(saveName: string): boolean {
    try {
      const data = localStorage.getItem(this.PREFIX + saveName);
      if (!data) return false;

      const snapshot = JSON.parse(data) as WorldSnapshot;
      this.world.loadSnapshot(snapshot);

      console.log(`[StorageManager] World loaded: ${saveName}`);
      return true;
    } catch (e) {
      console.error(`[StorageManager] Failed to load world: ${saveName}`, e);
      return false;
    }
  }

  /**
   * Returns a list of all available save slots.
   */
  public listSaves(): SaveMetadata[] {
    const saves: SaveMetadata[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.PREFIX) && key.endsWith("_meta")) {
        const meta = JSON.parse(localStorage.getItem(key)!) as SaveMetadata;
        saves.push(meta);
      }
    }
    return saves.sort((a, b) => b.timestamp - a.timestamp);
  }

  public delete(saveName: string): void {
    localStorage.removeItem(this.PREFIX + saveName);
    localStorage.removeItem(this.PREFIX + saveName + "_meta");
  }
}
