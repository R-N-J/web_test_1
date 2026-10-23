import { World } from "./World";
import { ComponentId, EntityId, MAX_COMPONENT_ID, isValidComponentId } from "./Archetype";
import { USER_COMPONENT_ID_START } from "./InternalComponents";

export interface PrefabDefinition {
  name: string;
  components: {
    id: ComponentId;
    value: unknown;
  }[];
  relationships?: {
    id: ComponentId;
    targetTag: string; // We use tags so we don't have to guess IDs
  }[];
}

export class PrefabManager {
  private templates = new Map<string, PrefabDefinition>();

  constructor(private world: World) {}

  public register(name: string, definition: PrefabDefinition): void {
    for (const comp of definition.components) {
      if (!isValidComponentId(comp.id)) {
        throw new Error(`[ECS] Invalid Component ID: ${comp.id} in prefab '${name}'. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
      if (comp.id < USER_COMPONENT_ID_START && !this.world.isComponentRegistered(comp.id)) {
        throw new Error(`[ECS] Cannot use unregistered reserved component ID: ${comp.id} in prefab '${name}'. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
      }
    }
    if (definition.relationships) {
      for (const rel of definition.relationships) {
        if (!isValidComponentId(rel.id)) {
          throw new Error(`[ECS] Invalid Component ID: ${rel.id} in prefab '${name}'. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
        }
        if (rel.id < USER_COMPONENT_ID_START && !this.world.isComponentRegistered(rel.id)) {
          throw new Error(`[ECS] Cannot use unregistered reserved component ID: ${rel.id} in prefab '${name}'. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
        }
      }
    }
    this.templates.set(name, definition);
  }

  /**
   * Registers multiple prefabs at once.
   */
  public registerAll(definitions: PrefabDefinition[]): void {
    for (const def of definitions) {
      this.register(def.name, def);
    }
  }

  /**
   * Returns true if a prefab with this name exists.
   */
  public has(name: string): boolean {
    return this.templates.get(name) !== undefined;
  }


  /**
   * Spawns a prefab and immediately assigns a unique tag to the new entity.
   */
  public spawnWithTag(prefabName: string, tag: string, overrides?: Map<ComponentId, unknown>): EntityId {
    const entity = this.spawn(prefabName, overrides);
    this.world.tags.register(tag, entity);
    return entity;
  }


  /**
   * Spawns a new entity based on a prefab template.
   * @param name The registered prefab name.
   * @param overrides Optional component values to override the template.
   */
  public spawn(name: string, overrides: Map<ComponentId, unknown> = new Map()): EntityId {
    for (const id of overrides.keys()) {
      if (!isValidComponentId(id)) {
        throw new Error(`[ECS] Invalid Component ID: ${id} in overrides for prefab '${name}'. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
      if (id < USER_COMPONENT_ID_START && !this.world.isComponentRegistered(id)) {
        throw new Error(`[ECS] Cannot use unregistered reserved component ID: ${id} in overrides for prefab '${name}'. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
      }
    }
    const template = this.templates.get(name);
    if (!template) {
      const msg = `[ECS] CRITICAL: Prefab Template '${name}' not found. Ensure it is registered with the PrefabManager during bootstrap.`;
      console.error(msg);
      throw new Error(msg);
    }

    const entity = this.world.createEntity();
    const editor = this.world.edit(entity);

    // 1. Add components from the template
    for (const comp of template.components) {
      // Ensure user component IDs are registered with the engine
      if (comp.id >= USER_COMPONENT_ID_START) {
        this.world.registerComponent(comp.id);
      }

      // Use override value if provided, otherwise template value
      const val = overrides.has(comp.id) ? overrides.get(comp.id) : comp.value;
      editor.add(comp.id, val);
    }

    // Apply all additions in one structural move
    editor.commit();

    // 2. Set up relationships (if any)
    if (template.relationships) {
      for (const rel of template.relationships) {
        // Logic Improvement: verify the target exists before linking
        const target = this.world.tags.getEntity(rel.targetTag);
        if (target !== undefined && this.world.isValid(target)) {
          this.world.relationships.add(entity, rel.id, target);
        }
      }
    }

    return entity;
  }
}
