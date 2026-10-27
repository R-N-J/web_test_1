import { EntityId, ComponentId, Archetype } from "./Archetype";
import { Bag } from "./Bag";

// note: the only limit of this system is the memory available to store the versions array.
// It is set at 1024 at start, but will grow as needed.

export interface EntityLocation {
  arch: Archetype;
  row: number;
}

export const GENERATION_SHIFT = 65536;
export const MAX_GENERATION = 65535;

export class EntityManager {
  private entityToLocation = new Map<EntityId, EntityLocation>();
  private nextEntityId = 0;
  private freeEntities = new Bag<EntityId>();
  private freeEntitiesSet = new Set<EntityId>();
  private versions = new Uint32Array(1024); // Store versions for each index



  private ensureVersionCapacity(index: number): void {
    if (index >= this.versions.length) {
      const newCap = Math.max(index + 1, this.versions.length * 2);
      const newVersions = new Uint32Array(newCap);
      newVersions.set(this.versions);
      this.versions = newVersions;
    }
  }


  public createEntity(): EntityId {
    if (this.freeEntities.length > 0) {
      // The version is already incremented in recycleEntity, just return it
      const id = this.freeEntities.removeAt(this.freeEntities.length - 1) as EntityId;
      this.freeEntitiesSet.delete(id);
      return id;
    }

    const index = this.nextEntityId++;
    const maxSafeIndex = Math.floor(Number.MAX_SAFE_INTEGER / GENERATION_SHIFT);
    if (index > maxSafeIndex) {
      throw new Error(`Entity allocation limit exceeded: index ${index} exceeds maximum safe index ${maxSafeIndex}`);
    }
    this.ensureVersionCapacity(index); // Ensure we have room for this index
    const version = 1;
    this.versions[index] = version;
    return this.pack(index, version);
  }

  public recycleEntity(entity: EntityId): void {
    if (!this.isValid(entity)) {
      return;
    }

    const index = this.unpackIndex(entity);
    const currentGen = this.unpackVersion(entity);
    const nextGen = currentGen + 1;

    if (nextGen <= MAX_GENERATION) {
      this.versions[index] = nextGen;
      const newId = this.pack(index, nextGen);
      this.freeEntities.add(newId);
      this.freeEntitiesSet.add(newId);
    } else {
      // Permanently retire slot when reaching generation limit (ENT-011)
      this.versions[index] = 0;
    }

    this.entityToLocation.delete(entity);
  }

  // Arithmetic encoding: id = index * 65536 + generation
  // Supported index range: 0 .. 2^37 - 1, generation range: 1 .. 65,535
  private pack(index: number, version: number): EntityId {
    return index * GENERATION_SHIFT + version;
  }

  private unpackIndex(id: EntityId): number {
    return Math.floor(id / GENERATION_SHIFT);
  }

  private unpackVersion(id: EntityId): number {
    return id % GENERATION_SHIFT;
  }

  public isValid(entity: EntityId): boolean {
    if (typeof entity !== "number" || !Number.isSafeInteger(entity) || entity <= 0) {
      return false;
    }

    const generation = entity % GENERATION_SHIFT;
    if (generation < 1 || generation > MAX_GENERATION) {
      return false;
    }

    const index = Math.floor(entity / GENERATION_SHIFT);
    if (index < 0 || index >= this.nextEntityId) {
      return false;
    }

    if (this.versions[index] !== generation) {
      return false;
    }

    return !this.freeEntitiesSet.has(entity);
  }

  public setLocation(entity: EntityId, arch: Archetype, row: number): void {
    this.entityToLocation.set(entity, { arch, row });
  }

  public getLocation(entity: EntityId): EntityLocation | undefined {
    return this.entityToLocation.get(entity);
  }

  public removeLocation(entity: EntityId): void {
    this.entityToLocation.delete(entity);
  }

  /**
   * Validates that an existing EntityLocation is internally consistent with archetype storage.
   * Throws a descriptive error if storage corruption / location mismatch is detected.
   */
  public validateLocation(entity: EntityId, loc?: EntityLocation): void {
    const targetLoc = loc ?? this.entityToLocation.get(entity);
    if (!targetLoc) return;
    const { arch, row } = targetLoc;
    if (
      typeof row !== "number" ||
      !Number.isInteger(row) ||
      row < 0 ||
      row >= arch.entities.length ||
      arch.entities[row] !== entity
    ) {
      throw new Error(
        `[ECS] Inconsistent entity location for entity ${entity}: row ${row} does not match archetype storage.`
      );
    }
  }

  /**
   * Safely retrieves a component value for an entity.
   * Leverages the Archetype.getValue helper for type safety.
   */
  public getComponentValue<T>(entity: EntityId, componentId: ComponentId): T | undefined {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return undefined;
    this.validateLocation(entity, loc);
    if (!loc.arch.hasComponent(componentId)) return undefined;
    return loc.arch.getValue<T>(componentId, loc.row);
  }

