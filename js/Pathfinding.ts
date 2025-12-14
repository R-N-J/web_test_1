import { DungeonMap, TileType } from "./DungeonMap";

// Node structure for the A* search
interface AStarNode {
  x: number;
  y: number;
  g: number; // Cost from the start node to the current node
  h: number; // Estimated cost (heuristic) from the current node to the end node
  f: number; // Total cost (g + h)
  parent: AStarNode | null;
}

// Helper function to estimate distance (Manhattan distance heuristic)
function heuristic(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// Core A* pathfinding function
export function findPath(
  map: DungeonMap,
  startX: number, startY: number,
  endX: number, endY: number
): { x: number; y: number }[] | null {

  // 1. Initialization
  const openSet: AStarNode[] = [];
  const closedSet = new Set<string>(); // Use string for fast coordinate lookups "x,y"
  const nodes = new Map<string, AStarNode>();

  const startNode: AStarNode = {
    x: startX, y: startY,
    g: 0, h: heuristic(startX, startY, endX, endY),
    f: heuristic(startX, startY, endX, endY),
    parent: null
  };
  openSet.push(startNode);
  nodes.set(`${startX},${startY}`, startNode);

  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, // Cardinal
    { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 } // Diagonal
  ];

  // 2. Main Loop
  while (openSet.length > 0) {
    // Sort openSet by F score (find node with lowest F score)
    openSet.sort((a, b) => a.f - b.f);
    const currentNode = openSet.shift()!;
    const currentKey = `${currentNode.x},${currentNode.y}`;

    // Check for goal
    if (currentNode.x === endX && currentNode.y === endY) {
      // Reconstruct path
      const path: { x: number; y: number }[] = [];
      let temp: AStarNode | null = currentNode;
      while (temp) {
        path.push({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }
      return path.reverse().slice(1); // Return path excluding the start node
    }

    closedSet.add(currentKey);

    // Explore neighbors
    for (const { dx, dy } of directions) {
      const neighborX = currentNode.x + dx;
      const neighborY = currentNode.y + dy;
      const neighborKey = `${neighborX},${neighborY}`;

      // Skip if out of bounds or already evaluated
      if (closedSet.has(neighborKey)) continue;

      const tile = map.get(neighborX, neighborY);

      // Check for obstacle (Cannot move through walls or closed doors)
      if (!tile || tile.type === 'WALL' || tile.type === 'DOOR_CLOSED') {
        continue;
      }

      // Cost to move to neighbor (1 for cardinal, approx 1.4 for diagonal)
      const moveCost = (dx !== 0 && dy !== 0) ? 1.4 : 1;
      const tentativeGScore = currentNode.g + moveCost;

      let neighborNode = nodes.get(neighborKey);

      if (!neighborNode || tentativeGScore < neighborNode.g) {
        // Found a better path or a new node
        if (!neighborNode) {
          neighborNode = {
            x: neighborX, y: neighborY,
            h: heuristic(neighborX, neighborY, endX, endY),
            parent: currentNode,
            g: tentativeGScore,
            f: 0
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          openSet.push(neighborNode);
          nodes.set(neighborKey, neighborNode);
        } else {
          // Update existing node
          neighborNode.parent = currentNode;
          neighborNode.g = tentativeGScore;
          neighborNode.f = neighborNode.g + neighborNode.h;
        }
      }
    }
  }

  // No path found
  return null;
}
