/**
 * Returns an array of positions that are adjacent to the given position, including diagonals.
 * @param x The x-coordinate of the center position
 * @param y The y-coordinate of the center position
 * @returns Array of {x, y} positions
 *
 * could be replaced with return ALL_DIRECTIONS.map(dir => ({ x: x + dir.x, y: y + dir.y }));
 */
export function getAdjacent8(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x, y: y - 1 }, { x, y: y + 1 },             // N, S
    { x: x - 1, y }, { x: x + 1, y },             // W, E
    { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 }, // NW, NE
    { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 }  // SW, SE
  ];
}

/**
 * Returns an array of cardinal positions (North, South, West, East) adjacent to the given position.
 * @param x The x-coordinate of the center position
 * @param y The y-coordinate of the center position
 * @returns Array of {x, y} positions
 */
export function getAdjacent4(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x, y: y - 1 }, { x, y: y + 1 }, // N, S
    { x: x - 1, y }, { x: x + 1, y }  // W, E
  ];
}
