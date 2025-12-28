import { Aspect } from "./Aspect";
import { Archetype, EntityId, ComponentId } from "./Archetype";
import { TagManager } from "./TagManager";
import { GroupManager } from "./GroupManager";
import { EntityEditor } from "./EntityEditor";
import { EntityManager } from "./EntityManager";
import { QueryManager } from "./QueryManager";
import { ComponentManager, ComponentObserver, MaskObserver } from "./ComponentManager";
import { RelationshipManager } from "./RelationshipManager";
import { PrefabManager } from "./PrefabManager";
import type { ComponentSerializer } from "./ComponentManager";
import { EventBus } from "../core/EventBus"; // Add this import from Core

export interface WorldSnapshot {
  version: number;
  nextEntityId: number;
  /**
   * Entity generation/version values for indices [0..nextEntityId).
   * Used to keep EntityId validity deterministic across save/load.
   */
  entityVersions: number[];
  freeEntities: EntityId[];
  archetypes: {
    mask: string;
    entities: EntityId[];
    columns: Record<number, unknown[]>;
  }[];
  tags: Record<string, EntityId>;
  groups: Record<string, EntityId[]>;
}

const ECS_SNAPSHOT_VERSION = 1;



export class World {
  private entities = new EntityManager();
  private queries = new QueryManager();
  private components = new ComponentManager(this.entities, this.queries);
  public readonly relationships = new RelationshipManager(this.entities, this.components);
  public readonly prefabs = new PrefabManager(this);
  public readonly events = new EventBus();


  public readonly tags = new TagManager();
  public readonly groups = new GroupManager();

  private singletonEntity: EntityId;

  constructor() {
    this.singletonEntity = this.createEntity();
    this.tags.register("__world_singletons__", this.singletonEntity);
  }

  /**
   * Returns the internal entity ID used for global singletons.
   * Useful for targeted updates via updateComponent or mutateComponent.
   */
  public getSingletonEntity(): EntityId {
    return this.singletonEntity;
  }

  /**
   * Sets or updates a global singleton component.
   */
  public setSingleton<T>(id: ComponentId, value: T): void {
    this.addComponent(this.singletonEntity, id, value);
  }

  /**
   * Retrieves a global singleton component.
   */
  public getSingleton<T>(id: ComponentId): T | undefined {
    return this.getComponent<T>(this.singletonEntity, id);
  }

  /**
   * Checks if a global singleton component exists.
   */
  public hasSingleton(id: ComponentId): boolean {
    return this.hasComponent(this.singletonEntity, id);
  }


  /**
   * Subscribe to structural changes (entity mask changes).
   */
  public subscribeOnMaskChange(observer: MaskObserver): void {
    this.components.subscribeOnMaskChange(observer);
  }

  public unsubscribeOnMaskChange(observer: MaskObserver): void {
    this.components.unsubscribeOnMaskChange(observer);
  }


  /**
   * Registers a component ID with the ECS. This should be done once at startup
   * (or before loading a snapshot) to keep archetype construction deterministic.
   */
  public registerComponent(id: ComponentId): void {
    this.components.addRegisteredComponent(id);
  }

  /**
   * Registers a serializer for a specific component ID.
   * This is used by snapshot save/load to handle non-JSON-native component values (Set, Map, custom classes, etc.).
   */
  public registerComponentSerializer(id: ComponentId, serializer: ComponentSerializer): void {
    this.components.registerSerializer(id, serializer);
  }

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

    // If the entity already has this component, treat this as "replace value" (non-structural).
    if (this.entities.hasComponent(entity, componentId)) {
      this.entities.setComponentValue(entity, componentId, value);
      return;
    }

    // Otherwise, this is a structural change (add the component bit -> transmute).
    const loc = this.entities.getLocation(entity);
    const oldMask = loc?.arch.mask ?? 0n;
    const newMask = oldMask | (1n << BigInt(componentId));

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
  public* view(aspect: Aspect): IterableIterator<EntityId> {
    const archetypes = this.getArchetypes(aspect);
    for (const arch of archetypes) {
      const count = arch.entities.length;
      for (let i = 0; i < count; i++) {
        yield arch.entities[i];
      }
    }
  }

  public* viewGroup(group: string): IterableIterator<EntityId> {
    // Pass 'this' so the manager can filter out recycled IDs automatically
    const entities = this.groups.getEntities(group, this);
    for (const e of entities) yield e;
  }

