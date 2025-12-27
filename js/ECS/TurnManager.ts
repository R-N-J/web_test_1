import { World } from "./World";
import { Scheduler, SystemConstructor } from "./Scheduler";
import { BaseSystem } from "./System";
import { InternalComponents, Clock } from "./InternalComponents";

// brain of the game loo, phases of a turn (Player -> NPCs -> World).

export class TurnManager {
  private _isPlayerTurn = true;
  private _isPaused = false;

  constructor(private world: World, private scheduler: Scheduler) {
    // Initialize the singleton if it doesn't exist
    if (!this.world.hasSingleton(InternalComponents.CLOCK)) {
      this.world.setSingleton<Clock>(InternalComponents.CLOCK, { turn: 0 });
    }
  }

  public get isPlayerTurn(): boolean {
    return this._isPlayerTurn && !this._isPaused;
  }

  public get turnNumber(): number {
    return this.world.getSingleton<Clock>(InternalComponents.CLOCK)?.turn ?? 0;
  }

  /**
   * Transitions from the Player's turn to the World/Monster turn.
   */
  public nextTurn(): void {
    if (!this._isPlayerTurn || this._isPaused) return;

    this._isPlayerTurn = false;

    // Increment turn count via the non-structural update API
    this.world.updateComponent<Clock>(this.world.getSingletonEntity(), InternalComponents.CLOCK, (clock) => {
      clock.turn++;
      return clock;
    });

    // 1. Logic Phase: Run any one-shot logic per turn
    // (e.g. updating cooldowns or poison ticks via specific systems)

    // 2. Execution Phase: Tick the scheduler
    this.tick();

    // 3. Return control to player
    this._isPlayerTurn = true;
  }

  /**
   * Ticks all enabled world systems.
   * In a turn-based game, dt is usually '1'.
   */
  public tick(dt: number = 1.0): void {
    if (this._isPaused) return;
    this.scheduler.update(dt);
  }

  /**
   * Helper to enable/disable specific system types during turn transitions.
   */
  public setSystemState<T extends BaseSystem>(type: SystemConstructor<T>, enabled: boolean): void {
    this.scheduler.setEnabled(type, enabled);
  }

  /**
   * Stops all game logic (Turn cycle + Ticking).
   * Use for menus, level loading, or game over screens.
   */
  public pause(): void {
    this._isPaused = true;
    this.scheduler.pauseAll(); // Notify all systems
  }

  public resume(): void {
    this._isPaused = false;
    this.scheduler.resumeAll(); // Notify all systems
  }

  /**
   * Resets the turn counter. Useful when starting a new game.
   */
  public reset(): void {
    this.world.setSingleton<Clock>(InternalComponents.CLOCK, {turn: 0});
    this._isPlayerTurn = true;
    this.resume();
  }
}
