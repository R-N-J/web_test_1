/**
 * A 'Bag' is a dense array that allows for fast O(1) removal by swapping
 * the deleted element with the last one.
 */
export class Bag<T> {
  private data: (T | null)[] = [];
  public length = 0;

  public add(item: T): void {
    this.data[this.length++] = item;
  }

  public removeAt(index: number): T | undefined {
    if (index >= this.length) return undefined;

    const item = this.data[index];
    // Swap-to-back logic
    this.data[index] = this.data[--this.length];
    // Clear the last reference to help GC and satisfy types without 'any'
    this.data[this.length] = null;

    return item ?? undefined;
  }

  public get(index: number): T {
    return this.data[index] as T;
  }
}
