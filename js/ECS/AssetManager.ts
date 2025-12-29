/**
 * Standard Service: AssetManager
 * Handles asynchronous loading and caching of JSON data and Audio.
 */
export class AssetManager {
  private cache = new Map<string, unknown>();
  private pending = new Set<string>();
  private errorCount = 0;

  /**
   * Checks if an asset exists in the cache.
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }


  /**
   * Loads a JSON file and stores it in the cache.
   */
  public async loadJson<T>(key: string, url: string): Promise<T> {
    this.pending.add(key);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json() as T;
      this.cache.set(key, data);
      return data;
    } catch (e) {
      console.error(`[AssetManager] Failed to load JSON: ${url}`, e);
      this.errorCount++;
      throw e;
    } finally {
      this.pending.delete(key);
    }
  }

  /**
   * Standard Service: Loads an Audio file.
   * Useful even if not used immediately, as it completes the framework manifest.
   */
  public async loadAudio(key: string, url: string): Promise<HTMLAudioElement> {
    this.pending.add(key);
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = url;
      audio.oncanplaythrough = () => {
        this.cache.set(key, audio);
        this.pending.delete(key);
        resolve(audio);
      };
      audio.onerror = (e) => {
        console.error(`[AssetManager] Failed to load Audio: ${url}`, e);
        this.errorCount++;
        this.pending.delete(key);
        reject(e);
      };
    });
  }


  /**
   * Retrieves a typed asset from the cache.
   */
  public get<T>(key: string): T {
    const asset = this.cache.get(key);
    if (!asset) {
      throw new Error(`[AssetManager] Asset not found in cache: ${key}`);
    }
    return asset as T;
  }

  /**
   * Returns true if all requested assets have finished loading.
   */
  public get isReady(): boolean {
    return this.pending.size === 0;
  }

  public get progress(): number {
    const total = this.cache.size + this.pending.size;
    return total === 0 ? 1 : this.cache.size / total;
  }

  /**
   * Clears the cache. Useful for major game state resets.
   */
  public clear(): void {
    this.cache.clear();
    this.pending.clear();
    this.errorCount = 0;
  }
}
