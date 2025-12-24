import { World } from "./World";
import { Scheduler } from "./Scheduler";
import { BaseSystem } from "./System";

// brain of the game loo, phases of a turn (Player -> NPCs -> World).

export class TurnManager {
  private turnCount = 0;
  private _isPlayerTurn = true;
  private _isPaused = false;

  constructor(private world: World, private scheduler: Scheduler) {}

  public get isPlayerTurn(): boolean {
    return this._isPlayerTurn;
  }

  public get turnNumber(): number {
    return this.turnCount;
  }

  /**
   * Transitions from the Player's turn to the World/Monster turn.
   */
  public nextTurn(): void {
    if (!this._isPlayerTurn || this._isPaused) return;

    this._isPlayerTurn = false;
    this.turnCount++;

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
  public setSystemState<T extends BaseSystem>(type: { new (...args: any[]): T }, enabled: boolean): void {
    this.scheduler.setEnabled(type as any, enabled);
  }

  /**
   * Stops all game logic (Turn cycle + Ticking).
   * Use for menus, level loading, or game over screens.
   */
  public pause(): void {
    this._isPaused = true;
  }

  public resume(): void {
    this._isPaused = false;
  }

  /**
   * Resets the turn counter. Useful when starting a new game.
   */
  public reset(): void {
    this.turnCount = 0;
    this._isPlayerTurn = true;
    this._isPaused = false;
  }

}
