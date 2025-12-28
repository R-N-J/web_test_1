import { World } from "./World";

/**
 * The Scene interface defines the lifecycle contract between
 * the game logic and the ECS engine.
 */
export interface Scene {
  /** A unique identifier for the scene, useful for logging and debugging. */
  readonly name: string;

  /**
   * Executed by the SceneManager when this scene becomes active.
   * This is where you should enable systems and spawn initial entities.
   */
  onEnter(world: World): void;

  /**
   * Executed by the SceneManager before the world is cleared and
   * the next scene is loaded. Use this to save global state or clean up.
   */
  onExit(world: World): void;
}