  /**
   * Returns the number of entities in a specific group.
   // ... existing code ...
   public *viewTag(tag: string): IterableIterator<EntityId> {
   const entity = this.tags.getEntity(tag);
   // Logic Improvement: verify the entity is still valid before yielding
   if (entity !== undefined && this.entities.isValid(entity)) yield entity;
   }

   /**
   * Checks if an entity matches a specific Aspect.
   */
  public matches(entity: EntityId, aspect: Aspect): boolean {
    if (!this.isValid(entity)) return false;
    const mask = this.entities.getMask(entity);
    return aspect.matches(mask);
  }

  /**
   * Returns the number of entities in a specific group.
   * Much faster than getting all entities and checking the length.
   */
  public countGroup(group: string): number {
    return this.groups.count(group);
  }

  public* viewTag(tag: string): IterableIterator<EntityId> {
    const entity = this.tags.getEntity(tag);
    // Safety: only yield if the entity exists AND is still valid/active
    if (entity !== undefined && this.entities.isValid(entity)) {
      yield entity;
    }
  }

  /**
   * Fast-path iterator that yields raw SoA columns for matching archetypes.
   *
   * Example usage:
   * for (const { entities, columns: [pos, vel] } of world.viewColumns(aspect, POS, VEL)) { ... }
   */
  public* viewColumns(
    aspect: Aspect,
    ...componentIds: ComponentId[]
  ): IterableIterator<{ arch: Archetype; entities: EntityId[]; columns: unknown[][] }> {
    const archetypes = this.getArchetypes(aspect);

    for (const arch of archetypes) {
      const cols: unknown[][] = [];
      let ok = true;

      for (const id of componentIds) {
        const col = arch.getColumn<unknown>(id);
        if (!col) {
          ok = false;
          break;
        }
        cols.push(col);
      }

      if (!ok) continue;

      yield {arch, entities: arch.entities, columns: cols};
    }
  }

