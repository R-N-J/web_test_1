import { PassiveSystem } from "./System";
import { Subscribe, Inject } from "./Decorators";
import { SceneManager } from "./SceneManager";
import { StorageManager } from "./StorageManager";
import { World } from "./World";
import { Scene } from "./Scene";
import { TurnManager } from "./TurnManager";

/**
 * Standard Framework Service: The Director.
 * Coordinates high-level game flow, winning, losing, and transitions.
 */
export abstract class Director extends PassiveSystem {
  private _scenes?: SceneManager;
  private _storage?: StorageManager;
  private _turns?: TurnManager;

  @Inject()
  protected set scenes(val: SceneManager) {
    this._scenes = val;
  }
  protected get scenes(): SceneManager {
    return this._scenes ?? this.world.scenes!;
  }

  @Inject()
  protected set storage(val: StorageManager) {
    this._storage = val;
  }
  protected get storage(): StorageManager {
    return this._storage ?? this.world.storage;
  }

  @Inject()
  protected set turns(val: TurnManager) {
    this._turns = val;
  }
  protected get turns(): TurnManager {
    return this._turns ?? this.world.turns!;
  }

  constructor(world: World) {
    super(world);
    // Framework hook for subclass setup
    this.onInitialize();
  }

  /** Hook for subclasses to perform initial game setup. */
  protected onInitialize(): void {}

  /**
   * Standard logic for when a player dies.
   */
  @Subscribe("PLAYER_DIED")
  public onPlayerDeath(): void {
    console.log("[Director] Player has died. Transitioning to Game Over.");
    // 1. Perform any 'last rites' (save high score, etc)
    // 2. Switch scene
    (this.turns ?? this.world.turns)?.pause();
    (this.scenes ?? this.world.scenes)?.switchTo(this.getGameOverScene());
  }

  /**
   * Standard logic for when a level is cleared.
   */
  @Subscribe("EXIT_REACHED")
  public onExitReached(): void {
    console.log("[Director] Exit reached. Moving to next floor.");
    (this.storage ?? this.world.storage)?.save("autosave"); // Auto-save on floor transition
    (this.scenes ?? this.world.scenes)?.switchTo(this.getNextLevelScene());
  }

  /**
   * Utility for manual scene transitions that ensures
   * the game state is preserved.
   */
  public changeScene(nextScene: Scene, shouldSave = true): void {
    if (shouldSave) (this.storage ?? this.world.storage)?.save("checkpoint");
    (this.scenes ?? this.world.scenes)?.switchTo(nextScene);
  }

  // Abstract methods to be implemented by your specific game logic
  protected abstract getGameOverScene(): Scene;
  protected abstract getNextLevelScene(): Scene;
}
