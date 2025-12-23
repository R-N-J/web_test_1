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
    this.freeEntities = new Bag<EntityId>();
  }

  public getNextEntityId(): number {
    return this.nextEntityId;
  }

  public setNextEntityId(id: number): void {
    this.nextEntityId = id;
  }

  public getFreeEntities(): EntityId[] {
    return this.freeEntities.toArray();
  }
}
