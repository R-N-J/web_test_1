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

  // --- Tests: Observer Notifications (BAT-003, OBS-001, OBS-003, OBS-004) ---
  const obsWorld = new World();
  const C1 = 1;
  const C2 = 2;
  const C3 = 3;
  obsWorld.registerComponent(C1);
  obsWorld.registerComponent(C2);
  obsWorld.registerComponent(C3);

  const addEventsC1: Array<{ entity: number; compId: number }> = [];
  const addEventsC2: Array<{ entity: number; compId: number }> = [];
  const removeEventsC1: Array<{ entity: number; compId: number }> = [];
  const removeEventsC2: Array<{ entity: number; compId: number }> = [];
  const maskEvents: Array<{ entity: number; oldMask: bigint; newMask: bigint }> = [];

  const onAddC1 = (e: number, id: number) => addEventsC1.push({ entity: e, compId: id });
  const onAddC2 = (e: number, id: number) => addEventsC2.push({ entity: e, compId: id });
  const onRemC1 = (e: number, id: number) => removeEventsC1.push({ entity: e, compId: id });
  const onRemC2 = (e: number, id: number) => removeEventsC2.push({ entity: e, compId: id });
  const onMask = (e: number, oldM: bigint, newM: bigint) => maskEvents.push({ entity: e, oldMask: oldM, newMask: newM });

  obsWorld.subscribeOnAdd(C1, onAddC1);
  obsWorld.subscribeOnAdd(C2, onAddC2);
  obsWorld.subscribeOnRemove(C1, onRemC1);
  obsWorld.subscribeOnRemove(C2, onRemC2);
  obsWorld.subscribeOnMaskChange(onMask);

  // 1. Direct addition invokes add observer
  const oe1 = obsWorld.createEntity();
  obsWorld.addComponent(oe1, C1, { val: 1 });
  assert.strictEqual(addEventsC1.length, 1, "Direct add: C1 add observer should be called once");
  assert.deepStrictEqual(addEventsC1[0], { entity: oe1, compId: C1 });
  assert.strictEqual(maskEvents.length, 1, "Direct add: mask observer should be called once");
  assert.strictEqual(maskEvents[0].oldMask, 0n);
  assert.strictEqual(maskEvents[0].newMask, 1n << BigInt(C1));

  // 2. Direct removal invokes remove observer
  obsWorld.removeComponent(oe1, C1);
  assert.strictEqual(removeEventsC1.length, 1, "Direct remove: C1 remove observer should be called once");
  assert.deepStrictEqual(removeEventsC1[0], { entity: oe1, compId: C1 });
  assert.strictEqual(maskEvents.length, 2, "Direct remove: mask observer should be called again");
  assert.strictEqual(maskEvents[1].oldMask, 1n << BigInt(C1));
  assert.strictEqual(maskEvents[1].newMask, 0n);

  // Reset event tracking
  addEventsC1.length = 0;
  addEventsC2.length = 0;
  removeEventsC1.length = 0;
  removeEventsC2.length = 0;
  maskEvents.length = 0;

  // 3. Batch addition invokes corresponding add observers (BAT-003, OBS-003)
  const oe2 = obsWorld.createEntity();
  obsWorld.edit(oe2).add(C1, { val: 10 }).add(C2, { val: 20 }).commit();
  assert.strictEqual(addEventsC1.length, 1, "Batch add: C1 add observer should be called once");
  assert.deepStrictEqual(addEventsC1[0], { entity: oe2, compId: C1 });
  assert.strictEqual(addEventsC2.length, 1, "Batch add: C2 add observer should be called once");
  assert.deepStrictEqual(addEventsC2[0], { entity: oe2, compId: C2 });
  assert.strictEqual(maskEvents.length, 1, "Batch add: mask observer should be called once");
  assert.strictEqual(maskEvents[0].oldMask, 0n);
  assert.strictEqual(maskEvents[0].newMask, (1n << BigInt(C1)) | (1n << BigInt(C2)));

  // Reset
  addEventsC1.length = 0;
  addEventsC2.length = 0;
  removeEventsC1.length = 0;
  removeEventsC2.length = 0;
  maskEvents.length = 0;

  // 4. Batch removal invokes corresponding remove observers (BAT-003, OBS-003)
  obsWorld.edit(oe2).remove(C1).commit();
  assert.strictEqual(removeEventsC1.length, 1, "Batch remove: C1 remove observer should be called once");
  assert.deepStrictEqual(removeEventsC1[0], { entity: oe2, compId: C1 });
  assert.strictEqual(removeEventsC2.length, 0, "Batch remove: C2 remove observer should not be called");
  assert.strictEqual(maskEvents.length, 1, "Batch remove: mask observer should be called once");
  assert.strictEqual(maskEvents[0].oldMask, (1n << BigInt(C1)) | (1n << BigInt(C2)));
  assert.strictEqual(maskEvents[0].newMask, 1n << BigInt(C2));

  // Reset
  addEventsC1.length = 0;
  addEventsC2.length = 0;
  removeEventsC1.length = 0;
  removeEventsC2.length = 0;
  maskEvents.length = 0;

  // 5. Simultaneous batch add and remove reports effective changes accurately (BAT-003, OBS-003)
  // oe2 currently has C2. In batch: add C1 and remove C2.
  obsWorld.edit(oe2).add(C1, { val: 100 }).remove(C2).commit();
  assert.strictEqual(addEventsC1.length, 1, "Batch simultaneous: C1 added");
  assert.strictEqual(removeEventsC2.length, 1, "Batch simultaneous: C2 removed");
  assert.strictEqual(addEventsC2.length, 0, "Batch simultaneous: C2 not added");
  assert.strictEqual(removeEventsC1.length, 0, "Batch simultaneous: C1 not removed");
  assert.strictEqual(maskEvents.length, 1, "Batch simultaneous: mask changed");
  assert.strictEqual(maskEvents[0].oldMask, 1n << BigInt(C2));
  assert.strictEqual(maskEvents[0].newMask, 1n << BigInt(C1));

  // Reset
  addEventsC1.length = 0;
  addEventsC2.length = 0;
  removeEventsC1.length = 0;
  removeEventsC2.length = 0;
  maskEvents.length = 0;

  // 6. No-op operations generate no false notifications (OBS-004)
  // 6a. Direct value replacement (already has C1)
  obsWorld.addComponent(oe2, C1, { val: 200 });
  assert.strictEqual(addEventsC1.length, 0, "Direct value replace: no add notification");
  assert.strictEqual(removeEventsC1.length, 0, "Direct value replace: no remove notification");
  assert.strictEqual(maskEvents.length, 0, "Direct value replace: no mask notification");

  // 6b. Direct removal of non-existent component
  obsWorld.removeComponent(oe2, C2);
  assert.strictEqual(removeEventsC2.length, 0, "Direct remove non-existent: no remove notification");
  assert.strictEqual(maskEvents.length, 0, "Direct remove non-existent: no mask notification");

  // 6c. Batch operation with no mask change (modifying existing C1 value)
  obsWorld.edit(oe2).add(C1, { val: 300 }).commit();
  assert.strictEqual(addEventsC1.length, 0, "Batch replace existing: no add notification");
  assert.strictEqual(removeEventsC1.length, 0, "Batch replace existing: no remove notification");
  assert.strictEqual(maskEvents.length, 0, "Batch replace existing: no mask notification");

  // 7. Unsubscribe check
  obsWorld.unsubscribeOnAdd(C1, onAddC1);
  obsWorld.unsubscribeOnRemove(C1, onRemC1);
  obsWorld.unsubscribeOnMaskChange(onMask);

  const oe3 = obsWorld.createEntity();
  obsWorld.addComponent(oe3, C1, { val: 5 });
  obsWorld.removeComponent(oe3, C1);
  assert.strictEqual(addEventsC1.length, 0, "Unsubscribed C1 add observer should not fire");
  assert.strictEqual(removeEventsC1.length, 0, "Unsubscribed C1 remove observer should not fire");
  assert.strictEqual(maskEvents.length, 0, "Unsubscribed mask observer should not fire");

  // 8. EntityEditor.clear() batch removal (BAT-003, OBS-003)
  const clearWorld = new World();
  clearWorld.registerComponent(C1);
  clearWorld.registerComponent(C2);
  const clearRemoved: number[] = [];
  clearWorld.subscribeOnRemove(C1, (_e, id) => clearRemoved.push(id));
  clearWorld.subscribeOnRemove(C2, (_e, id) => clearRemoved.push(id));

  const clearEntity = clearWorld.buildEntity().add(C1, { val: 1 }).add(C2, { val: 2 }).commit();
  clearWorld.edit(clearEntity).clear().commit();
  assert.strictEqual(clearRemoved.length, 2, "EntityEditor.clear() should trigger remove observers for all components");
  assert.ok(clearRemoved.includes(C1), "C1 remove observer triggered on clear");
  assert.ok(clearRemoved.includes(C2), "C2 remove observer triggered on clear");

  // 9. Deferred batch operations with observers (STR-007, OBS-003)
  const defWorld = new World();
  defWorld.registerComponent(C1);
  const defAdded: number[] = [];
  defWorld.subscribeOnAdd(C1, (_e, id) => defAdded.push(id));

  defWorld.setDeferred(true);
  const defEntity = defWorld.createEntity();
  defWorld.edit(defEntity).add(C1, { val: 42 }).commit();
  assert.strictEqual(defAdded.length, 0, "Deferred batch add should not trigger observer before flush");

  defWorld.setDeferred(false); // Disables deferred mode and flushes queue
  assert.strictEqual(defAdded.length, 1, "Deferred batch add should trigger observer upon flush");

  console.log("World tests completed!");
}

if (require.main === module) {
  testWorld();
}
