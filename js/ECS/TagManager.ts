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

    if (this.tags.has(tag)) {
      throw new Error(`Tag ${tag} is already assigned to entity ${this.tags.get(tag)}`);
    }
    this.tags.set(tag, entity);
    this.entities.set(entity, tag);
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
