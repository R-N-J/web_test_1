
import { EntityId, ComponentId } from "./Archetype";
import type { World } from "./World";


/**
 * A builder for performing multiple component changes in a single structural move.
 * Helps prevent "Archetype Churn" by calculating the final mask before moving data.
 */
export class EntityEditor {
  private newMask: bigint;
  private additions = new Map<ComponentId, unknown>();
  private removals = new Set<ComponentId>();

  constructor(private world: World, private entity: EntityId, initialMask: bigint) {
    this.newMask = initialMask;
  }

  /**
   * Retrieves a component value for the entity being edited.
   * Checks pending additions first, then falls back to the world data.
   */
  public get<T>(id: ComponentId): T | undefined {
    if (this.additions.has(id)) return this.additions.get(id) as T;
    if (this.removals.has(id)) return undefined;
    return this.world.getComponent<T>(this.entity, id);
  }

  /**
   * Checks if the entity will have this component after commit.
   */
  public has(id: ComponentId): boolean {
    return (this.newMask & (1n << BigInt(id))) !== 0n;
  }

  /**
   * Assigns a tag to this entity.
   */
  public tag(name: string): this {
    // Safety: if the entity already has a different tag, unregister it first
    const currentTag = this.world.tags.getTag(this.entity);
    if (currentTag && currentTag !== name) {
      this.world.tags.unregister(this.entity);
    }
    this.world.tags.register(name, this.entity);
    return this;
  }

  /**
   * Removes any tag assigned to this entity.
   */
  public untag(): this {
    this.world.tags.unregister(this.entity);
    return this;
  }


  /**
   * Adds this entity to a group.
   */
  public group(name: string): this {
    this.world.groups.add(name, this.entity);
    return this;
  }

  /**
   * Removes this entity from a specific group.
   */
  public ungroup(name: string): this {
    this.world.groups.removeFromGroup(name, this.entity);
    return this;
  }

  public add(id: ComponentId, value: unknown): this {
    this.newMask |= (1n << BigInt(id));
    this.additions.set(id, value);
    this.removals.delete(id);
    return this;
  }


  /**
   * Removes all components from the entity.
   */
  public clear(): this {
    // 1. Clear pending additions
    this.additions.clear();

    // 2. Identify all current components from the world mask and mark for removal
    const currentMask = this.world.getMask(this.entity);
    for (const compId of this.world.getRegisteredComponents()) {
      if ((currentMask & (1n << BigInt(compId))) !== 0n) {
        this.removals.add(compId);
      }
    }

    this.newMask = 0n;
    return this;
  }


  public remove(id: ComponentId): this {
    this.newMask &= ~(1n << BigInt(id));
    this.removals.add(id);
    this.additions.delete(id);
    return this;
  }

  /**
   * Finalizes the changes and performs exactly one memory move in the World.
   */
  public commit(): void {
    this.world.applyBatchChanges(this.entity, this.newMask, this.additions, this.removals);
  }
}
