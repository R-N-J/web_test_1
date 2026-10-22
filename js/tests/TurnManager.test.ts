import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { TurnManager } from "../ECS/TurnManager";
import { InternalComponents, Clock } from "../ECS/InternalComponents";

/**
 * Test the TurnManager functionality.
 */
export function testTurnManager() {
  console.log("Running TurnManager tests...");

  const world = new World();
  const scheduler = new Scheduler(world);
  const turnManager = new TurnManager(world, scheduler);

  // 1. Test: Initial State
  console.assert(turnManager.isPlayerTurn === true, "Should start with player turn");
  console.assert(turnManager.turnNumber === 0, "Should start with turn 0");

  // 2. Test: Turn Transition
  turnManager.nextTurn();
  // In the current implementation, nextTurn immediately sets _isPlayerTurn = false, increments turn, ticks, then sets _isPlayerTurn = true.
  console.assert(turnManager.turnNumber === 1, "Turn number should be 1 after nextTurn");
  console.assert(turnManager.isPlayerTurn === true, "Should be player turn again after nextTurn completes");

  const clock = world.getSingleton<Clock>(InternalComponents.CLOCK);
  console.assert(clock?.turn === 1, "Clock singleton should be updated");

  // 3. Test: Pause/Resume
  turnManager.pause();
  console.assert(turnManager.isPlayerTurn === false, "isPlayerTurn should be false when paused");

  turnManager.nextTurn(); // Should do nothing when paused
  console.assert(turnManager.turnNumber === 1, "Turn number should NOT increase when paused");

  turnManager.resume();
  console.assert(turnManager.isPlayerTurn === true, "Should be player turn after resume");

  // 4. Test: Reset
  turnManager.nextTurn(); // turn 2
  turnManager.reset();
  console.assert(turnManager.turnNumber === 0, "Turn number should be reset to 0");
  console.assert(turnManager.isPlayerTurn === true, "Should be player turn after reset");

  console.log("TurnManager tests completed!");
}

if (require.main === module) {
  testTurnManager();
}
