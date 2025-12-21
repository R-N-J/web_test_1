import type { Action } from "./Actions";
import type { GameState, UiOverlay } from "./GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import type { CONFIG } from "./Config";
import { Inventory } from "../items/Item";
import { MessageLog } from "./MessageLog";
import { createFreshLevel } from "../systems/LevelSystem";
import { runMonsterTurn } from "../systems/AISystem/AISystem";
import { renderGame } from "../systems/RenderSystem";
import { SaveSystem } from "../systems/save";
import { MessageLogOverlay } from "../ui/overlays/MessageLogOverlay";
import { GameOverOverlay } from "../ui/overlays/GameOverOverlay";
import { InventoryHandler } from "../ui/InventoryHandler";
import { DungeonManager } from "./DungeonManager";
import { PlayerSystem } from "../systems/PlayerSystem";
import { EventBus } from "./EventBus";
import { UI_COLORS, ENTITY_COLORS } from "./Colors";


export class Game {
  public state!: GameState;
  public readonly events: EventBus;
  private isAnimating = false;
  private lastSaveTime = 0;
  private readonly SAVE_DEBOUNCE_MS = 1000;
  private inventoryHandler: InventoryHandler;
  private dungeonManager: DungeonManager;

  constructor(
    private display: AsciiRenderer,
    private config: typeof CONFIG
  ) {
    this.events = new EventBus();
    this.inventoryHandler = new InventoryHandler(this);
    this.dungeonManager = new DungeonManager(config);
    this.setupEventSubscriptions();
  }

  private setupEventSubscriptions(): void {
    this.events.subscribe('MESSAGE_LOGGED', (ev) => {
      this.state?.log.addMessage(ev.text, ev.color);
    });

    this.events.subscribe('SCREEN_SHAKE', (ev) => {
      if (this.state) {
        this.state.screenShake = {
          x: (Math.random() - 0.5) * ev.intensity,
          y: (Math.random() - 0.5) * ev.intensity
        };
      }
    });
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

    inventory.setEventBus(this.events);

    console.log(`${__BUILD_NAME__} Version: ${__VERSION__} (Built: ${__BUILD_DATE__})`);

    this.events.publish({ type: 'MESSAGE_LOGGED', text: "Welcome to the Dungeons!", color: ENTITY_COLORS.ITEM_UNCOMMON });
    this.events.publish({ type: 'MESSAGE_LOGGED', text: "Find the stairs (>) to descend deeper.", color: UI_COLORS.DEFAULT_TEXT });
    this.events.publish({ type: 'MESSAGE_LOGGED', text: "Press 'p' to save, 'r' to load.", color: UI_COLORS.MUTED_TEXT });

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
      events: this.events,
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
        this.events.publish({ type: 'MESSAGE_LOGGED', text: "You have died!", color: UI_COLORS.ERROR });
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
          onDescend: () => this.dungeonManager.descend(this.state, (m, c) => this.events.publish({ type: 'MESSAGE_LOGGED', text: m, color: c ?? UI_COLORS.DEFAULT_TEXT })),
          onAscend: () => this.dungeonManager.ascend(this.state, (m, c) => this.events.publish({ type: 'MESSAGE_LOGGED', text: m, color: c ?? UI_COLORS.DEFAULT_TEXT })),
        });
      case "WAIT":
        this.events.publish({ type: 'MESSAGE_LOGGED', text: "You wait.", color: UI_COLORS.MUTED_TEXT });
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
    this.events.publish({
      type: 'MESSAGE_LOGGED',
      text: `Auto-pickup is now ${this.state.autoPickup ? "ON" : "OFF"}.`,
      color: UI_COLORS.WARNING
    });
    return false;
  }


  private saveGame(): void {
    const now = Date.now();
    if (now - this.lastSaveTime < this.SAVE_DEBOUNCE_MS) {
      return;
    }

    this.dungeonManager.saveLevelSnapshot(this.state);
    SaveSystem.save(this.state, this.dungeonManager.levels);

    this.events.publish({ type: 'MESSAGE_LOGGED', text: "Game saved.", color: ENTITY_COLORS.ITEM_UNCOMMON });
    this.lastSaveTime = now;
  }

  private loadGame(): void {
    const result = SaveSystem.load(this.config);
    if (!result) {
      this.events.publish({ type: 'MESSAGE_LOGGED', text: "No save found.", color: UI_COLORS.MUTED_TEXT });
      return;
    }

    this.state = result.state;
    this.dungeonManager.levels = result.levels;

    // Restore transient state
    this.state.events = this.events;
    this.state.inventory.setEventBus(this.events);

    this.events.publish({ type: 'MESSAGE_LOGGED', text: "Game loaded.", color: ENTITY_COLORS.ITEM_UNCOMMON });
    this.render();
  }


  public handleUiKey(event: KeyboardEvent): boolean {
    const s = this.state;
    const top = s.uiStack[s.uiStack.length - 1];
    if (!top) return false;
    return top.onKeyDown(s, event);
  }

  public pushUi(overlay: UiOverlay): void {
    this.state.uiStack.push(overlay);
  }

  public popUi(): void {
    this.state.uiStack.pop();
  }
}
