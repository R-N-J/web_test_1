import type { ComponentId } from "./Archetype";
import type { World } from "./World";
import type { ComponentSerializer } from "./ComponentManager";
import { InternalComponents } from "./InternalComponents";



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
 * Register core engine serializers.
 */
export function registerEcsSerializers(world: World, userComponents: Record<string, ComponentId>): void {
  // We look for specific relationship IDs in the user component set if they exist.
  // Using index access on the Record is safe and avoids 'any'.
  const relMemberOf = userComponents["REL_MEMBER_OF"];
  const relTargets = userComponents["REL_TARGETS"];

  if (relMemberOf !== undefined) {
    world.registerComponentSerializer(relMemberOf, RelationshipSetSerializer);
  }
  if (relTargets !== undefined) {
    world.registerComponentSerializer(relTargets, RelationshipSetSerializer);
  }
}


/**
 * Register all component IDs from a provided object.
 */
export function registerAllComponents(world: World, userComponents: Record<string, ComponentId>): void {
  // 1. Map names for debugging
  ComponentNames.clear();

  const allEntries = [
    ...Object.entries(InternalComponents),
    ...Object.entries(userComponents)
  ];

  for (const [name, id] of allEntries) {
    ComponentNames.set(id, name);
    world.registerComponent(id);
  }
}


/**
 * Metadata map for debugging and logging.
 * Maps ComponentId -> Human Readable Name.
 */
const ComponentNames = new Map<ComponentId, string>();

/**
 * Helper to get a readable name for a component ID.
 */
export function getComponentName(id: ComponentId): string {
  return ComponentNames.get(id) ?? `Unknown(${id})`;
}

/**
 * Helper to get a list of names for a bitmask.
 * Useful for logging: "Entity 5 has [POSITION, HEALTH]"
 */
export function getNamesFromMask(mask: bigint): string[] {
  const names: string[] = [];
  for (const [id, name] of ComponentNames) {
    if ((mask & (1n << BigInt(id))) !== 0n) {
      names.push(name);
    }
  }
  return names;
}

/**
 * ECS bootstrap: call this once for a new World.
 */
export function bootstrapEcs(world: World, userComponents: Record<string, ComponentId>): void {
  registerAllComponents(world, userComponents);
  registerEcsSerializers(world, userComponents);
}

