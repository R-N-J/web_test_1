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
   * Returns the number of entities in a group.
   */
  public count(group: string): number {
    return this.groups.get(group)?.size ?? 0;
  }

  /**
   * Removes an entity from one specific group.
   */
  public removeFromGroup(group: string, entity: EntityId): void {
    this.groups.get(group)?.delete(entity);
    this.entityToGroups.get(entity)?.delete(group);
  }


  public getEntities(group: string): EntityId[] {
    const set = this.groups.get(group);
    return set ? Array.from(set) : [];
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
