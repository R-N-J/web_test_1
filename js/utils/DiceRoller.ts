import { SeededRandom } from "./random";

/**
 * Utility for parsing and evaluating standard tabletop RPG dice notation.
 *
 * Supports the format: `[N]dX[+/-Y]`
 * - `N`: (Optional) Number of dice to roll. Defaults to 1.
 * - `X`: (Required) Number of sides per die.
 * - `Y`: (Optional) Constant modifier added to the total result.
 *
 * @example
 * DiceRoller.roll("d20");      // Rolls one 20-sided die
 * DiceRoller.roll("2d6+4");    // Rolls two 6-sided dice and adds 4
 * DiceRoller.roll("1d100-10"); // Rolls one 100-sided die and subtracts 10
 */
export class DiceRoller {
  /** Maximum number of dice allowed in a single roll to prevent performance issues or overflows. */
  private static readonly MAX_DICE = 100;
  /** Standard polyhedral dice sides supported by this project. */
  private static readonly VALID_SIDES = [4, 6, 8, 10, 12, 20, 100];

  /**
   * Parses a notation string and returns the calculated result.
   *
   * @param notation - A string like "2d6+2". Case-insensitive, spaces are ignored.
   * @param rng - An optional `SeededRandom` instance. If provided, the roll will be deterministic
   *              based on the RNG state. If omitted, `Math.random()` is used.
   * @returns The sum of all dice rolls plus the modifier.
   * @throws {Error} If the notation format is invalid, refers to non-standard dice sides,
   *                 or exceeds the `MAX_DICE` limit.
   */
  public static roll(notation: string, rng?: SeededRandom): number {
    if (!notation) {
      throw new Error("Invalid format: Dice notation cannot be empty");
    }

    // Clean input: lower case and remove spaces
    const cleanNotation = notation.toLowerCase().replace(/\s+/g, "");

    /**
     * Regular Expression Breakdown:
     * ^(\d+)?    - Capture group 1: Optional leading digits (number of dice)
     * d          - Literal 'd' separator
     * (\d+)      - Capture group 2: Required digits (number of sides)
     * ([+-]\d+)? - Capture group 3: Optional sign (+ or -) followed by digits (modifier)
     * $          - End of string
     */
    const match = cleanNotation.match(/^(\d+)?d(\d+)([+-]\d+)?$/);

    if (!match) {
      throw new Error(`Invalid dice notation format: ${notation}`);
    }

    const numDice = match[1] ? parseInt(match[1], 10) : 1;
    const diceSides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    // Validation
    if (numDice <= 0) throw new Error(`Number of dice must be positive: ${numDice}`);
    if (numDice > this.MAX_DICE) throw new Error(`Too many dice (max ${this.MAX_DICE}): ${numDice}`);
    if (diceSides <= 0) throw new Error(`Number of sides must be positive: ${diceSides}`);

    if (!this.VALID_SIDES.includes(diceSides)) {
      throw new Error(`Invalid dice sides: ${diceSides}. Standard sides are ${this.VALID_SIDES.join(", ")}`);
    }

    // Roll logic
    let total = 0;
    for (let i = 0; i < numDice; i++) {
      total += this.getRandomInt(1, diceSides, rng);
    }

    return total + modifier;
  }

  /**
   * Internal helper to retrieve a random integer.
   * Encapsulates the choice between the seeded generator and the native Math API.
   *
   * @param min - Lower bound (inclusive).
   * @param max - Upper bound (inclusive).
   * @param rng - Optional PRNG instance.
   * @returns A random integer within the range.
   */
  private static getRandomInt(min: number, max: number, rng?: SeededRandom): number {
    if (rng) {
      return rng.nextInt(min, max);
    }
    // Standard Math.random fallback
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
