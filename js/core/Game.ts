import type { Action } from "./Actions";
import type { GameState } from "./GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import type { CONFIG } from "./Config";
import { Inventory } from "../items/Item";
import { MessageLog } from "./MessageLog";
import { createFreshLevel } from "../systems/LevelSystem";
import { runMonsterTurn } from "../systems/AISystem/AISystem";
import { renderGame } from "../systems/RenderSystem";
import {
  buildSaveData,
  loadFromLocalStorage,
  saveToLocalStorage
} from "../systems/save";
import { DungeonMap } from "../map/DungeonMap";
import { MessageLogOverlay } from "../ui/overlays/MessageLogOverlay";
import { GameOverOverlay } from "../ui/overlays/GameOverOverlay";
import { InventoryHandler } from "../ui/InventoryHandler";
import { DungeonManager } from "./DungeonManager";
import { PlayerSystem } from "../systems/PlayerSystem";

export class Game {
  public state!: GameState;
  private isAnimating = false;
  private lastSaveTime = 0;
  private readonly SAVE_DEBOUNCE_MS = 1000;
  private inventoryHandler: InventoryHandler;
  private dungeonManager: DungeonManager;

  constructor(
    private display: AsciiRenderer,
    private config: typeof CONFIG
  ) {
    this.inventoryHandler = new InventoryHandler(this);
    this.dungeonManager = new DungeonManager(config);
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
      autoPickup: true,
    };

    this.dungeonManager.saveLevelSnapshot(this.state);
    this.render();
  }

  public async handleAction(action: Action): Promise<void> {
    if (!this.state) return;
    if (this.isAnimating) return;
    if (this.state.player.hp <= 0) return;

    const takesTurn = await this.playerTurn(action);

    if (takesTurn) {
      runMonsterTurn(this.state);
    }

    this.checkGameOver();
    this.render();
  }

  private checkGameOver(): void {
    if (this.state.player.hp <= 0) {
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
        return PlayerSystem.tryMoveOrInteract(this.state, action.delta, {
          onDescend: () => this.dungeonManager.descend(this.state, (m, c) => this.state.log.addMessage(m, c)),
          onAscend: () => this.dungeonManager.ascend(this.state, (m, c) => this.state.log.addMessage(m, c)),
        });
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
      case "OPEN_DOOR":
        return PlayerSystem.tryToggleDoor(this.state, "OPEN");
      case "CLOSE_DOOR":
        return PlayerSystem.tryToggleDoor(this.state, "CLOSE");
      case "FIRE_ARROW": {
        this.isAnimating = true;
        const fired = await PlayerSystem.fireArrow(this.state, () => this.render());
        this.isAnimating = false;
        return fired;
      }
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
    return false;
  }

  private saveGame(): void {
    const now = Date.now();
    if (now - this.lastSaveTime < this.SAVE_DEBOUNCE_MS) {
      return;
    }

    this.dungeonManager.saveLevelSnapshot(this.state);
    const data = buildSaveData(this.state, this.dungeonManager.levels);
    saveToLocalStorage(data);
    this.state.log.addMessage("Game saved.", "green");
    this.lastSaveTime = now;
  }

  private loadGame(): void {
    const loaded = loadFromLocalStorage();
    if (!loaded) {
      this.state.log.addMessage("No save found.", "gray");
      return;
    }

    const log = this.state.log;
    log.setHistory(loaded.log || []);

    const inventory = Inventory.fromSnapshot(log, loaded.inventory);

    // Restore dungeon manager levels
    this.dungeonManager.levels = loaded.levels;

    const current = loaded.levels[String(loaded.currentLevel)];
    if (!current) {
      this.state.log.addMessage("Save is missing current level data.", "red");
      return;
    }

    this.state.currentLevel = loaded.currentLevel;
    this.state.player = loaded.player;
    this.state.inventory = inventory;
    this.state.map = DungeonMap.fromSnapshot(this.config.WIDTH, this.config.MAP_HEIGHT, current.mapData);
    this.state.monsters = current.monsters;
    this.state.itemsOnMap = current.itemsOnMap;

    this.state.log.addMessage("Game loaded.", "green");
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
}
