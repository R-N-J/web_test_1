import { World } from "./World";
import { ComponentId, EntityId } from "./Archetype";

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
    const template = this.templates.get(name);
    if (!template) throw new Error(`Prefab "${name}" not found`);

    const entity = this.world.createEntity();
    const editor = this.world.edit(entity);

    // 1. Add components from the template
    for (const comp of template.components) {
      // Use override value if provided, otherwise template value
      const val = overrides.has(comp.id) ? overrides.get(comp.id) : comp.value;
      editor.add(comp.id, val);
    }

    // Apply all additions in one structural move
    editor.commit();

    // 2. Set up relationships (if any)
    if (template.relationships) {
      for (const rel of template.relationships) {
        const target = this.world.tags.getEntity(rel.targetTag);
        if (target !== undefined) {
          this.world.relationships.add(entity, rel.id, target);
        }
      }
    }

    return entity;
  }
}
