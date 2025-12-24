import { EntityId, ComponentId, Archetype } from "./Archetype";
import { Bag } from "./Bag";

// note: the only limit of this system is the memory available to store the versions array.
// It is set at 1024 at start, but will grow as needed.

export interface EntityLocation {
  arch: Archetype;
  row: number;
}

export class EntityManager {
  private entityToLocation = new Map<EntityId, EntityLocation>();
  private nextEntityId = 0;
  private freeEntities = new Bag<EntityId>();
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
      return this.freeEntities.removeAt(this.freeEntities.length - 1) as EntityId;
    }

    const index = this.nextEntityId++;
    this.ensureVersionCapacity(index); // Ensure we have room for this index
    const version = 1;
    this.versions[index] = version;
    return this.pack(index, version);
  }

  public recycleEntity(entity: EntityId): void {
    const index = this.unpackIndex(entity);
    let newVersion = (this.unpackVersion(entity) + 1) & 0xFF; // because of 8-bit, Wraps at 255

    // If we hit 0, bump it to 1 to avoid 'null-like' IDs.  Just in case if it was used as a "null" or "uninitialized" marker
    if (newVersion === 0) newVersion = 1;

    const newId = this.pack(index, newVersion);
    this.versions[index] = newVersion;

    this.freeEntities.add(newId);
    this.entityToLocation.delete(entity);
  }

  // Helpers to pack/unpack bits (24 bits for index, 8 bits for the version)
  // that is 16.7M entities with 255 versions each
  private pack(index: number, version: number): EntityId {
    return (index << 8) | version;
  }

  private unpackIndex(id: EntityId): number {
    return id >> 8;
  }

  private unpackVersion(id: EntityId): number {
    return id & 0xFF;
  }

  public isValid(entity: EntityId): boolean {
    const index = this.unpackIndex(entity);
    return this.versions[index] === this.unpackVersion(entity) && this.entityToLocation.has(entity);
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
   * Safely retrieves a component value for an entity.
   * Leverages the Archetype.getValue helper for type safety.
   */
  public getComponentValue<T>(entity: EntityId, componentId: ComponentId): T | undefined {
    const loc = this.entityToLocation.get(entity);
    if (!loc || !loc.arch.hasComponent(componentId)) return undefined;
    return loc.arch.getValue<T>(componentId, loc.row);
  }

  /**
   * Non-structural write: sets the component value for an entity WITHOUT changing archetype.
   * Returns false if entity/component doesn't exist.
   */
  public setComponentValue<T>(entity: EntityId, componentId: ComponentId, value: T): boolean {
    const loc = this.entityToLocation.get(entity);
    if (!loc) return false;

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
    return loc ? loc.arch.hasComponent(componentId) : false;
  }

  /**
   * Returns the current component bitmask of an entity.
   */
  public getMask(entity: EntityId): bigint {
    const loc = this.entityToLocation.get(entity);
    return loc ? loc.arch.mask : 0n;
  }


  public clear(): void {
    this.entityToLocation.clear();
    this.nextEntityId = 0;
    // Reuse Bag storage if you want; if not available, recreate it (your current approach).
    this.freeEntities = new Bag<EntityId>();

    // Reset versions so any old EntityId becomes invalid after a clear.
    // This keeps behavior predictable across world resets / snapshot loads.
    this.versions.fill(0);
  }


  /**
   * Hard reset: drops allocated buffers and returns to initial capacity.
   * Optional, but handy for tests or extreme resets.
   */
  public hardReset(): void {
    this.entityToLocation.clear();
    this.nextEntityId = 0;
    this.freeEntities = new Bag<EntityId>();
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
    for (const id of free) {
      this.freeEntities.add(id);
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
