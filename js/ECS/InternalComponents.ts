import { ComponentId } from "./Archetype";

//TODO: clean up the notes in this code

/**
 * Component IDs are the "ABI" of your ECS:
 * - They must remain stable over time if you want save files to remain compatible.
 * - Prefer appending new IDs to the end (don't reorder).
 * - Use const "as const" to ensure they are compile-time constants.
 * - Use "satisfies" to ensure they are valid ComponentIds.
 * - Use "keyof typeof Components" to get the type of the component IDs.
 * - Use "typeof Components[ComponentName]" to get the type of a specific component ID.
 *
 * // DO NOT REORDER IDS - WILL BREAK SAVES
 *
 */


/**
 * Reserved range for Engine-level components.
 * User components should start from 100 or higher.
 */
export const ENGINE_COMPONENT_ID_START = 0;
export const USER_COMPONENT_ID_START = 100;


export const InternalComponents = {
  CLOCK: ENGINE_COMPONENT_ID_START,
  // ... other engine components as needed.  All as examples for now.
  ENGINE_STATS: ENGINE_COMPONENT_ID_START + 1, // for profiling
  PROGRESS: ENGINE_COMPONENT_ID_START + 2, // Track current scene/level metadata
  INPUT: ENGINE_COMPONENT_ID_START + 3,       // Keyboard/Mouse state singleton
  SCREEN: ENGINE_COMPONENT_ID_START + 4       // Viewport/Camera dimensions
} as const satisfies Record<string, ComponentId>;

export interface Clock {
  turn: number;
}
export interface GameProgress {
  levelNumber: number;
  difficulty: number;
  seed: number; // For procedural generation
  nextSceneType: string;
}

//
// Note Viewport / Camera State  Data: { x: number, y: number, zoom: number, width: number, height: number }
export interface Screen {
  width: number;
  height: number;
}

export interface SystemPerf {
  name: string;
  duration: number; // milliseconds
}


// Note Statistics / Profiling  Data: { entityCount: number, archetypeCount: number, updateTimeMs: number }
export interface EngineStats {
  entities: number;
  archetypes: number;
  systems: SystemPerf[];
  lastUpdateMs: number;
}

//Note Data: { keysDown: Set<string>, mouseX: number, mouseY: number, leftClick: boolean }
export interface InputState {
  keys: Set<string>;
  mouse: { x: number, y: number, down: boolean };
}

// Note Scene / Game State
// An internal "State" component helps systems know if the game is currently PLAYING, PAUSED, LOADING, or GAME_OVER.
// Data: { current: 'MENU' | 'PLAY' | 'DEAD', transitionPending: boolean }
