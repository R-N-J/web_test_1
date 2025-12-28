import { World } from "./World";
import { Scheduler } from "./Scheduler";
import { Scene } from "./Scene";

export class SceneManager {
  private currentScene?: Scene;

  constructor(private world: World, private scheduler: Scheduler) {}

  /**
   * Switches to a new scene.
   * Handles the teardown of the old scene and setup of the new one.
   */
  public switchTo(nextScene: Scene): void {
    // 1. Teardown current scene
    if (this.currentScene) {
      console.log(`[ECS] Exiting Scene: ${this.currentScene.name}`);
      this.currentScene.onExit(this.world);
    }

    // 2. Clear the world (preserving only singletons if desired)
    this.world.clear();

    // 3. Setup next scene
    this.currentScene = nextScene;
    console.log(`[ECS] Entering Scene: ${nextScene.name}`);

    // Systems are usually added/enabled inside onEnter
    nextScene.onEnter(this.world);
  }

  public getCurrentSceneName(): string | undefined {
    return this.currentScene?.name;
  }
}
