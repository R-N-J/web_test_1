/**
 * Defines a filter for Archetypes.
 */
export class Aspect {
  constructor(
    public readonly allMask: bigint = 0n,
    public readonly oneMask: bigint = 0n,
    public readonly excludeMask: bigint = 0n
  ) {}

  /**
   * Helper to build a mask from component IDs.
   */
  private static buildMask(ids: number[]): bigint {
    let mask = 0n;
    for (const id of ids) mask |= (1n << BigInt(id));
    return mask;
  }

  /**
   * Factory: Matches entities that have ALL of these components.
   */
  public static all(...ids: number[]): Aspect {
    return new Aspect(this.buildMask(ids), 0n, 0n);
  }

  /**
   * Factory: Matches entities that have AT LEAST ONE of these components.
   */
  public static one(...ids: number[]): Aspect {
    return new Aspect(0n, this.buildMask(ids), 0n);
  }

  /**
   * Factory: Matches entities that do NOT have any of these components.
   */
  public static exclude(...ids: number[]): Aspect {
    return new Aspect(0n, 0n, this.buildMask(ids));
  }

  /**
   * Fluent: Adds ALL requirement to this aspect.
   */
  public all(...ids: number[]): Aspect {
    return new Aspect(this.allMask | Aspect.buildMask(ids), this.oneMask, this.excludeMask);
  }

  /**
   * Fluent: Adds AT LEAST ONE requirement to this aspect.
   */
  public one(...ids: number[]): Aspect {
    return new Aspect(this.allMask, this.oneMask | Aspect.buildMask(ids), this.excludeMask);
  }

  /**
   * Fluent: Adds EXCLUDE requirement to this aspect.
   */
  public exclude(...ids: number[]): Aspect {
    return new Aspect(this.allMask, this.oneMask, this.excludeMask | Aspect.buildMask(ids));
  }

  /**
   * Checks if an archetype's mask satisfies this aspect.
   */
  public matches(mask: bigint): boolean {
    // 1. Must have ALL of these
    if ((mask & this.allMask) !== this.allMask) return false;

    // 2. Must NOT have any of these
    if ((mask & this.excludeMask) !== 0n) return false;

    // 3. Must have AT LEAST ONE of these (if specified)
    if (this.oneMask !== 0n && (mask & this.oneMask) === 0n) return false;

    return true;
  }


  /**
   * Returns a new Aspect that includes all requirements of this and another aspect.
   * Useful for composing complex queries.
   */
  public and(other: Aspect): Aspect {
    return new Aspect(
      this.allMask | other.allMask,
      this.oneMask | other.oneMask,
      this.excludeMask | other.excludeMask
    );
  }

  /**
   * Returns a new Aspect that adds additional exclusion requirements.
   */
  public butNot(...ids: number[]): Aspect {
    return new Aspect(this.allMask, this.oneMask, this.excludeMask | Aspect.buildMask(ids));
  }

  /**
   * Static getter for an aspect that matches absolutely everything.
   */
  public static get EMPTY(): Aspect {
    return new Aspect();
  }



}