  /**
   * Non-structural write: sets the component value for an entity WITHOUT changing archetype.
   * Returns false if entity/component doesn't exist.
   */
  public setComponentValue<T>(entity: EntityId, componentId: ComponentId, value: T): boolean {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return false;
    this.validateLocation(entity, loc);

    const col = loc.arch.columns.get(componentId);
    if (!col) return false;

    col[loc.row] = value as unknown;
    return true;
  }

  /**
   * Non-structural update: reads current value, computes next value, writes it back.
   * Great for numbers/immutable updates (hp = hp - 1, etc).
   */
  public updateComponentValue<T>(
    entity: EntityId,
    componentId: ComponentId,
    updater: (current: T) => T
  ): boolean {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return false;
    this.validateLocation(entity, loc);

    const col = loc.arch.columns.get(componentId);
    if (!col) return false;

    const current = col[loc.row] as T;
    col[loc.row] = updater(current) as unknown;
    return true;
  }

  /**
   * Non-structural mutate: gives you the live object reference and lets you mutate in place.
   * Best for object components (Position, Stats objects, etc).
   */
  public mutateComponent<T>(
    entity: EntityId,
    componentId: ComponentId,
    mutator: (value: T) => void
  ): boolean {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return false;
    this.validateLocation(entity, loc);

    const col = loc.arch.columns.get(componentId);
    if (!col) return false;

    mutator(col[loc.row] as T);
    return true;
  }

  /**
   * Checks if an entity possesses a specific component.
   */
  public hasComponent(entity: EntityId, componentId: ComponentId): boolean {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return false;
    this.validateLocation(entity, loc);
    return loc.arch.hasComponent(componentId);
  }

  /**
   * Returns the current component bitmask of an entity.
   */
  public getMask(entity: EntityId): bigint {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return 0n;
    this.validateLocation(entity, loc);
    return loc.arch.mask;
  }


  public clear(): void {
    this.entityToLocation.clear();

    // Clear the free entity lists and rebuild them with advanced generations
    this.freeEntities = new Bag<EntityId>();
    this.freeEntitiesSet.clear();

    // Advance generation for every allocated index (0 <= index < this.nextEntityId)
    // so any pre-clear EntityId becomes permanently invalid and cannot be resurrected (ENT-010).
    for (let i = 0; i < this.nextEntityId; i++) {
      if (this.versions[i] > 0) {
        const nextGen = this.versions[i] + 1;
        if (nextGen <= MAX_GENERATION) {
          this.versions[i] = nextGen;
          const newFreeId = this.pack(i, nextGen);
          this.freeEntities.add(newFreeId);
          this.freeEntitiesSet.add(newFreeId);
        } else {
          // Permanently retire slot when reaching generation limit (ENT-011)
          this.versions[i] = 0;
        }
      }
    }
  }


  /**
   * Hard reset: drops allocated buffers and returns to initial capacity.
   * Optional, but handy for tests or extreme resets.
   */
  public hardReset(): void {
    this.entityToLocation.clear();
    this.nextEntityId = 0;
    this.freeEntities = new Bag<EntityId>();
    this.freeEntitiesSet.clear();
    this.versions = new Uint32Array(1024);
  }

  public getNextEntityId(): number {
    return this.nextEntityId;
  }

  public setNextEntityId(id: number): void {
    this.nextEntityId = id;
    // Safety: ensure we have version storage for the new ID range immediately
    if (id > 0) this.ensureVersionCapacity(id - 1);
  }

  public getFreeEntities(): EntityId[] {
    return this.freeEntities.toArray();
  }

  /**
   * Restores the recycled-ID pool from a snapshot.
   * This keeps entity ID reuse deterministic across save/load.
   */
  public loadFreeEntities(free: EntityId[]): void {
    this.freeEntities = new Bag<EntityId>();
    this.freeEntitiesSet.clear();
    for (const id of free) {
      this.freeEntities.add(id);
      this.freeEntitiesSet.add(id);
    }
  }

  /**
   * Returns a JSON-safe snapshot of entity versions for indices [0..nextEntityId).
   */
  public saveVersions(): number[] {
    return Array.from(this.versions.subarray(0, this.nextEntityId));
  }

  /**
   * Restores entity versions (generations). Expects versions for indices [0..nextEntityId).
   */
  public loadVersions(versions: number[]): void {
    if (versions.length === 0) return;

    // Ensure capacity for the incoming data
    this.ensureVersionCapacity(versions.length - 1);

    // Reset and restore
    this.versions.fill(0);
    for (let i = 0; i < versions.length; i++) {
      this.versions[i] = versions[i] >>> 0;
    }

    // Logic Improvement: sync nextEntityId if the versions array is larger than current
    if (versions.length > this.nextEntityId) {
      this.nextEntityId = versions.length;
    }
  }

}
