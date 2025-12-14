// main.ts
import { AsciiRenderer } from "./Renderer";
import { InputHandler, Direction } from "./InputHandler";
import { DungeonMap, generateRandomWalk, findStartingFloorTile } from "./DungeonMap";
import { calculateFOV } from "./Visibility";
import { Entity, tryMoveEntity } from "./Entity";
import { Item, Inventory } from "./Item";
import { MessageLog } from "./MessageLog";

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



// Message Log Initialization
const log = new MessageLog();
log.addMessage("Welcome to the Dungeons!", "#0f0"); // Initial welcome message


// Reserve rows at the bottom for UI (messages + status bar)
const UI_ROWS = log.DISPLAY_LINES + 1;     // 3 message lines + 1 status line
const MAP_HEIGHT = HEIGHT - UI_ROWS;       // dungeon height on screen


// Initialize and Generate Map
const gameMap = new DungeonMap(WIDTH, MAP_HEIGHT);
generateRandomWalk(gameMap, 0.40);

// Game State

// Initialize Player
const startTile = findStartingFloorTile(gameMap);
const player: Entity = {
  x: startTile.x,
  y: startTile.y,
  symbol: '@',
  color: '#0f0',
  name: 'Player',
  hp: 30,
  maxHp: 30,
  damage: 5,
  damageBase: 5,
  defenseBase: 1
};

let monsters: Entity[] = [];
const inventory = new Inventory(log);
const itemsOnMap: Item[] = [];

function getPlayerAttackTotal(): number {
  return player.damageBase + inventory.getAttackBonus();
}

function getPlayerDefenseTotal(): number {
  return player.defenseBase + inventory.getDefenseBonus();
}

function refreshPlayerDerivedStats(): void {
  player.damage = getPlayerAttackTotal();
}





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
      damageBase: 3,  // Base damage without equipment
      defenseBase: 0  // Base defense
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
    {
      symbol: "!", color: "#00f", name: "Healing Potion", slot: 'consumable',
      attackBonus: 0, defenseBonus: 0, healAmount: 5
    },
    {
      symbol: "/", color: "#999", name: "Short Sword", slot: 'weapon',
      attackBonus: 2, defenseBonus: 0, healAmount: 0
    },
    {
      symbol: "[", color: "#f90", name: "Leather Vest", slot: 'chest',
      attackBonus: 0, defenseBonus: 1, healAmount: 0
    },
    // Add more item types here
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

// Add listener for interaction keys (e for Equip, u for Use)
window.addEventListener("keydown", (event) => {
  let actionTaken = false;

  switch (event.key.toLowerCase()) {
    case 'e': { // Equip
      // For simplicity, finds and equips the first available weapon/armor in inventory
      const equipCandidates = inventory.items.filter(i => i.slot === 'weapon' || i.slot === 'chest' || i.slot === 'legs' || i.slot === 'feet' || i.slot === 'head' || i.slot === 'offhand');
      if (equipCandidates.length > 0) {
        const index = inventory.items.findIndex(i => i === equipCandidates[0]);
        inventory.equipItem(index, player);
        // After equipping, update the player's total damage stat
        refreshPlayerDerivedStats();
        actionTaken = true;
      } else {
        console.log("Nothing to equip.");
      }
      break;
    }

    case 'u': { // Use (Consumable)
      // For simplicity, finds and uses the first consumable item in inventory
      const consumableCandidates = inventory.items.filter(i => i.slot === 'consumable');
      if (consumableCandidates.length > 0) {
        const index = inventory.items.findIndex(i => i === consumableCandidates[0]);
        inventory.useConsumable(index, player);
        actionTaken = true;
      } else {
        console.log("Nothing to use.");
      }
      break;
    }
  }

  if (actionTaken) {
    // Any item interaction counts as a player turn
    monsterTurn();
    event.preventDefault(); // Stop browser scrolling
  }
});



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
      // ATTACK (apply player defense)
      const defense = getPlayerDefenseTotal();
      const damageTaken = Math.max(0, monster.damage - defense);
      const prevHp = player.hp;

      player.hp = Math.max(0, player.hp - damageTaken);

      console.log(
        `${monster.name} attacks ${player.name} for ${damageTaken} damage (ATK ${monster.damage}, DEF ${defense}). ` +
        `${player.name} HP: ${prevHp} -> ${player.hp}`
      );

      log.addMessage(
        `${monster.name} attacks ${player.name} for ${damageTaken} damage (DEF ${defense}). ` +
        `${player.name} HP: ${player.hp}/${player.maxHp}`,
        "red"
      );

      if (player.hp <= 0) {
        alert("Game Over! You were slain.");
        log.addMessage(`You were slain by a ${monster.name}.`, "red");
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

      // If the tile has NEVER been explored, skip drawing it entirely.
      if (!tileState || !tileState.isExplored) {
        continue; // Leaves the tile black (default clear color)
      }

      let char = ' ';
      let color = 'black';
      let bgColor = 'black';

      // Determine the base character (Wall or Floor)
      if (tileState.type === 'WALL') {
        char = '#';
        // Base colors for walls/floor (used when visible)
        color = '#666';
        bgColor = '#222';
      } else if (tileState.type === 'FLOOR') {
        char = '.';
        color = '#888';
        bgColor = 'black';
      }

      // --- APPLY FOV AND MEMORY STYLING ---
      if (tileState.isVisible) {
        // STATE 2: CURRENTLY VISIBLE (Bright and Normal Color)
        // Brighten colors for emphasis
        if (tileState.type === 'WALL') color = '#ccc';
        if (tileState.type === 'FLOOR') color = 'white';

      } else {
        // STATE 3: EXPLORED MEMORY (Darkened Fog of War)
        // Keep the character but apply a severe dimming effect.
        color = '#333'; // Dark gray for floor/wall symbols
        bgColor = '#111'; // Very dark background
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
    // 1. Skip if monster is dead
    if (m.hp <= 0) return;
    // Monsters should only be drawn when currently visible
    if (m.hp > 0 && gameMap.get(m.x, m.y)?.isVisible) {
      // Draw monster (HP check already done in monsterTurn/filter)
      display.draw(m.x, m.y, m.symbol, m.color);
    }
  });

  // 5. Draw Player (Drawn last, always on top)
  display.draw(player.x, player.y, player.symbol, player.color);

  // --- NEW: DRAW MESSAGE LOG ---
  const messages = log.getDisplayMessages();
  const statusBarRow = HEIGHT - 1;
  const logStartRow = statusBarRow - log.DISPLAY_LINES;

  messages.forEach((msg, index) => {
    display.drawTextLine(0, logStartRow + index, msg.text, msg.color, "black");
  });

  // 6. Draw UI Status Bar
  //display.drawStatusBar(HEIGHT - 1, `HP: ${player.hp}/${player.maxHp} | ATK: ${getPlayerAttackTotal()} | DEF: ${getPlayerDefenseTotal()} | Inventory: ${inventory.items.length}`,
  //  "white",
  //  "black");


  display.drawTextLine(0, statusBarRow, `HP: ${player.hp}/${player.maxHp} | ATK: ${getPlayerAttackTotal()} | DEF: ${getPlayerDefenseTotal()} | INV: ${inventory.items.length}`, "white", "black");

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
    log.addMessage(`Hero attacks ${targetMonster.name} for ${player.damage} damage!`, "yellow");

    // Check if monster died
    if (targetMonster.hp <= 0) {
      console.log(`${targetMonster.name} is defeated!`);
      log.addMessage(`${targetMonster.name} is defeated!`, "red");
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
refreshPlayerDerivedStats();
render();
