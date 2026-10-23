import assert from "node:assert/strict";
import { Aspect } from "../ECS/Aspect";

/**
 * Basic tests for the Aspect bitmask matching logic.
 */
export function testAspects() {
  console.log("Running Aspect tests...");

  const COMP_A = 1;
  const COMP_B = 2;
  const COMP_C = 3;

  const bA = 1n << 1n;
  const bB = 1n << 2n;
  const bC = 1n << 3n;

  // Test: All
  const aspectAll = Aspect.all(COMP_A, COMP_B);
  const maskAB = bA | bB;
  const maskABC = maskAB | bC;
  const maskA = bA;

  assert.strictEqual(aspectAll.matches(maskAB), true, "Should match exactly A and B");
  assert.strictEqual(aspectAll.matches(maskABC), true, "Should match A, B, and extra C");
  assert.strictEqual(aspectAll.matches(maskA), false, "Should not match only A");

  // Test: One
  const aspectOne = Aspect.one(COMP_A, COMP_B);
  assert.strictEqual(aspectOne.matches(maskA), true, "Should match only A");
  assert.strictEqual(aspectOne.matches(maskAB), true, "Should match both A and B");
  assert.strictEqual(aspectOne.matches(bC), false, "Should not match only C");

  // Test: Exclude
  const aspectExclude = Aspect.exclude(COMP_C);
  assert.strictEqual(aspectExclude.matches(maskAB), true, "Should match AB without C");
  assert.strictEqual(aspectExclude.matches(maskABC), false, "Should not match if C is present");

  // Test: Complex Combination
  const b4 = 1n << 4n;
  const complex = Aspect.all(COMP_A).one(COMP_B, COMP_C).butNot(4);
  assert.strictEqual(complex.matches(maskAB), true, "Should match A and B");
  assert.strictEqual(complex.matches(maskA | b4), false, "Should exclude 4");
  assert.strictEqual(complex.matches(maskA), false, "Should require one of B or C");

  console.log("Aspect tests completed!");
}

if (require.main === module) {
  testAspects();
}
