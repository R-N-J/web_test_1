import { Archetype, EntityId, ComponentId } from "./Archetype";
import { EntityManager } from "./EntityManager";
import { QueryManager } from "./QueryManager";
import { Bag } from "./Bag";

/**
 * Fired whenever an entity's structural mask changes.
 */
export type MaskObserver = (entity: EntityId, oldMask: bigint, newMask: bigint) => void;


export type ComponentObserver = (entity: EntityId, componentId: ComponentId) => void;

/**
 * Serializer for a single component type (by ComponentId).
 * Use this for snapshot save/load of non-JSON-native values (Set, Map, classes, etc.).
 */
export interface ComponentSerializer {
  serialize(value: unknown): unknown;
  deserialize(value: unknown): unknown;
}

export class ComponentManager {
  private archetypes = new Map<bigint, Archetype>();
  private onAddObservers = new Map<ComponentId, ComponentObserver[]>();
  private onRemoveObservers = new Map<ComponentId, ComponentObserver[]>();
  private registeredComponents = new Bag<ComponentId>();

  private serializers = new Map<ComponentId, ComponentSerializer>();
  private maskObservers = new Set<MaskObserver>();

  constructor(
    private entityManager: EntityManager,
    private queryManager: QueryManager
  ) {}

  public subscribeOnMaskChange(observer: MaskObserver): void {
    this.maskObservers.add(observer);
  }

  public unsubscribeOnMaskChange(observer: MaskObserver): void {
    this.maskObservers.delete(observer);
  }

  /**
   * Used by World/ComponentManager internals to notify structural membership changes.
   */
  public emitMaskChange(entity: EntityId, oldMask: bigint, newMask: bigint): void {
    if (oldMask === newMask) return;
    for (const cb of this.maskObservers) cb(entity, oldMask, newMask);
  }

