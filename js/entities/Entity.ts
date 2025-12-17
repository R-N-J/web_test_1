// Entity.ts
import { TileState } from '../map/DungeonMap';
//import { Direction } from './InputHandler'; // Assuming you kept Direction type

export interface Entity {
  id: string;
  x: number;
  y: number;
  symbol: string;
  color: string;
  name: string;
  hp: number;
  maxHp: number;
  damage: number;       // The total current damage (base + equipment)
  damageBase: number;   // Base damage without equipment
  defense: number;      // The total current defense (base + equipment)
  defenseBase: number;  // Base defense

  // Death / corpse behavior (optional so existing entities don't break)
  corpseDropChance?: number; // 0..1 (default: 0 for player, 1 for monsters if you set it)
  corpseSymbol?: string;     // default: "%"
  corpseColor?: string;      // default: "#aa8866"
  corpseName?: string;       // default: `${name} corpse`
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
