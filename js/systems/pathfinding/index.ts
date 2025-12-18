export type { Path, PathfindingAlgorithm, PathfindingOptions } from "./types";
export type { Point } from "../../core/Types";
export { findPathAStar } from "./AStar";

// Default algorithm (so AI can just import `findPath`)
import { findPathAStar } from "./AStar";
import type { DungeonMap } from "../../map/DungeonMap";
import type { Path, PathfindingOptions } from "./types";
import type { Point } from "../../core/Types";

export function findPath(
  map: DungeonMap,
  start: Point,
  goal: Point,
  options?: PathfindingOptions
): Path | null {
  return findPathAStar(map, start, goal, options);
}
