/**
 * A 'Bag' is an unordered, array-backed collection that provides amortized O(1) insertion
 * and O(1) swap-removal by replacing the removed element with the last element.
 */
export class Bag<T> {
  private data: (T | null)[] = [];
  public length = 0;

  /**
   * Implements the Iterator protocol.
   * Allows using the bag in for...of loops: for (const item of bag) { ... }
   */
  public *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.length; i++) {
      yield this.data[i] as T;
    }
  }

  /**
   * Adds an item to the end of the bag.
   * Complexity: amortized O(1).
   */
  public add(item: T): void {
    this.data[this.length++] = item;
  }

  /**
   * Removes the first occurrence of an item by value using strict equality.
   * Complexity: O(n) linear scan followed by O(1) swap-removal.
   *
   * @param item The item to remove.
   * @returns true if an item was found and removed, false otherwise.
   */
  public remove(item: T): boolean {
    for (let i = 0; i < this.length; i++) {
      if (this.data[i] === item) {
        this.removeAt(i);
        return true;
      }
    }
    return false;
  }

  /**
   * Removes an item at a specific index using O(1) swap-to-back removal.
   * Complexity: O(1).
   *
   * @param index The zero-based integer index of the element to remove.
   * @returns The removed item, or undefined if the index is invalid or out of bounds.
   */
  public removeAt(index: number): T | undefined {
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.length
    ) {
      return undefined;
    }

    const item = this.data[index] as T;
    // Swap-to-back logic: replace the removed element with the last element
    this.data[index] = this.data[--this.length];
    // Clear the vacated slot to prevent memory leaks and assist GC
    this.data[this.length] = null;

    return item;
  }

  /**
   * Retrieves the item at the specified index.
   * Complexity: O(1).
   *
   * @param index The zero-based integer index.
   * @returns The item at the index, or undefined if out of bounds or invalid.
   */
  public get(index: number): T | undefined {
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.length
    ) {
      return undefined;
    }
    return this.data[index] as T;
  }

  /**
   * Clears the bag, nulling out references for garbage collection without reallocating.
   * Complexity: O(n) where n is the current length.
   */
  public clear(): void {
    for (let i = 0; i < this.length; i++) {
      this.data[i] = null;
    }
    this.length = 0;
  }

  /**
   * Returns a clean shallow copy of all elements in the bag.
   * Complexity: O(n).
   */
  public toArray(): T[] {
    return this.data.slice(0, this.length) as T[];
  }

  /**
   * Returns an array of items matching the predicate.
   * Complexity: O(n).
   */
  public filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.length; i++) {
      const item = this.data[i] as T;
      if (predicate(item)) result.push(item);
    }
    return result;
  }

  /**
   * Checks if an item exists in the bag using strict equality.
   * Complexity: O(n).
   */
  public contains(item: T): boolean {
    for (let i = 0; i < this.length; i++) {
      if (this.data[i] === item) return true;
    }
    return false;
  }
}
