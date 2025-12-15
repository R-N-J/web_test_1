import type { DungeonMap } from "../../map/DungeonMap";

export type Point = { x: number; y: number };
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
