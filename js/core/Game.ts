import type { Action } from "./Actions";
import type { Direction } from "./Types";
import type { GameState } from "./GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import type { CONFIG } from "./Config";
import { Inventory,type Item, type InventoryItem } from "../items/Item";
import type { Entity } from "../entities/Entity";
import { MessageLog } from "./MessageLog";
import { createFreshLevel } from "../systems/LevelSystem";
import { runMonsterTurn } from "../systems/AISystem/AISystem";
import { renderGame } from "../systems/RenderSystem";
import { getLine } from "../systems/visibility";
import {
  buildSaveData,
  loadFromLocalStorage,
  saveToLocalStorage
} from "../systems/save";
import { DungeonMap } from "../map/DungeonMap";
import {createId} from "../utils/id";
import { PickListOverlay } from "../ui/overlays/PickListOverlay";
import { MessageLogOverlay } from "../ui/overlays/MessageLogOverlay";
import { GameOverOverlay } from "../ui/overlays/GameOverOverlay";
import { InventoryHandler } from "../ui/InventoryHandler";
import { InventoryOverlay } from "../ui/overlays/InventoryOverlay";
import { getAdjacent8, findNearestValidPlacement } from "../utils/geometry";

export class Game {
  public state!: GameState;
  private isAnimating = false;
  private lastSaveTime = 0;
  private readonly SAVE_DEBOUNCE_MS = 1000; // 1 second debounce. prevent the player from spamming the save function
  private inventoryHandler: InventoryHandler;

  private levels: Record<string, { mapData: GameState["map"]["mapData"]; monsters: GameState["monsters"]; itemsOnMap: GameState["itemsOnMap"] }> = {};

