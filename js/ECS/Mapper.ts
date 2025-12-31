import { World } from "./World";
import { EntityId, ComponentId } from "./Archetype";

/**
 * Artemis-odb style Component Mapper.
 * Provides specialized, high-performance access to a specific component type.
 */
export class Mapper<T> {
  constructor(
    private world: World,
    public readonly componentId: ComponentId
  ) {}

  /**
   * High-performance retrieval. Throws if the entity is invalid or missing the component.
   * Use this when your System Aspect guarantees the component's presence.
   */
  public require(entity: EntityId): T {
    const val = this.get(entity);
    if (val === undefined) {
      const msg = `[ECS] Mapper Error: Entity ${entity} is missing required Component ${this.componentId}`;
      console.error(msg);
      throw new Error(msg);
    }
    return val;
  }

  /**
   * Specialized retrieval for the Singleton Entity.
   */
  public getSingleton(): T | undefined {
    return this.world.getSingleton<T>(this.componentId);
  }

  /**
   * Fast check for component existence.
   */
  public has(entity: EntityId): boolean {
    if (!this.world.isValid(entity)) return false;
    return this.world.hasComponent(entity, this.componentId);
  }

  /**
   * Retrieves the component value for an entity.
   */
  public get(entity: EntityId): T | undefined {
    if (!this.world.isValid(entity)) return undefined;
    return this.world.getComponent<T>(entity, this.componentId);
  }

  /**
   * Non-structural write.
   */
  public set(entity: EntityId, value: T): void {
    if (!this.world.isValid(entity)) return;
    this.world.setComponent(entity, this.componentId, value);
  }

  /**
   * Non-structural update using a callback.
   */
  public update(entity: EntityId, updater: (current: T) => T): void {
    if (!this.world.isValid(entity)) return;
    this.world.updateComponent(entity, this.componentId, updater);
  }

  /**
   * Non-structural mutation for object-based components.
   */
  public mutate(entity: EntityId, mutator: (value: T) => void): void {
    if (!this.world.isValid(entity)) return;
    this.world.mutateComponent(entity, this.componentId, mutator);
  }

  /**
   * Structural removal of the component from the entity.
   */
  public remove(entity: EntityId): void {
    if (!this.world.isValid(entity)) return;
    this.world.removeComponent(entity, this.componentId);
  }
}
