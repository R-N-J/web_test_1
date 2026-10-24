import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { TurnManager } from "../ECS/TurnManager";
import { BaseSystem } from "../ECS/System";
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
  assert.strictEqual(turnManager.isPaused, false, "Should not be paused initially");
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
  assert.strictEqual(turnManager.isPaused, true, "isPaused should be true when paused");
  assert.strictEqual(turnManager.isPlayerTurn, false, "isPlayerTurn should be false when paused");

  turnManager.nextTurn(); // Should do nothing when paused
  assert.strictEqual(turnManager.turnNumber, 1, "Turn number should NOT increase when paused");

  turnManager.resume();
  assert.strictEqual(turnManager.isPaused, false, "isPaused should be false after resume");
  assert.strictEqual(turnManager.isPlayerTurn, true, "Should be player turn after resume");

  // 4. Test: Reset
  turnManager.nextTurn(); // turn 2
  turnManager.reset();
  assert.strictEqual(turnManager.turnNumber, 0, "Turn number should be reset to 0");
  assert.strictEqual(turnManager.isPlayerTurn, true, "Should be player turn after reset");

  // 5. Test: setSystemState
  class ToggleableTurnSystem extends BaseSystem {
    public updates = 0;
    public override update(): void {
      this.updates++;
    }
  }

  const toggleSys = new ToggleableTurnSystem(world);
  scheduler.add(toggleSys);

  turnManager.nextTurn();
  assert.strictEqual(toggleSys.updates, 1, "ToggleableTurnSystem updated on turn 1");

  turnManager.setSystemState(ToggleableTurnSystem, false);
  turnManager.nextTurn();
  assert.strictEqual(toggleSys.updates, 1, "ToggleableTurnSystem skipped when disabled");

  turnManager.setSystemState(ToggleableTurnSystem, true);
  turnManager.nextTurn();
  assert.strictEqual(toggleSys.updates, 2, "ToggleableTurnSystem resumed when re-enabled");

  scheduler.remove(toggleSys);

  // 6. Test: Exception safety during turn execution (SYS-008, SYS-010)
  class BrokenTurnSystem extends BaseSystem {
    public override update(): void {
      throw new Error("Turn tick crash");
    }
  }

  const brokenSys = new BrokenTurnSystem(world);
  scheduler.add(brokenSys);

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

  scheduler.remove(brokenSys);

  console.log("TurnManager tests completed!");
}

if (require.main === module) {
  testTurnManager();
}
