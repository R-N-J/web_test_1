// main.ts
import { AsciiRenderer } from "./Renderer";
import { InputHandler, Direction } from "./InputHandler";
import { DungeonMap, generateRandomWalk, findStartingFloorTile } from "./DungeonMap";
import { calculateFOV } from "./Visibility";
import { Entity, tryMoveEntity } from "./Entity";
import { Item, Inventory } from "./Item";

// --- CONFIGURATION ---
const WIDTH = 60;
const HEIGHT = 40;
const FOV_RADIUS = 10;

// --- 1. INITIALIZATION ---

// Initialize Renderer (Canvas setup)
const display = new AsciiRenderer({
  width: WIDTH,
  height: HEIGHT,
  tileSize: 20,
  font: "Courier New, monospace" // Or "Fira Code, monospace" if loaded
});

// Initialize and Generate Map
const gameMap = new DungeonMap(WIDTH, HEIGHT);
generateRandomWalk(gameMap, 0.40);

// Game State
let player: Entity;
let monsters: Entity[] = [];
const inventory = new Inventory();
const itemsOnMap: Item[] = [];

// --- 2. MONSTER & PLAYER SETUP UTILITIES ---

function spawnMonsters(map: DungeonMap, count: number): void {
  const floorTiles: { x: number, y: number }[] = [];

  // Find all available floor tiles
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (map.get(x, y)?.type === 'FLOOR') {
        floorTiles.push({ x, y });
      }
    }
  }

  for (let i = 0; i < count; i++) {
    if (floorTiles.length === 0) break;

    // Pick a random floor tile, remove it from the list
    const randomIndex = Math.floor(Math.random() * floorTiles.length);
    const { x, y } = floorTiles.splice(randomIndex, 1)[0];

    // Create a new monster (Orc example)
    monsters.push({
      x: x,
      y: y,
      symbol: "o",
      color: "#f00",
      name: "Orc",
      hp: 5,
      maxHp: 5,
      damage: 3,
    });
  }
}

function spawnItems(map: DungeonMap, count: number): void {
  const floorTiles: { x: number, y: number }[] = [];

  // Find all available floor tiles
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (map.get(x, y)?.type === 'FLOOR') {
        floorTiles.push({ x, y });
      }
    }
  }

  const itemsToSpawn: Omit<Item, 'x' | 'y'>[] = [
    { symbol: "!", color: "#00f", name: "Healing Potion", type: 'healing', effect: 5 },
    { symbol: "/", color: "#999", name: "Short Sword", type: 'weapon', effect: 2 },
  ];

  for (let i = 0; i < count; i++) {
    if (floorTiles.length === 0) break;

    const randomIndex = Math.floor(Math.random() * floorTiles.length);
    const { x, y } = floorTiles.splice(randomIndex, 1)[0];
    const randomItemIndex = Math.floor(Math.random() * itemsToSpawn.length);

    // Create the item on the map
    itemsOnMap.push({
      ...itemsToSpawn[randomItemIndex],
      x: x,
      y: y,
    });
  }
}


// Initialize Player
const startTile = findStartingFloorTile(gameMap);
// eslint-disable-next-line prefer-const
player = {
  x: startTile.x,
  y: startTile.y,
  symbol: "@",
  color: "#0f0",
  name: "Hero",
  hp: 20,
  maxHp: 20,
  damage: 5
};

// Spawn initial monsters
spawnMonsters(gameMap, 5);
// Spawn items alongside monsters
spawnItems(gameMap, 8);


// --- 3. THE GAME LOOP (MONSTER TURN) ---

