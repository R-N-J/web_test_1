// main.ts
import { AsciiRenderer } from "./Renderer";
import { InputHandler, Direction } from "./InputHandler";
import { DungeonMap, generateRandomWalk, findStartingFloorTile } from "./DungeonMap";
import { calculateFOV } from "./Visibility";
import { Entity, tryMoveEntity } from "./Entity";
import { Item, Inventory } from "./Item";
import { MessageLog } from "./MessageLog";
import { findPath } from "./Pathfinding";

// --- CONFIGURATION ---
const WIDTH = 60;
const HEIGHT = 40;
const FOV_RADIUS = 10;
const playerFOVRadius = FOV_RADIUS;


// Helper function to get all 8 adjacent positions around a point
const getAdjacentPositions = (x: number, y: number) => [
  {x, y: y - 1}, {x, y: y + 1},
  {x: x - 1, y}, {x: x + 1, y},
  {x: x - 1, y: y - 1}, {x: x + 1, y: y - 1},
  {x: x - 1, y: y + 1}, {x: x + 1, y: y + 1}
];


// Message Log Initialization
const log = new MessageLog();

// Reserve rows at the bottom for UI (messages + status bar)
const UI_ROWS = log.DISPLAY_LINES + 1;     // 3 message lines + 1 status line
const MAP_HEIGHT = HEIGHT - UI_ROWS;       // dungeon height on screen

// --- 1. INITIALIZATION ---

// Initialize Renderer (Canvas setup)
const display = new AsciiRenderer({
  width: WIDTH,
  height: HEIGHT,
  tileSize: 20,
  font: "Courier New, monospace" // Or "Fira Code, monospace" if loaded
});

let currentLevel = 1;
let monsters: Entity[] = [];
const inventory = new Inventory(log);
const itemsOnMap: Item[] = [];

// Initialize and Generate Map
const gameMap = new DungeonMap(WIDTH, MAP_HEIGHT);


// Initialize Player (declaration at the top)
let player: Entity;

// --- 6. START THE GAME ---

new InputHandler(handleKeyDown);  //this is now the ONLY keyboard hook
initializeGame(); // Initialize the first level
render();




function playerMoveOrInteract(delta: Direction): boolean {
  if (player.hp <= 0) return false;

  const newX = player.x + delta.x;
  const newY = player.y + delta.y;

  const targetTile = gameMap.get(newX, newY);
  const targetMonster = monsters.find(m => m.x === newX && m.y === newY && m.hp > 0);

  if (targetMonster) {
    targetMonster.hp -= player.damage;
    log.addMessage(`Hero attacks ${targetMonster.name} for ${player.damage} damage!`, "yellow");

    if (targetMonster.hp <= 0) {
      log.addMessage(`${targetMonster.name} is defeated!`, "red");
    }
    return true;
  }

  if (targetTile?.type === 'FLOOR' || targetTile?.type === 'DOOR_OPEN') {
    player.x = newX;
    player.y = newY;

    const itemIndex = itemsOnMap.findIndex(item => item.x === player.x && item.y === player.y);
    if (itemIndex > -1) {
      const item = itemsOnMap[itemIndex];
      inventory.addItem(item);
      itemsOnMap.splice(itemIndex, 1);
    }
    return true;
  }

  if (targetTile?.type === 'STAIRS_DOWN') {
    goDownStairs();
    return true;
  }

  if (targetTile?.type === 'DOOR_CLOSED') {
    log.addMessage("The door is closed. Press 'o' to open it.", "gray");
    render(); // show message immediately, but no turn taken
    return false;
  }

  return false;
}

function tryOpenDoor(): boolean {
  const nearbyTiles = getAdjacentPositions(player.x, player.y);
  for (const { x, y } of nearbyTiles) {
    const tile = gameMap.get(x, y);
    if (tile?.type === 'DOOR_CLOSED') {
      gameMap.set(x, y, { ...tile, type: 'DOOR_OPEN', blocksMovement: false, blocksSight: false });
      log.addMessage("You open the door.");
      return true;
    }
  }
  log.addMessage("No closed door nearby to open.");
  render();
  return false;
}

function tryCloseDoor(): boolean {
  const nearbyTiles = getAdjacentPositions(player.x, player.y);

  for (const { x, y } of nearbyTiles) {
    const tile = gameMap.get(x, y);
    if (tile?.type !== 'DOOR_OPEN') continue;

    const occupiedByPlayer = (player.x === x && player.y === y);
    const occupiedByMonster = monsters.some(m => m.hp > 0 && m.x === x && m.y === y);
    if (occupiedByPlayer || occupiedByMonster) continue;

    gameMap.set(x, y, { ...tile, type: 'DOOR_CLOSED', blocksMovement: true, blocksSight: true });
    log.addMessage("You close the door.");
    return true;
  }

  log.addMessage("There is no open door nearby (or it's blocked).", "gray");
  render();
  return false;
}

