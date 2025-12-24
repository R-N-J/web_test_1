/**
 * Defines a filter for Archetypes.
 */
export class Aspect {
  constructor(
    public readonly all: bigint = 0n,
    public readonly one: bigint = 0n,
    public readonly exclude: bigint = 0n
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
   * Checks if an archetype's mask satisfies this aspect.
   */
  public matches(mask: bigint): boolean {
    // 1. Must have ALL of these
    if ((mask & this.all) !== this.all) return false;

    // 2. Must NOT have any of these
    if ((mask & this.exclude) !== 0n) return false;

    // 3. Must have AT LEAST ONE of these (if specified)
    if (this.one !== 0n && (mask & this.one) === 0n) return false;

    return true;
  }


  /**
   * Returns a new Aspect that includes all requirements of this and another aspect.
   * Useful for composing complex queries.
   */
  public and(other: Aspect): Aspect {
    return new Aspect(
      this.all | other.all,
      this.one | other.one,
      this.exclude | other.exclude
    );
  }

  /**
   * Returns a new Aspect that adds additional exclusion requirements.
   */
  public butNot(...ids: number[]): Aspect {
    let newExclude = this.exclude;
    for (const id of ids) newExclude |= (1n << BigInt(id));
    return new Aspect(this.all, this.one, newExclude);
  }

  /**
   * Static getter for an aspect that matches absolutely everything.
   */
  public static get EMPTY(): Aspect {
    return new Aspect();
  }



}
