import assert from "node:assert/strict";
import { EntityManager } from "../ECS/EntityManager";
import { Archetype } from "../ECS/Archetype";

/**
 * Basic tests for the EntityManager class.
 */
export function testEntityManager() {
  console.log("Running EntityManager tests...");

  const em = new EntityManager();
  const e1 = em.createEntity();
  const e2 = em.createEntity();

  assert.strictEqual(em.isValid(e1), true, "e1 should be valid");
  assert.strictEqual(em.isValid(e2), true, "e2 should be valid");
  assert.notStrictEqual(e1, e2, "e1 and e2 should be different");

  // Test: Location management
  const arch = new Archetype(1n, [1]); // Dummy archetype with component ID 1
  em.setLocation(e1, arch, 0);
  const loc1 = em.getLocation(e1);
  assert.ok(loc1 !== undefined && loc1.arch === arch && loc1.row === 0, "e1 location should be set");

  // Test: Recycling
  em.recycleEntity(e1);
  assert.strictEqual(em.isValid(e1), false, "e1 should now be invalid");

  const e3 = em.createEntity();
  // e3 should use e1's index but have a different version
  const index1 = (e1 as unknown as number) >> 8;
  const index3 = (e3 as unknown as number) >> 8;
  assert.strictEqual(index1, index3, "e3 should reuse e1's index");
  assert.notStrictEqual(e1, e3, "e3 should be different from e1 due to versioning");

  console.log("EntityManager tests completed!");
}

if (require.main === module) {
  testEntityManager();
}
