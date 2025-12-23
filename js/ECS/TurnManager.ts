import { World } from "./World";
import { Scheduler } from "./Scheduler";

export class TurnManager {
  constructor(private world: World, private scheduler: Scheduler) {}

  /**
   * Called when the player performs a move.
   * It 'unlocks' the monster systems, runs them, then 'locks' them again.
   */
  public nextTurn(): void {
    // 1. Process player consequences (Hunger, Poison)
    // 2. Run Monster AI Systems
    // 3. Tick the World
    console.log("Turn processing...");
  }

  /**
   * In a turn-based game, dt is usually just '1' (one turn step).
   */
  public tick(): void {
    this.scheduler.update(1.0);
  }
}
