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

  // --- Tests: EntityEditor.commit() Idempotency & Lifecycle (BAT-004, BAT-005) ---
  const idemWorld = new World();
  idemWorld.registerComponent(C1);
  idemWorld.registerComponent(C2);

  const idemAddEventsC1: number[] = [];
  const idemMaskEvents: number[] = [];
  idemWorld.subscribeOnAdd(C1, (e) => idemAddEventsC1.push(e));
  idemWorld.subscribeOnMaskChange((e) => idemMaskEvents.push(e));

  // 1. Committing an editor once applies its intended changes
  const editorNew = idemWorld.buildEntity().add(C1, { val: 1 });
  const newId1 = editorNew.commit();
  assert.strictEqual(idemWorld.isValid(newId1), true, "New entity should be valid");
  assert.strictEqual(idemWorld.hasComponent(newId1, C1), true, "New entity should have C1");
  assert.strictEqual(idemAddEventsC1.length, 1, "Add observer should be called once on first commit");
  assert.strictEqual(idemMaskEvents.length, 1, "Mask observer should be called once on first commit");

  // 2. Committing the same editor twice does not apply changes a second time (BAT-005)
  const newId2 = editorNew.commit();
  assert.strictEqual(newId2, newId1, "Repeated commit must return same EntityId");
  assert.strictEqual(idemAddEventsC1.length, 1, "Add observer must not fire again on second commit");
  assert.strictEqual(idemMaskEvents.length, 1, "Mask observer must not fire again on second commit");

  // 3. Repeated commits do not reapply changes if entity was modified externally
  idemWorld.removeComponent(newId1, C1);
  assert.strictEqual(idemWorld.hasComponent(newId1, C1), false, "Entity no longer has C1");
  editorNew.commit(); // Calling commit again on already-committed editor
  assert.strictEqual(idemWorld.hasComponent(newId1, C1), false, "Repeated commit must not re-add C1 after external removal");

  // 4. Committing an existing entity editor twice behaves consistently (BAT-004, BAT-005)
  const existingEntity = idemWorld.createEntity();
  const editEventsC2: number[] = [];
  idemWorld.subscribeOnAdd(C2, (e) => editEventsC2.push(e));

  const editorExisting = idemWorld.edit(existingEntity).add(C2, { val: 20 });
  const editId1 = editorExisting.commit();
  assert.strictEqual(editId1, existingEntity, "First commit returns existing entity ID");
  assert.strictEqual(idemWorld.hasComponent(existingEntity, C2), true, "Existing entity has C2");
  assert.strictEqual(editEventsC2.length, 1, "C2 add observer fired once");

  const editId2 = editorExisting.commit();
  assert.strictEqual(editId2, existingEntity, "Second commit returns existing entity ID");
  assert.strictEqual(editEventsC2.length, 1, "C2 add observer does not fire a second time");

  // 5. Explicit commit followed by automatic flush does not reapply changes
  idemAddEventsC1.length = 0;
  const editorFlush = idemWorld.buildEntity().add(C1, { val: 99 });
  const flushId = editorFlush.commit();
  assert.strictEqual(flushId, editorFlush.entityId, "Explicit commit returns entity ID");
  assert.strictEqual(idemAddEventsC1.length, 1, "C1 add observer fired on explicit commit");
  idemWorld.flush(); // Auto-flush of active editors
  assert.strictEqual(idemAddEventsC1.length, 1, "Auto-flush must not reapply already committed editor");

  // 6. Uncommitted editor auto-flush followed by explicit commit
  idemAddEventsC1.length = 0;
  const editorAuto = idemWorld.buildEntity().add(C1, { val: 88 });
  idemWorld.flush(); // Auto-commits editorAuto
  assert.strictEqual(idemAddEventsC1.length, 1, "C1 add observer fired on auto-flush");
  const autoId = editorAuto.commit(); // Subsequent explicit commit
  assert.strictEqual(autoId, editorAuto.entityId, "Explicit commit after flush returns entity ID");
  assert.strictEqual(idemAddEventsC1.length, 1, "Explicit commit after auto-flush must not fire observer again");

  // 7. Commit on deleted entity is safe and does not revive entity
  const delEntity = idemWorld.createEntity();
  const delEditor = idemWorld.edit(delEntity).add(C1, { val: 55 });
  idemWorld.deleteEntity(delEntity);
  const delCommitId = delEditor.commit();
  assert.strictEqual(delCommitId, delEntity, "Commit on deleted entity returns entity ID");
  assert.strictEqual(idemWorld.isValid(delEntity), false, "Deleted entity must remain invalid after commit");
  assert.strictEqual(idemWorld.hasComponent(delEntity, C1), false, "Deleted entity must not have C1");

  // 8. Deferred batch repeated commits
  idemAddEventsC1.length = 0;
  idemWorld.setDeferred(true);
  const defEditor = idemWorld.buildEntity().add(C1, { val: 123 });
  defEditor.commit();
  defEditor.commit(); // Repeated commit in deferred mode
  assert.strictEqual(idemAddEventsC1.length, 0, "No observers fired before flush in deferred mode");
  idemWorld.setDeferred(false); // Flushes queue
  assert.strictEqual(idemAddEventsC1.length, 1, "Deferred batch must only apply once after repeated commits upon flush");

  // --- Tests: Snapshot Persistence & Version Compatibility (SAV-001 - SAV-006) ---
  const snapWorld = new World();
  snapWorld.registerComponent(C1);
  snapWorld.registerComponent(C2);

  const se1 = snapWorld.buildEntity().add(C1, { val: 10 }).add(C2, { val: 20 }).commit();
  snapWorld.tags.register("player", se1);
  snapWorld.groups.add("party", se1);

  const snapshot = snapWorld.saveSnapshot();
  assert.strictEqual(snapshot.version, 2, "Snapshot version should be 2");
  assert.strictEqual(snapshot.archetypes.length >= 1, true, "Snapshot should contain saved archetypes");

  // Restore snapshot into a new world
  const restoreWorld = new World();
  restoreWorld.registerComponent(C1);
  restoreWorld.registerComponent(C2);
  restoreWorld.loadSnapshot(snapshot);

  assert.strictEqual(restoreWorld.isValid(se1), true, "Restored entity ID should be valid");
  assert.deepStrictEqual(restoreWorld.getComponent(se1, C1), { val: 10 }, "Restored C1 data should match");
  assert.deepStrictEqual(restoreWorld.getComponent(se1, C2), { val: 20 }, "Restored C2 data should match");
  assert.strictEqual(restoreWorld.tags.get("player"), se1, "Restored tag should map to entity");
  assert.strictEqual(restoreWorld.groups.has("party", se1), true, "Restored group should contain entity");

  // Rejection of legacy snapshot version (e.g. version 1)
  const legacySnapshot = { ...snapshot, version: 1 };
  assert.throws(
    () => restoreWorld.loadSnapshot(legacySnapshot),
    /Unsupported ECS snapshot version: 1\. Expected: 2/,
    "Loading incompatible snapshot version 1 must throw an explicit error"
  );

  // --- Tests: Free-Pool Entity Invalidation via World & Snapshot (ENT-001, ENT-007 - ENT-011) ---
  const worldFree = new World();
  worldFree.registerComponent(C1);

  const we1 = worldFree.createEntity();
  worldFree.addComponent(we1, C1, { val: 123 });
  worldFree.deleteEntity(we1);

  const freeEntities = worldFree.saveSnapshot().freeEntities;
  assert.strictEqual(freeEntities.length, 1, "World should have 1 free entity in snapshot");
  const waitingWorldFreeId = freeEntities[0];

  assert.strictEqual(worldFree.isValid(waitingWorldFreeId), false, "Free ID in World must be invalid before reallocation");
  worldFree.addComponent(waitingWorldFreeId, C1, { val: 999 });
  assert.strictEqual(worldFree.hasComponent(waitingWorldFreeId, C1), false, "Adding component to free ID must not succeed");
  worldFree.deleteEntity(waitingWorldFreeId); // Safe no-op

  // Save snapshot with free entities and restore
  const freeSnap = worldFree.saveSnapshot();
  const restoreWorldFree = new World();
  restoreWorldFree.registerComponent(C1);
  restoreWorldFree.loadSnapshot(freeSnap);

  assert.strictEqual(
    restoreWorldFree.isValid(waitingWorldFreeId),
    false,
    "Free ID must remain invalid after snapshot restoration"
  );

  const we2 = restoreWorldFree.createEntity();
  assert.strictEqual(we2, waitingWorldFreeId, "createEntity() in restored world must return recycled free ID");
  assert.strictEqual(restoreWorldFree.isValid(we2), true, "Reallocated entity must be valid in restored world");

  // --- Tests: Deferred Operations on Invalid / Recycled Entity IDs (STR-004 - STR-007, ENT-001) ---
  // Issue B.1: addComponent on invalid/free-pool ID during deferred mode
  const defValWorld = new World();
  defValWorld.registerComponent(C1);
  defValWorld.registerComponent(C2);

  const dvEntity1 = defValWorld.createEntity();
  defValWorld.deleteEntity(dvEntity1); // Deleted and placed in freeEntities

  defValWorld.setDeferred(true);
  // Attempt to add component using free-pool ID (currently invalid)
  defValWorld.addComponent(dvEntity1, C1, { val: "should-not-be-added" });

  // Reallocate that same slot before flushing
  const reallocatedDv1 = defValWorld.createEntity();
  assert.notStrictEqual(reallocatedDv1, dvEntity1, "Reallocated entity must have new generation ID");
  assert.strictEqual(Math.floor(reallocatedDv1 / 65536), Math.floor(dvEntity1 / 65536), "Reallocated entity shares same slot index");

  // Flush deferred queue
  defValWorld.setDeferred(false);

  // Verify the invalid operation did NOT modify the newly created entity
  assert.strictEqual(
    defValWorld.hasComponent(reallocatedDv1, C1),
    false,
    "Deferred addComponent on stale/free-list ID must not apply to newly reallocated entity"
  );

  // Issue B.2: removeComponent on invalid/free-pool ID during deferred mode
  const dvEntity2 = defValWorld.createEntity();
  defValWorld.addComponent(dvEntity2, C1, { val: "initial" });
  defValWorld.deleteEntity(dvEntity2);

  defValWorld.setDeferred(true);
  // Attempt to remove component using free-pool ID (currently invalid)
  defValWorld.removeComponent(dvEntity2, C1);

  // Reallocate same slot and give it C1
  const reallocatedDv2 = defValWorld.createEntity();
  defValWorld.addComponent(reallocatedDv2, C1, { val: "new-entity-value" });

  // Flush deferred queue
  defValWorld.setDeferred(false);

  // Verify the invalid operation did NOT remove component from newly created entity
  assert.strictEqual(
    defValWorld.hasComponent(reallocatedDv2, C1),
    true,
    "Deferred removeComponent on stale/free-list ID must not remove component from newly reallocated entity"
  );
  assert.deepStrictEqual(
    defValWorld.getComponent(reallocatedDv2, C1),
    { val: "new-entity-value" },
    "Reallocated entity component value must remain intact"
  );

  // Issue B.3: deleteEntity on invalid/free-pool ID during deferred mode
  const dvEntity3 = defValWorld.createEntity();
  defValWorld.deleteEntity(dvEntity3);

  defValWorld.setDeferred(true);
  // Attempt to delete invalid entity in deferred mode
  defValWorld.deleteEntity(dvEntity3);

  // Reallocate same slot
  const reallocatedDv3 = defValWorld.createEntity();

  // Flush
  defValWorld.setDeferred(false);

  // Verify newly created entity was NOT deleted
  assert.strictEqual(
    defValWorld.isValid(reallocatedDv3),
    true,
    "Deferred deleteEntity on stale/free-list ID must not delete newly reallocated entity"
  );

  // Issue B.4: Valid deferred operations on live entities continue to work properly
  const liveDefEntity = defValWorld.createEntity();
  defValWorld.setDeferred(true);
  defValWorld.addComponent(liveDefEntity, C1, { val: "live-def" });
  assert.strictEqual(defValWorld.hasComponent(liveDefEntity, C1), false, "Not added before flush");
  defValWorld.flush(); // direct flush
  assert.strictEqual(defValWorld.hasComponent(liveDefEntity, C1), true, "Added after flush");
  assert.deepStrictEqual(defValWorld.getComponent(liveDefEntity, C1), { val: "live-def" });

  // --- Task 7D: Prevent deferred deletion of invalid entity IDs (ENT-010, STR-004 - STR-009) ---
  const delDefWorld = new World();
  const dEntity = delDefWorld.createEntity();
  delDefWorld.deleteEntity(dEntity);

  const freeIds = delDefWorld.saveSnapshot().freeEntities;
  assert.strictEqual(freeIds.length, 1, "There should be 1 ID waiting in the free pool");
  const waitingNextGenId = freeIds[0];
  assert.strictEqual(delDefWorld.isValid(waitingNextGenId), false, "Free pool ID must be invalid prior to allocation");

  delDefWorld.setDeferred(true);
  // Call deleteEntity with invalid free-pool ID while deferred
  delDefWorld.deleteEntity(waitingNextGenId);

  // Allocate another entity before flushing; should reuse the waiting free ID
  const reusedEntity = delDefWorld.createEntity();
  assert.strictEqual(reusedEntity, waitingNextGenId, "createEntity should reuse the waiting free-pool ID");
  assert.strictEqual(delDefWorld.isValid(reusedEntity), true, "Reused entity must be valid immediately upon creation");

  // Flush the deferred queue
  delDefWorld.setDeferred(false);

  // Verify that the newly allocated entity remains valid and was not deleted by the queued operation
  assert.strictEqual(
    delDefWorld.isValid(reusedEntity),
    true,
    "Newly allocated entity must remain valid after flushing deferred delete of its prior free-pool ID"
  );

  // Also verify deleting an already-invalid entity remains a safe no-op in immediate and deferred modes
  delDefWorld.deleteEntity(dEntity); // Immediate with stale ID
  assert.strictEqual(delDefWorld.isValid(reusedEntity), true, "Immediate delete of stale ID is safe no-op");

  delDefWorld.setDeferred(true);
  delDefWorld.deleteEntity(999999); // Deferred with non-existent ID
  delDefWorld.deleteEntity(dEntity); // Deferred with stale ID
  delDefWorld.setDeferred(false);
  assert.strictEqual(delDefWorld.isValid(reusedEntity), true, "Deferred delete of invalid IDs is safe no-op");

  console.log("World tests completed!");
}

if (require.main === module) {
  testWorld();
}
