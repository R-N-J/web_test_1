import { Aspect } from "./Aspect";
import { Archetype, EntityId, ComponentId } from "./Archetype";
import { TagManager } from "./TagManager";
import { GroupManager } from "./GroupManager";
import { EntityEditor } from "./EntityEditor";
import { EntityManager } from "./EntityManager";
import { QueryManager } from "./QueryManager";
import { ComponentManager, ComponentObserver } from "./ComponentManager";
import { RelationshipManager } from "./RelationshipManager";
import { PrefabManager } from "./PrefabManager";

export interface WorldSnapshot {
  nextEntityId: number;
  freeEntities: EntityId[];
  archetypes: {
    mask: string;
    entities: EntityId[];
    columns: Record<number, unknown[]>;
  }[];
  tags: Record<string, EntityId>;
  groups: Record<string, EntityId[]>;
}

export class World {
  private entities = new EntityManager();
  private queries = new QueryManager();
  private components = new ComponentManager(this.entities, this.queries);
  public readonly relationships = new RelationshipManager(this.entities, this.components);
  public readonly prefabs = new PrefabManager(this);

  public readonly tags = new TagManager();
  public readonly groups = new GroupManager();

  /**
   * Subscribes a callback to be called when a component is added to an entity.
   */
  public subscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    this.components.subscribeOnAdd(id, observer);
  }

  /**
   * Subscribes a callback to be called when a component is removed from an entity.
   */
  public subscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    this.components.subscribeOnRemove(id, observer);
  }

  public unsubscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    this.components.unsubscribeOnAdd(id, observer);
  }

  public unsubscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    this.components.unsubscribeOnRemove(id, observer);
  }

  public addComponent(entity: EntityId, componentId: ComponentId, value: unknown): void {
    this.components.addRegisteredComponent(componentId);
    const loc = this.entities.getLocation(entity);
    const oldMask = loc?.arch.mask ?? 0n;
    const newMask = oldMask | (1n << BigInt(componentId));

    if (oldMask === newMask) return; // Already has it

    this.components.transmute(entity, newMask, componentId, value);
  }

  public removeComponent(entity: EntityId, componentId: ComponentId): void {
    const loc = this.entities.getLocation(entity);
    if (!loc) return;

    const oldMask = loc.arch.mask;
    const newMask = oldMask & ~(1n << BigInt(componentId));

    if (oldMask === newMask) return; // Didn't have it

    this.components.transmute(entity, newMask);
  }

  /**
   * The primary API for Systems to get matching data.
   */
  public getArchetypes(aspect: Aspect): Archetype[] {
    return this.queries.getArchetypes(aspect, this.components.getArchetypes());
  }

  /**
   * A streaming view of all entities matching an aspect.
   * Use this for memory-efficient iteration.
   */
  public *view(aspect: Aspect): IterableIterator<EntityId> {
    const archetypes = this.getArchetypes(aspect);
    for (const arch of archetypes) {
      const count = arch.entities.length;
      for (let i = 0; i < count; i++) {
        yield arch.entities[i];
      }
    }
  }

  public *viewGroup(group: string): IterableIterator<EntityId> {
    const entities = this.groups.getEntities(group);
    for (const e of entities) yield e;
  }

  /**
   * Returns the number of entities in a specific group.
   * Much faster than getting all entities and checking the length.
   */
  public countGroup(group: string): number {
    return this.groups.count(group);
  }

  public *viewTag(tag: string): IterableIterator<EntityId> {
    const entity = this.tags.getEntity(tag);
    if (entity !== undefined) yield entity;
  }

  /**
   * Returns the tag assigned to an entity, if any.
   * Useful for identifying special entities in logs or UI.
   */
  public getEntityTag(entity: EntityId): string | undefined {
    return this.tags.getTag(entity);
  }

  public query(aspect: bigint): EntityId[] {
    const results: EntityId[] = [];
    for (const arch of this.components.getArchetypes()) {
      if ((arch.mask & aspect) === aspect) {
        results.push(...arch.entities);
      }
    }
    return results;
  }

  /**
   * Safely retrieves a component value for an entity.
   */
  public getComponent<T>(entity: EntityId, id: ComponentId): T | undefined {
    return this.entities.getComponentValue<T>(entity, id);
  }

  /**
   * Checks if an entity possesses a specific component.
   */
  public hasComponent(entity: EntityId, id: ComponentId): boolean {
    return this.entities.hasComponent(entity, id);
  }

  /**
   * Checks if an entity is still active and hasn't been recycled.
   */
  public isValid(entity: EntityId): boolean {
    return this.entities.isValid(entity);
  }



  /**
   * Generates a new unique Entity ID, recycling old IDs if available.
   */
  public createEntity(): EntityId {
    return this.entities.createEntity();
  }

  /**
   * Deletes an entity, cleans up its data, and recycles its ID.
   */
  public deleteEntity(entity: EntityId): void {
    // 0. Clean up relationships pointing TO this entity
    this.relationships.cleanup(entity);

    // 1. Clean up from Archetypes
    const loc = this.entities.getLocation(entity);
    if (loc) {
      const movedEntityId = loc.arch.removeEntity(loc.row);

      // Update the row index of the entity that was swapped into this position
      if (movedEntityId !== entity) {
        const movedLoc = this.entities.getLocation(movedEntityId);
        if (movedLoc) {
            this.entities.setLocation(movedEntityId, movedLoc.arch, loc.row);
        }
      }

      this.entities.removeLocation(entity);
    }

    // 2. Clean up Tags and Groups
    this.tags.unregister(entity);
    this.groups.remove(entity);

    // 3. Recycle the ID
    this.entities.recycleEntity(entity);
  }

  /**
   * Starts a batch edit for an entity to avoid multiple memory moves.
   */
  public edit(entity: EntityId): EntityEditor {
    const loc = this.entities.getLocation(entity);
    return new EntityEditor(this, entity, loc?.arch.mask ?? 0n);
  }

  /**
   * Used by EntityEditor to perform one structural move (single batch move).
   */
  public applyBatchChanges(
    entity: EntityId,
    newMask: bigint,
    additions: Map<ComponentId, unknown>,
    removals: Set<ComponentId>
  ): void {
    for (const id of additions.keys()) {
        this.components.addRegisteredComponent(id);
    }
    this.components.applyBatchChanges(entity, newMask, additions, removals);
  }

  /**
   * Resets the entire world state.
   * Useful for loading games or switching levels.
   */
  public clear(): void {
    // 1. Clear Entities and their recycling versions
    this.entities.clear();
    // 2. Clear Archetype data and observers
    this.components.clear();
    this.components.clearObservers(); // Ensure old callbacks don't fire on new entities
    // 3. Clear the Query cache
    this.queries.clear();
    // 4. Reset Tags and Groups
    this.tags.load({}); // TagManager.load({}) effectively clears it
    this.groups.load({}); // GroupManager.load({}) effectively clears it
    // 5. Note: PrefabManager doesn't usually need clearing as
    // blueprints persist across level changes.
  }

  /**
   * Creates a plain-object snapshot of the entire ECS state.
   */
  public saveSnapshot(): WorldSnapshot {
    const archetypeSnapshots = Array.from(this.components.getArchetypeMap().values())
      .filter(arch => arch.entities.length > 0) // Only save archetypes that actually have entities
      .map(arch => arch.save());

    return {
      nextEntityId: this.entities.getNextEntityId(),
      freeEntities: this.entities.getFreeEntities(),
      archetypes: archetypeSnapshots,
      tags: this.tags.save(),
      groups: this.groups.save()
    };
  }

  /**
   * Restores the world state from a snapshot.
   */
  public loadSnapshot(snapshot: WorldSnapshot): void {
    this.clear();
    this.entities.setNextEntityId(snapshot.nextEntityId);

    // 1. Rebuild Archetypes and Entity Locations
    for (const archData of snapshot.archetypes) {
      const mask = BigInt(archData.mask);
      const componentIds = Object.keys(archData.columns).map(Number);

      const arch = this.components.getOrCreateArchetype(mask, componentIds);
      arch.entities = archData.entities;

      for (const compId of componentIds) {
        arch.columns.set(compId, archData.columns[compId]);
        // CLEANER: ComponentManager handles its own registration logic
        this.components.addRegisteredComponent(compId);
      }

      // 2. Rebuild the entity-to-location index
      for (let row = 0; row < arch.entities.length; row++) {
        this.entities.setLocation(arch.entities[row], arch, row);
      }
    }

    // 3. Rebuild Tags and Groups
    this.tags.load(snapshot.tags);
    this.groups.load(snapshot.groups);
  }

}

