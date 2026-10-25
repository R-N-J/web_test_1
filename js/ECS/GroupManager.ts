import { EntityId } from "./Archetype";

/**
 * Manages collections of entities by group name (1-to-many mapping).
 */
export class GroupManager {
  private groups = new Map<string, Set<EntityId>>();
  private entityToGroups = new Map<EntityId, Set<string>>();

  public add(group: string, entity: EntityId): void {
    if (!this.groups.has(group)) this.groups.set(group, new Set());
    if (!this.entityToGroups.has(entity)) this.entityToGroups.set(entity, new Set());

    this.groups.get(group)!.add(entity);
    this.entityToGroups.get(entity)!.add(group);
  }

  /**
   * Checks if a group contains a specific entity.
   */
  public has(group: string, entity: EntityId): boolean {
    return this.groups.get(group)?.has(entity) ?? false;
  }


  /**
   * Removes an entity from one specific group.
   */
  public removeFromGroup(group: string, entity: EntityId): void {
    this.groups.get(group)?.delete(entity);
    this.entityToGroups.get(entity)?.delete(group);
  }

  /**
   * Unified API: Returns a stream of all valid entities in the group.
   */
  public *view(group: string, world: { isValid(id: EntityId): boolean }): IterableIterator<EntityId> {
    const set = this.groups.get(group);
    if (!set) return;
    for (const id of set) {
      if (world.isValid(id)) yield id;
    }
  }

  /**
   * Unified API: Returns an array of all valid entities in a group.
   */
  public getEntities(group: string, world: { isValid(id: EntityId): boolean }): EntityId[] {
    const set = this.groups.get(group);
    if (!set) return [];
    return Array.from(set).filter(id => world.isValid(id));
  }

  /**
   * Unified API: Returns the first valid entity in the group.
   */
  public findFirst(group: string, world: { isValid(id: EntityId): boolean }): EntityId | undefined {
    const set = this.groups.get(group);
    if (!set) return undefined;
    for (const id of set) {
      if (world.isValid(id)) return id;
    }
    return undefined;
  }

  /**
   * Unified API: Returns the number of entities currently in the group.
   * When called without a world object, returns the raw count of all tracked entity IDs in the group.
   * When a world object is provided, filters and counts only currently valid entities.
   *
   * @param group The group name to count.
   * @param world Optional World validator to count only valid entities.
   * @returns The raw tracked count if world is omitted, or the count of valid entities if world is provided.
   */
  public count(group: string, world?: { isValid(id: EntityId): boolean }): number {
    const set = this.groups.get(group);
    if (!set) return 0;
    if (!world) return set.size;
    let count = 0;
    for (const id of set) {
      if (world.isValid(id)) count++;
    }
    return count;
  }

  /**
   * Returns all group names this entity belongs to.
   */
  public getGroups(entity: EntityId): string[] {
    const set = this.entityToGroups.get(entity);
    return set ? Array.from(set) : [];
  }

  /**
   * Returns all registered group names.
   */
  public getGroupNames(): string[] {
    return Array.from(this.groups.keys());
  }

  public remove(entity: EntityId): void {
    const groups = this.entityToGroups.get(entity);
    if (groups) {
      for (const groupName of groups) {
        this.groups.get(groupName)?.delete(entity);
      }
      this.entityToGroups.delete(entity);
    }
  }

  public save(): Record<string, EntityId[]> {
    const data: Record<string, EntityId[]> = {};
    for (const [groupName, entities] of this.groups) {
      data[groupName] = Array.from(entities);
    }
    return data;
  }

  public load(data: Record<string, EntityId[]>): void {
    this.groups.clear();
    this.entityToGroups.clear();
    for (const [groupName, entities] of Object.entries(data)) {
      for (const id of entities) {
        this.add(groupName, id);
      }
    }
  }


}