  private static deepCloneSnapshotValue(value: unknown): unknown {
    // Primitives and null are safe as-is
    if (value === null || typeof value !== "object") return value;

    // Use built-in structuredClone if available
    if (typeof globalThis.structuredClone === "function") {
      try {
        return globalThis.structuredClone(value);
      } catch {
        // Fall through
      }
    }

    // FINAL FALLBACK
    try {
      return JSON.parse(JSON.stringify(value)) as unknown;
    } catch {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        throw new Error(
          `[ECS] Snapshot CRITICAL FAILURE: Component value is too complex to clone. ` +
          `You MUST register a ComponentSerializer for this data type to prevent state corruption.`
        );
      }
      return value;
    }
  }


  public registerSerializer(id: ComponentId, serializer: ComponentSerializer): void {
    this.serializers.set(id, serializer);
  }

  public serializeValue(id: ComponentId, value: unknown): unknown {
    const s = this.serializers.get(id);
    if (s) return s.serialize(value);

    // Default policy: deep clone to prevent snapshot sharing references with live ECS data.
    return ComponentManager.deepCloneSnapshotValue(value);
  }

  public deserializeValue(id: ComponentId, value: unknown): unknown {
    const s = this.serializers.get(id);
    return s ? s.deserialize(value) : value;
  }

  /**
   * Creates a deep copy of a component value using the registered serializer
   * or the default deep-clone policy.
   */
  public cloneValue(id: ComponentId, value: unknown): unknown {
    // Serialization + Deserialization is the safest way to ensure a clean clone
    // for complex types registered with serializers.
    return this.deserializeValue(id, this.serializeValue(id, value));
  }

  public subscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    if (!this.onAddObservers.has(id)) this.onAddObservers.set(id, []);
    this.onAddObservers.get(id)!.push(observer);
  }

  public subscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    if (!this.onRemoveObservers.has(id)) this.onRemoveObservers.set(id, []);
    this.onRemoveObservers.get(id)!.push(observer);
  }

  public unsubscribeOnAdd(id: ComponentId, observer: ComponentObserver): void {
    const observers = this.onAddObservers.get(id);
    if (observers) {
      this.onAddObservers.set(id, observers.filter(o => o !== observer));
    }
  }

  public unsubscribeOnRemove(id: ComponentId, observer: ComponentObserver): void {
    const observers = this.onRemoveObservers.get(id);
    if (observers) {
      this.onRemoveObservers.set(id, observers.filter(o => o !== observer));
    }
  }

  public getOrCreateArchetype(mask: bigint, componentIds: number[]): Archetype {
    let arch = this.archetypes.get(mask);
    if (!arch) {
      arch = new Archetype(mask, componentIds);
      this.archetypes.set(mask, arch);
      this.queryManager.registerArchetype(arch);
    }
    return arch;
  }



  public transmute(entity: EntityId, newMask: bigint, newComponentId?: ComponentId, newValue?: unknown): void {
    const oldLocation = this.entityManager.getLocation(entity);
    const oldMask = oldLocation?.arch.mask ?? 0n;
    const dataToMigrate = new Map<ComponentId, unknown>();

    const addedBits = newMask & ~oldMask;
    const removedBits = oldMask & ~newMask;

    if (oldLocation) {
      const { arch, row } = oldLocation;
      for (const [compId, col] of arch.columns) {
        dataToMigrate.set(compId, col[row]);
      }

      const movedEntityId = arch.removeEntity(row);

      if (movedEntityId !== entity) {
        const movedLoc = this.entityManager.getLocation(movedEntityId);
        if (movedLoc) {
            this.entityManager.setLocation(movedEntityId, movedLoc.arch, row);
        }
      }
    }

    if (newComponentId !== undefined) {
      dataToMigrate.set(newComponentId, newValue);
    }

    let targetArch = this.archetypes.get(newMask);
    if (!targetArch) {
      const componentIds = this.registeredComponents.filter((id: ComponentId) =>
        (newMask & (1n << BigInt(id))) !== 0n
      );
      targetArch = new Archetype(newMask, componentIds);
      this.archetypes.set(newMask, targetArch);
      this.queryManager.registerArchetype(targetArch);
      this.queryManager.invalidateCache(); // Re-sync existing queries
    }

    const newRow = targetArch.addEntity(entity, dataToMigrate);
    this.entityManager.setLocation(entity, targetArch, newRow);

    this.notifyObservers(entity, addedBits, removedBits);
    // NEW: structural event
    this.emitMaskChange(entity, oldMask, newMask);
  }

  public notifyObservers(entity: EntityId, added: bigint, removed: bigint): void {
    // IMPROVEMENT: Use the new Bag iterator for a cleaner, faster loop
    for (const compId of this.registeredComponents) {
      const bit = 1n << BigInt(compId);

      if ((added & bit) !== 0n) {
        this.onAddObservers.get(compId)?.forEach(cb => cb(entity, compId));
      }

      if ((removed & bit) !== 0n) {
        this.onRemoveObservers.get(compId)?.forEach(cb => cb(entity, compId));
      }
    }
  }

  public applyBatchChanges(
    entity: EntityId,
    newMask: bigint,
    additions: Map<ComponentId, unknown>,
    removals: Set<ComponentId>
  ): void {
    const oldLocation = this.entityManager.getLocation(entity);

    // If the same archetype, this is NON-structural (no mask change).
    if (oldLocation && oldLocation.arch.mask === newMask) {
      for (const [id, val] of additions) {
        const col = oldLocation.arch.columns.get(id);
        if (col) col[oldLocation.row] = val;
      }
      return;
    }

    const oldMask = oldLocation?.arch.mask ?? 0n;
    const dataToMigrate = new Map<ComponentId, unknown>();

    if (oldLocation) {
      const { arch, row } = oldLocation;
      for (const [compId, col] of arch.columns) {
        if (!removals.has(compId)) {
          dataToMigrate.set(compId, col[row]);
        }
      }
      const movedEntityId = arch.removeEntity(row);
      if (movedEntityId !== entity) {
        const movedLoc = this.entityManager.getLocation(movedEntityId);
        if (movedLoc) {
          this.entityManager.setLocation(movedEntityId, movedLoc.arch, row);
        }
      }
    }

    for (const [id, val] of additions) {
      dataToMigrate.set(id, val);
    }

    const targetArch = this.getOrCreateArchetype(
      newMask,
      this.registeredComponents.filter((id: ComponentId) => (newMask & (1n << BigInt(id))) !== 0n)
    );
    this.queryManager.invalidateCache(); // Ensure batch moves are reflected in queries

    const newRow = targetArch.addEntity(entity, dataToMigrate);
    this.entityManager.setLocation(entity, targetArch, newRow);
    // NEW: structural event
    this.emitMaskChange(entity, oldMask, newMask);
  }

  public getArchetypes(): IterableIterator<Archetype> {
    return this.archetypes.values();
  }

  public getArchetypeMap(): Map<bigint, Archetype> {
    return this.archetypes;
  }

  public setArchetype(mask: bigint, arch: Archetype): void {
    this.archetypes.set(mask, arch);
  }

  public addRegisteredComponent(id: ComponentId): void {
    if (!this.registeredComponents.contains(id)) { // CLEANER: uses Bag.contains
      this.registeredComponents.add(id);
    }
  }

  /**
   * Returns all component IDs currently known to the manager.
   */
  public getRegisteredComponents(): ComponentId[] {
    return this.registeredComponents.toArray(); // CLEANER: uses Bag.toArray
  }

  /**
   * Total number of active archetypes.
   */
  public getArchetypeCount(): number {
    return this.archetypes.size;
  }

  /**
   * Wipes all observer subscriptions.
   * Useful during a full world reset.
   */
  public clearObservers(): void {
    this.onAddObservers.clear();
    this.onRemoveObservers.clear();
  }

  public clear(): void {
    this.archetypes.clear();
    this.clearObservers(); // IMPROVEMENT: Reset observers during a full clear
    // Note: registeredComponents persists to keep ID mapping stable
  }


}
