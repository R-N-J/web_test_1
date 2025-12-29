import { BaseSystem, PassiveSystem } from "./System";
import { Subscribe, Inject } from "./Decorators";
import { SceneManager } from "./SceneManager";
import { StorageManager } from "./StorageManager";
import { World } from "./World";
import { Scene } from "./Scene"; // Import the Scene interface
import { TurnManager } from "./TurnManager";

/**
 * Standard Framework Service: The Director.
 * Coordinates high-level game flow, winning, losing, and transitions.
 */
export abstract class Director extends PassiveSystem {
  @Inject()
  protected scenes!: SceneManager;

  @Inject()
  protected storage!: StorageManager;

  @Inject()
  protected turns!: TurnManager;

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
    this.turns.pause();
    this.world.scenes?.switchTo(this.getGameOverScene());
  }

  /**
   * Standard logic for when a level is cleared.
   */
  @Subscribe("EXIT_REACHED")
  public onExitReached(): void {
    console.log("[Director] Exit reached. Moving to next floor.");
    this.storage.save("autosave"); // Auto-save on floor transition
    this.world.scenes?.switchTo(this.getNextLevelScene());
  }

  /**
   * Utility for manual scene transitions that ensures
   * the game state is preserved.
   */
  public changeScene(nextScene: Scene, shouldSave = true): void {
    if (shouldSave) this.storage.save("checkpoint");
    this.world.scenes?.switchTo(nextScene);
  }

  // Abstract methods to be implemented by your specific game logic
  protected abstract getGameOverScene(): Scene;
  protected abstract getNextLevelScene(): Scene;
}
