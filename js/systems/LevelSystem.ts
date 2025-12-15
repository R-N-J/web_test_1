import { DungeonMap, generateRandomWalk, findStartingFloorTile } from "../DungeonMap";
import type { Entity } from "../Entity";
import type { Item, Inventory } from "../Item";

export function createFreshLevel(params: {
  width: number;
  mapHeight: number;
  level: number;
  inventory: Inventory;
}): {
  map: DungeonMap;
  player: Entity;
  monsters: Entity[];
  itemsOnMap: Item[];
} {
  const { width, mapHeight, level, inventory } = params;

  const map = new DungeonMap(width, mapHeight);
  generateRandomWalk(map, 0.40);
  placeLevelFeatures(map);

  const start = findStartingFloorTile(map);

  const player: Entity = {
    x: start.x,
    y: start.y,
    symbol: "@",
    color: "#0f0",
    name: "Player",
    hp: 30,
    maxHp: 30,
    damageBase: 5,
    damage: 5,
    defenseBase: 1,
    defense: 1,
  };

  const monsters = spawnMonsters(map, Math.max(5, 5 + level));
  const itemsOnMap = spawnItems(map, 8);

  // Apply equipment-derived stats on level creation (in case you keep items between floors)
  player.damage = player.damageBase + inventory.getAttackBonus();
  player.defense = player.defenseBase + inventory.getDefenseBonus();

  return { map, player, monsters, itemsOnMap };
}

export function placeLevelFeatures(map: DungeonMap): void {
  const floorTiles: Array<{ x: number; y: number }> = [];

  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.get(x, y)?.type === "FLOOR") floorTiles.push({ x, y });
    }
  }
  if (floorTiles.length === 0) return;

  // Stairs
  const stairsPos = floorTiles.splice(Math.floor(Math.random() * floorTiles.length), 1)[0];
  map.set(stairsPos.x, stairsPos.y, {
    type: "STAIRS_DOWN",
    isVisible: false,
    isExplored: false,
    blocksMovement: false,
    blocksSight: false,
  });

  // Doors
  const doorCount = 3;
  for (let i = 0; i < doorCount; i++) {
    const wallTiles: Array<{ x: number; y: number }> = [];

    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        const tile = map.get(x, y);
        if (tile?.type !== "WALL") continue;

        const adjacentToFloor =
          map.get(x + 1, y)?.type === "FLOOR" ||
          map.get(x - 1, y)?.type === "FLOOR" ||
          map.get(x, y + 1)?.type === "FLOOR" ||
          map.get(x, y - 1)?.type === "FLOOR";

        if (adjacentToFloor) wallTiles.push({ x, y });
      }
    }

    if (wallTiles.length === 0) break;
    const doorPos = wallTiles[Math.floor(Math.random() * wallTiles.length)];

    map.set(doorPos.x, doorPos.y, {
      type: "DOOR_CLOSED",
      isVisible: false,
      isExplored: false,
      blocksMovement: true,
      blocksSight: true,
    });
  }
}

function spawnMonsters(map: DungeonMap, count: number): Entity[] {
  const monsters: Entity[] = [];
  const floorTiles: Array<{ x: number; y: number }> = [];

  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.get(x, y)?.type === "FLOOR") floorTiles.push({ x, y });
    }
  }

  for (let i = 0; i < count && floorTiles.length > 0; i++) {
    const { x, y } = floorTiles.splice(Math.floor(Math.random() * floorTiles.length), 1)[0];
    monsters.push({
      x,
      y,
      symbol: "o",
      color: "#f00",
      name: "Orc",
      hp: 5,
      maxHp: 5,
      damageBase: 3,
      damage: 3,
      defenseBase: 0,
      defense: 0,
    });
  }

  return monsters;
}

function spawnItems(map: DungeonMap, count: number): Item[] {
  const itemsOnMap: Item[] = [];
  const floorTiles: Array<{ x: number; y: number }> = [];

  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.get(x, y)?.type === "FLOOR") floorTiles.push({ x, y });
    }
  }

  const itemsToSpawn: Array<Omit<Item, "x" | "y">> = [
    {
      symbol: "!",
      color: "#00f",
      name: "Healing Potion",
      slot: "consumable",
      attackBonus: 0,
      defenseBonus: 0,
      healAmount: 5,
    },
    {
      symbol: "/",
      color: "#999",
      name: "Short Sword",
      slot: "weapon",
      attackBonus: 2,
      defenseBonus: 0,
      healAmount: 0,
    },
    {
      symbol: "[",
      color: "#f90",
      name: "Leather Vest",
      slot: "chest",
      attackBonus: 0,
      defenseBonus: 1,
      healAmount: 0,
    },
  ];

  for (let i = 0; i < count && floorTiles.length > 0; i++) {
    const { x, y } = floorTiles.splice(Math.floor(Math.random() * floorTiles.length), 1)[0];
    const base = itemsToSpawn[Math.floor(Math.random() * itemsToSpawn.length)];
    itemsOnMap.push({ ...base, x, y });
  }

  return itemsOnMap;
}
