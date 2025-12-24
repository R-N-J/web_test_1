import type { ComponentId } from "./Archetype";
import type { World } from "./World";
import type { ComponentSerializer } from "./ComponentManager";

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
  // --- Core ---
  POSITION: 0,
  RENDER: 1,
  HEALTH: 2,

  // --- Relationships (examples) ---
  REL_MEMBER_OF: 100,
  REL_TARGETS: 101
} as const satisfies Record<string, ComponentId>;

export type ComponentName = keyof typeof Components;

/**
 * Serializer for relationship values that can be:
 * - EntityId (number) OR
 * - Set<EntityId>
 */
const RelationshipSetSerializer: ComponentSerializer = {
  serialize(value: unknown): unknown {
    if (value instanceof Set) {
      return { __rogue1_ecs: "Set", values: Array.from(value) };
    }
    return value;
  },
  deserialize(value: unknown): unknown {
    if (
      value &&
      typeof value === "object" &&
      "__rogue1_ecs" in value &&
      (value as { __rogue1_ecs?: unknown }).__rogue1_ecs === "Set"
    ) {
      const v = value as { __rogue1_ecs: "Set"; values: number[] };
      return new Set(v.values);
    }
    return value;
  }
};

/**
 * Register all component serializers in one place.
 * Call once during bootstrap.
 */
export function registerEcsSerializers(world: World): void {
  world.registerComponentSerializer(Components.REL_MEMBER_OF, RelationshipSetSerializer);
  world.registerComponentSerializer(Components.REL_TARGETS, RelationshipSetSerializer);
}

/**
 * Register all component IDs up front.
 * This makes archetype creation deterministic and avoids "register-as-you-go" surprises.
 */
export function registerAllComponents(world: World): void {
  for (const id of Object.values(Components)) {
    world.registerComponent(id);
  }
}


/**
 * ECS bootstrap: call this once for a new World, and also pass it into
 * `world.resetForLoad(bootstrapEcs)` before `world.loadSnapshot(...)`.
 *
 * This ensures:
 * - component IDs are registered (deterministic archetype construction)
 * - serializers are registered (correct snapshot decode/encode)
 */
export function bootstrapEcs(world: World): void {
  registerAllComponents(world);
  registerEcsSerializers(world);
}
