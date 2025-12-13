import { DungeonMap } from './DungeonMap'; // Need access to the Map class

// Helper function that determines the path between two tiles
export function getLine(x1: number, y1: number, x2: number, y2: number): { x: number; y: number }[] {
// ... complex line algorithm math to return a list of (x, y) coordinates ...
  // For simplicity here, we assume a library like rot.js would handle this,
  // or you implement it separately.
  // We will simulate it with a simple straight line path for the demo:
  const line: { x: number; y: number }[] = [];
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = (x1 < x2) ? 1 : -1;
  const sy = (y1 < y2) ? 1 : -1;
  let err = dx - dy;

  while(true) {
    line.push({x: x1, y: y1});
    if ((x1 === x2) && (y1 === y2)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x1 += sx; }
    if (e2 < dx) { err += dx; y1 += sy; }
  }
  return line;
}

// The core function that uses getLine
export function calculateFOV(map: DungeonMap, px: number, py: number, radius: number): void {
// 1. Reset all tiles to not visible
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      map.mapData[y][x].isVisible = false;
    }
  }

  // 2. Iterate through all tiles within the radius (a bounding box)
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {

      // Check if the tile is within the map boundaries and within the actual circle radius
      const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
      if (distance > radius || x < 0 || x >= map.width || y < 0 || y >= map.height) {
        continue;
      }

      // 3. Trace a ray from the player to the target tile
      const path = getLine(px, py, x, y);

      let isBlocked = false;
      for (let i = 0; i < path.length; i++) {
        const { x: tx, y: ty } = path[i];
        const tile = map.get(tx, ty);

        // Optimization: The player's tile is always visible
        if (tx === px && ty === py) continue;

        // If the ray hits a wall before reaching the target, the target is blocked
        if (tile && tile.type === 'WALL') {
          isBlocked = true;
          // IMPORTANT: If we are one tile away from the wall, the wall tile itself
          // should still be marked as visible, but the ray stops *after* that.
          if (tx === x && ty === y) {
            // The ray stopped on the wall itself, so we can see the wall
            map.mapData[ty][tx].isVisible = true;
            map.mapData[ty][tx].isExplored = true;
          }
          break; // Stop tracing this ray
        }
      }

      // 4. Mark visible and explored
      if (!isBlocked) {
        map.mapData[y][x].isVisible = true;
        map.mapData[y][x].isExplored = true;
      }
    }
  }
}