  constructor(
    private display: AsciiRenderer,
    private config: typeof CONFIG
  ) {
    this.inventoryHandler = new InventoryHandler(this);
  }

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
      uiStack: [],
      screenShake: { x: 0, y: 0 },
      autoPickup: true, // Default to ON
    };

    this.saveCurrentLevelSnapshot();
    this.render();
  }

  public async handleAction(action: Action): Promise<void> {
    if (!this.state) return;
    if (this.isAnimating) return; // NEW: lock input while animating
    if (this.state.player.hp <= 0) return; // Don't allow actions if dead

    const takesTurn = await this.playerTurn(action);

    if (takesTurn) {
      runMonsterTurn(this.state);
    }

    this.checkGameOver();
    this.render();
  }

  private checkGameOver(): void {
    if (this.state.player.hp <= 0) {
      // Prevent multiple overlays if we are already dead
      if (!this.state.uiStack.some(o => o.kind === "GAME_OVER")) {
        this.state.log.addMessage("You have died!", "red");
        this.pushUi(new GameOverOverlay());
      }
    }
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
        return this.inventoryHandler.openMain(
          it => it.slot !== "consumable" && it.slot !== "none",
          "Equip Item"
        );
      case "USE_CONSUMABLE":
        return this.inventoryHandler.openMain(
          it => it.slot === "consumable",
          "Use Consumable"
        );
      case "OPEN_INVENTORY":
        return this.inventoryHandler.openMain();
        //    return this.openInventoryMenu();
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
      case "VIEW_LOG":
        this.pushUi(new MessageLogOverlay());
        return false;
      case "TOGGLE_AUTO_PICKUP":
        return this.toggleAutoPickup();
       default:
        return false;
    }
  }

  private toggleAutoPickup(): boolean {
    this.state.autoPickup = !this.state.autoPickup;
    this.state.log.addMessage(
      `Auto-pickup is now ${this.state.autoPickup ? "ON" : "OFF"}.`,
      "orange"
    );
    return false; // Toggling settings does not cost a turn
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
    return getAdjacent8(x, y);
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

      if (s.autoPickup) {
        const itemIndex = s.itemsOnMap.findIndex(it => it.x === nx && it.y === ny);
        if (itemIndex >= 0) {
          const item = s.itemsOnMap[itemIndex];

          // Don't auto-pickup corpses (or any "slot: none" map decoration items).
          if (item.slot !== "none") {
            // Check if pickup was successful before removing from map
            const countBefore = s.inventory.items.length;
            s.inventory.addItem(item);

            if (s.inventory.items.length > countBefore) {
              s.itemsOnMap.splice(itemIndex, 1);
            }
          }
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
    // Opening a menu should NOT take a turn
    const opened = this.openUseConsumableMenu();
    if (opened) this.render();
    return false;
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
      s.map = DungeonMap.fromSnapshot(this.config.WIDTH, this.config.MAP_HEIGHT, cached.mapData);
      s.monsters = cached.monsters;
      s.itemsOnMap = cached.itemsOnMap;
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

    // Use the new class-based hydration
    s.map = DungeonMap.fromSnapshot(this.config.WIDTH, this.config.MAP_HEIGHT, cached.mapData);
    s.monsters = cached.monsters;
    s.itemsOnMap = cached.itemsOnMap;

    // Place player at STAIRS_DOWN when returning upward.
    this.placePlayerOnTileOrFloor("STAIRS_DOWN");
  }
// ... existing code ...

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

    const log = this.state.log;
    log.setHistory(loaded.log || []);

    // Use the new class-based hydration
    const inventory = Inventory.fromSnapshot(log, loaded.inventory);

    this.levels = loaded.levels;
    const current = this.levels[String(loaded.currentLevel)];
    if (!current) {
      this.state.log.addMessage("Save is missing current level data.", "red");
      return;
    }

    // Hydrate level components
    this.state.currentLevel = loaded.currentLevel;
    this.state.player = loaded.player;
    this.state.inventory = inventory;
    this.state.map = DungeonMap.fromSnapshot(this.config.WIDTH, this.config.MAP_HEIGHT, current.mapData);
    this.state.monsters = current.monsters;
    this.state.itemsOnMap = current.itemsOnMap;

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

    // Find a valid spot near the monster that isn't stairs or a wall
    const placement = findNearestValidPlacement(monster.x, monster.y, (x, y) => {
      const tile = s.map.get(x, y);
      if (!tile || tile.type === "WALL") return false;
      // Don't cover stairs
      if (tile.type === "STAIRS_UP" || tile.type === "STAIRS_DOWN") return false;
      return true;
    });

    const corpse: Item = {
      id: createId('corpse'),
      x: placement.x,
      y: placement.y,
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

  private openEquipMenu(): boolean {
    const s = this.state;
    const letters = "abcdefghijklmnopqrstuvwxyz";

    const candidates = s.inventory.items
      .filter((it) => it.slot !== "consumable" && it.slot !== "none")
      .slice(0, 26);

    if (candidates.length === 0) {
      s.log.addMessage("Nothing to equip.", "gray");
      return false;
    }

    const entries = candidates.map((it, i) => {
      const label = letters[i];
      return {
        label,
        text: `${label}) ${it.name} (${it.slot})`,
        value: it.id, // Store ID as the payload
      };
    });

    this.pushUi(
      new PickListOverlay<string>( // Use string ID
        "Equip which item?",
        entries,
        (state, itemId) => {
          state.inventory.equipItem(itemId, state.player);
          state.player.damage = state.player.damageBase + state.inventory.getAttackBonus();
          state.player.defense = state.player.defenseBase + state.inventory.getDefenseBonus();
          this.popUi();
        },
        () => this.popUi()
      )
    );

    return true;
  }

  private openUseConsumableMenu(): boolean {
    const s = this.state;
    const letters = "abcdefghijklmnopqrstuvwxyz";

    const candidates = s.inventory.items
      .filter((it) => it.slot === "consumable")
      .slice(0, 26);

    if (candidates.length === 0) {
      s.log.addMessage("Nothing to use.", "gray");
      return false;
    }

    const entries = candidates.map((it, i) => {
      const label = letters[i];
      const details = it.healAmount > 0 ? ` (heal ${it.healAmount})` : "";
      return {
        label,
        text: `${label}) ${it.name}${details}`,
        value: it.id, // Store ID as the payload
      };
    });

    this.pushUi(
      new PickListOverlay<string>( // Use string ID
        "Use which item?",
        entries,
        (state, itemId) => {
          state.inventory.useConsumable(itemId, state.player);
          this.popUi();
        },
        () => this.popUi()
      )
    );

    return true;
  }

  public handleUiKey(event: KeyboardEvent): boolean {
    const s = this.state;
    const top = s.uiStack[s.uiStack.length - 1];
    if (!top) return false;
    return top.onKeyDown(s, event);
  }

  public pushUi(overlay: import("./GameState").UiOverlay): void {
    this.state.uiStack.push(overlay);
  }

  public popUi(): void {
    this.state.uiStack.pop();
  }

  private openInventoryMenu(): boolean {
    const s = this.state;
    if (s.inventory.items.length === 0) {
      s.log.addMessage("Your inventory is empty.", "gray");
      return false;
    }

    const entries = InventoryOverlay.getEntryList(s);

    this.pushUi(
      new PickListOverlay<InventoryItem>(
        "Inventory",
        entries,
        (state, item) => {
          this.popUi(); // Remove the item list
          this.openItemActionMenu(item); // Open the actions for that item
        },
        () => this.popUi() // Just remove the list on cancel (Escape)
      )
    );
    return false;
  }

  private openItemActionMenu(item: InventoryItem): void {
    const actions = [];
    if (item.slot === "consumable") {
      actions.push({ label: "u", text: "u) Use", value: "USE" });
    } else {
      actions.push({ label: "e", text: "e) Equip", value: "EQUIP" });
    }
    actions.push({ label: "d", text: "d) Drop", value: "DROP" });

    this.pushUi(
      new PickListOverlay<string>(
        `${item.name}`,
        actions,
        (state, action) => {
          this.popUi(); // Remove the action menu
          if (action === "USE") {

            state.inventory.useConsumable(item.id, state.player);
            // Taking an action ends the turn
            void this.handleAction({ type: "WAIT" });
          } else if (action === "EQUIP") {
            state.inventory.equipItem(item.id, state.player);
            state.player.damage = state.player.damageBase + state.inventory.getAttackBonus();
            state.player.defense = state.player.defenseBase + state.inventory.getDefenseBonus();
          } else if (action === "DROP") {
            const dropped = state.inventory.dropItem(item.id);
            if (dropped) {
              state.itemsOnMap.push({
                ...dropped,
                x: state.player.x,
                y: state.player.y
              });
            }
          }
          this.render();
        },
        () => {
          this.popUi(); // Remove the action menu
          this.openInventoryMenu(); // Return to the item list
        }
      )
    );
  }


}

