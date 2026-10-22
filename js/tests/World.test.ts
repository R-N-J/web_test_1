import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";

/**
 * Basic tests for the World class and entity management.
 */
export function testWorld() {
  console.log("Running World tests...");

  const world = new World();
  const COMP_A = 100;
  const COMP_B = 101;

  world.registerComponent(COMP_A);
  world.registerComponent(COMP_B);

  // Test: Entity creation
  const e1 = world.createEntity();
  assert.strictEqual(world.isValid(e1), true, "Entity e1 should be valid");

  // Test: Adding components
  world.addComponent(e1, COMP_A, { value: "A" });
  assert.strictEqual(world.hasComponent(e1, COMP_A), true, "e1 should have COMP_A");

  // Test: Aspect views
  const aspectA = Aspect.all(COMP_A);
  const viewA = world.getEntities(aspectA);
  assert.strictEqual(viewA.length, 1, "View A should have one entity");
  assert.strictEqual(viewA[0], e1, "Entity in view A should be e1");

  // Test: Aspect views with multiple entities
  const e2 = world.createEntity();
  world.addComponent(e2, COMP_A, { value: "A2" });
  world.addComponent(e2, COMP_B, { value: "B2" });

  const aspectAB = Aspect.all(COMP_A, COMP_B);
  const viewAB = world.getEntities(aspectAB);
  assert.strictEqual(viewAB.length, 1, "View AB should have one entity");
  assert.strictEqual(viewAB[0], e2, "Entity in view AB should be e2");

  // Test: Removal
  world.removeComponent(e2, COMP_B);
  assert.strictEqual(world.hasComponent(e2, COMP_B), false, "e2 should no longer have COMP_B");
  assert.strictEqual(world.getEntities(aspectAB).length, 0, "View AB should now be empty");

  // Test: Entity deletion
  world.deleteEntity(e1);
  assert.strictEqual(world.isValid(e1), false, "e1 should now be invalid");
  assert.strictEqual(world.getEntities(aspectA).length, 1, "View A should now only have e2");

  // Test: ENT-010 Duplicate deletion safety
  // Deleting e1 a second time should be a safe no-op and not corrupt the free pool
  world.deleteEntity(e1);
  assert.strictEqual(world.isValid(e1), false, "e1 should remain invalid after duplicate deletion");

  // Deleting an invalid / non-existent entity should be a safe no-op
  world.deleteEntity(-1);
  world.deleteEntity(999999);

  // Subsequent entity allocations must not return duplicate entity IDs
  const e3 = world.createEntity();
  const e4 = world.createEntity();
  assert.notStrictEqual(e3, e4, "e3 and e4 must be distinct entities; duplicate deletion must not create duplicate free entries");
  assert.strictEqual(world.isValid(e3), true, "e3 should be valid");
  assert.strictEqual(world.isValid(e4), true, "e4 should be valid");
  assert.strictEqual(world.isValid(e1), false, "e1 should remain invalid");

  // Old entity e1 must not access or mutate newly allocated entities
  world.addComponent(e3, COMP_A, { value: "A3" });
  world.addComponent(e4, COMP_A, { value: "A4" });
  assert.strictEqual(world.hasComponent(e1, COMP_A), false, "old e1 should not have COMP_A");
  assert.strictEqual(world.getComponent(e1, COMP_A), undefined, "old e1 getComponent should return undefined");

  world.setComponent(e1, COMP_A, { value: "mutated" });
  assert.strictEqual(world.getComponent<{ value: string }>(e3, COMP_A)?.value, "A3", "e3 component value should be unaffected by writes to old e1");

  // Query views and counts must remain consistent
  const viewAfter = world.getEntities(aspectA);
  assert.strictEqual(viewAfter.length, 3, "View A should contain e2, e3, e4");
  assert.ok(viewAfter.includes(e2), "View A contains e2");
  assert.ok(viewAfter.includes(e3), "View A contains e3");
  assert.ok(viewAfter.includes(e4), "View A contains e4");
  assert.strictEqual(viewAfter.includes(e1), false, "View A must not contain e1");

  // Test: ENT-010 Deferred duplicate deletion
  const e5 = world.createEntity();
  world.addComponent(e5, COMP_A, { value: "A5" });
  world.setDeferred(true);
  world.deleteEntity(e5);
  world.deleteEntity(e5); // duplicate delete queued in deferred mode
  world.setDeferred(false);

  assert.strictEqual(world.isValid(e5), false, "e5 should be invalid after deferred delete");
  const e6 = world.createEntity();
  const e7 = world.createEntity();
  assert.notStrictEqual(e6, e7, "e6 and e7 must be distinct entities after deferred duplicate deletion");

  console.log("World tests completed!");
}

if (require.main === module) {
  testWorld();
}