function tryEquip(): boolean {
  const equipCandidates = inventory.items.filter(i =>
    i.slot === 'weapon' || i.slot === 'chest' || i.slot === 'legs' ||
    i.slot === 'feet' || i.slot === 'head' || i.slot === 'offhand'
  );

  if (equipCandidates.length === 0) {
    log.addMessage("Nothing to equip.");
    render();
    return false;
  }

  const index = inventory.items.findIndex(i => i === equipCandidates[0]);
  inventory.equipItem(index, player);
  refreshPlayerDerivedStats();
  return true;
}

function tryUseConsumable(): boolean {
  const consumableCandidates = inventory.items.filter(i => i.slot === 'consumable');

  if (consumableCandidates.length === 0) {
    log.addMessage("Nothing to use.");
    render();
    return false;
  }

  const index = inventory.items.findIndex(i => i === consumableCandidates[0]);
  inventory.useConsumable(index, player);
  return true;
}

function handleKeyDown(event: KeyboardEvent): void {
  // Ignore repeats if you want “one press = one turn”
  if (event.repeat) return;

  const moveDelta = InputHandler.getMovementDelta(event);

  let actionTakesTurn = false;

  if (moveDelta) {
    actionTakesTurn = playerMoveOrInteract(moveDelta);
  } else {
    switch (event.key.toLowerCase()) {
      case 'e':
        actionTakesTurn = tryEquip();
        break;
      case 'u':
        actionTakesTurn = tryUseConsumable();
        break;
      case 'o':
        actionTakesTurn = tryOpenDoor();
        break;
      case 'c':
        actionTakesTurn = tryCloseDoor();
        break;
      default:
        return; // ignore unrelated keys
    }
  }

  // prevent browser scrolling etc. for keys we handle
  event.preventDefault();

  if (actionTakesTurn) {
    monsterTurn(); // monsterTurn() ends with render()
  }
}


function getPlayerAttackTotal(): number {
  return player.damageBase + inventory.getAttackBonus();
}

function getPlayerDefenseTotal(): number {
  return player.defenseBase + inventory.getDefenseBonus();
}

function refreshPlayerDerivedStats(): void {
  player.damage = getPlayerAttackTotal();
  player.defense = getPlayerDefenseTotal();
}


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
      defenseBase: 0,  // Base defense
      defense: 0
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

function placeLevelFeatures(map: DungeonMap): void {
  console.log("Placing level features...");
  const floorTiles: { x: number, y: number }[] = [];
  // 1. Find all available floor tiles
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.get(x, y)?.type === 'FLOOR') {
        floorTiles.push({ x, y });
      }
    }
  }

  if (floorTiles.length === 0) return;

  // 2. Place Stairs Down (Place first to ensure it gets a spot)
  const stairsIndex = Math.floor(Math.random() * floorTiles.length);
  const stairsPos = floorTiles.splice(stairsIndex, 1)[0];
  map.set(stairsPos.x, stairsPos.y, {
    type: 'STAIRS_DOWN',
    isVisible: false,
    isExplored: false,
    blocksMovement: false,
    blocksSight: false
  });

  // 3. Place a few Doors (optional: replace a wall with a door)
  const doorCount = 3;
  for (let i = 0; i < doorCount; i++) {
    // Find a random wall tile adjacent to a floor (simple implementation)
    const wallTiles: { x: number, y: number }[] = [];
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        const tile = map.get(x, y);
        if (tile?.type === 'WALL') {
          // Check if adjacent to a floor tile to make it useful
          if (map.get(x + 1, y)?.type === 'FLOOR' || map.get(x - 1, y)?.type === 'FLOOR' ||
            map.get(x, y + 1)?.type === 'FLOOR' || map.get(x, y - 1)?.type === 'FLOOR') {
            wallTiles.push({ x, y });
          }
        }
      }
    }

    if (wallTiles.length > 0) {
      const doorIndex = Math.floor(Math.random() * wallTiles.length);
      const doorPos = wallTiles[doorIndex];
      map.set(doorPos.x, doorPos.y, {
        type: 'DOOR_CLOSED',
        isVisible: false,
        isExplored: false,
        blocksMovement: true,
        blocksSight: true
      });
    }
  }
}


/**
 * Initializes the game state, generates the initial map, and positions the player
 */
