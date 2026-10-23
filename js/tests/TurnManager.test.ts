import assert from "node:assert/strict";
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
  assert.strictEqual(turnManager.isPlayerTurn, true, "Should start with player turn");
  assert.strictEqual(turnManager.turnNumber, 0, "Should start with turn 0");

  // 2. Test: Turn Transition
  turnManager.nextTurn();
  // In the current implementation, nextTurn immediately sets _isPlayerTurn = false, increments turn, ticks, then sets _isPlayerTurn = true.
  assert.strictEqual(turnManager.turnNumber, 1, "Turn number should be 1 after nextTurn");
  assert.strictEqual(turnManager.isPlayerTurn, true, "Should be player turn again after nextTurn completes");

  const clock = world.getSingleton<Clock>(InternalComponents.CLOCK);
  assert.strictEqual(clock?.turn, 1, "Clock singleton should be updated");

  // 3. Test: Pause/Resume
  turnManager.pause();
  assert.strictEqual(turnManager.isPlayerTurn, false, "isPlayerTurn should be false when paused");

  turnManager.nextTurn(); // Should do nothing when paused
  assert.strictEqual(turnManager.turnNumber, 1, "Turn number should NOT increase when paused");

  turnManager.resume();
  assert.strictEqual(turnManager.isPlayerTurn, true, "Should be player turn after resume");

  // 4. Test: Reset
  turnManager.nextTurn(); // turn 2
  turnManager.reset();
  assert.strictEqual(turnManager.turnNumber, 0, "Turn number should be reset to 0");
  assert.strictEqual(turnManager.isPlayerTurn, true, "Should be player turn after reset");

  // 5. Test: Exception safety during turn execution (SYS-008, SYS-010)
  class BrokenTurnSystem {
    public enabled = true;
    public runUpdate(): void {
      throw new Error("Turn tick crash");
    }
    public cleanup(): void {}
    public toggle(): void {}
  }

  // @ts-expect-error - mock system
  scheduler.add(new BrokenTurnSystem());

  assert.throws(
    () => {
      turnManager.nextTurn();
    },
    {
      name: "Error",
      message: "Turn tick crash"
    },
    "turnManager.nextTurn() should propagate system exceptions"
  );

  assert.strictEqual(turnManager.isPlayerTurn, true, "isPlayerTurn must be restored to true even if turn execution throws");
  assert.strictEqual(world.isDeferred, false, "world.isDeferred must be restored to false after turn error");

  console.log("TurnManager tests completed!");
}

if (require.main === module) {
  testTurnManager();
}
