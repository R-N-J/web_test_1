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
   * Fast check for component existence.
   */
  public has(entity: EntityId): boolean {
    return this.world.hasComponent(entity, this.componentId);
  }

  /**
   * Retrieves the component value for an entity.
   */
  public get(entity: EntityId): T | undefined {
    return this.world.getComponent<T>(entity, this.componentId);
  }

  /**
   * Non-structural write: updates the component value without moving archetypes.
   */
  public set(entity: EntityId, value: T): void {
    this.world.setComponent(entity, this.componentId, value);
  }

  /**
   * Non-structural update using a callback.
   */
  public update(entity: EntityId, updater: (current: T) => T): void {
    this.world.updateComponent(entity, this.componentId, updater);
  }

  /**
   * Non-structural mutation for object-based components.
   */
  public mutate(entity: EntityId, mutator: (value: T) => void): void {
    this.world.mutateComponent(entity, this.componentId, mutator);
  }

  /**
   * Structural removal of the component from the entity.
   */
  public remove(entity: EntityId): void {
    this.world.removeComponent(entity, this.componentId);
  }
}
