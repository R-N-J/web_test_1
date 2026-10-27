export type ComponentId = number;
export type EntityId = number;

/**
 * Maximum supported component ID (16-bit unsigned integer range 0..65535).
 * Enforcing this bound guarantees bounded BigInt mask sizes (<= 8KB) and prevents runtime RangeErrors.
 */
export const MAX_COMPONENT_ID = 65535;

/**
 * Validates that a value is a valid ComponentId (non-negative safe integer <= MAX_COMPONENT_ID).
 */
export function isValidComponentId(id: unknown): id is ComponentId {
  return typeof id === "number" && Number.isSafeInteger(id) && id >= 0 && id <= MAX_COMPONENT_ID;
}

/**
 * Stores entities of a specific component composition in Struct of Arrays (SoA) format.
 * Entities with identical component configurations share an Archetype.
 */
export class Archetype {
  public entities: EntityId[] = [];
  /**
   * SoA Storage: Column per component type.
   * Using unknown[] instead of any[] to satisfy strict linting.
   */
  public columns: Map<ComponentId, unknown[]> = new Map();

  constructor(public readonly mask: bigint, componentIds: readonly ComponentId[]) {
    if (typeof mask !== "bigint" || mask < 0n) {
      throw new Error(`[ECS] Invalid Archetype mask: mask must be a non-negative bigint.`);
    }
    if (!Array.isArray(componentIds)) {
      throw new Error(`[ECS] Invalid componentIds: must be an array of Component IDs.`);
    }

    let calculatedMask = 0n;
    for (const id of componentIds) {
      if (!isValidComponentId(id)) {
        throw new Error(
          `[ECS] Invalid Component ID: ${id} in Archetype constructor. Component IDs must be integers between 0 and ${MAX_COMPONENT_ID}.`
        );
      }
      const bit = 1n << BigInt(id);
      if ((calculatedMask & bit) !== 0n) {
        throw new Error(`[ECS] Duplicate Component ID: ${id} in Archetype constructor.`);
      }
      calculatedMask |= bit;
      this.columns.set(id, []);
    }

    if (mask !== calculatedMask) {
      throw new Error(
        `[ECS] Archetype mask (${mask}) does not match component IDs mask (${calculatedMask}).`
      );
    }
  }

  /**
   * Returns true if this archetype contains the specified component.
   */
  public hasComponent(id: ComponentId): boolean {
    return isValidComponentId(id) && this.columns.has(id);
  }

  /**
   * Returns the raw column array for a component ID (fast-path access).
   * Useful for high-performance systems that override `processArchetype`.
   */
  public getColumn<T>(id: ComponentId): T[] | undefined {
    if (!isValidComponentId(id)) return undefined;
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
   * Retrieves a component value for a specific row, or undefined if the row index is invalid.
   */
  public getValue<T>(id: ComponentId, row: number): T | undefined {
    const col = this.columns.get(id);
    if (!col) {
      throw new Error(`[ECS] Component ${id} not found in archetype ${this.mask}`);
    }
    if (typeof row !== "number" || !Number.isInteger(row) || row < 0 || row >= this.entities.length) {
      return undefined;
    }
    return col[row] as T;
  }

  /**
   * Adds an entity to this archetype.
   * Values are passed as unknown to ensure type safety at the boundaries.
   *
   * @param entity The Entity ID to add.
   * @param values Optional Map of component values for the entity.
   * @returns The zero-based row index allocated for the entity.
   */
  public addEntity(entity: EntityId, values?: Map<ComponentId, unknown>): number {
    const row = this.entities.length;
    this.entities.push(entity);
    for (const [id, col] of this.columns) {
      col.push(values?.get(id));
    }
    return row;
  }

  /**
   * Removes an entity at the specified row using O(1) swap-to-back removal.
   *
   * @param row Zero-based row index to remove.
   * @returns The EntityId that was moved from the last row into this row, or undefined if the row is invalid.
   */
  public removeEntity(row: number): EntityId | undefined {
    if (
      typeof row !== "number" ||
      !Number.isInteger(row) ||
      row < 0 ||
      row >= this.entities.length
    ) {
      return undefined;
    }

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
   * Wipes all entities and component data from this archetype in place while preserving the component schema.
   */
  public clear(): void {
    this.entities.length = 0;
    for (const col of this.columns.values()) {
      col.length = 0;
    }
  }
}
