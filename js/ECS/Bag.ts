/**
 * A 'Bag' is a dense array that allows for fast O(1) removal by swapping
 * the deleted element with the last one.
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



  public add(item: T): void {
    this.data[this.length++] = item;
  }

  /**
   * Removes an item by value.
   * Performs a linear scan to find the index, then a fast O(1) swap-remove.
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

  /**
   * Clears the bag without reallocating the underlying array.
   */
  public clear(): void {
    for (let i = 0; i < this.length; i++) {
      this.data[i] = null;
    }
    this.length = 0;
  }

  /**
   * Returns a clean array of all items.
   * Useful for debugging or when order-independent iteration is needed.
   */
  public toArray(): T[] {
    return this.data.slice(0, this.length) as T[];
  }

  /**
   * Returns an array of items that match the predicate.
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
   * Checks if an item exists in the bag.
   */
  public contains(item: T): boolean {
    for (let i = 0; i < this.length; i++) {
      if (this.data[i] === item) return true;
    }
    return false;
  }

}
