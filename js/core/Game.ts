import type { Action, Direction } from "./Actions";
import type { GameState } from "./GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import type { CONFIG } from "./Config";
import { Inventory,type Item } from "../items/Item";
import type { Entity } from "../entities/Entity";
import { MessageLog } from "./MessageLog";
import { createFreshLevel } from "../systems/LevelSystem";
import { runMonsterTurn } from "../systems/AISystem/AISystem";
import { renderGame } from "../systems/RenderSystem";
import { getLine } from "../systems/visibility";
import {
  buildSaveData,
  hydrateInventory,
  hydrateLevel,
  loadFromLocalStorage,
  saveToLocalStorage
} from "../systems/save";
import {createId} from "../utils/id";

export class Game {
  public state!: GameState;
  private isAnimating = false;
  private lastSaveTime = 0;
  private readonly SAVE_DEBOUNCE_MS = 1000; // 1 second debounce

  private levels: Record<string, { mapData: GameState["map"]["mapData"]; monsters: GameState["monsters"]; itemsOnMap: GameState["itemsOnMap"] }> = {};

  constructor(
    private display: AsciiRenderer,
    private config: typeof CONFIG
  ) {}

  public startNewGame(): void {
    const log = new MessageLog();
    const inventory = new Inventory(log);

    const { map, player, monsters, itemsOnMap } = createFreshLevel({
      width: this.config.WIDTH,
      mapHeight: this.config.MAP_HEIGHT,
      level: 1,
      inventory,
    });

    log.addMessage("Welcome to the Dungeons!", "#0f0");
    log.addMessage("Find the stairs (>) to descend deeper.", "white");
    //log.addMessage("Press 'f' to fire an arrow (demo).", "gray");
    log.addMessage("Press 'p' to save, 'r' to load.", "gray");

    this.state = {
      width: this.config.WIDTH,
      height: this.config.HEIGHT,
      mapHeight: this.config.MAP_HEIGHT,
      fovRadius: this.config.FOV_RADIUS,
      currentLevel: 1,
      map,
      player,
      monsters,
      itemsOnMap,
      inventory,
      log,
      projectiles: [],
      ui: { kind: "NONE" },
    };

    this.saveCurrentLevelSnapshot();
    this.render();
  }

  public async handleAction(action: Action): Promise<void> {
    if (!this.state) return;
    if (this.isAnimating) return; // NEW: lock input while animating

    const takesTurn = await this.playerTurn(action);

    if (takesTurn) {
      runMonsterTurn(this.state);
    }

    this.render();
  }

  public render(): void {
    renderGame(this.state, this.display);
  }

  private async playerTurn(action: Action): Promise<boolean> {
    switch (action.type) {
      case "MOVE":
        return this.tryMoveOrInteract(action.delta);
      case "WAIT":
        this.state.log.addMessage("You wait.", "gray");
        return true;
      case "EQUIP":
        return this.tryEquip();
      case "USE_CONSUMABLE":
        return this.tryUseConsumable();
      case "OPEN_DOOR":
        return this.tryToggleDoor("OPEN");
      case "CLOSE_DOOR":
        return this.tryToggleDoor("CLOSE");
      case "FIRE_ARROW":
        return await this.fireArrow();
      case "SAVE_GAME":
        this.saveGame();
        return false;
      case "LOAD_GAME":
        this.loadGame();
        return false;
      default:
        return false;
    }
  }

  private saveCurrentLevelSnapshot(): void {
    const s = this.state;
    this.levels[String(s.currentLevel)] = {
      mapData: s.map.mapData,
      monsters: s.monsters,
      itemsOnMap: s.itemsOnMap,
    };
  }

