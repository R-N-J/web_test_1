export type { Point, Path, PathfindingAlgorithm, PathfindingOptions } from "./types";
export { findPathAStar } from "./AStar";

// Default algorithm (so AI can just import `findPath`)
import { findPathAStar } from "./AStar";
import type { DungeonMap } from "../../map/DungeonMap";
import type { Path, PathfindingOptions, Point } from "./types";

export function findPath(
  map: DungeonMap,
  start: Point,
  goal: Point,
  options?: PathfindingOptions
): Path | null {
  return findPathAStar(map, start, goal, options);
}
