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
}
