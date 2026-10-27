import { Aspect } from "./Aspect";
import { Archetype, EntityId, ComponentId, MAX_COMPONENT_ID, isValidComponentId } from "./Archetype";
import { USER_COMPONENT_ID_START } from "./InternalComponents";
import { TagManager } from "./TagManager";
import { GroupManager } from "./GroupManager";
import { EntityEditor } from "./EntityEditor";
import { EntityManager, GENERATION_SHIFT, MAX_GENERATION } from "./EntityManager";
import { QueryManager } from "./QueryManager";
import { ComponentManager, ComponentObserver, MaskObserver } from "./ComponentManager";
import { RelationshipManager, createReadOnlySetView } from "./RelationshipManager";
import { PrefabManager } from "./PrefabManager";
import type { ComponentSerializer } from "./ComponentManager";
import { Mapper } from "./Mapper";
import { EventBus } from "../core/EventBus"; // Add this import from Core
import { SceneManager } from "./SceneManager";
import { TurnManager } from "./TurnManager";
import { Scheduler } from "./Scheduler"; // Add this import
import { AssetManager } from "./AssetManager";
import { StorageManager } from "./StorageManager";

type DeferredOp =
  | { type: 'ADD'; entity: EntityId; component: ComponentId; value: unknown }
  | { type: 'REMOVE'; entity: EntityId; component: ComponentId }
  | { type: 'DELETE'; entity: EntityId }
  | { type: 'BATCH'; entity: EntityId; mask: bigint; additions: Map<ComponentId, unknown>; removals: Set<ComponentId> };


export interface WorldSnapshot {
  version: number;
  nextEntityId: number;
  /**
   * Entity generation/version values for indices [0..nextEntityId).
   * Used to keep EntityId validity deterministic across save/load.
   */
  entityVersions: number[];
  freeEntities: EntityId[];
  archetypes: {
    mask: string;
    entities: EntityId[];
    columns: Record<number, unknown[]>;
  }[];
  tags: Record<string, EntityId>;
  groups: Record<string, EntityId[]>;
}

export const ECS_SNAPSHOT_VERSION = 2;



export class World {
  private entities = new EntityManager();
  private queries = new QueryManager();
  private components = new ComponentManager(this.entities, this.queries);
  public readonly relationships = new RelationshipManager(this.entities, this.components);
  public readonly prefabs = new PrefabManager(this);
  private activeEditors = new Set<EntityEditor>(); // NEW: Track uncommitted builders

  private mapperCache = new Map<ComponentId, Mapper<unknown>>();
  public readonly assets = new AssetManager();
  public readonly storage = new StorageManager(this);
  public readonly events = new EventBus();

  public readonly tags = new TagManager();
  public readonly groups = new GroupManager();
  public scenes?: SceneManager; // Make this optional until scheduler is set
  public turns?: TurnManager;  // Make this optional until scheduler is set

  private singletonEntity: EntityId;

  private deferredQueue: DeferredOp[] = [];
  private _isDeferred = false;

  public scheduler?: Scheduler;

  constructor() {
    this.singletonEntity = this.createEntity();
    this.tags.register("__world_singletons__", this.singletonEntity);
    // SceneManager requires a scheduler, so we initialize it in setScheduler()
  }

  /**
   * Links the scheduler to the world and initializes dependent managers.
   */
  public setScheduler(scheduler: Scheduler): void {
    this.scheduler = scheduler;
    if (!this.scenes) {
      this.scenes = new SceneManager(this, scheduler);
    }
    if (!this.turns) {
      this.turns = new TurnManager(this, scheduler);
    }
  }

  /**
   * Returns the internal entity ID used for global singletons.
   * Useful for targeted updates via updateComponent or mutateComponent.
   */
  public getSingletonEntity(): EntityId {
    return this.singletonEntity;
  }

  /**
   * Sets or updates a global singleton component.
   */
  public setSingleton<T>(id: ComponentId, value: T): void {
    this.addComponent(this.singletonEntity, id, value);
  }

  /**
   * Retrieves a global singleton component.
   */
  public getSingleton<T>(id: ComponentId): T | undefined {
    return this.getComponent<T>(this.singletonEntity, id);
  }


  /**
   * Retrieves a global singleton. If it doesn't exist, it creates it
   * using the provided default value.
   *
   * Pro Pattern: Use this in System.onEnable() or constructors to ensure
   * global resources are initialized without external dependencies.
   */
  public getOrCreateSingleton<T>(id: ComponentId, defaultValue: T): T {
    const existing = this.getSingleton<T>(id);
    if (existing !== undefined) {
      return existing;
    }

    this.setSingleton<T>(id, defaultValue);
    return defaultValue;
  }


  /**
   * Checks if a global singleton component exists.
   */
  public hasSingleton(id: ComponentId): boolean {
    return this.hasComponent(this.singletonEntity, id);
  }


  /**
   * Subscribe to structural changes (entity mask changes).
   */
  public subscribeOnMaskChange(observer: MaskObserver): void {
    this.components.subscribeOnMaskChange(observer);
  }

  public unsubscribeOnMaskChange(observer: MaskObserver): void {
    this.components.unsubscribeOnMaskChange(observer);
  }


