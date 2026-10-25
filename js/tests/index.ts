import { testAspects } from "./Aspect.test";
import { testWorld } from "./World.test";
import { testEntityManager } from "./EntityManager.test";
import { testRPGScenario } from "./RPG.test";
import { testPrefabManager } from "./Prefabs.test";
import { testTurnManager } from "./TurnManager.test";
import { testSystems } from "./Systems.test";
import { testSceneManager } from "./SceneManager.test";
import { testEventBus } from "./EventBus.test";

/**
 * Main entry point for ECS tests.
 */
export function runAllTests() {
  console.log("=== Starting ECS Test Suite ===");
  try {
    testAspects();
    testWorld();
    testEntityManager();
    testRPGScenario();
    testPrefabManager();
    testTurnManager();
    testSystems();
    testSceneManager();
    testEventBus();
    console.log("=== All Tests Passed Successfully ===");
  } catch (err) {
    console.error("!!! Test Failed !!!");
    console.error(err);
    process.exit(1);
  }
}

// Run tests
runAllTests();
