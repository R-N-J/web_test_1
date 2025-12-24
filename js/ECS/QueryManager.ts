import { Aspect } from "./Aspect";
import { Archetype } from "./Archetype";

export class QueryManager {
  // Cache: Aspect.all + Aspect.one + Aspect.exclude -> List of matching Archetypes
  private queryCache = new Map<string, Archetype[]>();
  private activeAspects = new Map<string, Aspect>();


  /**
   * Generates a unique stable key for an Aspect.
   */
  private getAspectKey(aspect: Aspect): string {
    return `${aspect.all}:${aspect.one}:${aspect.exclude}`;
  }

  public getArchetypes(aspect: Aspect, allArchetypes: IterableIterator<Archetype>): Archetype[] {
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
