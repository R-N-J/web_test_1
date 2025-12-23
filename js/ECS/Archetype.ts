export type ComponentId = number;
export type EntityId = number;

/**
 * Stores entities of a specific component composition in Struct of Arrays (SoA) format.
 */
export class Archetype {
  public entities: EntityId[] = [];
  /**
   * SoA Storage: Column per component type.
   * Using unknown[] instead of any[] to satisfy strict linting.
   */
  public columns: Map<ComponentId, unknown[]> = new Map();

  constructor(public readonly mask: bigint, componentIds: ComponentId[]) {
    for (const id of componentIds) {
      this.columns.set(id, []);
    }
  }

  /**
   * Adds an entity to this archetype.
   * Values are passed as unknown to ensure type safety at the boundaries.
   */
  public addEntity(entity: EntityId, values: Map<ComponentId, unknown>): number {
    const row = this.entities.length;
    this.entities.push(entity);
    for (const [id, col] of this.columns) {
      col.push(values.get(id));
    }
    return row;
  }

  public removeEntity(row: number): EntityId {
    const lastRow = this.entities.length - 1;
    const movedEntity = this.entities[lastRow];

    // Swap-to-back for O(1) removal
    this.entities[row] = movedEntity;
    this.entities.pop();

    for (const col of this.columns.values()) {
      col[row] = col[lastRow];
      col.pop();
    }
    return movedEntity;
  }
}
