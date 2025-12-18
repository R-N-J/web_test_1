/**
 * A seeded pseudo-random number generator (PRNG)
 *
 * Use this instead of `Math.random()` for any random number generation for reproducibility.
 *
 * @example
 * const rng = new SeededRandom("my seed");
 * rng.nextInt(1, 6); // A classic d6 roll
 */
export class SeededRandom {
  private seed: number;

  /**
   * Initializes the generator with a numeric or string seed.
   * @param seed - A number or string to initialize the generator. Strings are hashed to numbers.
   */
  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? this.hashSeed(seed) : seed;
  }

  /**
   * Generates the next random float in the sequence.
   *
   * Uses the **Mulberry32** algorithm, fast 32-bit PRNG.
   *
   * @returns A float between 0 (inclusive) and 1 (exclusive).
   */
  public next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Generates a random integer within a specific range.
   *
   * @param min - The minimum value (inclusive).
   * @param max - The maximum value (inclusive).
   * @returns A random integer between min and max.
   *
   * @example
   * rng.nextInt(1, 6); // A classic d6 roll
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Selects a random element from an array.
   *
   * @param array - The array to pick from.
   * @returns A random element from the array.
   */
  public pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Hashes a string into a 32-bit signed integer.
   * Uses the DJB2-style shift-add-xor algorithm.
   *
   * @param str - The string to hash.
   * @returns A 32-bit integer representation of the string.
   */
  private hashSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Force to 32-bit signed integer
    }
    return hash;
  }
}