  private adjacent8(): Array<{ x: number; y: number }> {
    const { x, y } = this.state.player;
    return [
      { x, y: y - 1 }, { x, y: y + 1 },
      { x: x - 1, y }, { x: x + 1, y },
      { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
      { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 },
    ];
  }

  //Return true if the player attacks a monster or moves to a valid tile
  //Return false if the player tries to move to an invalid tile or interact with something that's not handled
  private tryMoveOrInteract(delta: Direction): boolean {
    const s = this.state;
    if (s.player.hp <= 0) return false;

    const nx = s.player.x + delta.x;
    const ny = s.player.y + delta.y;

    const tile = s.map.get(nx, ny);
    const monster = s.monsters.find(m => m.hp > 0 && m.x === nx && m.y === ny);

    if (monster) {
      monster.hp -= s.player.damage;
      s.log.addMessage(`Hero attacks ${monster.name} for ${s.player.damage} damage!`, "yellow");
      if (monster.hp <= 0) {
        s.log.addMessage(`${monster.name} is defeated!`, "red");
        this.dropCorpse(monster);
      }
      return true;
    }

    if (tile?.type === "FLOOR" || tile?.type === "DOOR_OPEN") {
      s.player.x = nx;
      s.player.y = ny;

      const itemIndex = s.itemsOnMap.findIndex(it => it.x === nx && it.y === ny);
      if (itemIndex >= 0) {
        const item = s.itemsOnMap[itemIndex];

        // Don't auto-pickup corpses (or any "slot: none" map decoration items).
        if (item.slot !== "none") {
          s.inventory.addItem(item);
          s.itemsOnMap.splice(itemIndex, 1);
        }
      }
      return true;
    }

    if (tile?.type === "DOOR_CLOSED") {
      s.log.addMessage("The door is closed. Press 'o' to open it.", "gray");
      return false;
    }

    if (tile?.type === "STAIRS_DOWN") {
      this.goDownStairs();
      return true;
    }

    if (tile?.type === "STAIRS_UP") {
      this.goUpStairs();
      return true;
    }

    return false;
  }

  private tryEquip(): boolean {
    // Opening a menu should NOT take a turn
    const opened = this.openEquipMenu();
    if (opened) this.render();
    return false;
  }

  private tryUseConsumable(): boolean {
    const s = this.state;
    const candidates = s.inventory.items.filter(i => i.slot === "consumable");

    if (candidates.length === 0) {
      s.log.addMessage("Nothing to use.", "gray");
      return false;
    }

    const index = s.inventory.items.findIndex(i => i === candidates[0]);
    s.inventory.useConsumable(index, s.player);
    return true;
  }

  private tryToggleDoor(mode: "OPEN" | "CLOSE"): boolean {
    const s = this.state;

    for (const { x, y } of this.adjacent8()) {
      const tile = s.map.get(x, y);
      if (!tile) continue;

      if (mode === "OPEN" && tile.type === "DOOR_CLOSED") {
        s.map.set(x, y, { ...tile, type: "DOOR_OPEN", blocksMovement: false, blocksSight: false });
        s.log.addMessage("You open the door.", "orange");
        return true;
      }

      if (mode === "CLOSE" && tile.type === "DOOR_OPEN") {
        const occupiedByMonster = s.monsters.some(m => m.hp > 0 && m.x === x && m.y === y);
        const occupiedByPlayer = s.player.x === x && s.player.y === y;
        if (occupiedByMonster || occupiedByPlayer) continue;

        s.map.set(x, y, { ...tile, type: "DOOR_CLOSED", blocksMovement: true, blocksSight: true });
        s.log.addMessage("You close the door.", "orange");
        return true;
      }
    }

    s.log.addMessage(
      mode === "OPEN" ? "No closed door nearby to open." : "No open door nearby to close (or it's blocked).",
      "gray"
    );
    return false;
  }

  private goDownStairs(): void {
    const s = this.state;

    this.saveCurrentLevelSnapshot();

    const nextLevel = s.currentLevel + 1;
    s.currentLevel = nextLevel;

    s.log.addMessage(`You descend to Level ${s.currentLevel}!`, "yellow");

    const cached = this.levels[String(nextLevel)];
    if (cached) {
      const hydrated = hydrateLevel(this.config.WIDTH, this.config.MAP_HEIGHT, cached);
      s.map = hydrated.map;
      s.monsters = hydrated.monsters;
      s.itemsOnMap = hydrated.itemsOnMap;
    } else {
      const fresh = createFreshLevel({
        width: this.config.WIDTH,
        mapHeight: this.config.MAP_HEIGHT,
        level: nextLevel,
        inventory: s.inventory,
      });
      s.map = fresh.map;
      s.monsters = fresh.monsters;
      s.itemsOnMap = fresh.itemsOnMap;

      this.saveCurrentLevelSnapshot();
    }

    // Place player at STAIRS_UP on the new level if available, otherwise first floor.
    this.placePlayerOnTileOrFloor("STAIRS_UP");
  }

  private goUpStairs(): void {
    const s = this.state;

    if (s.currentLevel <= 1) {
      s.log.addMessage("You are already on Level 1.", "gray");
      return;
    }

    this.saveCurrentLevelSnapshot();

    const prevLevel = s.currentLevel - 1;
    s.currentLevel = prevLevel;

    s.log.addMessage(`You ascend to Level ${s.currentLevel}!`, "yellow");

    const cached = this.levels[String(prevLevel)];
    if (!cached) {
      s.log.addMessage("No saved data for that level (unexpected).", "red");
      return;
    }

    const hydrated = hydrateLevel(this.config.WIDTH, this.config.MAP_HEIGHT, cached);
    s.map = hydrated.map;
    s.monsters = hydrated.monsters;
    s.itemsOnMap = hydrated.itemsOnMap;

    // Place player at STAIRS_DOWN when returning upward.
    this.placePlayerOnTileOrFloor("STAIRS_DOWN");
  }

  private placePlayerOnTileOrFloor(type: "STAIRS_UP" | "STAIRS_DOWN"): void {
    const s = this.state;

    for (let y = 0; y < s.map.height; y++) {
      for (let x = 0; x < s.map.width; x++) {
        if (s.map.get(x, y)?.type === type) {
          s.player.x = x;
          s.player.y = y;
          return;
        }
      }
    }

    // fallback: find any floor
    for (let y = 0; y < s.map.height; y++) {
      for (let x = 0; x < s.map.width; x++) {
        if (s.map.get(x, y)?.type === "FLOOR") {
          s.player.x = x;
          s.player.y = y;
          return;
        }
      }
    }
  }

  private saveGame(): void {
    const now = Date.now();
    if (now - this.lastSaveTime < this.SAVE_DEBOUNCE_MS) {
      return; // Skip if we've saved recently
    }

    this.saveCurrentLevelSnapshot();
    const data = buildSaveData(this.state, this.levels);
    saveToLocalStorage(data);
    this.state.log.addMessage("Game saved.", "green");
    this.lastSaveTime = now; // Update the last save time
  }

  private loadGame(): void {
    const loaded = loadFromLocalStorage();
    if (!loaded) {
      this.state.log.addMessage("No save found.", "gray");
      return;
    }

    const log = this.state.log; // keep current log instance
    const inventory = hydrateInventory(log, loaded.inventory);

    this.levels = loaded.levels;

    const current = this.levels[String(loaded.currentLevel)];
    if (!current) {
      this.state.log.addMessage("Save is missing current level data.", "red");
      return;
    }

    const hydrated = hydrateLevel(this.config.WIDTH, this.config.MAP_HEIGHT, current);

    this.state.currentLevel = loaded.currentLevel;
    this.state.player = loaded.player;
    this.state.inventory = inventory;
    this.state.map = hydrated.map;
    this.state.monsters = hydrated.monsters;
    this.state.itemsOnMap = hydrated.itemsOnMap;

    this.state.log.addMessage("Game loaded.", "green");
  }

  private async fireArrow(): Promise<boolean> {
    const s = this.state;

    // Find the closest visible monster
    const visibleMonsters = s.monsters.filter(m => m.hp > 0 && s.map.get(m.x, m.y)?.isVisible);
    if (visibleMonsters.length === 0) {
      s.log.addMessage("No visible target to shoot.", "gray");
      return false;
    }

    visibleMonsters.sort((a, b) => {
      const da = (a.x - s.player.x) ** 2 + (a.y - s.player.y) ** 2;
      const db = (b.x - s.player.x) ** 2 + (b.y - s.player.y) ** 2;
      return da - db;
    });

    const target = visibleMonsters[0];

    // Build line path (includes start+end)
    const line = getLine(s.player.x, s.player.y, target.x, target.y);

    // Travel tiles after the player tile
    const path = line.slice(1);

    // Animate; stop early if a wall/closed door blocks flight
    await this.animateArrowPath(path, target);

    return true; // firing costs a turn
  }

  private async animateArrowPath(
    path: Array<{ x: number; y: number }>,
    target: Entity
  ): Promise<void> {
    const s = this.state;
    this.isAnimating = true;

    const arrowCharForDelta = (dx: number, dy: number): string => {
      // Normalize to -1/0/1 (path steps should already be like this, but be safe)
      const ndx = Math.sign(dx);
      const ndy = Math.sign(dy);

      if (ndx === 1 && ndy === 0) return "→";
      if (ndx === -1 && ndy === 0) return "←";
      if (ndx === 0 && ndy === 1) return "↓";
      if (ndx === 0 && ndy === -1) return "↑";

      if (ndx === 1 && ndy === 1) return "↘";
      if (ndx === 1 && ndy === -1) return "↗";
      if (ndx === -1 && ndy === 1) return "↙";
      if (ndx === -1 && ndy === -1) return "↖";

      return "•"; // fallback (shouldn't happen)
    };


    try {
      // Start from the player tile, since `path` begins after the player tile
      let prev = { x: s.player.x, y: s.player.y };

      for (const step of path) {
        const tile = s.map.get(step.x, step.y);
        if (!tile) break;

        const dx = step.x - prev.x;
        const dy = step.y - prev.y;
        const arrowChar = arrowCharForDelta(dx, dy);

        // Arrow stops at blocking tiles (still “hits” that tile visually for one frame)
        s.projectiles = [{ x: step.x, y: step.y, char: arrowChar, color: "white" }];
        this.render();

        // small delay per tile
        await new Promise<void>(resolve => window.setTimeout(resolve, 60));

        if (tile.blocksMovement || tile.blocksSight) {
          // blocked by wall/closed door, etc.
          break;
        }

        // Hit monster if we reached its coords
        if (step.x === target.x && step.y === target.y) {
          target.hp -= 3;
          s.log.addMessage("The arrow hits!", "yellow");
          if (target.hp <= 0) {
            s.log.addMessage("Target is slain!", "red");
            this.dropCorpse(target);
          }
          break;
        }
        prev = step;
      }
    } finally {
      s.projectiles = [];
      this.isAnimating = false;
      this.render();
    }
  }

  private dropCorpse(monster: Entity): void {
    // If not set, default to "no corpse" (useful so the player doesn't drop one)
    const chance = monster.corpseDropChance ?? 0;
    if (chance <= 0) return;
    if (Math.random() > chance) return;

    const s = this.state;

    const corpse: Item = {
      id: createId('corpse'),
      x: monster.x,
      y: monster.y,
      symbol: "%",
      color: "#aa8866",
      name: `${monster.name} corpse`,
      slot: "none",
      attackBonus: 0,
      defenseBonus: 0,
      healAmount: 0,
    };

    s.itemsOnMap.push(corpse);
    s.log.addMessage(`The ${monster.name} drops its corpse.`, "gray");
  }

  public handleUiKey(event: KeyboardEvent): boolean {
    const s = this.state;
    if (s.ui.kind !== "PICKLIST") return false;

    const entries = s.ui.entries;
    if (entries.length === 0) {
      s.ui = { kind: "NONE" };
      return true;
    }

    const key = event.key;

    // Cancel
    if (key === "Escape") {
      s.ui = { kind: "NONE" };
      this.render();
      return true;
    }

    // Up/Down
    if (key === "ArrowUp") {
      s.ui = { ...s.ui, selected: (s.ui.selected - 1 + entries.length) % entries.length };
      this.render();
      return true;
    }
    if (key === "ArrowDown") {
      s.ui = { ...s.ui, selected: (s.ui.selected + 1) % entries.length };
      this.render();
      return true;
    }

    // Letter select a-z
    const lower = key.toLowerCase();
    if (lower.length === 1 && lower >= "a" && lower <= "z") {
      const idx = lower.charCodeAt(0) - "a".charCodeAt(0);
      if (idx >= 0 && idx < entries.length) {
        s.ui = { ...s.ui, selected: idx };
        this.render();
      }
      return true;
    }

    // Confirm
    if (key === "Enter") {
      const chosen = entries[s.ui.selected];
      s.inventory.equipItem(chosen.inventoryIndex, s.player);

      // Recompute derived stats
      s.player.damage = s.player.damageBase + s.inventory.getAttackBonus();
      s.player.defense = s.player.defenseBase + s.inventory.getDefenseBonus();

      s.ui = { kind: "NONE" };
      this.render();
      return true;
    }

    return true; // consume other keys while menu is open
  }

  private openEquipMenu(): boolean {
    const s = this.state;

    // Show only equippable items for equip menu
    const equippable = s.inventory.items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.slot !== "consumable" && it.slot !== "none");

    if (equippable.length === 0) {
      s.log.addMessage("Nothing to equip.", "gray");
      return false;
    }

    const letters = "abcdefghijklmnopqrstuvwxyz";
    const entries = equippable.slice(0, 26).map(({ it, idx }, i) => {
      const label = letters[i];
      const text = `${label}) ${it.name}  (${it.slot})`;
      return { label, text, inventoryIndex: idx };
    });

    s.ui = {
      kind: "PICKLIST",
      title: "Equip which item?",
      selected: 0,
      entries,
    };

    return true;
  }

}

