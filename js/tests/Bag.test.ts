import assert from "node:assert/strict";
import { Bag } from "../ECS/Bag";

export function testBag(): void {
  console.log("Testing Bag Data Structure...");

  // 1. Empty Collection Behavior
  {
    const bag = new Bag<string>();
    assert.strictEqual(bag.length, 0, "Initial length should be 0");
    assert.strictEqual(bag.get(0), undefined, "get(0) on empty bag should return undefined");
    assert.strictEqual(bag.get(-1), undefined, "get(-1) on empty bag should return undefined");
    assert.strictEqual(bag.removeAt(0), undefined, "removeAt(0) on empty bag should return undefined");
    assert.strictEqual(bag.remove("nonexistent"), false, "remove() on empty bag should return false");
    assert.strictEqual(bag.contains("nonexistent"), false, "contains() on empty bag should return false");
    assert.deepStrictEqual(bag.toArray(), [], "toArray() on empty bag should return empty array");
    assert.deepStrictEqual(bag.filter(() => true), [], "filter() on empty bag should return empty array");

    let iterCount = 0;
    for (const item of bag) {
      if (item !== undefined) iterCount++;
    }
    assert.strictEqual(iterCount, 0, "Iterator over empty bag should yield 0 items");

    // clear() on empty bag is safe
    bag.clear();
    assert.strictEqual(bag.length, 0, "clear() on empty bag preserves length 0");
  }

  // 2. Add, Get, Contains, and toArray Operations
  {
    const bag = new Bag<number>();
    bag.add(10);
    bag.add(20);
    bag.add(30);

    assert.strictEqual(bag.length, 3, "Length should be 3 after 3 adds");
    assert.strictEqual(bag.get(0), 10, "get(0) returns 10");
    assert.strictEqual(bag.get(1), 20, "get(1) returns 20");
    assert.strictEqual(bag.get(2), 30, "get(2) returns 30");

    assert.strictEqual(bag.contains(10), true, "contains(10) is true");
    assert.strictEqual(bag.contains(20), true, "contains(20) is true");
    assert.strictEqual(bag.contains(30), true, "contains(30) is true");
    assert.strictEqual(bag.contains(40), false, "contains(40) is false");

    assert.deepStrictEqual(bag.toArray(), [10, 20, 30], "toArray() returns snapshot array");

    // Defensive copy check: mutating toArray result must not affect bag
    const arr = bag.toArray();
    arr.push(999);
    arr[0] = 111;
    assert.strictEqual(bag.length, 3, "Mutating toArray array does not change bag length");
    assert.strictEqual(bag.get(0), 10, "Mutating toArray array does not change bag element");
  }

  // 3. Swap-Removal Operations (First, Middle, Last)
  {
    // 3.1: Remove middle element
    const bag1 = new Bag<string>();
    bag1.add("A");
    bag1.add("B");
    bag1.add("C");
    bag1.add("D");

    const removedMiddle = bag1.removeAt(1); // remove "B", "D" swapped to index 1
    assert.strictEqual(removedMiddle, "B", "removeAt(1) returns removed element B");
    assert.strictEqual(bag1.length, 3, "Length is now 3");
    assert.strictEqual(bag1.get(0), "A", "Index 0 is A");
    assert.strictEqual(bag1.get(1), "D", "Index 1 is now D (swapped from back)");
    assert.strictEqual(bag1.get(2), "C", "Index 2 is C");
    assert.strictEqual(bag1.get(3), undefined, "Index 3 is now undefined");

    // 3.2: Remove first element
    const removedFirst = bag1.removeAt(0); // remove "A", "C" swapped to index 0
    assert.strictEqual(removedFirst, "A", "removeAt(0) returns A");
    assert.strictEqual(bag1.length, 2, "Length is now 2");
    assert.strictEqual(bag1.get(0), "C", "Index 0 is C (swapped from back)");
    assert.strictEqual(bag1.get(1), "D", "Index 1 is D");

    // 3.3: Remove last element
    const removedLast = bag1.removeAt(1); // remove "D" (last element)
    assert.strictEqual(removedLast, "D", "removeAt(1) returns D");
    assert.strictEqual(bag1.length, 1, "Length is now 1");
    assert.strictEqual(bag1.get(0), "C", "Index 0 is C");

    // 3.4: Remove remaining single element
    const removedFinal = bag1.removeAt(0);
    assert.strictEqual(removedFinal, "C", "removeAt(0) returns C");
    assert.strictEqual(bag1.length, 0, "Length is now 0");

    // 3.5: Remove by value with remove(item)
    const bag2 = new Bag<string>();
    bag2.add("X");
    bag2.add("Y");
    bag2.add("Z");

    assert.strictEqual(bag2.remove("NOT_PRESENT"), false, "remove(missing) returns false");
    assert.strictEqual(bag2.length, 3, "Length unchanged when removing missing item");

    assert.strictEqual(bag2.remove("X"), true, "remove(X) returns true");
    assert.strictEqual(bag2.length, 2, "Length is 2 after remove(X)");
    assert.strictEqual(bag2.contains("X"), false, "X is no longer in bag");
    assert.strictEqual(bag2.contains("Z"), true, "Z was swapped to index 0");
    assert.strictEqual(bag2.get(0), "Z", "Z is at index 0");
    assert.strictEqual(bag2.get(1), "Y", "Y is at index 1");
  }

  // 4. Out-of-Range and Malformed Index Validation
  {
    const bag = new Bag<string>();
    bag.add("ALPHA");
    bag.add("BETA");
    bag.add("GAMMA");

    // Test negative indexes
    assert.strictEqual(bag.removeAt(-1), undefined, "removeAt(-1) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(-1) must not decrement length");
    assert.strictEqual(bag.get(0), "ALPHA");
    assert.strictEqual(bag.get(1), "BETA");
    assert.strictEqual(bag.get(2), "GAMMA");

    assert.strictEqual(bag.removeAt(-100), undefined, "removeAt(-100) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(-100) must not decrement length");

    assert.strictEqual(bag.get(-1), undefined, "get(-1) returns undefined");
    assert.strictEqual(bag.get(-100), undefined, "get(-100) returns undefined");

    // Test fractional indexes
    assert.strictEqual(bag.removeAt(1.5), undefined, "removeAt(1.5) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(1.5) must not decrement length");
    assert.strictEqual(bag.get(1.5), undefined, "get(1.5) returns undefined");

    assert.strictEqual(bag.removeAt(0.1), undefined, "removeAt(0.1) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(0.1) must not decrement length");

    // Test NaN and Infinities
    assert.strictEqual(bag.removeAt(NaN), undefined, "removeAt(NaN) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(NaN) must not decrement length");
    assert.strictEqual(bag.get(NaN), undefined, "get(NaN) returns undefined");

    assert.strictEqual(bag.removeAt(Infinity), undefined, "removeAt(Infinity) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(Infinity) must not decrement length");
    assert.strictEqual(bag.get(Infinity), undefined, "get(Infinity) returns undefined");

    assert.strictEqual(bag.removeAt(-Infinity), undefined, "removeAt(-Infinity) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(-Infinity) must not decrement length");
    assert.strictEqual(bag.get(-Infinity), undefined, "get(-Infinity) returns undefined");

    // Test out of bounds indexes (>= length)
    assert.strictEqual(bag.removeAt(3), undefined, "removeAt(length) returns undefined");
    assert.strictEqual(bag.removeAt(100), undefined, "removeAt(100) returns undefined");
    assert.strictEqual(bag.length, 3, "removeAt(outOfBounds) must not decrement length");
    assert.strictEqual(bag.get(3), undefined, "get(length) returns undefined");
    assert.strictEqual(bag.get(100), undefined, "get(100) returns undefined");

    // Verify bag content integrity was preserved
    assert.deepStrictEqual(bag.toArray(), ["ALPHA", "BETA", "GAMMA"], "Bag content remains intact after invalid index attempts");
  }

  // 5. Generic Types with Null and Undefined Handling
  {
    // Bag allowing null
    const nullBag = new Bag<string | null>();
    nullBag.add("valid");
    nullBag.add(null);
    nullBag.add("another");

    assert.strictEqual(nullBag.length, 3);
    assert.strictEqual(nullBag.get(1), null, "get(1) returns null");
    assert.strictEqual(nullBag.contains(null), true, "contains(null) returns true");

    const removedNull = nullBag.removeAt(1);
    assert.strictEqual(removedNull, null, "removeAt(1) must return null, not undefined");
    assert.strictEqual(nullBag.length, 2);
    assert.strictEqual(nullBag.contains(null), false, "contains(null) is now false");
    assert.deepStrictEqual(nullBag.toArray(), ["valid", "another"]);

    // Bag allowing undefined
    const undefBag = new Bag<number | undefined>();
    undefBag.add(42);
    undefBag.add(undefined);

    assert.strictEqual(undefBag.length, 2);
    assert.strictEqual(undefBag.contains(undefined), true);
    assert.strictEqual(undefBag.get(1), undefined);
    assert.strictEqual(undefBag.remove(undefined), true);
    assert.strictEqual(undefBag.length, 1);
    assert.strictEqual(undefBag.get(0), 42);
  }

  // 6. Clear and Reuse Lifecycle
  {
    const bag = new Bag<number>();
    for (let i = 0; i < 100; i++) {
      bag.add(i);
    }
    assert.strictEqual(bag.length, 100);

    bag.clear();
    assert.strictEqual(bag.length, 0);
    assert.deepStrictEqual(bag.toArray(), []);
    assert.strictEqual(bag.get(0), undefined);

    // Re-populate after clear
    bag.add(1000);
    bag.add(2000);
    assert.strictEqual(bag.length, 2);
    assert.strictEqual(bag.get(0), 1000);
    assert.strictEqual(bag.get(1), 2000);
    assert.strictEqual(bag.get(2), undefined);
    assert.deepStrictEqual(bag.toArray(), [1000, 2000]);
  }

  // 7. Iteration (`[Symbol.iterator]`) and `filter()`
  {
    const bag = new Bag<{ id: number; name: string }>();
    const item1 = { id: 1, name: "Item 1" };
    const item2 = { id: 2, name: "Item 2" };
    const item3 = { id: 3, name: "Item 3" };

    bag.add(item1);
    bag.add(item2);
    bag.add(item3);

    // Iteration via for...of
    const collected: { id: number; name: string }[] = [];
    for (const item of bag) {
      collected.push(item);
    }
    assert.deepStrictEqual(collected, [item1, item2, item3], "Iterator yields all elements in order");

    // filter
    const filtered = bag.filter((it) => it.id > 1);
    assert.deepStrictEqual(filtered, [item2, item3], "filter returns matching elements");
    assert.strictEqual(bag.length, 3, "filter does not mutate original bag");

    // strict object equality in contains and remove
    assert.strictEqual(bag.contains(item2), true);
    assert.strictEqual(bag.contains({ id: 2, name: "Item 2" }), false, "contains uses strict equality");
    assert.strictEqual(bag.remove({ id: 2, name: "Item 2" }), false, "remove uses strict equality");
    assert.strictEqual(bag.remove(item2), true);
    assert.strictEqual(bag.length, 2);
  }

  // 8. Integration Invariants with EntityManager and ComponentManager
  {
    // Test that Bag accurately supports free entity allocation / recycling stack usage in EntityManager
    const freePool = new Bag<number>();
    freePool.add(100);
    freePool.add(200);
    freePool.add(300);

    // LIFO pop style: removeAt(length - 1)
    const popped1 = freePool.removeAt(freePool.length - 1);
    assert.strictEqual(popped1, 300);
    assert.strictEqual(freePool.length, 2);

    const popped2 = freePool.removeAt(freePool.length - 1);
    assert.strictEqual(popped2, 200);
    assert.strictEqual(freePool.length, 1);

    const popped3 = freePool.removeAt(freePool.length - 1);
    assert.strictEqual(popped3, 100);
    assert.strictEqual(freePool.length, 0);

    assert.strictEqual(freePool.removeAt(freePool.length - 1), undefined);
  }

  console.log("Bag Data Structure tests completed successfully!");
}
