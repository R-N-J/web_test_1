import { ComponentId } from "../ECS/Archetype";
import {ENGINE_COMPONENT_ID_START, InternalComponents, USER_COMPONENT_ID_START} from "../ECS/InternalComponents";

//TODO: Game Configuration or the Current Map  or `PLAYER_REFERENCE`

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

export const Components = {
   // Re-export Internal for convenience in the game layer if needed
  CLOCK: InternalComponents.CLOCK,
  ENGINE_STATS: InternalComponents.ENGINE_STATS,
  INPUT: InternalComponents.INPUT,
  SCREEN: InternalComponents.SCREEN,

  // --- Core ---
  POSITION: USER_COMPONENT_ID_START ,
  RENDER: USER_COMPONENT_ID_START + 1,
  HEALTH: USER_COMPONENT_ID_START + 2,

  // --- Relationships ---
  REL_MEMBER_OF: USER_COMPONENT_ID_START + 200,
  REL_TARGETS: USER_COMPONENT_ID_START + 201

} as const satisfies Record<string, ComponentId>;

export type ComponentName = keyof typeof Components;