  /**
   * Registers a user-defined component ID with the ECS.
   * User component IDs must be in the range 100..65535 (0..99 are reserved for internal engine components).
   */
  public registerComponent(id: ComponentId): void {
    if (!isValidComponentId(id) || id < USER_COMPONENT_ID_START) {
      throw new Error(`[ECS] Invalid User Component ID: ${id}. User Component IDs must be in range ${USER_COMPONENT_ID_START}..${MAX_COMPONENT_ID} (0..${USER_COMPONENT_ID_START - 1} are reserved for engine components).`);
    }
    this.components.addRegisteredComponent(id);
  }

  /**
   * Registers a serializer for a specific component ID.
   * This is used by snapshot save/load to handle non-JSON-native component values (Set, Map, custom classes, etc.).
   */
  public registerComponentSerializer(id: ComponentId, serializer: ComponentSerializer): void {
    this.components.registerSerializer(id, serializer);
  }

  /**
   * Creates a deep clone of a component value using registered serializers or the default deep-clone policy.
   */
  public cloneValue(id: ComponentId, value: unknown): unknown {
    return this.components.cloneValue(id, value);
  }

  /**
   * Subscribes a callback to be called when a component is added to an entity.
   */
  public subscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    this.components.subscribeOnAdd(id, observer);
  }

  /**
   * Subscribes a callback to be called when a component is removed from an entity.
   */
  public subscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    this.components.subscribeOnRemove(id, observer);
  }

  public unsubscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    this.components.unsubscribeOnAdd(id, observer);
  }

  public unsubscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    this.components.unsubscribeOnRemove(id, observer);
  }

  /**
   * Returns whether deferred mode is currently active.
   */
  public get isDeferred(): boolean {
    return this._isDeferred;
  }

  /**
   * Enables or disables deferred mode.
   * When true, structural changes are queued instead of applied immediately.
   */
  public setDeferred(state: boolean): void {
    this._isDeferred = state;
    if (!state && this.deferredQueue.length > 0) {
      this.flush();
    }
  }

  public addComponent(entity: EntityId, componentId: ComponentId, value: unknown): void {
    if (!isValidComponentId(componentId)) {
      throw new Error(`[ECS] Invalid Component ID: ${componentId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    if (componentId < USER_COMPONENT_ID_START && !this.components.isRegistered(componentId)) {
      throw new Error(`[ECS] Cannot add unregistered reserved component ID: ${componentId}. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
    }

    if (!this.isValid(entity)) {
      return;
    }

    if (this._isDeferred) {
      this.deferredQueue.push({ type: 'ADD', entity, component: componentId, value });
      return;
    }

    this.components.addRegisteredComponent(componentId);

    const isRel = this.relationships.isRegisteredRelation(componentId);
    let oldVal: unknown;
    if (isRel) {
      const current = this.entities.getComponentValue(entity, componentId);
      oldVal = current instanceof Set ? new Set(current) : current;
    }
    const valToStore = (isRel && value instanceof Set) ? new Set(value) : value;

    // If the entity already has this component, treat this as "replace value" (non-structural).
    if (this.entities.hasComponent(entity, componentId)) {
      this.entities.setComponentValue(entity, componentId, valToStore);
      if (isRel) {
        this.relationships.reconcile(entity, componentId, oldVal, valToStore);
      }
      return;
    }

    // Otherwise, this is a structural change (add the component bit -> transmute).
    const loc = this.entities.getLocation(entity);
    const oldMask = loc?.arch.mask ?? 0n;
    const newMask = oldMask | (1n << BigInt(componentId));

    this.components.transmute(entity, newMask, componentId, valToStore);
    if (isRel) {
      this.relationships.reconcile(entity, componentId, undefined, valToStore);
    }
  }

  public removeComponent(entity: EntityId, componentId: ComponentId): void {
    if (!isValidComponentId(componentId)) {
      throw new Error(`[ECS] Invalid Component ID: ${componentId}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }

    if (!this.isValid(entity)) {
      return;
    }

    if (this._isDeferred) {
      this.deferredQueue.push({ type: 'REMOVE', entity, component: componentId });
      return;
    }

    const loc = this.entities.getLocation(entity);
    if (!loc || !loc.arch.hasComponent(componentId)) {
      return; // Absent component: safe no-op
    }

    const oldMask = loc.arch.mask;
    const newMask = oldMask & ~(1n << BigInt(componentId));

    if (oldMask === newMask) return; // Didn't have it

    const isRel = this.relationships.isRegisteredRelation(componentId);
    let oldVal: unknown;
    if (isRel) {
      const current = this.entities.getComponentValue(entity, componentId);
      oldVal = current instanceof Set ? new Set(current) : current;
    }

    this.components.transmute(entity, newMask);
    if (isRel) {
      this.relationships.reconcile(entity, componentId, oldVal, undefined);
    }
  }

  /**
   * Unified API: Returns raw matching Archetypes.
   * Best for high-performance systems overriding processArchetype.
   */
  public getArchetypes(aspect: Aspect): Archetype[] {
    return this.queries.getArchetypes(aspect, this.components.getArchetypes());
  }






  /**
   * SECTION: Unified Query API
   * Consistent access patterns for finding entities.
   */

  // --- Aspect Based (Multi-entity search) ---
  /**
   * Primary streaming iterator for systems.
   */
  public* view(aspect: Aspect): IterableIterator<EntityId> {
    yield* this.queries.view(aspect, this.components.getArchetypes());
  }
  /**
   * Returns a snapshot array of all matching entities.
   */
  public getEntities(aspect: Aspect): EntityId[] {
    return this.queries.getEntities(aspect, this.components.getArchetypes());
  }
  /**
   * Returns the first entity that matches the aspect.
   */
  public findFirst(aspect: Aspect): EntityId | undefined {
    return this.queries.findFirst(aspect, this.components.getArchetypes());
  }
  /**
   * Returns the total count of entities matching the aspect.
   */
  public count(aspect: Aspect): number {
    return this.queries.count(aspect, this.components.getArchetypes());
  }

  // --- Group Based (Set-entity search) ---
  public* viewGroup(group: string): IterableIterator<EntityId> {
    yield* this.groups.view(group, this);
  }
  public getEntitiesByGroup(group: string): EntityId[] {
    return this.groups.getEntities(group, this);
  }
  public findFirstInGroup(group: string): EntityId | undefined {
    return this.groups.findFirst(group, this);
  }
  public countGroup(group: string): number {
    return this.groups.count(group, this);
  }

  // --- Tag Based (Unique-entity search) ---
  public* viewTag(tag: string): IterableIterator<EntityId> {
    yield* this.tags.view(tag, this);
  }
  public getEntitiesByTag(tag: string): EntityId[] {
    return this.tags.getEntities(tag, this);
  }
  public findFirstWithTag(tag: string): EntityId | undefined {
    return this.tags.findFirst(tag, this);
  }
  public countTag(tag: string): number {
    return this.tags.count(tag, this);
  }


  /**
   * Checks if an entity matches a specific Aspect.
   */
  public matches(entity: EntityId, aspect: Aspect): boolean {
    if (!this.isValid(entity)) return false;
    const mask = this.entities.getMask(entity);
    return aspect.matches(mask);
  }



  /**
   * Fast-path iterator that yields raw SoA columns for matching archetypes.
   * If a matching archetype is missing a requested component column, that column will be undefined.
   *
   * Example usage:
   * for (const { entities, columns: [pos, vel] } of world.viewColumns(aspect, POS, VEL)) { ... }
   */
  public* viewColumns(
    aspect: Aspect,
    ...componentIds: ComponentId[]
  ): IterableIterator<{ arch: Archetype; entities: EntityId[]; columns: (unknown[] | undefined)[] }> {
    for (const id of componentIds) {
      if (!isValidComponentId(id)) {
        throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
    }

    const archetypes = this.getArchetypes(aspect);

    for (const arch of archetypes) {
      if (arch.entities.length === 0) continue;

      const cols: (unknown[] | undefined)[] = [];
      for (const id of componentIds) {
        const col = arch.getColumn<unknown>(id);
        cols.push(col);
      }

      yield { arch, entities: arch.entities, columns: cols };
    }
  }

  /**
   * Strict fast-path iterator: yields raw SoA columns for matching archetypes.
   * Throws if any matching archetype is missing a requested column.
   *
   * Use this when your Aspect logically guarantees the columns exist (e.g. Aspect.all(...)).
   * This helps catch registration/serialization mistakes early.
   */
  public* viewColumnsStrict(
    aspect: Aspect,
    ...componentIds: ComponentId[]
  ): IterableIterator<{ arch: Archetype; entities: EntityId[]; columns: unknown[][] }> {
    for (const id of componentIds) {
      if (!isValidComponentId(id)) {
        throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
    }

    const archetypes = this.getArchetypes(aspect);

    for (const arch of archetypes) {
      const cols: unknown[][] = [];

      for (const id of componentIds) {
        const col = arch.getColumn<unknown>(id);
        if (!col) {
          throw new Error(
            `viewColumnsStrict: archetype mask=${arch.mask.toString()} is missing column for componentId=${id}`
          );
        }
        cols.push(col);
      }

      if (arch.entities.length === 0) continue;

      yield { arch, entities: arch.entities, columns: cols };
    }
  }


  /**
   * Returns the tag assigned to an entity, if any.
   * Useful for identifying special entities in logs or UI.
   */
  public getEntityTag(entity: EntityId): string | undefined {
    return this.tags.getTag(entity);
  }


  /**
   * Safely retrieves a component value for an entity.
   */
  public getComponent<T>(entity: EntityId, id: ComponentId): T | undefined {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const val = this.entities.getComponentValue<T>(entity, id);
    if (val instanceof Set && this.relationships.isRegisteredRelation(id)) {
      return createReadOnlySetView(val) as unknown as T;
    }
    return val;
  }

  /**
   * Non-structural write (no archetype move). Returns false if entity/component doesn't exist.
   */
  public setComponent<T>(entity: EntityId, id: ComponentId, value: T): boolean {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const isRel = this.relationships.isRegisteredRelation(id);
    let oldVal: unknown;
    if (isRel) {
      const current = this.entities.getComponentValue(entity, id);
      oldVal = current instanceof Set ? new Set(current) : current;
    }
    const valToStore = (isRel && value instanceof Set) ? new Set(value) as unknown as T : value;
    const success = this.entities.setComponentValue(entity, id, valToStore);
    if (success && isRel) {
      this.relationships.reconcile(entity, id, oldVal, valToStore);
    }
    return success;
  }

  /**
   * Non-structural update (no archetype move). Returns false if entity/component doesn't exist.
   */
  public updateComponent<T>(entity: EntityId, id: ComponentId, updater: (current: T) => T): boolean {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const isRel = this.relationships.isRegisteredRelation(id);
    let oldVal: unknown;
    if (isRel) {
      const current = this.entities.getComponentValue(entity, id);
      oldVal = current instanceof Set ? new Set(current) : current;
    }
    const success = this.entities.updateComponentValue(entity, id, updater);
    if (success && isRel) {
      const currentVal = this.entities.getComponentValue(entity, id);
      const valToStore = currentVal instanceof Set ? new Set(currentVal) : currentVal;
      if (currentVal instanceof Set) {
        this.entities.setComponentValue(entity, id, valToStore);
      }
      this.relationships.reconcile(entity, id, oldVal, valToStore);
    }
    return success;
  }

  /**
   * Non-structural mutation (no archetype move). Returns false if entity/component doesn't exist.
   */
  public mutateComponent<T>(entity: EntityId, id: ComponentId, mutator: (value: T) => void): boolean {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    const isRel = this.relationships.isRegisteredRelation(id);
    let oldVal: unknown;
    if (isRel) {
      const current = this.entities.getComponentValue(entity, id);
      oldVal = current instanceof Set ? new Set(current) : current;
    }
    const success = this.entities.mutateComponent(entity, id, mutator);
    if (success && isRel) {
      const newVal = this.entities.getComponentValue(entity, id);
      this.relationships.reconcile(entity, id, oldVal, newVal);
    }
    return success;
  }


  /**
   * Checks if an entity possesses a specific component.
   */
  public hasComponent(entity: EntityId, id: ComponentId): boolean {
    if (!isValidComponentId(id)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    return this.entities.hasComponent(entity, id);
  }

  /**
   * Checks if an entity is still active and hasn't been recycled.
   */
  public isValid(entity: EntityId): boolean {
    return this.entities.isValid(entity);
  }

  /**
   * Returns the current component mask for an entity.
   */
  public getMask(entity: EntityId): bigint {
    return this.entities.getMask(entity);
  }

  /**
   * Returns the total number of unique archetypes in the world.
   */
  public getArchetypeCount(): number {
    return this.components.getArchetypeCount();
  }

  /**
   * Returns the total number of active entities in the world.
   */
  public getEntityCount(): number {
    let total = 0;
    for (const arch of this.components.getArchetypes()) {
      total += arch.entities.length;
    }
    return total;
  }

  /**
   * Returns all component IDs currently registered in the engine.
   */
  public getRegisteredComponents(): ComponentId[] {
    return this.components.getRegisteredComponents();
  }

  /**
   * Checks if a component ID is registered in the engine.
   */
  public isComponentRegistered(id: ComponentId): boolean {
    return this.components.isRegistered(id);
  }


  /**
   * Generates a new unique Entity ID, recycling old IDs if available.
   */
  public createEntity(): EntityId {
    return this.entities.createEntity();
  }

  /**
   * Deletes an entity, cleans up its data, and recycles its ID.
   * If the entity is invalid or has already been deleted, this operation is a safe no-op.
   */
  public deleteEntity(entity: EntityId): void {
    // Safety: prevent accidental deletion of the global singleton entity
    if (entity === this.singletonEntity) {
      console.error("Critical Error: Attempted to delete the Singleton Entity.");
      return;
    }
    if (!this.isValid(entity)) {
      return;
    }

    if (this._isDeferred) {
      this.deferredQueue.push({ type: 'DELETE', entity });
      return;
    }

    // Validate archetype location consistency before performing any mutations
    const initialLoc = this.entities.getLocation(entity);
    if (initialLoc) {
      this.entities.validateLocation(entity, initialLoc);
    }

    // 0. Clean up relationships pointing TO this entity
    this.relationships.cleanup(entity);

    // 1. Clean up from Archetypes (re-fetch location as cleanup may transmute self-referential relations)
    const loc = this.entities.getLocation(entity);
    const oldMask = loc?.arch.mask ?? 0n;

    if (loc) {
      const movedEntityId = loc.arch.removeEntity(loc.row);
      if (movedEntityId === undefined) {
        throw new Error(
          `[ECS] Failed to remove entity ${entity} from archetype row ${loc.row}.`
        );
      }

      if (movedEntityId !== entity) {
        const movedLoc = this.entities.getLocation(movedEntityId);
        if (movedLoc) {
          this.entities.setLocation(movedEntityId, movedLoc.arch, loc.row);
        }
      }

      this.entities.removeLocation(entity);
    }

    // NEW: structural exit event (entity is effectively removed from all aspects)
    if (oldMask !== 0n) {
      this.components.emitMaskChange(entity, oldMask, 0n);
    }

    // 2. Clean up Tags and Groups
    this.tags.unregister(entity);
    this.groups.remove(entity);

    // 3. Recycle the ID
    this.entities.recycleEntity(entity);
  }

  /**
   * Fluent API: Creates a new entity and returns an editor to build it.
   * Logic: In our framework, editors are auto-committed during flush()
   * so the user can just chain .add() calls and be done.
   */
  public create(): EntityEditor {
    const entity = this.createEntity();
    return this.edit(entity);
  }

  /**
   * Starts a batch edit for an entity.
   * Tracks the editor so it can be auto-committed if the user forgets.
   */
  public edit(entity: EntityId): EntityEditor {
    const loc = this.entities.getLocation(entity);
    const editor = new EntityEditor(this, entity, loc?.arch.mask ?? 0n);
    this.activeEditors.add(editor);
    return editor;
  }

  /**
   * Used by EntityEditor.commit() to remove itself from the tracking Set.
   */
  public finalizeEditor(editor: EntityEditor): void {
    this.activeEditors.delete(editor);
  }


  /**
   * Fluent API: Creates a new entity and returns an editor to build it.
   * Usage: world.buildEntity().add(ID, val).tag('hero').commit();
   */
  public buildEntity(): EntityEditor {
    const entity = this.createEntity();
    return this.edit(entity);
  }

  /**
   * Creates an exact structural and data copy of an existing entity.
   * Note: Tags are NOT duplicated as they must be unique.
   *
   * Planned to be used for Mirror Image or Doppelganger effect.
   *
   * @param source The entity to duplicate.
   * @returns The new entity ID.
   */
  public duplicateEntity(source: EntityId): EntityId {
    if (!this.isValid(source)) {
      throw new Error(`Cannot duplicate invalid entity: ${source}`);
    }

    const newEntity = this.createEntity();
    const sourceMask = this.getMask(source);
    const editor = this.edit(newEntity);

    // Iterate through all registered components and copy if present on source
    for (const compId of this.getRegisteredComponents()) {
      const bit = 1n << BigInt(compId);
      if ((sourceMask & bit) !== 0n) {
        const val = this.entities.getComponentValue(source, compId);
        // Deep clone the value via ComponentManager logic
        editor.add(compId, this.components.cloneValue(compId, val));
      }
    }

    editor.commit();

    // Add to same groups as source
    for (const groupName of this.groups.getGroups(source)) {
      this.groups.add(groupName, newEntity);
    }

    return newEntity;
  }


  /**
   * Used by EntityEditor to perform one structural move (single batch move).
   */
  public applyBatchChanges(
    entity: EntityId,
    newMask: bigint,
    additions: Map<ComponentId, unknown>,
    removals: Set<ComponentId>
  ): void {
    if (!this.isValid(entity)) {
      return;
    }
    for (const id of additions.keys()) {
      if (!isValidComponentId(id)) {
        throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
      if (id < USER_COMPONENT_ID_START && !this.components.isRegistered(id)) {
        throw new Error(`[ECS] Cannot add unregistered reserved component ID: ${id}. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`);
      }
    }
    for (const id of removals) {
      if (!isValidComponentId(id)) {
        throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
      }
    }
    if (this._isDeferred) {
      this.deferredQueue.push({ type: 'BATCH', entity, mask: newMask, additions: new Map(additions), removals: new Set(removals) });
      return;
    }

    // Pre-record old values for relationship components in additions or removals
    const relOldValues = new Map<ComponentId, unknown>();
    for (const id of removals) {
      if (this.relationships.isRegisteredRelation(id)) {
        const current = this.entities.getComponentValue(entity, id);
        relOldValues.set(id, current instanceof Set ? new Set(current) : current);
      }
    }
    for (const id of additions.keys()) {
      if (this.relationships.isRegisteredRelation(id)) {
        const current = this.entities.getComponentValue(entity, id);
        relOldValues.set(id, current instanceof Set ? new Set(current) : current);
      }
    }

    const processedAdditions = new Map<ComponentId, unknown>();
    for (const [id, val] of additions) {
      const isRel = this.relationships.isRegisteredRelation(id);
      processedAdditions.set(id, (isRel && val instanceof Set) ? new Set(val) : val);
    }

    for (const id of processedAdditions.keys()) {
      this.components.addRegisteredComponent(id);
    }
    this.components.applyBatchChanges(entity, newMask, processedAdditions, removals);

    // Reconcile relationship reverse index for all modified relationship components
    for (const id of removals) {
      if (this.relationships.isRegisteredRelation(id)) {
        this.relationships.reconcile(entity, id, relOldValues.get(id), undefined);
      }
    }
    for (const [id, val] of processedAdditions) {
      if (this.relationships.isRegisteredRelation(id)) {
        this.relationships.reconcile(entity, id, relOldValues.get(id), val);
      }
    }
  }

  /**
   * Executes all queued structural changes AND any uncommitted editors..
   */
  public flush(): void {
    const wasDeferred = this._isDeferred;
    this._isDeferred = false;
    try {
      // 1. Auto-commit any editors created during systems execution
      for (const editor of Array.from(this.activeEditors)) {
        editor.commit(); // This now removes itself from the Set via finalizeEditor
      }

      // 2. Process the structural queue (ADD, REMOVE, DELETE)
      while (this.deferredQueue.length > 0) {
        const op = this.deferredQueue.shift()!;
        if (!this.isValid(op.entity)) continue;

        switch (op.type) {
          case 'ADD': this.addComponent(op.entity, op.component, op.value); break;
          case 'REMOVE': this.removeComponent(op.entity, op.component); break;
          case 'DELETE': this.deleteEntity(op.entity); break;
          case 'BATCH': this.applyBatchChanges(op.entity, op.mask, op.additions, op.removals); break;
        }
      }
    } finally {
      this._isDeferred = wasDeferred;
    }
  }


  /**
   * Returns a Component Mapper for ultra-fast access.
   * Mappers are cached and reused for the same ComponentId.
   */
  public getMapper<T>(id: ComponentId): Mapper<T> {
    let mapper = this.mapperCache.get(id);
    if (!mapper) {
      // Create as unknown and store it
      mapper = new Mapper<unknown>(this, id);
      this.mapperCache.set(id, mapper);
    }
    // Cast to the requested generic type T when returning
    return mapper as unknown as Mapper<T>;
  }


  /**
   * Resets the entire world state.
   * Useful for loading games or switching levels.
   */
  public clear(): void {
    this._isDeferred = false;
    // 1. Clear Entities and their recycling versions
    this.entities.clear();
    // 2. Clear Archetype data and observers
    this.components.clear();
    this.components.clearObservers(); // Ensure old callbacks don't fire on new entities
    // 3. Clear the Query cache
    this.queries.clear();
    // 4. Reset Tags and Groups
    this.tags.load({}); // TagManager.load({}) effectively clears it
    this.groups.load({}); // GroupManager.load({}) effectively clears it
    // 5. Reset Relationship index
    this.relationships.clear();
    // Clear the mapper cache to avoid holding references to old World state
    this.mapperCache.clear();
    // 6. Clear Event Bus handlers
    this.events.clear();
    // 7. Clear Active Editors and Deferred Queue
    for (const editor of this.activeEditors) {
      editor.cancel();
    }
    this.activeEditors.clear();
    this.deferredQueue = [];
    // 8. Recreate the singleton entity
    this.singletonEntity = this.createEntity();
    this.tags.register("__world_singletons__", this.singletonEntity);

    // 9. Rebind active systems from scheduler
    this.scheduler?.rebind();
    // Note: PrefabManager doesn't usually need clearing as
    // blueprints persist across level changes.
    // Note: Usually we don't clear assets here as they persist across levels,
    // but the option is there if needed.
  }

  /**
   * Creates a plain-object snapshot of the entire ECS state.
   */
  public saveSnapshot(): WorldSnapshot {
    const archetypeSnapshots = [];

    for (const [mask, arch] of this.components.getArchetypeMap()) {
      if (arch.entities.length === 0) continue;

      const columnsData: Record<number, unknown[]> = {};
      for (const [compId, column] of arch.columns) {
        // Serialize + clone each value to keep snapshot immutable
        columnsData[compId] = column.map(v => this.components.serializeValue(compId, v));
      }

      archetypeSnapshots.push({
        mask: mask.toString(),
        entities: [...arch.entities],
        columns: columnsData
      });
    }

    return {
      version: ECS_SNAPSHOT_VERSION,
      nextEntityId: this.entities.getNextEntityId(),
      entityVersions: this.entities.saveVersions(),
      freeEntities: this.entities.getFreeEntities(),
      archetypes: archetypeSnapshots,
      tags: this.tags.save(),
      groups: this.groups.save()
    };
  }

  /**
   * Prepares the World to load a snapshot.
   *
   * - Clears runtime state (entities, archetypes, queries, tags, groups)
   * - Keeps component IDs + serializers intact (unless your code explicitly resets them)
   * - Optionally runs a registrar callback to (re)register component IDs/serializers
   */
  public resetForLoad(registrar?: (world: World) => void): void {
    this.clear();

    // Ensure any caller can re-register component IDs and serializers at the right time.
    // (Useful if you ever create a brand new World instance or you want explicit bootstrapping.)
    registrar?.(this);
  }


  /**
   * Restores the world state from a snapshot.
   */
  public loadSnapshot(snapshot: WorldSnapshot): void {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error(`[ECS] Invalid snapshot: snapshot must be a non-null object.`);
    }

    if (snapshot.version !== ECS_SNAPSHOT_VERSION) {
      throw new Error(
        `Unsupported ECS snapshot version: ${snapshot.version}. Expected: ${ECS_SNAPSHOT_VERSION}`
      );
    }

    const maxSafeIndex = Math.floor(Number.MAX_SAFE_INTEGER / GENERATION_SHIFT);

    if (
      typeof snapshot.nextEntityId !== "number" ||
      !Number.isSafeInteger(snapshot.nextEntityId) ||
      snapshot.nextEntityId < 0 ||
      snapshot.nextEntityId > maxSafeIndex ||
      !Array.isArray(snapshot.entityVersions) ||
      !Array.isArray(snapshot.freeEntities) ||
      !Array.isArray(snapshot.archetypes) ||
      !snapshot.tags || typeof snapshot.tags !== "object" || Array.isArray(snapshot.tags) ||
      !snapshot.groups || typeof snapshot.groups !== "object" || Array.isArray(snapshot.groups)
    ) {
      throw new Error(`[ECS] Malformed snapshot: invalid nextEntityId or missing required snapshot structures.`);
    }

    // 1. Validate entityVersions
    if (snapshot.entityVersions.length < snapshot.nextEntityId) {
      throw new Error(
        `[ECS] Malformed snapshot: entityVersions length (${snapshot.entityVersions.length}) must be at least nextEntityId (${snapshot.nextEntityId}).`
      );
    }

    for (let i = 0; i < snapshot.entityVersions.length; i++) {
      const v = snapshot.entityVersions[i];
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > MAX_GENERATION) {
        throw new Error(
          `[ECS] Malformed snapshot: invalid entity version in entityVersions (${v} at index ${i}). Versions must be integers in range 0..${MAX_GENERATION}.`
        );
      }
    }

    // 2. Validate freeEntities
    const freeEntitiesSet = new Set<EntityId>();
    for (let i = 0; i < snapshot.freeEntities.length; i++) {
      const freeId = snapshot.freeEntities[i];
      if (typeof freeId !== "number" || !Number.isSafeInteger(freeId) || freeId <= 0) {
        throw new Error(`[ECS] Malformed freeEntities ID at index ${i}: must be a positive safe integer.`);
      }
      const idx = Math.floor(freeId / GENERATION_SHIFT);
      const gen = freeId % GENERATION_SHIFT;
      if (idx < 0 || idx >= snapshot.nextEntityId) {
        throw new Error(`[ECS] Malformed freeEntities ID ${freeId}: index ${idx} out of range [0..${snapshot.nextEntityId}).`);
      }
      if (gen < 1 || gen > MAX_GENERATION) {
        throw new Error(`[ECS] Malformed freeEntities ID ${freeId}: generation ${gen} out of range [1..${MAX_GENERATION}].`);
      }
      if (snapshot.entityVersions[idx] !== gen) {
        throw new Error(
          `[ECS] Malformed freeEntities ID ${freeId}: generation ${gen} does not match entityVersions[${idx}] (${snapshot.entityVersions[idx]}).`
        );
      }
      if (freeEntitiesSet.has(freeId)) {
        throw new Error(`[ECS] Malformed freeEntities: duplicate free entity ID ${freeId}.`);
      }
      freeEntitiesSet.add(freeId);
    }

    const isValidSnapshotAllocatedEntity = (id: EntityId): boolean => {
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return false;
      const idx = Math.floor(id / GENERATION_SHIFT);
      const gen = id % GENERATION_SHIFT;
      if (idx < 0 || idx >= snapshot.nextEntityId) return false;
      if (gen < 1 || gen > MAX_GENERATION) return false;
      if (snapshot.entityVersions[idx] !== gen) return false;
      return !freeEntitiesSet.has(id);
    };

    // 3. Pre-validate and stage archetypes, masks, columns, and deserialized component values
    interface StagedArchetype {
      mask: bigint;
      componentIds: ComponentId[];
      entities: EntityId[];
      columns: Map<ComponentId, unknown[]>;
    }

    const stagedArchetypes: StagedArchetype[] = [];
    const allLiveEntities = new Set<EntityId>();
    const seenArchetypeMasks = new Set<bigint>();

    for (let archIdx = 0; archIdx < snapshot.archetypes.length; archIdx++) {
      const archData = snapshot.archetypes[archIdx];
      if (
        !archData ||
        typeof archData !== "object" ||
        Array.isArray(archData) ||
        typeof archData.mask !== "string" ||
        !Array.isArray(archData.entities) ||
        !archData.columns ||
        typeof archData.columns !== "object" ||
        Array.isArray(archData.columns)
      ) {
        throw new Error(`[ECS] Malformed archetype data at index ${archIdx} in snapshot.`);
      }

      // Validate mask string
      if (!/^[0-9]+$/.test(archData.mask)) {
        throw new Error(`[ECS] Malformed archetype mask: "${archData.mask}" is not a valid non-negative integer string.`);
      }

      let parsedMask: bigint;
      try {
        parsedMask = BigInt(archData.mask);
      } catch {
        throw new Error(`[ECS] Malformed archetype mask: "${archData.mask}" could not be parsed as BigInt.`);
      }

      if (parsedMask < 0n) {
        throw new Error(`[ECS] Malformed archetype mask: mask must be non-negative.`);
      }

      if (seenArchetypeMasks.has(parsedMask)) {
        throw new Error(`[ECS] Malformed snapshot: duplicate archetype mask ${parsedMask} at index ${archIdx}.`);
      }
      seenArchetypeMasks.add(parsedMask);

      const rawColumnKeys = Object.keys(archData.columns);
      const componentIds: ComponentId[] = [];
      const seenComponentIds = new Set<ComponentId>();
      let expectedMask = 0n;

      for (const rawKey of rawColumnKeys) {
        const compId = Number(rawKey);
        if (!isValidComponentId(compId) || String(compId) !== rawKey) {
          throw new Error(
            `[ECS] Invalid Component ID: ${rawKey} in snapshot. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`
          );
        }
        if (seenComponentIds.has(compId)) {
          throw new Error(`[ECS] Duplicate component column ${compId} in archetype.`);
        }
        seenComponentIds.add(compId);
        componentIds.push(compId);

        if (compId < USER_COMPONENT_ID_START && !this.components.isRegistered(compId)) {
          throw new Error(
            `[ECS] Cannot load snapshot with unregistered reserved component ID: ${compId}. Component IDs 0..${USER_COMPONENT_ID_START - 1} are reserved for internal engine components.`
          );
        }

        const rawColumn = archData.columns[compId];
        if (!Array.isArray(rawColumn) || rawColumn.length !== archData.entities.length) {
          throw new Error(
            `[ECS] Malformed column data for component ${compId} in snapshot: column length must match entities length.`
          );
        }

        expectedMask |= (1n << BigInt(compId));
      }

      if (parsedMask !== expectedMask) {
        throw new Error(
          `[ECS] Archetype mask mismatch: mask ${parsedMask} does not match component columns mask ${expectedMask}.`
        );
      }

      // Validate entities in this archetype
      for (let entIdx = 0; entIdx < archData.entities.length; entIdx++) {
        const ent = archData.entities[entIdx];
        if (!isValidSnapshotAllocatedEntity(ent)) {
          throw new Error(
            `[ECS] Malformed or invalid entity ID ${ent} in archetype mask ${parsedMask}.`
          );
        }
        if (allLiveEntities.has(ent)) {
          throw new Error(
            `[ECS] Duplicate entity ID ${ent} found across snapshot archetypes.`
          );
        }
        allLiveEntities.add(ent);
      }

      // Pre-deserialize all column values (if a custom deserializer throws, it fails before world mutation)
      const stagedColumns = new Map<ComponentId, unknown[]>();
      for (const compId of componentIds) {
        const rawColumn = archData.columns[compId];
        const decoded = rawColumn.map(v => this.components.deserializeValue(compId, v));

        // Validate relationship component values if compId is explicitly registered as a relationship
        if (this.relationships.isRegisteredRelation(compId)) {
          for (let rowIdx = 0; rowIdx < decoded.length; rowIdx++) {
            const relVal = decoded[rowIdx];
            const subject = archData.entities[rowIdx];

            if (typeof relVal === "number") {
              if (!isValidSnapshotAllocatedEntity(relVal)) {
                throw new Error(
                  `[ECS] Malformed relationship in snapshot: component ${compId} on entity ${subject} contains invalid or unallocated target entity ID: ${relVal}.`
                );
              }
            } else if (relVal instanceof Set) {
              for (const target of relVal) {
                if (typeof target !== "number" || !isValidSnapshotAllocatedEntity(target)) {
                  throw new Error(
                    `[ECS] Malformed relationship in snapshot: component ${compId} on entity ${subject} contains invalid or unallocated target in Set: ${String(target)}.`
                  );
                }
              }
            } else {
              throw new Error(
                `[ECS] Malformed relationship in snapshot: component ${compId} on entity ${subject} has unsupported value type (${typeof relVal}). Relationship values must be an EntityId number or Set<EntityId>.`
              );
            }
          }
        }

        stagedColumns.set(compId, decoded);
      }

      stagedArchetypes.push({
        mask: parsedMask,
        componentIds,
        entities: [...archData.entities],
        columns: stagedColumns
      });
    }

    // 4. Validate tags
    const taggedEntities = new Set<EntityId>();
    for (const [tag, ent] of Object.entries(snapshot.tags)) {
      if (typeof tag !== "string" || tag.length === 0) {
        throw new Error(`[ECS] Malformed tag: tag name must be a non-empty string.`);
      }
      if (!isValidSnapshotAllocatedEntity(ent)) {
        throw new Error(`[ECS] Malformed tag: entity ID ${ent} for tag "${tag}" is invalid or unallocated.`);
      }
      if (taggedEntities.has(ent)) {
        throw new Error(`[ECS] Malformed snapshot: entity ${ent} assigned to multiple tags.`);
      }
      taggedEntities.add(ent);
    }

    // 5. Validate groups
    for (const [groupName, entities] of Object.entries(snapshot.groups)) {
      if (typeof groupName !== "string" || groupName.length === 0) {
        throw new Error(`[ECS] Malformed group: group name must be a non-empty string.`);
      }
      if (!Array.isArray(entities)) {
        throw new Error(`[ECS] Malformed group "${groupName}": entities must be an array.`);
      }
      const groupEntitySet = new Set<EntityId>();
      for (const ent of entities) {
        if (!isValidSnapshotAllocatedEntity(ent)) {
          throw new Error(`[ECS] Malformed group "${groupName}": entity ID ${ent} is invalid or unallocated.`);
        }
        if (groupEntitySet.has(ent)) {
          throw new Error(`[ECS] Malformed group "${groupName}": duplicate entity ID ${ent}.`);
        }
        groupEntitySet.add(ent);
      }
    }

    // =========================================================================
    // Transactional Commit Phase: All validations passed, execute destructive load
    // =========================================================================
    this.resetForLoad();

    this.entities.setNextEntityId(snapshot.nextEntityId);
    this.entities.loadVersions(snapshot.entityVersions);
    this.entities.loadFreeEntities(snapshot.freeEntities);

    for (const staged of stagedArchetypes) {
      const arch = this.components.getOrCreateArchetype(staged.mask, staged.componentIds);
      arch.entities = staged.entities;

      for (const compId of staged.componentIds) {
        arch.columns.set(compId, staged.columns.get(compId)!);
        this.components.addRegisteredComponent(compId);
      }

      for (let row = 0; row < arch.entities.length; row++) {
        this.entities.setLocation(arch.entities[row], arch, row);
      }
    }

    // Rebuild the relationship index after data is loaded
    this.relationships.rebuild();

    this.tags.load(snapshot.tags);
    this.groups.load(snapshot.groups);

    const savedSingleton = this.tags.findFirst("__world_singletons__", this);
    if (savedSingleton !== undefined) {
      this.singletonEntity = savedSingleton;
    } else {
      this.singletonEntity = this.createEntity();
      this.tags.register("__world_singletons__", this.singletonEntity);
    }
  }


}
