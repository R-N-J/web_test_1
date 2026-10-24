import { MAX_COMPONENT_ID, isValidComponentId } from "./Archetype";

/**
 * Defines a filter for Archetypes.
 */
export class Aspect {
  public readonly allMask: bigint;
  public readonly oneMasks: readonly bigint[];
  public readonly excludeMask: bigint;

  constructor(
    allMask: bigint = 0n,
    oneMasks: bigint | readonly bigint[] = [],
    excludeMask: bigint = 0n
  ) {
    this.allMask = allMask;
    this.excludeMask = excludeMask;
    if (typeof oneMasks === "bigint") {
      this.oneMasks = oneMasks === 0n ? [] : [oneMasks];
    } else {
      const unique = Array.from(new Set(oneMasks)).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      );
      this.oneMasks = Object.freeze(unique);
    }
  }

  /**
   * Backward-compatibility accessor for combined oneMask.
   * Returns a bitwise OR union of all disjunctive masks.
   * Note: The combined bitmask cannot represent every composite query's full logical meaning
   * when multiple independent disjunctive clauses are configured.
   */
  public get oneMask(): bigint {
    let combined = 0n;
    for (const mask of this.oneMasks) {
      combined |= mask;
    }
    return combined;
  }

  /**
   * Helper to build a mask from component IDs.
   */
  private static buildMask(ids: number[]): bigint {
    let mask = 0n;
    for (const id of ids) {
      if (!isValidComponentId(id)) {
        throw new Error(`[ECS] Invalid Component ID: ${id}. IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
      mask |= (1n << BigInt(id));
    }
    return mask;
  }

  /**
   * Factory: Matches entities that have ALL of these components.
   * An empty list of IDs imposes no constraint (matches all entities).
   */
  public static all(...ids: number[]): Aspect {
    return new Aspect(this.buildMask(ids), [], 0n);
  }

  /**
   * Factory: Matches entities that have AT LEAST ONE of these components.
   * Note: An empty one() requirement (0 candidate components) is unsatisfiable and matches nothing.
   */
  public static one(...ids: number[]): Aspect {
    return new Aspect(0n, [this.buildMask(ids)], 0n);
  }

  /**
   * Factory: Matches entities that do NOT have any of these components.
   * An empty list of IDs imposes no exclusion (matches all entities).
   */
  public static exclude(...ids: number[]): Aspect {
    return new Aspect(0n, [], this.buildMask(ids));
  }

  /**
   * Fluent: Adds ALL requirement to this aspect.
   */
  public all(...ids: number[]): Aspect {
    return new Aspect(
      this.allMask | Aspect.buildMask(ids),
      this.oneMasks,
      this.excludeMask
    );
  }

  /**
   * Fluent: Adds AT LEAST ONE requirement to this aspect.
   */
  public one(...ids: number[]): Aspect {
    return new Aspect(
      this.allMask,
      [...this.oneMasks, Aspect.buildMask(ids)],
      this.excludeMask
    );
  }

  /**
   * Fluent: Adds EXCLUDE requirement to this aspect.
   */
  public exclude(...ids: number[]): Aspect {
    return new Aspect(
      this.allMask,
      this.oneMasks,
      this.excludeMask | Aspect.buildMask(ids)
    );
  }

  /**
   * Checks if an archetype's mask satisfies this aspect.
   */
  public matches(mask: bigint): boolean {
    // 1. Must have ALL of these
    if ((mask & this.allMask) !== this.allMask) return false;

    // 2. Must NOT have any of these
    if ((mask & this.excludeMask) !== 0n) return false;

    // 3. Must have AT LEAST ONE from EACH specified one group
    for (const oneMask of this.oneMasks) {
      if ((mask & oneMask) === 0n) return false;
    }

    return true;
  }

  /**
   * Returns a new Aspect that includes all requirements of this and another aspect.
   * Useful for composing complex queries.
   */
  public and(other: Aspect): Aspect {
    return new Aspect(
      this.allMask | other.allMask,
      [...this.oneMasks, ...other.oneMasks],
      this.excludeMask | other.excludeMask
    );
  }

  /**
   * Returns a new Aspect that adds additional exclusion requirements.
   */
  public butNot(...ids: number[]): Aspect {
    return new Aspect(
      this.allMask,
      this.oneMasks,
      this.excludeMask | Aspect.buildMask(ids)
    );
  }

  /**
   * Static getter for an aspect that matches absolutely everything.
   */
  public static get EMPTY(): Aspect {
    return new Aspect(0n, [], 0n);
  }
}
