import type { DungeonMap } from "../../map/DungeonMap";
import type { Point } from "../../core/Types";

export type { Point };
export type Path = Point[];

export interface PathfindingOptions {
  allowDiagonal?: boolean;
}

export type PathfindingAlgorithm = (
  map: DungeonMap,
  start: Point,
  goal: Point,
  options?: PathfindingOptions
) => Path | null;
