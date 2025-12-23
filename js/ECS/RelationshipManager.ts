import { EntityId, ComponentId } from "./Archetype";
import { EntityManager } from "./EntityManager";
import { ComponentManager } from "./ComponentManager";

export class RelationshipManager {
  constructor(
    private entities: EntityManager,
    private components: ComponentManager
  ) {}

  /**
   * Links a subject to a target.
   * @param exclusive If true, replaces existing target. If false, adds to a collection.
   */
  public add(subject: EntityId, relationId: ComponentId, target: EntityId, exclusive = true): void {
    if (!this.entities.isValid(target) || !this.entities.isValid(subject)) return;

    this.components.addRegisteredComponent(relationId);

    if (exclusive) {
      // Standard 1-to-1 or Many-to-1 logic
      const loc = this.entities.getLocation(subject);
      const oldMask = loc?.arch.mask ?? 0n;
      this.components.transmute(subject, oldMask | (1n << BigInt(relationId)), relationId, target);
    } else {
      // One-to-Many logic using a Set
      const existing = this.getTargets(subject, relationId);
      if (existing instanceof Set) {
        existing.add(target);
      } else {
        const newSet = new Set<EntityId>();
        newSet.add(target);
        const loc = this.entities.getLocation(subject);
        const oldMask = loc?.arch.mask ?? 0n;
        this.components.transmute(subject, oldMask | (1n << BigInt(relationId)), relationId, newSet);
      }
    }
  }

  /**
   * Creates a two-way link between two entities.
   * Useful for: Soul Bonds, Teleporters, Marriage, etc.
   */
  public addSymmetric(entityA: EntityId, entityB: EntityId, relationId: ComponentId): void {
    this.add(entityA, relationId, entityB, true);
    this.add(entityB, relationId, entityA, true);
  }


  /**
   * Returns a clean array of targets, regardless of whether it's 1-to-1 or 1-to-Many.
   * This is very helpful for "foreach" loops in your systems.
   */
  public getTargetsArray(subject: EntityId, relationId: ComponentId): EntityId[] {
    const targets = this.getTargets(subject, relationId);
    if (targets === undefined) return [];
    if (targets instanceof Set) return Array.from(targets);
    return [targets];
  }


  /**
   * Removes a specific target from a relationship.
   */
  public remove(subject: EntityId, relationId: ComponentId, target?: EntityId): void {
    const loc = this.entities.getLocation(subject);
    if (!loc) return;

    const val = loc.arch.columns.get(relationId)?.[loc.row];

    if (val instanceof Set && target !== undefined) {
      val.delete(target);
      if (val.size === 0) {
        this.removeComponent(subject, relationId);
      }
    } else {
      // If no target specified or it's a single value, remove the whole component
      this.removeComponent(subject, relationId);
    }
  }

  private removeComponent(subject: EntityId, relationId: ComponentId): void {
    const currentMask = this.entities.getMask(subject);
    const bit = 1n << BigInt(relationId);

    if ((currentMask & bit) !== 0n) {
      const newMask = currentMask & ~bit;
      this.components.transmute(subject, newMask);
    }
  }
  /**
   * Returns the target(s) of a relationship.
   * Returns a single EntityId for exclusive, or a Set<EntityId> for non-exclusive.
   */
  public getTargets(subject: EntityId, relationId: ComponentId): EntityId | Set<EntityId> | undefined {
    return this.entities.getComponentValue<EntityId | Set<EntityId>>(subject, relationId);  }



  /**
   * Finds all entities that point to a specific target.
   * Now handles both raw IDs and Sets.
   */
  public *getRelated(relationId: ComponentId, target: EntityId): IterableIterator<EntityId> {
    for (const arch of this.components.getArchetypes()) {
      const column = arch.columns.get(relationId);
      if (!column) continue;

      for (let i = 0; i < arch.entities.length; i++) {
        const val = column[i];
        if (val === target || (val instanceof Set && val.has(target))) {
          yield arch.entities[i];
        }
      }
    }
  }

  /**
   * Returns the number of entities that point to a specific target via a relation.
   */
  public countRelated(relationId: ComponentId, target: EntityId): number {
    let count = 0;
    for (const arch of this.components.getArchetypes()) {
      const column = arch.columns.get(relationId);
      if (!column) continue;

      for (let i = 0; i < arch.entities.length; i++) {
        const val = column[i];
        if (val === target || (val instanceof Set && val.has(target))) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Removes all targets for a specific relationship on a subject.
   */
  public clear(subject: EntityId, relationId: ComponentId): void {
    this.removeComponent(subject, relationId);
  }

  public cleanup(deletedEntity: EntityId): void {
    for (const arch of this.components.getArchetypes()) {
      for (const [compId, column] of arch.columns) {
        for (let i = arch.entities.length - 1; i >= 0; i--) {
          const val = column[i];
          if (val === deletedEntity) {
            this.remove(arch.entities[i], compId);
          } else if (val instanceof Set && val.has(deletedEntity)) {
            val.delete(deletedEntity);
            if (val.size === 0) {
              this.remove(arch.entities[i], compId);
            }
          }
        }
      }
    }
  }
}
