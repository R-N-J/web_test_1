import { Archetype, EntityId, ComponentId } from "./Archetype";
import { EntityManager } from "./EntityManager";
import { QueryManager } from "./QueryManager";

export type ComponentObserver = (entity: EntityId, componentId: ComponentId) => void;

export class ComponentManager {
  private archetypes = new Map<bigint, Archetype>();
  private onAddObservers = new Map<ComponentId, ComponentObserver[]>();
  private onRemoveObservers = new Map<ComponentId, ComponentObserver[]>();
  private registeredComponents: ComponentId[] = [];

  constructor(
    private entityManager: EntityManager,
    private queryManager: QueryManager
  ) {}

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
      const componentIds = this.registeredComponents.filter(id =>
        (newMask & (1n << BigInt(id))) !== 0n
      );
      targetArch = new Archetype(newMask, componentIds);
      this.archetypes.set(newMask, targetArch);
      this.queryManager.registerArchetype(targetArch);
    }

    const newRow = targetArch.addEntity(entity, dataToMigrate);
    this.entityManager.setLocation(entity, targetArch, newRow);

    this.notifyObservers(entity, addedBits, removedBits);
  }

  public notifyObservers(entity: EntityId, added: bigint, removed: bigint): void {
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
    if (oldLocation && oldLocation.arch.mask === newMask) {
      for (const [id, val] of additions) {
        const col = oldLocation.arch.columns.get(id);
        if (col) col[oldLocation.row] = val;
      }
      return;
    }

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

    const targetArch = this.getOrCreateArchetype(newMask,
      this.registeredComponents.filter(id => (newMask & (1n << BigInt(id))) !== 0n)
    );
    const newRow = targetArch.addEntity(entity, dataToMigrate);
    this.entityManager.setLocation(entity, targetArch, newRow);
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
    if (!this.registeredComponents.includes(id)) {
        this.registeredComponents.push(id);
    }
  }

  /**
   * Returns all component IDs currently known to the manager.
   */
  public getRegisteredComponents(): ComponentId[] {
    return [...this.registeredComponents];
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
    // Note: registeredComponents usually persists across clears
    // unless you are doing a hard engine reset.
  }


}
