import type { Action, Direction } from "./Actions";
import type { GameState } from "./GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import type { CONFIG } from "./Config";
import { Inventory } from "../items/Item";
import { MessageLog } from "./MessageLog";
import { createFreshLevel } from "../systems/LevelSystem";
import { runMonsterTurn } from "../systems/AISystem/AISystem";
import { renderGame } from "../systems/RenderSystem";
import { getLine } from "../systems/visibility";

export class Game {
  public state!: GameState;
  private isAnimating = false;

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
    log.addMessage("Press 'f' to fire an arrow (demo).", "gray");

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
    };

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
        return await this.fireArrow(); // NEW
      default:
        return false;
    }
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
      if (monster.hp <= 0) s.log.addMessage(`${monster.name} is defeated!`, "red");
      return true;
    }

    if (tile?.type === "FLOOR" || tile?.type === "DOOR_OPEN") {
      s.player.x = nx;
      s.player.y = ny;

      const itemIndex = s.itemsOnMap.findIndex(it => it.x === nx && it.y === ny);
      if (itemIndex >= 0) {
        const item = s.itemsOnMap[itemIndex];
        s.inventory.addItem(item);
        s.itemsOnMap.splice(itemIndex, 1);
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

    return false;
  }

  private tryEquip(): boolean {
    const s = this.state;

    const candidates = s.inventory.items.filter(i =>
      i.slot === "weapon" || i.slot === "chest" || i.slot === "legs" ||
      i.slot === "feet" || i.slot === "head" || i.slot === "offhand"
    );

    if (candidates.length === 0) {
      s.log.addMessage("Nothing to equip.", "gray");
      return false;
    }

    const index = s.inventory.items.findIndex(i => i === candidates[0]);
    s.inventory.equipItem(index, s.player);

    s.player.damage = s.player.damageBase + s.inventory.getAttackBonus();
    s.player.defense = s.player.defenseBase + s.inventory.getDefenseBonus();

    return true;
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
    s.currentLevel++;

    s.log.addMessage(`You descend to Level ${s.currentLevel}!`, "yellow");

    const fresh = createFreshLevel({
      width: this.config.WIDTH,
      mapHeight: this.config.MAP_HEIGHT,
      level: s.currentLevel,
      inventory: s.inventory,
    });

    s.map = fresh.map;
    s.player.x = fresh.player.x;
    s.player.y = fresh.player.y;
    s.monsters = fresh.monsters;
    s.itemsOnMap = fresh.itemsOnMap;
  }

  private async fireArrow(): Promise<boolean> {
    const s = this.state;

    // Find closest visible monster
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
    target: { x: number; y: number; hp: number }
  ): Promise<void> {
    const s = this.state;
    this.isAnimating = true;

    try {
      for (const step of path) {
        const tile = s.map.get(step.x, step.y);
        if (!tile) break;

        // Arrow stops at blocking tiles (still “hits” that tile visually for one frame)
        s.projectiles = [{ x: step.x, y: step.y, char: "→", color: "white" }];
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
          if (target.hp <= 0) s.log.addMessage("Target is slain!", "red");
          break;
        }
      }
    } finally {
      s.projectiles = [];
      this.isAnimating = false;
      this.render();
    }
  }
}

