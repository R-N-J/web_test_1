import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { SceneManager } from "../ECS/SceneManager";
import { Scene } from "../ECS/Scene";

/**
 * A simple scene for testing.
 */
class TestScene implements Scene {
  public name: string;
  public entered = false;
  public exited = false;

  constructor(name: string) {
    this.name = name;
  }

  public onEnter(_world: World): void {
    this.entered = true;
  }

  public onExit(_world: World): void {
    this.exited = true;
  }
}

/**
 * Test the SceneManager functionality.
 */
export function testSceneManager() {
  console.log("Running SceneManager tests...");

  const world = new World();
  const scheduler = new Scheduler(world);
  const sceneManager = new SceneManager(world, scheduler);

  const scene1 = new TestScene("Level 1");
  const scene2 = new TestScene("Level 2");

  // 1. Test: Initial Switch
  sceneManager.switchTo(scene1);
  assert.strictEqual(sceneManager.getCurrentSceneName(), "Level 1", "Current scene should be Level 1");
  assert.strictEqual(scene1.entered, true, "Scene 1 should have been entered");

  // 2. Test: Switching Scenes
  world.buildEntity().commit(); // Create something to be cleared
  assert.strictEqual(world.getEntityCount(), 1, "World should have 1 entity");

  sceneManager.switchTo(scene2);
  assert.strictEqual(sceneManager.getCurrentSceneName(), "Level 2", "Current scene should be Level 2");
  assert.strictEqual(scene1.exited, true, "Scene 1 should have been exited");
  assert.strictEqual(scene2.entered, true, "Scene 2 should have been entered");
  assert.strictEqual(world.getEntityCount(), 0, "World should have been cleared on scene switch");

  console.log("SceneManager tests completed!");
}

if (require.main === module) {
  testSceneManager();
}
