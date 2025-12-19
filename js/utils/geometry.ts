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

/**
 * Finds the nearest valid floor tile that isn't a restricted type (like stairs).
 * Useful for dropping corpses or spawning items so they don't overlap important features.
 */
export function findNearestValidPlacement(
  startX: number,
  startY: number,
  isTileValid: (x: number, y: number) => boolean
): { x: number, y: number } {
  // If the current tile is valid, stay here.
  if (isTileValid(startX, startY)) return { x: startX, y: startY };

  // Check 8-way neighbors
  const neighbors = getAdjacent8(startX, startY);
  for (const n of neighbors) {
    if (isTileValid(n.x, n.y)) return n;
  }

  // Fallback to original position if no neighbor is found (unlikely in a dungeon)
  return { x: startX, y: startY };
}