function initializeGame() {
  // 1. Set up initial the game state
  currentLevel = 1;  // Reset to level 1 when starting a new game

  // 2. Generate initial map
  generateRandomWalk(gameMap, 0.40);
  placeLevelFeatures(gameMap);

    // 3. Initialize and position player
  const startTile = findStartingFloorTile(gameMap);
  player = {
    x: startTile.x,
    y: startTile.y,
    symbol: '@',
    color: '#0f0',
    name: 'Player',
    hp: 30,
    maxHp: 30,
    damage: 5,
    damageBase: 5,
    defense: 1,
    defenseBase: 1
  };
  refreshPlayerDerivedStats();


  // 4. Initialize entities
  monsters.length = 0; // Clear any existing monsters
  itemsOnMap.length = 0; // Clear any existing items
  spawnMonsters(gameMap, 5);  // Initial number of monsters
  spawnItems(gameMap, 8);     // Initial number of items

  // 5. Initialize game systems
  refreshPlayerDerivedStats();
  calculateFOV(gameMap, player.x, player.y, playerFOVRadius);

  // 6. Initial game message
  log.addMessage("Welcome to the Dungeons!", "#0f0"); // Initial welcome message
  log.addMessage("Find the stairs (>) to descend deeper.", "white");
}

function monsterTurn(): void {
  monsters.forEach(monster => {
    // 1. Skip if monster is dead or player is dead
    if (monster.hp <= 0 || player.hp <= 0) return;

    // Determine distance to player
    const dxToPlayer = player.x - monster.x;
    const dyToPlayer = player.y - monster.y;
    const distSq = dxToPlayer ** 2 + dyToPlayer ** 2;

    // 2. COMBAT LOGIC: Attack if adjacent
    if (distSq <= 2) {
      // ATTACK logic (same as before)
      player.hp -= monster.damage;
      log.addMessage(`${monster.name} attacks Hero for ${monster.damage} damage!`, "red");

      if (player.hp <= 0) {
        alert("Game Over! You were slain.");
        log.addMessage(`You were slain by a ${monster.name}.`, "red");
      }

    } else if (gameMap.get(monster.x, monster.y)?.isVisible) {
      // 3. MOVEMENT LOGIC (Tracking Player - If Visible)

      // --- NEW: A* PATHFINDING ---
      const path = findPath(gameMap, monster.x, monster.y, player.x, player.y);

      if (path && path.length > 0) {
        // Path found: move to the next step in the path
        const nextStep = path[0];

        // Note: We use the simpler tryMoveEntity just to update the monster's position,
        // but the move is guaranteed to be valid by A*.
        tryMoveEntity(monster, gameMap, nextStep.x - monster.x, nextStep.y - monster.y);

      } else {
        // Path blocked or no path exists (e.g., player is behind a closed door)
        log.addMessage(`${monster.name} seems confused.`, "gray");
      }

    } else {
      // 4. MOVEMENT LOGIC (Random Wander - If Player is NOT Visible)

      // Choose a random cardinal direction (same as before)
      const randomDirs: Direction[] = [
        { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0, y: 1 }, { x: 0, y: -1 }
      ];
      const randomDir = randomDirs[Math.floor(Math.random() * randomDirs.length)];

      tryMoveEntity(monster, gameMap, randomDir.x, randomDir.y);
    }
  });

  // Clean up the list of monsters
  monsters = monsters.filter(m => m.hp > 0);

  // Redraw the scene after all monsters have acted
  render();
}

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
      } else if (tileState.type === 'STAIRS_DOWN') { // NEW
        char = '>';
        color = 'yellow';
        bgColor = 'black';
      } else if (tileState.type === 'DOOR_CLOSED') { // NEW
        char = '+';
        color = 'brown';
        bgColor = 'black';
      } else if (tileState.type === 'DOOR_OPEN') { // NEW
        char = '-';  // or | for horizontal
        color = 'brown';
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


  display.drawTextLine(0, statusBarRow, `L${currentLevel} | HP: ${player.hp}/${player.maxHp} | ATK: ${getPlayerAttackTotal()} | DEF: ${getPlayerDefenseTotal()} | INV: ${inventory.items.length}`, "white", "black");

}

function goDownStairs(): void {
  currentLevel++;
  log.addMessage(`You descend to Level ${currentLevel}!`, "yellow");

  // Reset the map and entities

  // 1. Regenerate Map
  generateRandomWalk(gameMap, 0.40);
  placeLevelFeatures(gameMap); // IMPORTANT: put stairs/doors back on the new level


  // 2. Find new start position and move player there
  const startTile = findStartingFloorTile(gameMap);
  player.x = startTile.x;
  player.y = startTile.y;

  // 3. Clear and respawn enemies/items
  monsters = [];
  itemsOnMap.length = 0; // Efficiently clear the array
  spawnMonsters(gameMap, 5 + currentLevel); // Increase difficulty slightly
  spawnItems(gameMap, 8);

  // Recalculate FOV after level transition
  calculateFOV(gameMap, player.x, player.y, playerFOVRadius);

  // Force a full render to show the new map
  render();
}


