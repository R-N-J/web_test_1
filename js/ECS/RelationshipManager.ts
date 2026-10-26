import { EntityId, ComponentId, MAX_COMPONENT_ID, isValidComponentId } from "./Archetype";
import { USER_COMPONENT_ID_START } from "./InternalComponents";
import { EntityManager } from "./EntityManager";
import { ComponentManager } from "./ComponentManager";

export class RelationshipManager {
  /**
   * Index for fast cleanup: TargetEntityId -> Map<RelationId, Set<SubjectEntityId>>
   * This allows O(1) lookups to find who is pointing at a deleted entity.
   */
  private targetToSubjects = new Map<EntityId, Map<ComponentId, Set<EntityId>>>();

  /**
   * Set of component IDs explicitly registered or used as relationships.
   * Prevents rebuild() from mistaking regular numeric components (e.g. HP: 0) for relationship targets.
   */
  private registeredRelations = new Set<ComponentId>();

  constructor(
    private entities: EntityManager,
    private components: ComponentManager
  ) {}

  /**
   * Explicitly registers a component ID as a relationship type.
   */
  public registerRelation(relationId: ComponentId): void {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    if (relationId < USER_COMPONENT_ID_START && !this.components.isRegistered(relationId)) {
      throw new Error(`[ECS] Cannot register unregistered reserved component ID: ${relationId}. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
    }
    this.registeredRelations.add(relationId);
    this.components.addRegisteredComponent(relationId);
  }

  /**
   * Returns true if the component ID has been registered as a relationship.
   */
  public isRegisteredRelation(relationId: ComponentId): boolean {
    return this.registeredRelations.has(relationId);
  }

  /**
   * Links a subject to a target.
   * @param exclusive If true, replaces existing target. If false, adds to a collection.
   */
  public add(subject: EntityId, relationId: ComponentId, target: EntityId, exclusive = true): void {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    if (relationId < USER_COMPONENT_ID_START && !this.components.isRegistered(relationId)) {
      throw new Error(`[ECS] Cannot add unregistered reserved component ID: ${relationId}. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
    }
    if (!this.entities.isValid(target) || !this.entities.isValid(subject)) return;

    this.registeredRelations.add(relationId);
    this.components.addRegisteredComponent(relationId);

    const hasRelation = this.entities.hasComponent(subject, relationId);

    if (exclusive) {
      // If component already exists, we must untrack the old target(s) first
      if (hasRelation) {
        const oldTarget = this.entities.getComponentValue<EntityId | Set<EntityId>>(subject, relationId);
        if (oldTarget !== undefined) {
          if (oldTarget instanceof Set) {
            for (const t of oldTarget) this.untrackTarget(t, relationId, subject);
          } else if (typeof oldTarget === "number") {
            this.untrackTarget(oldTarget, relationId, subject);
          }
        }

        this.entities.setComponentValue(subject, relationId, target);
        this.trackTarget(target, relationId, subject);
        return;
      }

      // Otherwise, structural add
      const loc = this.entities.getLocation(subject);
      const oldMask = loc?.arch.mask ?? 0n;
      this.components.transmute(subject, oldMask | (1n << BigInt(relationId)), relationId, target);
      this.trackTarget(target, relationId, subject);
      return;
    }

    // One-to-Many logic using a Set
    const existing = this.getTargets(subject, relationId);

    if (existing instanceof Set) {
      if (!existing.has(target)) {
        existing.add(target);
        this.trackTarget(target, relationId, subject);
      }
      return;
    }

    const newSet = new Set<EntityId>();
    if (existing !== undefined) {
      newSet.add(existing);
      // existing was already tracked as a single value, no need to re-track
    }
    newSet.add(target);
    this.trackTarget(target, relationId, subject);

    if (hasRelation) {
      this.entities.setComponentValue(subject, relationId, newSet);
      return;
    }

    const loc = this.entities.getLocation(subject);
    const oldMask = loc?.arch.mask ?? 0n;
    this.components.transmute(subject, oldMask | (1n << BigInt(relationId)), relationId, newSet);
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
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const targets = this.getTargets(subject, relationId);
    if (targets === undefined) return [];
    if (targets instanceof Set) return Array.from(targets);
    return [targets];
  }


  /**
   * Removes a specific target from a relationship.
   * If target is omitted, removes all targets for that relation on subject.
   */
  public remove(subject: EntityId, relationId: ComponentId, target?: EntityId): void {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const loc = this.entities.getLocation(subject);
    if (!loc) return;

    const val = loc.arch.columns.get(relationId)?.[loc.row];
    if (val === undefined) return;

    if (val instanceof Set && target !== undefined) {
      if (val.has(target)) {
        val.delete(target);
        this.untrackTarget(target, relationId, subject);
      }
      if (val.size === 0) {
        this.removeComponent(subject, relationId);
      }
    } else if (target !== undefined) {
      // 1-to-1 relationship: only remove if the current target matches the requested target
      if (val === target) {
        if (typeof val === "number") {
          this.untrackTarget(val, relationId, subject);
        }
        this.removeComponent(subject, relationId);
      }
    } else {
      // If no target specified, remove the whole component and untrack all its targets
      if (typeof val === "number") {
        this.untrackTarget(val, relationId, subject);
      } else if (val instanceof Set) {
        for (const t of val) this.untrackTarget(t, relationId, subject);
      }
      this.removeComponent(subject, relationId);
    }
  }

  private trackTarget(target: EntityId, relationId: ComponentId, subject: EntityId): void {
    if (!this.targetToSubjects.has(target)) {
      this.targetToSubjects.set(target, new Map());
    }
    const relations = this.targetToSubjects.get(target)!;
    if (!relations.has(relationId)) {
      relations.set(relationId, new Set());
    }
    relations.get(relationId)!.add(subject);
  }

  private untrackTarget(target: EntityId, relationId: ComponentId, subject: EntityId): void {
    const relations = this.targetToSubjects.get(target);
    if (!relations) return;
    const subjects = relations.get(relationId);
    if (subjects) {
      subjects.delete(subject);
      if (subjects.size === 0) relations.delete(relationId);
    }
    if (relations.size === 0) this.targetToSubjects.delete(target);
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
   * Rebuilds the back-reference index by scanning all archetypes.
   * Useful after loading a snapshot.
   */
  public rebuild(): void {
    this.clear();

    for (const arch of this.components.getArchetypes()) {
      for (const [compId, column] of arch.columns) {
        if (!this.registeredRelations.has(compId)) continue;

        for (let i = 0; i < arch.entities.length; i++) {
          const val = column[i];
          const subject = arch.entities[i];

          if (typeof val === "number" && this.entities.isValid(val)) {
            this.trackTarget(val, compId, subject);
          } else if (val instanceof Set) {
            for (const target of val) {
              if (typeof target === "number" && this.entities.isValid(target)) {
                this.trackTarget(target, compId, subject);
              }
            }
          }
        }
      }
    }
  }


  /**
   * Returns the target(s) of a relationship.
   * Returns a single EntityId for exclusive, or a Set<EntityId> for non-exclusive.
   */
  public getTargets(subject: EntityId, relationId: ComponentId): EntityId | Set<EntityId> | undefined {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const val = this.entities.getComponentValue<EntityId | Set<EntityId>>(subject, relationId);

    if (val === undefined) return undefined;

    if (val instanceof Set) {
      // Logic Improvement: filter out any recycled/deleted targets from the live Set
      for (const id of val) {
        if (!this.entities.isValid(id)) val.delete(id);
      }
      return val.size > 0 ? val : undefined;
    }

    return this.entities.isValid(val) ? val : undefined;
  }


  /**
   * Finds all entities that point to a specific target.
   * Now handles both raw IDs and Sets.
   */
  public *getRelated(relationId: ComponentId, target: EntityId): IterableIterator<EntityId> {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    if (!this.entities.isValid(target)) return;

    for (const arch of this.components.getArchetypes()) {
      const column = arch.columns.get(relationId);
      if (!column) continue;

      for (let i = 0; i < arch.entities.length; i++) {
        const val = column[i];
        const subject = arch.entities[i];

        if (!this.entities.isValid(subject)) continue;

        if (val === target || (val instanceof Set && val.has(target))) {
          yield subject;
        }
      }
    }
  }
  /**
   * Returns the number of entities that point to a specific target via a relation.
   */
  public countRelated(relationId: ComponentId, target: EntityId): number {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    if (!this.entities.isValid(target)) return 0;

    let count = 0;
    for (const arch of this.components.getArchetypes()) {
      const column = arch.columns.get(relationId);
      if (!column) continue;

      for (let i = 0; i < arch.entities.length; i++) {
        const val = column[i];
        const subject = arch.entities[i];
        if (!this.entities.isValid(subject)) continue;

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
  public clearRelations(subject: EntityId, relationId: ComponentId): void {
    if (!isValidComponentId(relationId)) {
      throw new Error(`[ECS] Invalid Component ID: ${relationId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    this.remove(subject, relationId);
  }

  /**
   * Resets the entire internal index.
   * Call this during World.clear() to drop all indexing data.
   */
  public clear(): void {
    this.targetToSubjects.clear();
  }


  public cleanup(deletedEntity: EntityId): void {
    // 1. Clean up incoming relations (entities pointing TO deletedEntity)
    const relations = this.targetToSubjects.get(deletedEntity);
    if (relations) {
      // Use a copy of the relations to avoid concurrent modification issues during removal
      const relationEntries = Array.from(relations.entries());

      for (const [relationId, subjects] of relationEntries) {
        const subjectArray = Array.from(subjects);
        for (const subject of subjectArray) {
          this.remove(subject, relationId, deletedEntity);
        }
      }

      this.targetToSubjects.delete(deletedEntity);
    }

    // 2. Clean up outgoing relations (targets that deletedEntity was pointing to)
    const loc = this.entities.getLocation(deletedEntity);
    if (loc) {
      for (const [compId, column] of loc.arch.columns) {
        if (this.registeredRelations.has(compId)) {
          const val = column[loc.row];
          if (typeof val === "number") {
            this.untrackTarget(val, compId, deletedEntity);
          } else if (val instanceof Set) {
            for (const t of val) {
              if (typeof t === "number") {
                this.untrackTarget(t, compId, deletedEntity);
              }
            }
          }
        }
      }
    }
  }




}
