import { Aspect } from "./Aspect";
import { Archetype, EntityId } from "./Archetype";

export class QueryManager {
  // Cache: Aspect.all + Aspect.one + Aspect.exclude -> List of matching Archetypes
  private queryCache = new Map<string, Archetype[]>();
  private activeAspects = new Map<string, Aspect>();
  private isCacheDirty = false;

  /**
   * Generates a unique stable key for an Aspect.
   */
  private getAspectKey(aspect: Aspect): string {
    return `${aspect.all}:${aspect.one}:${aspect.exclude}`;
  }

  /**
   * Marks the cache as needing a rebuild.
   * Call this when the global list of archetypes changes structurally.
   */
  public invalidateCache(): void {
    this.isCacheDirty = true;
  }

  /**
   * Internal helper: Ensures the cache is valid and returns matching archetypes.
   */
  private getMatchingArchetypes(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): Archetype[] {
    if (this.isCacheDirty) {
      this.queryCache.clear();
      this.isCacheDirty = false;
    }

    const key = this.getAspectKey(aspect);
    let matches = this.queryCache.get(key);

    if (!matches) {
      matches = [];
      for (const arch of allArchetypes) {
        if (aspect.matches(arch.mask)) matches.push(arch);
      }
      this.activeAspects.set(key, aspect);
      this.queryCache.set(key, matches);
    }

    return matches;
  }

  /**
   * Unified API: Returns a stream of all matching Entity IDs.
   * Best for high-performance iteration.
   */
  public *view(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): IterableIterator<EntityId> {
    const matches = this.getMatchingArchetypes(aspect, allArchetypes);
    for (const arch of matches) {
      const entities = arch.entities;
      for (let i = 0; i < entities.length; i++) {
        yield entities[i];
      }
    }
  }

  /**
   * Unified API: Returns an array of all matching Entity IDs.
   * Best when you need to sort or store the results.
   */
  public getEntities(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): EntityId[] {
    const results: EntityId[] = [];
    const matches = this.getMatchingArchetypes(aspect, allArchetypes);
    for (const arch of matches) {
      results.push(...arch.entities);
    }
    return results;
  }

  /**
   * Unified API: Returns the first matching entity found.
   * Pro Tip: Use this for finding the 'Player' or 'Camera' if they aren't singletons.
   */
  public findFirst(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): EntityId | undefined {
    const matches = this.getMatchingArchetypes(aspect, allArchetypes);
    for (const arch of matches) {
      if (arch.entities.length > 0) return arch.entities[0];
    }
    return undefined;
  }

  /**
   * Unified API: Efficiently counts matching entities without building an array.
   */
  public count(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): number {
    let total = 0;
    const matches = this.getMatchingArchetypes(aspect, allArchetypes);
    for (const arch of matches) {
      total += arch.entities.length;
    }
    return total;
  }

  public getArchetypes(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): Archetype[] {
    if (this.isCacheDirty) {
      this.queryCache.clear();
      // We keep activeAspects so we know what queries to rebuild if needed,
      // but clearing queryCache forces a re-scan.
      this.isCacheDirty = false;
    }

    const key = this.getAspectKey(aspect);
    // If we've seen this query before, return the cached list
    if (this.hasQuery(aspect)) {
      return this.queryCache.get(key)!;
    }

    // Otherwise, build the cache for the first time
    const matches: Archetype[] = [];
    for (const arch of allArchetypes) {
      if (aspect.matches(arch.mask)) {
        matches.push(arch);
      }
    }

    this.activeAspects.set(key, aspect);
    this.queryCache.set(key, matches);
    return matches;
  }

  /**
   * Checks if a specific Aspect is already being tracked/cached.
   */
  public hasQuery(aspect: Aspect): boolean {
    return this.queryCache.has(this.getAspectKey(aspect));
  }

  public registerArchetype(arch: Archetype): void {
    for (const [key, aspect] of this.activeAspects) {
      if (aspect.matches(arch.mask)) {
        this.queryCache.get(key)!.push(arch);
      }
    }
  }

  /**
   * Returns the number of unique queries (Aspects) currently cached.
   */
  public getQueryCount(): number {
    return this.queryCache.size;
  }

  public clear(): void {
    this.queryCache.clear();
    this.activeAspects.clear();
  }
}
