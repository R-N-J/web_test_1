import { EntityId, Archetype } from "./Archetype";
import { Bag } from "./Bag";

export interface EntityLocation {
  arch: Archetype;
  row: number;
}

export class EntityManager {
  private entityToLocation = new Map<EntityId, EntityLocation>();
  private nextEntityId = 0;
  private freeEntities = new Bag<EntityId>();

  public createEntity(): EntityId {
    if (this.freeEntities.length > 0) {
      return this.freeEntities.removeAt(this.freeEntities.length - 1) as EntityId;
    }
    return this.nextEntityId++;
  }

  public recycleEntity(entity: EntityId): void {
    this.freeEntities.add(entity);
    this.entityToLocation.delete(entity);
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
    return (this.freeEntities as unknown as { data: (EntityId | null)[] }).data.filter(i => i !== null) as EntityId[];
  }
}
