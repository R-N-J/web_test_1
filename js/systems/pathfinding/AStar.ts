import type { DungeonMap } from "../../map/DungeonMap";
import type { Path, PathfindingAlgorithm } from "./types";

// Node structure for the A* search
interface AStarNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

function heuristic(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export const findPathAStar: PathfindingAlgorithm = (map, start, goal, options) => {
  const allowDiagonal = options?.allowDiagonal ?? true;

  const openSet: AStarNode[] = [];
  const closedSet = new Set<string>();
  const nodes = new Map<string, AStarNode>();

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start.x, start.y, goal.x, goal.y),
    f: heuristic(start.x, start.y, goal.x, goal.y),
    parent: null,
  };

  openSet.push(startNode);
  nodes.set(`${start.x},${start.y}`, startNode);

  const directions = allowDiagonal
    ? [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
    ]
    : [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const currentNode = openSet.shift()!;
    const currentKey = `${currentNode.x},${currentNode.y}`;

    if (currentNode.x === goal.x && currentNode.y === goal.y) {
      const path: Path = [];
      let temp: AStarNode | null = currentNode;

      while (temp) {
        path.push({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }

      return path.reverse().slice(1);
    }

    closedSet.add(currentKey);

    for (const { dx, dy } of directions) {
      const neighborX = currentNode.x + dx;
      const neighborY = currentNode.y + dy;
      const neighborKey = `${neighborX},${neighborY}`;

      if (closedSet.has(neighborKey)) continue;

      const tile = map.get(neighborX, neighborY);

      // obstacle check (use your tile rules)
      if (!tile || tile.type === "WALL" || tile.type === "DOOR_CLOSED") {
        continue;
      }

      const moveCost = dx !== 0 && dy !== 0 ? 1.4 : 1;
      const tentativeG = currentNode.g + moveCost;

      let neighborNode = nodes.get(neighborKey);

      if (!neighborNode || tentativeG < neighborNode.g) {
        if (!neighborNode) {
          neighborNode = {
            x: neighborX,
            y: neighborY,
            h: heuristic(neighborX, neighborY, goal.x, goal.y),
            parent: currentNode,
            g: tentativeG,
            f: 0,
          };
          neighborNode.f = neighborNode.g + neighborNode.h;

          openSet.push(neighborNode);
          nodes.set(neighborKey, neighborNode);
        } else {
          neighborNode.parent = currentNode;
          neighborNode.g = tentativeG;
          neighborNode.f = neighborNode.g + neighborNode.h;
        }
      }
    }
  }

  return null;
};
