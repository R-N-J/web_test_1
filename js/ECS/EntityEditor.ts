
import { EntityId, ComponentId } from "./Archetype";
import type { World } from "./World";

/**
 * A builder for performing multiple component changes in a single structural move.
 * Helps prevent "Archetype Churn" by calculating the final mask before moving data.
 */
export class EntityEditor {
  private newMask: bigint;
  private additions = new Map<ComponentId, unknown>();
  private removals = new Set<ComponentId>();

  constructor(private world: World, private entity: EntityId, initialMask: bigint) {
    this.newMask = initialMask;
  }

  public add(id: ComponentId, value: unknown): this {
    this.newMask |= (1n << BigInt(id));
    this.additions.set(id, value);
    this.removals.delete(id);
    return this;
  }

  public remove(id: ComponentId): this {
    this.newMask &= ~(1n << BigInt(id));
    this.removals.add(id);
    this.additions.delete(id);
    return this;
  }

  /**
   * Finalizes the changes and performs exactly one memory move in the World.
   */
  public commit(): void {
    this.world.applyBatchChanges(this.entity, this.newMask, this.additions, this.removals);
  }
}