  /**
   * Strict fast-path iterator: yields raw SoA columns for matching archetypes.
   * Throws if any matching archetype is missing a requested column.
   *
   * Use this when your Aspect logically guarantees the columns exist (e.g. Aspect.all(...)).
   * This helps catch registration/serialization mistakes early.
   */
  public* viewColumnsStrict(
    aspect: Aspect,
    ...componentIds: ComponentId[]
  ): IterableIterator<{ arch: Archetype; entities: EntityId[]; columns: unknown[][] }> {
    const archetypes = this.getArchetypes(aspect);

    for (const arch of archetypes) {
      const cols: unknown[][] = [];

      for (const id of componentIds) {
        const col = arch.getColumn<unknown>(id);
        if (!col) {
          throw new Error(
            `viewColumnsStrict: archetype mask=${arch.mask.toString()} is missing column for componentId=${id}`
          );
        }
        cols.push(col);
      }

      yield {arch, entities: arch.entities, columns: cols};
    }
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
   * Non-structural write (no archetype move). Returns false if entity/component doesn't exist.
   */
  public setComponent<T>(entity: EntityId, id: ComponentId, value: T): boolean {
    return this.entities.setComponentValue(entity, id, value);
  }

  /**
   * Non-structural update (no archetype move). Returns false if entity/component doesn't exist.
   */
  public updateComponent<T>(entity: EntityId, id: ComponentId, updater: (current: T) => T): boolean {
    return this.entities.updateComponentValue(entity, id, updater);
  }

  /**
   * Non-structural mutation (no archetype move). Returns false if entity/component doesn't exist.
   */
  public mutateComponent<T>(entity: EntityId, id: ComponentId, mutator: (value: T) => void): boolean {
    return this.entities.mutateComponent(entity, id, mutator);
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
   * Returns the current component mask for an entity.
   */
  public getMask(entity: EntityId): bigint {
    return this.entities.getMask(entity);
  }

  /**
   * Returns all component IDs currently registered in the engine.
   */
  public getRegisteredComponents(): ComponentId[] {
    return this.components.getRegisteredComponents();
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
    // Safety: prevent accidental deletion of the global singleton entity
    if (entity === this.singletonEntity) {
      console.error("Critical Error: Attempted to delete the Singleton Entity.");
      return;
    }

    // 0. Clean up relationships pointing TO this entity
    this.relationships.cleanup(entity);

    // 1. Clean up from Archetypes
    const loc = this.entities.getLocation(entity);
    const oldMask = loc?.arch.mask ?? 0n;

    if (loc) {
      const movedEntityId = loc.arch.removeEntity(loc.row);

      if (movedEntityId !== entity) {
        const movedLoc = this.entities.getLocation(movedEntityId);
        if (movedLoc) {
          this.entities.setLocation(movedEntityId, movedLoc.arch, loc.row);
        }
      }

      this.entities.removeLocation(entity);
    }

    // NEW: structural exit event (entity is effectively removed from all aspects)
    if (oldMask !== 0n) {
      this.components.emitMaskChange(entity, oldMask, 0n);
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
   * Creates an exact structural and data copy of an existing entity.
   * Note: Tags are NOT duplicated as they must be unique.
   *
   * Planned to be used for Mirror Image or Doppelganger effect.
   *
   * @param source The entity to duplicate.
   * @returns The new entity ID.
   */
  public duplicateEntity(source: EntityId): EntityId {
    if (!this.isValid(source)) {
      throw new Error(`Cannot duplicate invalid entity: ${source}`);
    }

    const newEntity = this.createEntity();
    const sourceMask = this.getMask(source);
    const editor = this.edit(newEntity);

    // Iterate through all registered components and copy if present on source
    for (const compId of this.getRegisteredComponents()) {
      const bit = 1n << BigInt(compId);
      if ((sourceMask & bit) !== 0n) {
        const val = this.getComponent(source, compId);
        // Deep clone the value via ComponentManager logic
        editor.add(compId, this.components.cloneValue(compId, val));
      }
    }

    editor.commit();

    // Optional: Add to same groups as source
    for (const groupName of this.groups.save() ? Object.keys(this.groups.save()) : []) {
      if (this.groups.has(groupName, source)) {
        this.groups.add(groupName, newEntity);
      }
    }

    return newEntity;
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
    // 5. Reset Relationship index
    this.relationships.clear();
    // 6. Note: PrefabManager doesn't usually need clearing as
    // blueprints persist across level changes.
  }

  /**
   * Creates a plain-object snapshot of the entire ECS state.
   */
  public saveSnapshot(): WorldSnapshot {
    const archetypeSnapshots = [];

    for (const [mask, arch] of this.components.getArchetypeMap()) {
      if (arch.entities.length === 0) continue;

      const columnsData: Record<number, unknown[]> = {};
      for (const [compId, column] of arch.columns) {
        // Serialize + clone each value to keep snapshot immutable
        columnsData[compId] = column.map(v => this.components.serializeValue(compId, v));
      }

      archetypeSnapshots.push({
        mask: mask.toString(),
        entities: [...arch.entities],
        columns: columnsData
      });
    }

    return {
      version: ECS_SNAPSHOT_VERSION,
      nextEntityId: this.entities.getNextEntityId(),
      entityVersions: this.entities.saveVersions(),
      freeEntities: this.entities.getFreeEntities(),
      archetypes: archetypeSnapshots,
      tags: this.tags.save(),
      groups: this.groups.save()
    };
  }

  /**
   * Prepares the World to load a snapshot.
   *
   * - Clears runtime state (entities, archetypes, queries, tags, groups)
   * - Keeps component IDs + serializers intact (unless your code explicitly resets them)
   * - Optionally runs a registrar callback to (re)register component IDs/serializers
   */
  public resetForLoad(registrar?: (world: World) => void): void {
    this.clear();

    // Ensure any caller can re-register component IDs and serializers at the right time.
    // (Useful if you ever create a brand new World instance or you want explicit bootstrapping.)
    registrar?.(this);
  }


  /**
   * Restores the world state from a snapshot.
   */
  public loadSnapshot(snapshot: WorldSnapshot): void {
    if (snapshot.version !== ECS_SNAPSHOT_VERSION) {
      throw new Error(
        `Unsupported ECS snapshot version: ${snapshot.version}. Expected: ${ECS_SNAPSHOT_VERSION}`
      );
    }
    //this.clear();
    // If you want to enforce registration always happens before load,
    // loadSnapshot can rely on resetForLoad() being called by the caller,
    // OR you can call it here with no registrar.
    this.resetForLoad();

    this.entities.setNextEntityId(snapshot.nextEntityId);
    this.entities.loadVersions(snapshot.entityVersions);
    this.entities.loadFreeEntities(snapshot.freeEntities);

    for (const archData of snapshot.archetypes) {
      const mask = BigInt(archData.mask);
      const componentIds = Object.keys(archData.columns).map(Number);

      const arch = this.components.getOrCreateArchetype(mask, componentIds);
      arch.entities = archData.entities;

      for (const compId of componentIds) {
        const rawColumn = archData.columns[compId];
        const decoded = rawColumn.map(v => this.components.deserializeValue(compId, v));
        arch.columns.set(compId, decoded);
        this.components.addRegisteredComponent(compId);
      }

      for (let row = 0; row < arch.entities.length; row++) {
        this.entities.setLocation(arch.entities[row], arch, row);
      }
    }

    // Rebuild the relationship index after data is loaded
    this.relationships.rebuild();

    this.tags.load(snapshot.tags);
    this.groups.load(snapshot.groups);
  }


}