function monsterTurn(): void {
  monsters.forEach(monster => {
    // 1. Skip if monster is dead
    if (monster.hp <= 0) return;

    const dxToPlayer = player.x - monster.x;
    const dyToPlayer = player.y - monster.y;
    // 2. Check for player proximity (Attack if adjacent)
    const distSq = (monster.x - player.x) ** 2 + (monster.y - player.y) ** 2;

    if (distSq <= 2) {
      // ATTACK
      player.hp -= monster.damage;
      console.log(`${monster.name} attacks Hero for ${monster.damage} damage! Hero HP: ${player.hp}`);

      if (player.hp <= 0) {
        alert("Game Over! You were slain.");
        // In a full game, you'd trigger a proper death scene here
      }

    } else if (gameMap.get(monster.x, monster.y)?.isVisible) {
      // 3. MOVEMENT LOGIC (Tracking Player - If Visible)

      // Calculate the direction signs
      const dx = Math.sign(dxToPlayer);
      const dy = Math.sign(dyToPlayer);

      let moved = false;

      // Prioritize Diagonal Movement (feels more responsive)
      if (dx !== 0 && dy !== 0) {
        moved = tryMoveEntity(monster, gameMap, dx, dy);
      }

      // If diagonal failed or was not needed, try primary axis
      if (!moved && dx !== 0) {
        moved = tryMoveEntity(monster, gameMap, dx, 0);
      }

      // If X move failed, or monster only needed Y, try Y axis
      if (!moved && dy !== 0) {
        tryMoveEntity(monster, gameMap, 0, dy);
      }

    } else {
      // 4. MOVEMENT LOGIC (Random Wander - If Player is NOT Visible)

      // Choose a random cardinal direction
      const randomDirs: Direction[] = [
        { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0, y: 1 }, { x: 0, y: -1 }
      ];
      const randomDir = randomDirs[Math.floor(Math.random() * randomDirs.length)];

      tryMoveEntity(monster, gameMap, randomDir.x, randomDir.y);
    }
  });

  // Clean up the list of monsters (important for performance and rendering)
  monsters = monsters.filter(m => m.hp > 0);

  // Redraw the scene after all monsters have acted
  render();
}

// --- 4. THE RENDER FUNCTION ---

function render() {
  // 1. CALCULATE FOV
  calculateFOV(gameMap, player.x, player.y, FOV_RADIUS);

  display.clear();

  // 2. Draw the entire map based on visibility and exploration
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const tileState = gameMap.get(x, y);

      if (!tileState || (!tileState.isVisible && !tileState.isExplored)) {
        continue;
      }

      let char = ' ';
      let color = 'black';
      let bgColor = 'black';

      // Set base character/color
      if (tileState.type === 'WALL') {
        char = '#';
        color = '#666';
        bgColor = '#222';
      } else if (tileState.type === 'FLOOR') {
        char = '.';
        color = '#888';
        bgColor = 'black';
      }

      // Apply FOV STYLING
      if (tileState.isVisible) {
        // Current Line of Sight: Bright
        if (tileState.type === 'WALL') color = '#ccc';
        if (tileState.type === 'FLOOR') color = 'white';
      } else {
        // Explored but NOT visible: Fog of War (Darkened)
        color = '#333';
        bgColor = '#111';
      }

      display.draw(x, y, char, color, bgColor);
    }
  }

  // 3. Draw ITEMS (If Visible) - Draw before monsters/player
  itemsOnMap.forEach(item => {
    if (gameMap.get(item.x, item.y)?.isVisible) {
      display.draw(item.x, item.y, item.symbol, item.color);
    }
  });


  // 4. Draw MONSTERS (If Visible and Alive)
  monsters.forEach(m => {
    if (m.hp > 0 && gameMap.get(m.x, m.y)?.isVisible) {
      // Draw monster (HP check already done in monsterTurn/filter)
      display.draw(m.x, m.y, m.symbol, m.color);
    }
  });

  // 5. Draw Player (Drawn last, always on top)
  display.draw(player.x, player.y, player.symbol, player.color);

  // 6. Draw UI Status Bar
  display.drawStatusBar(HEIGHT - 1, `HP: ${player.hp}/${player.maxHp} | Inventory: ${inventory.items.length}`, "white", "black");
}


// --- 5. INPUT HANDLING (PLAYER TURN) ---

new InputHandler((delta: Direction) => {
  if (player.hp <= 0) return;

  const newX = player.x + delta.x;
  const newY = player.y + delta.y;

  // 1. Check for Monster at Target Location
  const targetMonster = monsters.find(m => m.x === newX && m.y === newY && m.hp > 0);

  if (targetMonster) {
    // A. COMBAT (Attack)
    targetMonster.hp -= player.damage;
    console.log(`Hero attacks ${targetMonster.name} for ${player.damage} damage!`);

    // Check if monster died
    if (targetMonster.hp <= 0) {
      console.log(`${targetMonster.name} is defeated!`);
    }

    monsterTurn(); // Monster Turn immediately follows player's attack

  } else if (gameMap.get(newX, newY)?.type === 'FLOOR') {
    // B. MOVEMENT
    player.x = newX;
    player.y = newY;

    // --- NEW PICKUP LOGIC ---
    const itemIndex = itemsOnMap.findIndex(item => item.x === player.x && item.y === player.y);
    if (itemIndex > -1) {
      const item = itemsOnMap[itemIndex];
      inventory.addItem(item);
      itemsOnMap.splice(itemIndex, 1); // Remove from map
    }

    monsterTurn(); // Monster Turn immediately follows player's move
  }
  // Hitting a WALL results in no action, which correctly prevents monsterTurn()
});


// --- 6. START THE GAME ---
render();
