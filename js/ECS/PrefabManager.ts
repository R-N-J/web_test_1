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
  groups?: string[];
}

export class PrefabManager {
  private templates = new Map<string, PrefabDefinition>();

  constructor(private world: World) {}

  public register(name: string, definition: PrefabDefinition): void {
    if (!name || typeof name !== "string") {
      throw new Error(`[ECS] Invalid prefab name: '${name}'. Name must be a non-empty string.`);
    }
    if (!definition || typeof definition !== "object" || !Array.isArray(definition.components)) {
      throw new Error(`[ECS] Invalid prefab definition for '${name}'. Definition must be an object with a 'components' array.`);
    }

    for (const comp of definition.components) {
      if (!comp || !isValidComponentId(comp.id)) {
        throw new Error(`[ECS] Invalid Component ID: ${comp?.id} in prefab '${name}'. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
      if (comp.id < USER_COMPONENT_ID_START && !this.world.isComponentRegistered(comp.id)) {
        throw new Error(`[ECS] Cannot use unregistered reserved component ID: ${comp.id} in prefab '${name}'. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
      }
    }

    let clonedRelationships: { id: ComponentId; targetTag: string }[] | undefined;
    if (definition.relationships !== undefined) {
      if (!Array.isArray(definition.relationships)) {
        throw new Error(`[ECS] Invalid relationships in prefab '${name}'. Relationships must be an array.`);
      }
      clonedRelationships = [];
      for (const rel of definition.relationships) {
        if (!rel || !isValidComponentId(rel.id)) {
          throw new Error(`[ECS] Invalid Component ID: ${rel?.id} in prefab '${name}'. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
        }
        if (rel.id < USER_COMPONENT_ID_START && !this.world.isComponentRegistered(rel.id)) {
          throw new Error(`[ECS] Cannot use unregistered reserved component ID: ${rel.id} in prefab '${name}'. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
        }
        if (!rel.targetTag || typeof rel.targetTag !== "string") {
          throw new Error(`[ECS] Invalid relationship targetTag: '${rel.targetTag}' in prefab '${name}'. Target tag must be a non-empty string.`);
        }
        clonedRelationships.push({ id: rel.id, targetTag: rel.targetTag });
      }
    }

    let clonedGroups: string[] | undefined;
    if (definition.groups !== undefined) {
      if (!Array.isArray(definition.groups)) {
        throw new Error(`[ECS] Invalid groups in prefab '${name}'. Groups must be an array of strings.`);
      }
      clonedGroups = [];
      for (const g of definition.groups) {
        if (!g || typeof g !== "string") {
          throw new Error(`[ECS] Invalid group name: '${g}' in prefab '${name}'. Group names must be non-empty strings.`);
        }
        clonedGroups.push(g);
      }
    }

    // Clone components and values to isolate template from caller mutations
    const clonedComponents = definition.components.map(comp => ({
      id: comp.id,
      value: this.world.cloneValue(comp.id, comp.value)
    }));

    const clonedDef: PrefabDefinition = {
      name,
      components: clonedComponents,
      relationships: clonedRelationships,
      groups: clonedGroups
    };

    this.templates.set(name, clonedDef);
  }

  /**
   * Registers multiple prefabs at once.
   */
  public registerAll(definitions: PrefabDefinition[]): void {
    if (!Array.isArray(definitions)) {
      throw new Error("[ECS] Invalid definitions argument in registerAll. Expected an array of PrefabDefinition objects.");
    }
    for (const def of definitions) {
      if (!def || typeof def !== "object") {
        throw new Error("[ECS] Invalid prefab definition element in registerAll.");
      }
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
   * Clears all registered prefab templates.
   */
  public clear(): void {
    this.templates.clear();
  }

  /**
   * Spawns a prefab and immediately assigns a unique tag to the new entity.
   */
  public spawnWithTag(prefabName: string, tag: string, overrides?: Map<ComponentId, unknown>): EntityId {
    const entity = this.spawn(prefabName, overrides);
    try {
      this.world.tags.register(tag, entity);
    } catch (err) {
      this.world.deleteEntity(entity);
      throw err;
    }
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
    try {
      const editor = this.world.edit(entity);
      const appliedComponents = new Set<ComponentId>();

      // 1. Add components from the template (with overrides if provided)
      for (const comp of template.components) {
        // Ensure user component IDs are registered with the engine
        if (comp.id >= USER_COMPONENT_ID_START) {
          this.world.registerComponent(comp.id);
        }

        appliedComponents.add(comp.id);
        const rawVal = overrides.has(comp.id) ? overrides.get(comp.id) : comp.value;
        const val = this.world.cloneValue(comp.id, rawVal);
        editor.add(comp.id, val);
      }

      // Add any extra override components not in template
      for (const [id, rawVal] of overrides) {
        if (!appliedComponents.has(id)) {
          if (id >= USER_COMPONENT_ID_START) {
            this.world.registerComponent(id);
          }
          const val = this.world.cloneValue(id, rawVal);
          editor.add(id, val);
        }
      }

      // Apply all additions in one structural move
      editor.commit();

      // 2. Set up groups (if any)
      if (template.groups) {
        for (const group of template.groups) {
          this.world.groups.add(group, entity);
        }
      }

      // 3. Set up relationships (if any)
      if (template.relationships) {
        for (const rel of template.relationships) {
          const target = this.world.tags.getEntity(rel.targetTag);
          if (target !== undefined && this.world.isValid(target)) {
            this.world.relationships.add(entity, rel.id, target);
          }
        }
      }

      return entity;
    } catch (err) {
      this.world.deleteEntity(entity);
      throw err;
    }
  }
}
