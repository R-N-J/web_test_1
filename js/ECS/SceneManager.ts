import { World } from "./World";
import { Scheduler } from "./Scheduler";
import { Scene } from "./Scene";

export class SceneManager {
  private currentScene?: Scene;
  private registeredScenes = new Map<string, Scene>();

  constructor(private world: World, private scheduler: Scheduler) {}

  /**
   * Registers a scene definition by name for later retrieval or switching.
   */
  public register(scene: Scene): void {
    this.validateScene(scene);
    this.registeredScenes.set(scene.name, scene);
  }

  /**
   * Registers multiple scenes.
   */
  public registerAll(scenes: Scene[]): void {
    if (!Array.isArray(scenes)) {
      throw new Error("[SceneManager] Expected an array of scenes to registerAll.");
    }
    for (const scene of scenes) {
      this.register(scene);
    }
  }

  /**
   * Unregisters a scene by name.
   */
  public unregister(name: string): boolean {
    return this.registeredScenes.delete(name);
  }

  /**
   * Checks if a scene name is registered.
   */
  public has(name: string): boolean {
    return this.registeredScenes.has(name);
  }

  /**
   * Retrieves a registered scene by name.
   */
  public get(name: string): Scene | undefined {
    return this.registeredScenes.get(name);
  }

  /**
   * Clears all registered scene definitions.
   */
  public clear(): void {
    this.registeredScenes.clear();
  }

  /**
   * Validates that a Scene object adheres to the Scene interface contract.
   */
  private validateScene(scene: Scene): void {
    if (
      !scene ||
      typeof scene !== "object" ||
      typeof scene.name !== "string" ||
      scene.name.trim().length === 0 ||
      typeof scene.onEnter !== "function" ||
      typeof scene.onExit !== "function"
    ) {
      throw new Error(
        "[SceneManager] Cannot switch to invalid scene. A Scene must provide 'name' (non-empty string), 'onEnter' (function), and 'onExit' (function)."
      );
    }
  }

  /**
   * Switches to a new scene by instance or registered name.
   * Handles the teardown of the old scene and setup of the new one.
   */
  public switchTo(nextScene: Scene | string): void {
    let targetScene: Scene;

    if (typeof nextScene === "string") {
      const resolved = this.registeredScenes.get(nextScene);
      if (!resolved) {
        throw new Error(`[SceneManager] Unknown scene: '${nextScene}'. Scene is not registered.`);
      }
      targetScene = resolved;
    } else {
      this.validateScene(nextScene);
      targetScene = nextScene;
    }

    // 1. Teardown current scene
    if (this.currentScene) {
      console.log(`[ECS] Exiting Scene: ${this.currentScene.name}`);
      this.currentScene.onExit(this.world);
    }

    // 2. Clear the world (preserving only singletons if desired)
    this.world.clear();

    // 3. Setup next scene
    this.currentScene = targetScene;
    console.log(`[ECS] Entering Scene: ${targetScene.name}`);

    // Systems are usually added/enabled inside onEnter
    targetScene.onEnter(this.world);
  }

  /**
   * Retrieves the currently active Scene object.
   */
  public getCurrentScene(): Scene | undefined {
    return this.currentScene;
  }

  /**
   * Retrieves the name of the currently active scene.
   */
  public getCurrentSceneName(): string | undefined {
    return this.currentScene?.name;
  }

  /**
   * Returns the Scheduler attached to this SceneManager.
   */
  public getScheduler(): Scheduler {
    return this.scheduler;
  }

  /**
   * Returns the World attached to this SceneManager.
   */
  public getWorld(): World {
    return this.world;
  }
}
