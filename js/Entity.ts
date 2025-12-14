// Entity.ts
import { TileState } from './DungeonMap';
//import { Direction } from './InputHandler'; // Assuming you kept Direction type

export interface Entity {
  x: number;
  y: number;
  symbol: string;
  color: string;
  name: string;
  hp: number;
  maxHp: number;
  damage: number;       // The total current damage (base + equipment)
  damageBase: number;   // NEW: Base damage without equipment
  defenseBase: number;  // NEW: Base defense
}

// Basic movement logic for a simple Monster AI
interface GameMap {
  get(x: number, y: number): TileState | undefined;
}

export function tryMoveEntity(entity: Entity, map: GameMap, dx: number, dy: number): boolean {
  const newX = entity.x + dx;
  const newY = entity.y + dy;

  // Check bounds and if the tile is a floor
  const tile = map.get(newX, newY);
  if (tile && tile.type === 'FLOOR') {
    entity.x = newX;
    entity.y = newY;
    return true;
  }
  return false;
}
