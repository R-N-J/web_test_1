import { World } from "./World";
import { Scheduler } from "./Scheduler";

// brain of the game loo, phases of a turn (Player -> NPCs -> World).

export class TurnManager {
  private turnCount = 0;
  private _isPlayerTurn = true;

  constructor(private world: World, private scheduler: Scheduler) {}

  public get isPlayerTurn(): boolean {
    return this._isPlayerTurn;
  }

  public get turnNumber(): number {
    return this.turnCount;
  }

  /**
   * Called when the player performs a move.
   */
  public nextTurn(): void {
    if (!this._isPlayerTurn) return; // Prevent double-turns

    this._isPlayerTurn = false;
    this.turnCount++;

    // 1. Run NPC/Monster AI
    // In a real game, you'd trigger specific systems here
    this.tick();

    // 2. Return control to player
    this._isPlayerTurn = true;
  }

  /**
   * Ticks the world systems.
   * In a turn-based game, dt is usually '1'.
   */
  public tick(): void {
    this.scheduler.update(1.0);
  }

  /**
   * Completely pauses the turn cycle (e.g. for a level-up screen).
   */
  public pause(): void {
    this._isPlayerTurn = false;
  }

  public resume(): void {
    this._isPlayerTurn = true;
  }
}
