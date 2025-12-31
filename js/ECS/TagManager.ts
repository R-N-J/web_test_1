import { EntityId } from "./Archetype";

/**
 * Manages unique string tags for entities (1-to-1 mapping).
 */
export class TagManager {
  private tags = new Map<string, EntityId>();
  private entities = new Map<EntityId, string>();

  public register(tag: string, entity: EntityId): void {
    // If the entity already has a different tag, remove the old one first
    const existingTag = this.entities.get(entity);
    if (existingTag && existingTag !== tag) {
      this.tags.delete(existingTag);
    }

    if (this.tags.has(tag) && this.tags.get(tag) !== entity) {
      const msg = `[ECS] CRITICAL: Tag Collision! Tag '${tag}' is already assigned to entity ${this.tags.get(tag)}. Cannot reassign to ${entity}.`;
      console.error(msg);
      throw new Error(msg);
    }
    this.tags.set(tag, entity);
    this.entities.set(entity, tag);
  }

  /**
   * Unified API: Returns a stream containing the tagged entity if valid.
   */
  public *view(tag: string, world: { isValid(id: EntityId): boolean }): IterableIterator<EntityId> {
    const entity = this.tags.get(tag);
    if (entity !== undefined && world.isValid(entity)) yield entity;
  }

  /**
   * Unified API: Returns an array containing the tagged entity if valid.
   */
  public getEntities(tag: string, world: { isValid(id: EntityId): boolean }): EntityId[] {
    const entity = this.tags.get(tag);
    return (entity !== undefined && world.isValid(entity)) ? [entity] : [];
  }

  /**
   * Unified API: Returns the tagged entity if valid.
   */
  public findFirst(tag: string, world: { isValid(id: EntityId): boolean }): EntityId | undefined {
    const entity = this.tags.get(tag);
    return (entity !== undefined && world.isValid(entity)) ? entity : undefined;
  }

  /**
   * Unified API: Returns 1 if the tag exists and is valid, 0 otherwise.
   */
  public count(tag: string, world: { isValid(id: EntityId): boolean }): number {
    const entity = this.tags.get(tag);
    return (entity !== undefined && world.isValid(entity)) ? 1 : 0;
  }



  /**
   * Checks if an entity is currently assigned any tag.
   */
  public isTagged(entity: EntityId): boolean {
    return this.entities.has(entity);
  }


  public getEntity(tag: string): EntityId | undefined {
    return this.tags.get(tag);
  }

  /**
   * Returns true if the specific tag is currently assigned.
   */
  public has(tag: string): boolean {
    return this.tags.has(tag);
  }

  /**
   * Returns the tag assigned to a specific entity, if any.
   */
  public getTag(entity: EntityId): string | undefined {
    return this.entities.get(entity);
  }

  /**
   * Returns all registered tags.
   */
  public getTags(): string[] {
    return Array.from(this.tags.keys());
  }

  public unregister(entity: EntityId): void {
    const tag = this.entities.get(entity);
    if (tag) {
      this.tags.delete(tag);
      this.entities.delete(entity);
    }
  }

  public save(): Record<string, EntityId> {
    const data: Record<string, EntityId> = {};
    for (const [tag, id] of this.tags) {
      data[tag] = id;
    }
    return data;
  }

  public load(data: Record<string, EntityId>): void {
    this.tags.clear();
    this.entities.clear();
    for (const [tag, id] of Object.entries(data)) {
      this.register(tag, id);
    }
  }



}
