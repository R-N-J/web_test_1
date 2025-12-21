/**
 * Represents a point or a displacement in 2D space.
 */
export interface Point {
  x: number; // Horizontal (Column)
  y: number; // Vertical (Row)
}

export type Direction = Point;

/**
 * Standard cardinal directions (North, South, West, East)
 */
export const CARDINAL_DIRECTIONS: Direction[] = [
  { x: 0, y: -1 }, // North
  { x: 0, y: 1 },  // South
  { x: -1, y: 0 }, // West
  { x: 1, y: 0 },  // East
];

/**
 * All 8 directions including diagonals.
 */
export const ALL_DIRECTIONS: Direction[] = [
  ...CARDINAL_DIRECTIONS,
  { x: -1, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 1 },  { x: 1, y: 1 },
];

declare global {

  const __BUILD_NAME__: string;
  const __BUILD_DATE__: string;
  const __VERSION__: string;
}

export {}

