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
   * Returns true if this archetype contains the specified component.
   */
  public hasComponent(id: ComponentId): boolean {
    return this.columns.has(id);
  }

  /**
   * Returns the raw column array for a component ID (fast-path access).
   * Useful for high-performance systems that override `processArchetype`.
   */
  public getColumn<T>(id: ComponentId): T[] | undefined {
    return this.columns.get(id) as T[] | undefined;
  }


  /**
   * Fast-path access that asserts the column exists.
   * Use when your system's Aspect guarantees this component is present.
   */
  public requireColumn<T>(id: ComponentId): T[] {
    const col = this.getColumn<T>(id);
    if (!col) {
      const msg = `[ECS] CRITICAL: Archetype missing required column for Component ${id}. This usually means the System Aspect requested a component that doesn't exist in this layout.`;
      console.error(msg);
      throw new Error(msg);
    }
    return col;
  }

  /**
   * Safely retrieves a component value for a specific row.
   */
  public getValue<T>(id: ComponentId, row: number): T {
    const col = this.columns.get(id);
    if (!col) throw new Error(`Component ${id} not found in archetype ${this.mask}`);
    return col[row] as T;
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

  /**
   * Wipes all entities and component data from this archetype.
   */
  public clear(): void {
    this.entities = [];
    for (const col of this.columns.values()) {
      col.length = 0;
    }
  }
}
