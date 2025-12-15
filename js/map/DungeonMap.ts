// Define what a Tile is
export type TileType = 'WALL' | 'FLOOR' | 'STAIRS_DOWN' | 'DOOR_CLOSED' | 'DOOR_OPEN';

export interface TileState {
  type: TileType;       // The actual type of the tile
  isVisible: boolean;   // Is it currently lit up (line-of-sight)?
  isExplored: boolean;  // Has the player ever seen it? (Fog of War)
  blocksMovement: boolean;  // Can entities move through this tile?
  blocksSight: boolean;     // Does this tile block line of sight?
}

export class DungeonMap {
  public mapData: TileState[][];

  constructor(public width: number, public height: number) {
    // Initialize the entire map as solid rock (WALL)
    this.mapData = Array(height).fill(null).map(() => Array(width).fill(null).map(() => ({
        type: 'WALL',
        isVisible: false,
        isExplored: false,
        blocksMovement: true,
        blocksSight: true
      }))
    );
  }

  // Helper method to get or set a tile
  public get(x: number, y: number): TileState | undefined {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.mapData[y][x];
    }
    return undefined; // Out of bounds
  }

  public set(x: number, y: number, tile: TileState): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.mapData[y][x] = tile;
    }
  }
}


// Define the Directions a Walker can move
const DIRECTIONS: { x: number; y: number }[] = [
  { x: 0, y: -1 }, // North
  { x: 0, y: 1 },  // South
  { x: -1, y: 0 }, // West
  { x: 1, y: 0 },  // East
];

export function generateRandomWalk(map: DungeonMap, floorPercentage: number = 0.45): void {
  // RESET MAP FIRST (prevents floors accumulating across levels and freezing the while-loop)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
    map.mapData[y][x] = { type: 'WALL', isVisible: false, isExplored: false, blocksMovement: true, blocksSight: true };
    }
  }

  const totalTiles = map.width * map.height;
  const targetFloors = Math.floor(totalTiles * floorPercentage);
  let carvedFloors = 0;

  // Start the walker in the middle of the map
  let walkerX = Math.floor(map.width / 2);
  let walkerY = Math.floor(map.height / 2);

  // Carve the starting position
  map.set(walkerX, walkerY, { 
    type: 'FLOOR', 
    isVisible: false, 
    isExplored: false, 
    blocksMovement: false,
    blocksSight: false
  });
  carvedFloors++;

  while (carvedFloors < targetFloors) {
    // 1. Choose a random direction
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];

    // 2. Calculate the potential new position
    const nextX = walkerX + direction.x;
    const nextY = walkerY + direction.y;

    // 3. Check boundaries (Don't let the walker leave the map or get stuck on the edge)
    // We check map.width - 1 and map.height - 1 to ensure a wall surrounds the floor.
    if (nextX > 1 && nextX < map.width - 2 && nextY > 1 && nextY < map.height - 2) {
      walkerX = nextX;
      walkerY = nextY;

      // 4. Carve the new tile
      if (map.get(walkerX, walkerY)?.type === 'WALL') {
        map.set(walkerX, walkerY, { type: 'FLOOR', isVisible: false, isExplored: false, blocksMovement: false, blocksSight: false });
        carvedFloors++;
      }
    }
    // If we hit a boundary, the walker stays put and tries a new random direction next loop.
  }

  // Optional Step: Add a boundary of walls to ensure the dungeon is closed
  for (let x = 0; x < map.width; x++) {
    map.set(x, 0, { type: 'WALL', isVisible: false, isExplored: false, blocksMovement: true, blocksSight: true });
    map.set(x, map.height - 1, { type: 'WALL', isVisible: false, isExplored: false, blocksMovement: true, blocksSight: true });
  }
  for (let y = 0; y < map.height; y++) {
    map.set(0, y, { type: 'WALL', isVisible: false, isExplored: false, blocksMovement: true, blocksSight: true });
    map.set(map.width - 1, y, { type: 'WALL', isVisible: false, isExplored: false, blocksMovement: true, blocksSight: true });
  }
}

export function findStartingFloorTile(map: DungeonMap): { x: number, y: number } {
  const { width, height } = map;

  // Iterate over the map data, skipping the outer boundary of walls (1 to width/height - 1)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Use the map's getter to check the tile type
      const tile = map.get(x, y);

      // Check if it's a FLOOR tile
      if (tile && tile.type === 'FLOOR') {
        // Found it! Return the coordinates.
        return { x, y };
      }
    }
  }

  // Fallback: If for some reason the map generation failed and there are no floor tiles,
  // return a safe default (like 1, 1). This is unlikely but handles edge cases.
  console.warn("Could not find any starting floor tile. Placing player at (1, 1).");
  return { x: 1, y: 1 };
}
