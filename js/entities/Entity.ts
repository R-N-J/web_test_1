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

// Define a minimal interface for what tryMove needs to know about the world
interface MoveContext {
  map: { get(x: number, y: number): TileState | undefined };
  monsters: Entity[];
  player: Entity;
}

export function tryMoveEntity(entity: Entity, context: MoveContext, dx: number, dy: number): boolean {
  const newX = entity.x + dx;
  const newY = entity.y + dy;

  // 1. Check map bounds and tile type
  const tile = context.map.get(newX, newY);
  if (!tile || tile.blocksMovement) {
    return false;
  }

  // 2. Check if the player is there (if this entity isn't the player)
  if (entity.id !== context.player.id) {
    if (newX === context.player.x && newY === context.player.y) {
      return false; // Monsters can't walk into the player (they should attack instead)
    }
  }

  // 3. Check if any OTHER living monster is there
  const isOccupied = context.monsters.some(m =>
    m.hp > 0 &&
    m.id !== entity.id &&
    m.x === newX &&
    m.y === newY
  );

  if (isOccupied) {
    return false;
  }

  // Success!
  entity.x = newX;
  entity.y = newY;
  return true;
}
