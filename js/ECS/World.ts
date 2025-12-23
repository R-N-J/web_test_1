import { Aspect } from "./Aspect";
import { Archetype, EntityId, ComponentId } from "./Archetype";
import { TagManager } from "./TagManager";
import { GroupManager } from "./GroupManager";
import { EntityEditor } from "./EntityEditor";
import { Bag } from "./Bag";

/**
 * Signature for callbacks that react to component changes.
 */
export type ComponentObserver = (entity: EntityId, componentId: ComponentId) => void;

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
  private entityToLocation = new Map<EntityId, { arch: Archetype, row: number }>();
  private archetypes = new Map<bigint, Archetype>();
  private nextEntityId = 0;
  private freeEntities = new Bag<EntityId>();

  public readonly tags = new TagManager();
  public readonly groups = new GroupManager();

  // Cache: Aspect.all + Aspect.one + Aspect.exclude -> List of matching Archetypes
  private queryCache = new Map<string, Archetype[]>();
  private activeAspects = new Map<string, Aspect>();

  // Observers: Mapping ComponentId -> List of callbacks
  private onAddObservers = new Map<ComponentId, ComponentObserver[]>();
  private onRemoveObservers = new Map<ComponentId, ComponentObserver[]>();

  // Track which component IDs exist in the world to rebuild masks
  private registeredComponents: ComponentId[] = [];



  /**
   * Subscribes a callback to be called when a component is added to an entity.
   */
  public subscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    if (!this.onAddObservers.has(id)) this.onAddObservers.set(id, []);
    this.onAddObservers.get(id)!.push(observer);
  }

  /**
   * Subscribes a callback to be called when a component is removed from an entity.
   */
  public subscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    if (!this.onRemoveObservers.has(id)) this.onRemoveObservers.set(id, []);
    this.onRemoveObservers.get(id)!.push(observer);
  }

  public unsubscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    const observers = this.onAddObservers.get(id);
    if (observers) {
      this.onAddObservers.set(id, observers.filter(o => o !== observer));
    }
  }

  public unsubscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    const observers = this.onRemoveObservers.get(id);
    if (observers) {
      this.onRemoveObservers.set(id, observers.filter(o => o !== observer));
    }
  }


  /**
   * Internal method to register a new Archetype into all existing Aspect caches.
   */
  private registerArchetypeInCaches(arch: Archetype): void {
    for (const [key, aspect] of this.activeAspects) {
      if (aspect.matches(arch.mask)) {
        this.queryCache.get(key)!.push(arch);
      }
    }
  }


  /**
   * Performs the structural move of an entity between memory layouts.
   */
  private transmute(entity: EntityId, newMask: bigint, newComponentId?: ComponentId, newValue?: unknown): void {
    const oldLocation = this.entityToLocation.get(entity);
    const oldMask = oldLocation?.arch.mask ?? 0n;
    const dataToMigrate = new Map<ComponentId, unknown>();

    // Bitwise math: find exactly what changed
    const addedBits = newMask & ~oldMask;
    const removedBits = oldMask & ~newMask;

    // 1. Collect existing data if entity was already in an archetype
    if (oldLocation) {
      const { arch, row } = oldLocation;
      for (const [compId, col] of arch.columns) {
        dataToMigrate.set(compId, col[row]);
      }

      // 2. Remove from old archetype (O(1) swap-and-pop)
      const movedEntityId = arch.removeEntity(row);

      // 3. Update the location of the entity that was swapped into our old row
      if (movedEntityId !== entity) {
        const movedLoc = this.entityToLocation.get(movedEntityId);
        if (movedLoc) movedLoc.row = row;
      }
    }

    // 4. Add new data if this was an 'add' operation
    if (newComponentId !== undefined) {
      dataToMigrate.set(newComponentId, newValue);
    } else {
      // If it was a 'remove' operation, we simply don't add the component
      // being removed to the dataToMigrate map.
    }

    // 5. Get or create the target archetype
    let targetArch = this.archetypes.get(newMask);
    if (!targetArch) {
      const componentIds = this.registeredComponents.filter(id =>
        (newMask & (1n << BigInt(id))) !== 0n
      );
      targetArch = new Archetype(newMask, componentIds);
      this.archetypes.set(newMask, targetArch);
    }

    // 6. Insert into target
    const newRow = targetArch.addEntity(entity, dataToMigrate);
    this.entityToLocation.set(entity, { arch: targetArch, row: newRow });

    // 7. Notify Observers (Post-Transmute)
    this.notifyObservers(entity, addedBits, removedBits);

  }

  private notifyObservers(entity: EntityId, added: bigint, removed: bigint): void {
    // Check all registered components for changes
    for (const compId of this.registeredComponents) {
      const bit = 1n << BigInt(compId);

      if ((added & bit) !== 0n) {
        this.onAddObservers.get(compId)?.forEach(cb => cb(entity, compId));
      }

      if ((removed & bit) !== 0n) {
        this.onRemoveObservers.get(compId)?.forEach(cb => cb(entity, compId));
      }
    }
  }

  public addComponent(entity: EntityId, componentId: ComponentId, value: unknown): void {
    const loc = this.entityToLocation.get(entity);
    const oldMask = loc?.arch.mask ?? 0n;
    const newMask = oldMask | (1n << BigInt(componentId));

    if (oldMask === newMask) return; // Already has it

    this.transmute(entity, newMask, componentId, value);
  }

  public removeComponent(entity: EntityId, componentId: ComponentId): void {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return;

    const oldMask = loc.arch.mask;
    const newMask = oldMask & ~(1n << BigInt(componentId));

    if (oldMask === newMask) return; // Didn't have it

    this.transmute(entity, newMask);
  }


  /**
   * The primary API for Systems to get matching data.
   */
  public getArchetypes(aspect: Aspect): Archetype[] {
    const key = `${aspect.all}-${aspect.one}-${aspect.exclude}`;

    // If we've seen this query before, return the cached list
    if (this.queryCache.has(key)) {
      return this.queryCache.get(key)!;
    }

    // Otherwise, build the cache for the first time
    const matches: Archetype[] = [];
    for (const arch of this.archetypes.values()) {
      if (aspect.matches(arch.mask)) {
        matches.push(arch);
      }
    }

    this.activeAspects.set(key, aspect);
    this.queryCache.set(key, matches);
    return matches;
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

  public *viewTag(tag: string): IterableIterator<EntityId> {
    const entity = this.tags.getEntity(tag);
    if (entity !== undefined) yield entity;
  }

  public query(aspect: bigint): EntityId[] {
    const results: EntityId[] = [];
    for (const arch of this.archetypes.values()) {
      if ((arch.mask & aspect) === aspect) {
        results.push(...arch.entities);
      }
    }
    return results;
  }

  // --- Updated Create Archetype Logic ---
  private getOrCreateArchetype(mask: bigint, componentIds: number[]): Archetype {
    let arch = this.archetypes.get(mask);
    if (!arch) {
      arch = new Archetype(mask, componentIds);
      this.archetypes.set(mask, arch);

      // CRITICAL: Update caches whenever a new memory layout is born
      this.registerArchetypeInCaches(arch);
    }
    return arch;
  }

  /**
   * Generates a new unique Entity ID, recycling old IDs if available.
   */
  public createEntity(): EntityId {
    if (this.freeEntities.length > 0) {
      return this.freeEntities.removeAt(this.freeEntities.length - 1) as EntityId;
    }
    return this.nextEntityId++;
  }

  /**
   * Deletes an entity, cleans up its data, and recycles its ID.
   */
  public deleteEntity(entity: EntityId): void {
    // 1. Clean up from Archetypes
    const loc = this.entityToLocation.get(entity);
    if (loc) {
      const movedEntityId = loc.arch.removeEntity(loc.row);

      // Update the row index of the entity that was swapped into this position
      if (movedEntityId !== entity) {
        const movedLoc = this.entityToLocation.get(movedEntityId);
        if (movedLoc) movedLoc.row = loc.row;
      }

      this.entityToLocation.delete(entity);
    }

    // 2. Clean up Tags and Groups
    this.tags.unregister(entity);
    this.groups.remove(entity);

    // 3. Recycle the ID
    this.freeEntities.add(entity);
  }


  /**
   * tarts a batch edit for an entity to avoid multiple memory moves.
   */
  public edit(entity: EntityId): EntityEditor {
    const loc = this.entityToLocation.get(entity);
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
    const oldLocation = this.entityToLocation.get(entity);
    if (oldLocation && oldLocation.arch.mask === newMask) {
      // optimization: if mask didn't change, just update values in place!
      for (const [id, val] of additions) {
        const col = oldLocation.arch.columns.get(id);
        if (col) col[oldLocation.row] = val;
      }
      return;
    }

    // Otherwise, perform the structural move (transmute)
    const dataToMigrate = new Map<ComponentId, unknown>();

    if (oldLocation) {
      const { arch, row } = oldLocation;
      for (const [compId, col] of arch.columns) {
        if (!removals.has(compId)) {
          dataToMigrate.set(compId, col[row]);
        }
      }
      // Remove from old... (standard swap-and-pop logic)
      const movedEntityId = arch.removeEntity(row);
      if (movedEntityId !== entity) {
        const movedLoc = this.entityToLocation.get(movedEntityId);
        if (movedLoc) movedLoc.row = row;
      }
    }

    // Merge in the new additions
    for (const [id, val] of additions) {
      dataToMigrate.set(id, val);
    }

    // Finish the move to the target archetype
    const targetArch = this.getOrCreateArchetype(newMask,
      this.registeredComponents.filter(id => (newMask & (1n << BigInt(id))) !== 0n)
    );
    const newRow = targetArch.addEntity(entity, dataToMigrate);
    this.entityToLocation.set(entity, { arch: targetArch, row: newRow });
  }


  /**
   * Resets the entire world state.
   * Useful for loading games or switching levels.
   */
  public clear(): void {
    this.entityToLocation.clear();
    this.archetypes.clear();
    this.nextEntityId = 0;
    this.freeEntities = new Bag<EntityId>();
    this.queryCache.clear();
    this.tags.load({});   // Using the load({}) we added to managers to reset them
    this.groups.load({});
  }





  /**
   * Creates a plain-object snapshot of the entire ECS state.
   */
  public saveSnapshot(): WorldSnapshot {
    const archetypeSnapshots = [];

    for (const [mask, arch] of this.archetypes) {
      const columnsData: Record<number, unknown[]> = {};

      for (const [compId, column] of arch.columns) {
        // We clone the column data to ensure the snapshot is immutable
        columnsData[compId] = [...column];
      }

      archetypeSnapshots.push({
        mask: mask.toString(), // BigInt must be stringified for JSON
        entities: [...arch.entities],
        columns: columnsData
      });
    }

    return {
      nextEntityId: this.nextEntityId,
      freeEntities: (this.freeEntities as unknown as Record<string, unknown[]>).data.filter(i => i !== null) as EntityId[],
      archetypes: archetypeSnapshots,
      tags: this.tags.save(),
      groups: this.groups.save()
    };
  }

  /**
   * Restores the world state from a snapshot.
   */
  public loadSnapshot(snapshot: WorldSnapshot): void {
    this.clear(); // Method to reset all maps and arrays
    this.nextEntityId = snapshot.nextEntityId;

    // 1. Rebuild Archetypes and Entity Locations
    for (const archData of snapshot.archetypes) {
      const mask = BigInt(archData.mask);
      const componentIds = Object.keys(archData.columns).map(Number);

      const arch = this.getOrCreateArchetype(mask, componentIds);
      arch.entities = archData.entities;

      for (const compId of componentIds) {
        arch.columns.set(compId, archData.columns[compId]);
      }

      // 2. Rebuild the entity-to-location index
      for (let row = 0; row < arch.entities.length; row++) {
        this.entityToLocation.set(arch.entities[row], { arch, row });
      }
    }

    // 3. Rebuild Tags and Groups
    this.tags.load(snapshot.tags);
    this.groups.load(snapshot.groups);
  }
}

