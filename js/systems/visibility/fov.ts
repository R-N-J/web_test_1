import type { DungeonMap } from "../../map/DungeonMap";
import { getLine } from "./line";

/**
 * Field of View (FOV):
 * - Resets all tiles to not visible
 * - Marks tiles in radius visible if line-of-sight is not blocked
 * - Marks seen tiles as explored
 *
 * Uses `tile.blocksSight` instead of hard-coding WALL checks, so doors can block sight too.
 */
export function calculateFOV(map: DungeonMap, px: number, py: number, radius: number): void {
  // 1) Reset all tiles
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      map.mapData[y][x].isVisible = false;
    }
  }

  // 2) Iterate within bounding square around player
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      // bounds + radius circle check
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;

      const dx = x - px;
      const dy = y - py;
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue;

      // player tile always visible
      if (x === px && y === py) {
        const t = map.get(x, y);
        if (t) {
          t.isVisible = true;
          t.isExplored = true;
        }
        continue;
      }

      // 3) Trace ray
      const path = getLine(px, py, x, y);

      for (let i = 1; i < path.length; i++) {
        const { x: tx, y: ty } = path[i];
        const tile = map.get(tx, ty);
        if (!tile) break;

        // The ray reaches this tile, so it is visible
        tile.isVisible = true;
        tile.isExplored = true;

        // If this tile blocks sight, stop the ray here (but keep this tile visible)
        if (tile.blocksSight) break;
      }
    }
  }
}
