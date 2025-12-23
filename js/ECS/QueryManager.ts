import { Aspect } from "./Aspect";
import { Archetype } from "./Archetype";

export class QueryManager {
  // Cache: Aspect.all + Aspect.one + Aspect.exclude -> List of matching Archetypes
  private queryCache = new Map<string, Archetype[]>();
  private activeAspects = new Map<string, Aspect>();

  public getArchetypes(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): Archetype[] {
    const key = `${aspect.all}-${aspect.one}-${aspect.exclude}`;

    // If we've seen this query before, return the cached list
    if (this.queryCache.has(key)) {
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
