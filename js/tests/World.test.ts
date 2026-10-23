import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";
import { Mapper } from "../ECS/Mapper";
import { MAX_COMPONENT_ID } from "../ECS/Archetype";
import { registerAllComponents } from "../ECS/ComponentRegistry";
import { All, And, One, AnyOf, Exclude, NoneOf, ButNot, Inject, Singleton, SingletonComponent } from "../ECS/Decorators";
import { PrefabManager } from "../ECS/PrefabManager";
import { ENGINE_COMPONENT_ID_START, USER_COMPONENT_ID_START, InternalComponents } from "../ECS/InternalComponents";

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
  const C1 = 101;
  const C2 = 102;
  const C3 = 103;
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

  // --- Task 10: Audit Query Correctness and Cache Invalidation ---

  // 1. Query API Agreement (QRY-001 - QRY-004)
  // For the same unchanged world and Aspect: view(), getEntities(), count(), findFirst(), getArchetypes()
  {
    const qWorld = new World();
    const CA = 110;
    const CB = 111;
    const CC = 112;
    const CD = 113;
    qWorld.registerComponent(CA);
    qWorld.registerComponent(CB);
    qWorld.registerComponent(CC);
    qWorld.registerComponent(CD);

    // Create diverse entity population across different archetypes
    qWorld.createEntity(); // empty entity (no components)
    qWorld.buildEntity().with(CA, { val: "A" }).commit();
    qWorld.buildEntity().with(CB, { val: "B" }).commit();
    qWorld.buildEntity().with(CA, { val: "AB_A" }).with(CB, { val: "AB_B" }).commit();
    qWorld.buildEntity().with(CA, { val: "AC_A" }).with(CC, { val: "AC_C" }).commit();
    qWorld.buildEntity().with(CA, {}).with(CB, {}).with(CC, {}).commit();
    qWorld.buildEntity().with(CB, {}).with(CC, {}).with(CD, {}).commit();

    const aspectsToTest = [
      Aspect.all(CA),
      Aspect.all(CA, CB),
      Aspect.all(CA).exclude(CC),
      Aspect.one(CB, CD),
      Aspect.one(CA, CB).and(Aspect.one(CC, CD)),
      Aspect.EMPTY,
      Aspect.one(), // unsatisfiable
      Aspect.exclude(CA, CB, CC, CD),
      Aspect.all(CA).butNot(CB)
    ];

    for (const aspect of aspectsToTest) {
      const entitiesArray = qWorld.getEntities(aspect);
      const streamedEntities = Array.from(qWorld.view(aspect));
      const totalCount = qWorld.count(aspect);
      const firstEntity = qWorld.findFirst(aspect);
      const matchingArchetypes = qWorld.getArchetypes(aspect);

      // Verify no duplicate entities in array or view
      const uniqueArray = new Set(entitiesArray);
      assert.strictEqual(uniqueArray.size, entitiesArray.length, "getEntities must not contain duplicates");
      assert.strictEqual(new Set(streamedEntities).size, streamedEntities.length, "view must not contain duplicates");

      // Verify agreement between view() and getEntities()
      assert.strictEqual(entitiesArray.length, streamedEntities.length, "view and getEntities must agree on length");
      for (const ent of entitiesArray) {
        assert.ok(streamedEntities.includes(ent), `view must contain entity ${ent}`);
      }

      // Verify count() agreement
      assert.strictEqual(totalCount, entitiesArray.length, "count must equal getEntities length");

      // Verify findFirst() agreement
      if (entitiesArray.length === 0) {
        assert.strictEqual(firstEntity, undefined, "findFirst must return undefined when no entities match");
      } else {
        assert.ok(firstEntity !== undefined && entitiesArray.includes(firstEntity), "findFirst must return an entity from matching entities");
        assert.strictEqual(qWorld.matches(firstEntity, aspect), true, "findFirst entity must satisfy aspect");
      }

      // Verify getArchetypes() contains only matching archetypes without duplicates
      const uniqueArchs = new Set(matchingArchetypes);
      assert.strictEqual(uniqueArchs.size, matchingArchetypes.length, "getArchetypes must not return duplicate archetypes");
      for (const arch of matchingArchetypes) {
        assert.strictEqual(aspect.matches(arch.mask), true, "Each returned archetype mask must match aspect");
      }

      // Verify mutating returned archetype array does not corrupt query cache
      const originalArchCount = matchingArchetypes.length;
      matchingArchetypes.push(...matchingArchetypes); // external mutation
      const freshArchetypes = qWorld.getArchetypes(aspect);
      assert.strictEqual(freshArchetypes.length, originalArchCount, "Mutating getArchetypes return array must not corrupt cache");
    }
  }

  // 2. Cached queries and new archetypes (QRY-006)
  {
    const cqWorld = new World();
    const C1 = 120;
    const C2 = 121;
    const C3 = 122;
    cqWorld.registerComponent(C1);
    cqWorld.registerComponent(C2);
    cqWorld.registerComponent(C3);

    const query1 = Aspect.all(C1);
    // Populate query cache
    assert.strictEqual(cqWorld.count(query1), 0);
    assert.deepStrictEqual(cqWorld.getEntities(query1), []);

    // Create entity with C1 (new archetype mask C1)
    const ent1 = cqWorld.buildEntity().with(C1, {}).commit();
    assert.strictEqual(cqWorld.count(query1), 1);
    assert.deepStrictEqual(cqWorld.getEntities(query1), [ent1]);

    // Create entity with C2 (new archetype mask C2, non-matching)
    const ent2 = cqWorld.buildEntity().with(C2, {}).commit();
    assert.strictEqual(cqWorld.count(query1), 1);
    assert.deepStrictEqual(cqWorld.getEntities(query1), [ent1]);

    // Create entity with C1 + C3 (new archetype mask C1|C3, matching)
    const ent3 = cqWorld.buildEntity().with(C1, {}).with(C3, {}).commit();
    assert.strictEqual(cqWorld.count(query1), 2);
    const res = cqWorld.getEntities(query1);
    assert.strictEqual(res.length, 2);
    assert.ok(res.includes(ent1) && res.includes(ent3) && !res.includes(ent2));

    // Test repeated registration of existing archetype does not duplicate results
    const qm = (cqWorld as unknown as { queries: { registerArchetype: (arch: unknown) => void; invalidateCache: () => void } }).queries;
    const archC1 = (cqWorld as unknown as { components: { archetypes: Map<bigint, unknown> } }).components.archetypes.get(1n << BigInt(C1))!;
    assert.ok(archC1 !== undefined);
    qm.registerArchetype(archC1);
    qm.registerArchetype(archC1);

    assert.strictEqual(cqWorld.count(query1), 2, "Repeated registerArchetype must not duplicate count");
    assert.strictEqual(cqWorld.getEntities(query1).length, 2, "Repeated registerArchetype must not duplicate entities");
    assert.strictEqual(cqWorld.getArchetypes(query1).length, 2, "Repeated registerArchetype must not duplicate archetypes");

    // Invalidate cache and verify clean re-evaluation
    qm.invalidateCache();
    assert.strictEqual(cqWorld.count(query1), 2);
    assert.strictEqual(cqWorld.getEntities(query1).length, 2);
  }

  // 3. Structural changes: Immediate and Deferred (STR-001 - STR-007, ARC-006 - ARC-011)
  {
    const stWorld = new World();
    const CA = 130;
    const CB = 131;
    stWorld.registerComponent(CA);
    stWorld.registerComponent(CB);

    const queryA = Aspect.all(CA);
    const queryB = Aspect.all(CB);
    const queryAB = Aspect.all(CA, CB);

    // Warm caches
    assert.strictEqual(stWorld.count(queryA), 0);
    assert.strictEqual(stWorld.count(queryB), 0);
    assert.strictEqual(stWorld.count(queryAB), 0);

    // Create entity with CA
    const entity = stWorld.createEntity();
    stWorld.addComponent(entity, CA, { val: 1 });
    assert.strictEqual(stWorld.count(queryA), 1);
    assert.strictEqual(stWorld.count(queryB), 0);
    assert.strictEqual(stWorld.count(queryAB), 0);

    // Add CB (immediate transition to CA + CB)
    stWorld.addComponent(entity, CB, { val: 2 });
    assert.strictEqual(stWorld.count(queryA), 1);
    assert.strictEqual(stWorld.count(queryB), 1);
    assert.strictEqual(stWorld.count(queryAB), 1);

    // Remove CA (immediate transition to CB)
    stWorld.removeComponent(entity, CA);
    assert.strictEqual(stWorld.count(queryA), 0);
    assert.strictEqual(stWorld.count(queryB), 1);
    assert.strictEqual(stWorld.count(queryAB), 0);

    // Deferred structural changes
    stWorld.setDeferred(true);
    stWorld.addComponent(entity, CA, { val: 3 });
    stWorld.removeComponent(entity, CB);

    // Before flush, query results must reflect unchanged pre-flush state
    assert.strictEqual(stWorld.count(queryA), 0, "Deferred add must not affect query before flush");
    assert.strictEqual(stWorld.count(queryB), 1, "Deferred remove must not affect query before flush");

    // Flush
    stWorld.setDeferred(false);

    // After flush, query results must reflect updated state
    assert.strictEqual(stWorld.count(queryA), 1, "Deferred add must be reflected after flush");
    assert.strictEqual(stWorld.count(queryB), 0, "Deferred remove must be reflected after flush");
    assert.strictEqual(stWorld.count(queryAB), 0);

    // Batch edits via editEntity / EntityEditor
    const bEntity = stWorld.createEntity();
    stWorld.edit(bEntity).add(CA, { val: "batchA" }).add(CB, { val: "batchB" }).commit();
    assert.strictEqual(stWorld.count(queryAB), 1, "Batch edit adding CA and CB must update queryAB");

    // Deferred batch editing
    stWorld.setDeferred(true);
    stWorld.edit(bEntity).remove(CA).commit();
    assert.strictEqual(stWorld.count(queryAB), 1, "Deferred batch remove must not affect query before flush");
    stWorld.flush();
    assert.strictEqual(stWorld.count(queryAB), 0, "Deferred batch remove must update queryAB after flush");
    assert.strictEqual(stWorld.count(queryB), 1, "Deferred batch remove keeps CB");
    stWorld.setDeferred(false);
  }

  // 4. Deletion and ID Recycling (ENT-010, QRY-001)
  {
    const delWorld = new World();
    const CA = 140;
    const CB = 141;
    delWorld.registerComponent(CA);
    delWorld.registerComponent(CB);

    const queryA = Aspect.all(CA);
    const queryB = Aspect.all(CB);

    const ent1 = delWorld.buildEntity().with(CA, { name: "first" }).commit();
    const ent2 = delWorld.buildEntity().with(CA, { name: "second" }).commit();

    assert.strictEqual(delWorld.count(queryA), 2);
    assert.deepStrictEqual(new Set(delWorld.getEntities(queryA)), new Set([ent1, ent2]));

    // Delete ent1
    delWorld.deleteEntity(ent1);
    assert.strictEqual(delWorld.isValid(ent1), false);
    assert.strictEqual(delWorld.count(queryA), 1);
    assert.deepStrictEqual(delWorld.getEntities(queryA), [ent2]);
    assert.strictEqual(delWorld.findFirst(queryA), ent2);

    // Recycle ID: allocate new entity (reuses ent1's slot with new version)
    const ent3 = delWorld.createEntity();
    assert.notStrictEqual(ent3, ent1, "New entity must have a new generation/version ID");
    assert.strictEqual(delWorld.isValid(ent3), true);
    assert.strictEqual(delWorld.isValid(ent1), false, "Stale ID must remain invalid");

    // Before adding components, ent3 has no components
    assert.strictEqual(delWorld.count(queryA), 1);
    assert.strictEqual(delWorld.count(queryB), 0);

    // Give ent3 component CB
    delWorld.addComponent(ent3, CB, { name: "third" });
    assert.strictEqual(delWorld.count(queryA), 1);
    assert.strictEqual(delWorld.count(queryB), 1);
    assert.deepStrictEqual(delWorld.getEntities(queryB), [ent3]);

    // Ensure stale ent1 cannot match any queries
    assert.strictEqual(delWorld.matches(ent1, queryA), false);
    assert.strictEqual(delWorld.matches(ent1, queryB), false);
    assert.ok(!delWorld.getEntities(queryA).includes(ent1));
    assert.ok(!delWorld.getEntities(queryB).includes(ent1));
  }

  // 5. Composite Aspects and Cache Isolation (Task 9 Semantics Preservation)
  {
    const compWorld = new World();
    const CA = 150;
    const CB = 151;
    const CC = 152;
    const CD = 153;
    compWorld.registerComponent(CA);
    compWorld.registerComponent(CB);
    compWorld.registerComponent(CC);
    compWorld.registerComponent(CD);

    const eA_C = compWorld.buildEntity().with(CA, {}).with(CC, {}).commit();
    const eB_D = compWorld.buildEntity().with(CB, {}).with(CD, {}).commit();
    const eA_only = compWorld.buildEntity().with(CA, {}).commit();
    const eC_only = compWorld.buildEntity().with(CC, {}).commit();

    const conjunctive = Aspect.one(CA, CB).and(Aspect.one(CC, CD));
    const disjunctiveUnion = Aspect.one(CA, CB, CC, CD);
    const emptyOne = Aspect.one();
    const unconstrained = Aspect.EMPTY;

    // Conjunction query: requires (A or B) AND (C or D)
    const conjMatches = compWorld.getEntities(conjunctive);
    assert.strictEqual(conjMatches.length, 2);
    assert.ok(conjMatches.includes(eA_C) && conjMatches.includes(eB_D));
    assert.ok(!conjMatches.includes(eA_only) && !conjMatches.includes(eC_only));

    // Disjunctive union query: requires (A or B or C or D)
    const unionMatches = compWorld.getEntities(disjunctiveUnion);
    assert.strictEqual(unionMatches.length, 4);

    // Empty one: unsatisfiable, matches 0 entities
    assert.strictEqual(compWorld.count(emptyOne), 0);
    assert.deepStrictEqual(compWorld.getEntities(emptyOne), []);
    assert.strictEqual(compWorld.findFirst(emptyOne), undefined);

    // Unconstrained Aspect.EMPTY matches all entities
    assert.strictEqual(compWorld.count(unconstrained), 4);

    // Invalidate cache and re-verify isolation
    (compWorld as unknown as { queries: { invalidateCache: () => void } }).queries.invalidateCache();
    assert.strictEqual(compWorld.count(emptyOne), 0, "Unsatisfiable aspect remains unsatisfiable after cache invalidation");
    assert.strictEqual(compWorld.count(conjunctive), 2);
    assert.strictEqual(compWorld.count(disjunctiveUnion), 4);
    assert.strictEqual(compWorld.count(unconstrained), 4);
  }

  // --- Task 11: Audit Component and Archetype Storage Integrity ---

  // 1. Adding, Replacing, and Removing Components (CMP-006 - CMP-012)
  {
    const stWorld = new World();
    const CA = 160;
    const CB = 161;
    const CC = 162;
    stWorld.registerComponent(CA);
    stWorld.registerComponent(CB);
    stWorld.registerComponent(CC);

    const entity = stWorld.createEntity();
    assert.strictEqual(stWorld.hasComponent(entity, CA), false);
    assert.strictEqual(stWorld.getComponent(entity, CA), undefined);
    assert.strictEqual(stWorld.getMask(entity), 0n);

    // Add CA
    stWorld.addComponent(entity, CA, { name: "initial_A", num: 10 });
    assert.strictEqual(stWorld.hasComponent(entity, CA), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "initial_A", num: 10 });
    assert.strictEqual(stWorld.getMask(entity), 1n << BigInt(CA));
    assert.strictEqual(stWorld.count(Aspect.all(CA)), 1);

    // Replace CA via addComponent (non-structural value replacement)
    stWorld.addComponent(entity, CA, { name: "replaced_A", num: 20 });
    assert.strictEqual(stWorld.hasComponent(entity, CA), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "replaced_A", num: 20 });
    assert.strictEqual(stWorld.getMask(entity), 1n << BigInt(CA));

    // Update CA via setComponent
    assert.strictEqual(stWorld.setComponent(entity, CA, { name: "set_A", num: 30 }), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "set_A", num: 30 });

    // Update CA via updateComponent
    assert.strictEqual(stWorld.updateComponent<{ name: string; num: number }>(entity, CA, c => ({ ...c, num: c.num + 5 })), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "set_A", num: 35 });

    // Mutate CA via mutateComponent
    assert.strictEqual(stWorld.mutateComponent<{ name: string; num: number }>(entity, CA, c => { c.num = 40; }), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "set_A", num: 40 });

    // Add CB (transition to CA + CB)
    stWorld.addComponent(entity, CB, { valB: "beta" });
    assert.strictEqual(stWorld.hasComponent(entity, CA), true);
    assert.strictEqual(stWorld.hasComponent(entity, CB), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "set_A", num: 40 }, "CA value preserved across CB addition");
    assert.deepStrictEqual(stWorld.getComponent(entity, CB), { valB: "beta" });

    // Remove absent component CC (safe no-op, no mutation, no corruption)
    stWorld.removeComponent(entity, CC);
    assert.strictEqual(stWorld.hasComponent(entity, CC), false);
    assert.deepStrictEqual(stWorld.getComponent(entity, CA), { name: "set_A", num: 40 });
    assert.deepStrictEqual(stWorld.getComponent(entity, CB), { valB: "beta" });
    assert.strictEqual(stWorld.getMask(entity), (1n << BigInt(CA)) | (1n << BigInt(CB)));

    // Remove CA (transition to CB only)
    stWorld.removeComponent(entity, CA);
    assert.strictEqual(stWorld.hasComponent(entity, CA), false);
    assert.strictEqual(stWorld.getComponent(entity, CA), undefined);
    assert.strictEqual(stWorld.hasComponent(entity, CB), true);
    assert.deepStrictEqual(stWorld.getComponent(entity, CB), { valB: "beta" }, "CB value preserved across CA removal");
    assert.strictEqual(stWorld.getMask(entity), 1n << BigInt(CB));

    // Remove CB (transition to empty archetype 0n)
    stWorld.removeComponent(entity, CB);
    assert.strictEqual(stWorld.hasComponent(entity, CB), false);
    assert.strictEqual(stWorld.getComponent(entity, CB), undefined);
    assert.strictEqual(stWorld.getMask(entity), 0n);
    assert.strictEqual(stWorld.isValid(entity), true);
  }

  // 2. Archetype Transitions and Row Relocation Integrity (ARC-006 - ARC-011)
  {
    const arcWorld = new World();
    const CA = 170;
    const CB = 171;
    const CC = 172;
    arcWorld.registerComponent(CA);
    arcWorld.registerComponent(CB);
    arcWorld.registerComponent(CC);

    // Create 3 entities in archetype CA (rows 0, 1, 2)
    const e0 = arcWorld.buildEntity().with(CA, { id: "e0" }).commit();
    const e1 = arcWorld.buildEntity().with(CA, { id: "e1" }).commit();
    const e2 = arcWorld.buildEntity().with(CA, { id: "e2" }).commit();

    const em = (arcWorld as unknown as { entities: { getLocation: (ent: number) => { arch: unknown; row: number } | undefined } }).entities;
    assert.strictEqual(em.getLocation(e0)?.row, 0);
    assert.strictEqual(em.getLocation(e1)?.row, 1);
    assert.strictEqual(em.getLocation(e2)?.row, 2);

    // Transition non-last row (e0 at row 0) to archetype CA + CB
    // Archetype CA should swap e2 (last row 2) into row 0, updating e2's location to row 0.
    arcWorld.addComponent(e0, CB, { b: "e0_b" });

    assert.strictEqual(em.getLocation(e2)?.row, 0, "e2 must be moved to row 0 in archetype CA");
    assert.strictEqual(em.getLocation(e1)?.row, 1, "e1 must remain at row 1 in archetype CA");
    assert.strictEqual(em.getLocation(e0)?.row, 0, "e0 must be at row 0 in new archetype CA+CB");

    // Verify all entity component values remain intact and accurate after relocation
    assert.deepStrictEqual(arcWorld.getComponent(e0, CA), { id: "e0" });
    assert.deepStrictEqual(arcWorld.getComponent(e0, CB), { b: "e0_b" });
    assert.deepStrictEqual(arcWorld.getComponent(e1, CA), { id: "e1" });
    assert.deepStrictEqual(arcWorld.getComponent(e2, CA), { id: "e2" });

    // Transition last row (e1 at row 1) out of archetype CA to archetype CA + CC
    arcWorld.addComponent(e1, CC, { c: "e1_c" });
    assert.strictEqual(em.getLocation(e2)?.row, 0, "e2 remains at row 0 in archetype CA");
    assert.deepStrictEqual(arcWorld.getComponent(e2, CA), { id: "e2" });
    assert.deepStrictEqual(arcWorld.getComponent(e1, CA), { id: "e1" });
    assert.deepStrictEqual(arcWorld.getComponent(e1, CC), { c: "e1_c" });

    // Transition sole remaining row (e2 at row 0) out of archetype CA to become empty archetype (0n)
    arcWorld.removeComponent(e2, CA);
    assert.strictEqual(arcWorld.getMask(e2), 0n);
    assert.strictEqual(arcWorld.getComponent(e2, CA), undefined);

    // Transition e2 from empty archetype into existing archetype CA + CB
    arcWorld.addComponent(e2, CA, { id: "e2_revived" });
    arcWorld.addComponent(e2, CB, { b: "e2_b" });
    assert.deepStrictEqual(arcWorld.getComponent(e2, CA), { id: "e2_revived" });
    assert.deepStrictEqual(arcWorld.getComponent(e2, CB), { b: "e2_b" });
    assert.deepStrictEqual(arcWorld.getComponent(e0, CA), { id: "e0" });
    assert.deepStrictEqual(arcWorld.getComponent(e0, CB), { b: "e0_b" });
  }

  // 3. Multiple Entities and SoA Component Columns Integrity
  {
    const soaWorld = new World();
    const CA = 180;
    const CB = 181;
    const CC = 182;
    soaWorld.registerComponent(CA);
    soaWorld.registerComponent(CB);
    soaWorld.registerComponent(CC);

    const entities: number[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const ent = soaWorld.buildEntity()
        .with(CA, { valA: `A_${i}` })
        .with(CB, { valB: `B_${i}`, index: i })
        .commit();
      entities.push(ent);
    }

    // Verify initial values across all entities
    for (let i = 0; i < count; i++) {
      assert.deepStrictEqual(soaWorld.getComponent(entities[i], CA), { valA: `A_${i}` });
      assert.deepStrictEqual(soaWorld.getComponent(entities[i], CB), { valB: `B_${i}`, index: i });
    }

    // Remove CA from entity at index 2 (middle row)
    soaWorld.removeComponent(entities[2], CA);

    // Remove CA from entity at index 4 (last row)
    soaWorld.removeComponent(entities[4], CA);

    // Add CC to entity at index 0 (first row)
    soaWorld.addComponent(entities[0], CC, { valC: "C_0" });

    // Verify all entities maintain exact values without column cross-talk
    assert.deepStrictEqual(soaWorld.getComponent(entities[0], CA), { valA: "A_0" });
    assert.deepStrictEqual(soaWorld.getComponent(entities[0], CB), { valB: "B_0", index: 0 });
    assert.deepStrictEqual(soaWorld.getComponent(entities[0], CC), { valC: "C_0" });

    assert.deepStrictEqual(soaWorld.getComponent(entities[1], CA), { valA: "A_1" });
    assert.deepStrictEqual(soaWorld.getComponent(entities[1], CB), { valB: "B_1", index: 1 });
    assert.strictEqual(soaWorld.hasComponent(entities[1], CC), false);

    assert.strictEqual(soaWorld.hasComponent(entities[2], CA), false);
    assert.deepStrictEqual(soaWorld.getComponent(entities[2], CB), { valB: "B_2", index: 2 });

    assert.deepStrictEqual(soaWorld.getComponent(entities[3], CA), { valA: "A_3" });
    assert.deepStrictEqual(soaWorld.getComponent(entities[3], CB), { valB: "B_3", index: 3 });

    assert.strictEqual(soaWorld.hasComponent(entities[4], CA), false);
    assert.deepStrictEqual(soaWorld.getComponent(entities[4], CB), { valB: "B_4", index: 4 });
  }

  // 4. Registration, Partition, and Validation of Component IDs (CMP-001 - CMP-005)
  {
    const regWorld = new World();
    const VALID_ID = 150;
    regWorld.registerComponent(VALID_ID);

    // 4.1 Component ID Partition Enforcement (Engine: 0..99, User: 100..65535)
    // User component registration rejecting reserved engine IDs (boundary 99 vs 100)
    assert.throws(
      () => registerAllComponents(new World(), { ReservedComp: 99 }),
      /\[ECS\] CRITICAL: Invalid User Component ID 99 for 'ReservedComp'/,
      "User component registration must reject reserved engine ID 99"
    );
    assert.throws(
      () => registerAllComponents(new World(), { ReservedComp: 0 }),
      /\[ECS\] CRITICAL: Invalid User Component ID 0 for 'ReservedComp'/,
      "User component registration must reject reserved engine ID 0"
    );
    assert.throws(
      () => registerAllComponents(new World(), { ReservedComp: 50 }),
      /\[ECS\] CRITICAL: Invalid User Component ID 50 for 'ReservedComp'/,
      "User component registration must reject reserved engine ID 50"
    );

    // Direct World.registerComponent user partition enforcement
    const directRegWorld = new World();
    assert.throws(
      () => directRegWorld.registerComponent(0),
      /\[ECS\] Invalid User Component ID: 0/,
      "Direct user component registration must reject reserved ID 0"
    );
    assert.throws(
      () => directRegWorld.registerComponent(50),
      /\[ECS\] Invalid User Component ID: 50/,
      "Direct user component registration must reject reserved ID 50"
    );
    assert.throws(
      () => directRegWorld.registerComponent(99),
      /\[ECS\] Invalid User Component ID: 99/,
      "Direct user component registration must reject reserved ID 99"
    );
    directRegWorld.registerComponent(100);
    assert.strictEqual(directRegWorld.getRegisteredComponents().includes(100), true);
    directRegWorld.registerComponent(MAX_COMPONENT_ID);
    assert.strictEqual(directRegWorld.getRegisteredComponents().includes(MAX_COMPONENT_ID), true);
    assert.throws(
      () => directRegWorld.registerComponent(MAX_COMPONENT_ID + 1),
      /\[ECS\] Invalid User Component ID/,
      "Direct user component registration must reject ID > MAX_COMPONENT_ID"
    );

    // Engine initialization automatically registers internal components (0..99)
    const initWorld = new World();
    assert.strictEqual(initWorld.getRegisteredComponents().includes(ENGINE_COMPONENT_ID_START), true, "Internal CLOCK must be registered on world init");
    assert.strictEqual(initWorld.getRegisteredComponents().includes(ENGINE_COMPONENT_ID_START + 1), true, "Internal ENGINE_STATS must be registered on world init");
    assert.strictEqual(initWorld.getRegisteredComponents().includes(ENGINE_COMPONENT_ID_START + 2), true, "Internal PROGRESS must be registered on world init");
    assert.strictEqual(initWorld.getRegisteredComponents().includes(ENGINE_COMPONENT_ID_START + 3), true, "Internal INPUT must be registered on world init");
    assert.strictEqual(initWorld.getRegisteredComponents().includes(ENGINE_COMPONENT_ID_START + 4), true, "Internal SCREEN must be registered on world init");

    // Public API Surface: No public bypass method exists on World
    assert.strictEqual(
      typeof (directRegWorld as unknown as Record<string, unknown>).registerInternalComponent,
      "undefined",
      "World must not expose a public registerInternalComponent bypass method"
    );

    // Valid lower partition boundary (100)
    const validLowerWorld = new World();
    registerAllComponents(validLowerWorld, { LowerBoundComp: 100 });
    assert.strictEqual(validLowerWorld.getRegisteredComponents().includes(100), true, "ID 100 must be accepted as valid user component");

    // Valid upper partition boundary (65535)
    const validUpperWorld = new World();
    registerAllComponents(validUpperWorld, { UpperBoundComp: MAX_COMPONENT_ID });
    assert.strictEqual(validUpperWorld.getRegisteredComponents().includes(MAX_COMPONENT_ID), true, "ID 65535 must be accepted as valid user component");

    // Out of range upper partition boundary (65536)
    assert.throws(
      () => registerAllComponents(new World(), { ExceededComp: MAX_COMPONENT_ID + 1 }),
      new RegExp(`\\[ECS\\] CRITICAL: Invalid User Component ID ${MAX_COMPONENT_ID + 1} for 'ExceededComp'`),
      "User component registration must reject ID 65536 exceeding MAX_COMPONENT_ID"
    );

    // Duplicate component collision rejection in registerAllComponents
    const duplicateMap = {
      CompAlpha: 150,
      CompBeta: 150 // Collision on 150
    };
    assert.throws(
      () => registerAllComponents(new World(), duplicateMap),
      /\[ECS\] CRITICAL: Component ID Collision! ID 150/,
      "Duplicate component IDs in registry must fail"
    );

    // 4.2 Comprehensive Invalid Component ID Rejection across ALL Public APIs
    const invalidIds: unknown[] = [
      -1,
      -100,
      1.5,
      3.14159,
      NaN,
      Infinity,
      -Infinity,
      MAX_COMPONENT_ID + 1,
      65536,
      100000,
      Number.MAX_SAFE_INTEGER,
      "invalid"
    ];

    const testEntity = regWorld.createEntity();
    regWorld.addComponent(testEntity, VALID_ID, { data: "initial" });

    for (const inv of invalidIds) {
      const invId = inv as number;

      // Registration
      assert.throws(() => regWorld.registerComponent(invId), /\[ECS\] Invalid (User )?Component ID/);

      // World Add / Remove / Get / Set / Update / Mutate / Has
      assert.throws(() => regWorld.addComponent(testEntity, invId, {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.removeComponent(testEntity, invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.getComponent(testEntity, invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.setComponent(testEntity, invId, {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.updateComponent(testEntity, invId, c => c), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.mutateComponent(testEntity, invId, () => {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.hasComponent(testEntity, invId), /\[ECS\] Invalid Component ID/);

      // World Observers & Serializers
      assert.throws(() => regWorld.subscribeOnAdd(invId, () => {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.subscribeOnRemove(invId, () => {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.unsubscribeOnAdd(invId, () => {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.unsubscribeOnRemove(invId, () => {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.registerComponentSerializer(invId, { serialize: v => v, deserialize: v => v }), /\[ECS\] Invalid Component ID/);

      // World Singletons
      assert.throws(() => regWorld.getSingleton(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.setSingleton(invId, {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.hasSingleton(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.getOrCreateSingleton(invId, {}), /\[ECS\] Invalid Component ID/);

      // Aspect Construction
      assert.throws(() => Aspect.all(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => Aspect.one(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => Aspect.exclude(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => Aspect.all().butNot(invId), /\[ECS\] Invalid Component ID/);

      // Mapper
      assert.throws(() => new Mapper(regWorld, invId), /\[ECS\] Invalid Component ID/);

      // Entity Builder & Editor
      assert.throws(() => regWorld.buildEntity().add(invId, {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.edit(testEntity).get(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.edit(testEntity).has(invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.edit(testEntity).add(invId, {}), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.edit(testEntity).remove(invId), /\[ECS\] Invalid Component ID/);

      // Relationships
      assert.throws(() => regWorld.relationships.remove(testEntity, invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.relationships.getTargets(testEntity, invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.relationships.getTargetsArray(testEntity, invId), /\[ECS\] Invalid Component ID/);
      assert.throws(() => Array.from(regWorld.relationships.getRelated(invId, testEntity)), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.relationships.countRelated(invId, testEntity), /\[ECS\] Invalid Component ID/);
      assert.throws(() => regWorld.relationships.clearRelations(testEntity, invId), /\[ECS\] Invalid Component ID/);
    }

    // 4.3 Decorator Helper Component ID Validation
    // Rejection of invalid IDs
    assert.throws(() => All(-1), /\[ECS\] Invalid Component ID/);
    assert.throws(() => All(65536), /\[ECS\] Invalid Component ID/);
    assert.throws(() => And(NaN), /\[ECS\] Invalid Component ID/);
    assert.throws(() => One(-5), /\[ECS\] Invalid Component ID/);
    assert.throws(() => One(100000), /\[ECS\] Invalid Component ID/);
    assert.throws(() => AnyOf(Infinity), /\[ECS\] Invalid Component ID/);
    assert.throws(() => Exclude(-1), /\[ECS\] Invalid Component ID/);
    assert.throws(() => Exclude(65536), /\[ECS\] Invalid Component ID/);
    assert.throws(() => NoneOf(3.14), /\[ECS\] Invalid Component ID/);
    assert.throws(() => ButNot(NaN), /\[ECS\] Invalid Component ID/);
    assert.throws(() => Inject(65536), /\[ECS\] Invalid Component ID/);
    assert.throws(() => Inject(-1), /\[ECS\] Invalid Component ID/);
    assert.throws(() => Singleton(65536), /\[ECS\] Invalid Component ID/);
    assert.throws(() => Singleton(-1), /\[ECS\] Invalid Component ID/);
    assert.throws(() => SingletonComponent(65536), /\[ECS\] Invalid Component ID/);
    assert.throws(() => SingletonComponent(-1), /\[ECS\] Invalid Component ID/);

    // Acceptance of valid internal (0..99) and user (100..65535) component IDs
    assert.strictEqual(typeof All(0, 99, 100, 65535), "function");
    assert.strictEqual(typeof And(0, 100), "function");
    assert.strictEqual(typeof One(0, 99, 100, 65535), "function");
    assert.strictEqual(typeof AnyOf(0, 100), "function");
    assert.strictEqual(typeof Exclude(0, 99, 100, 65535), "function");
    assert.strictEqual(typeof NoneOf(0, 100), "function");
    assert.strictEqual(typeof ButNot(0, 100), "function");
    assert.strictEqual(typeof Inject(0), "function");
    assert.strictEqual(typeof Inject(100), "function");
    assert.strictEqual(typeof Inject(), "function");
    assert.strictEqual(typeof Singleton(0), "function");
    assert.strictEqual(typeof Singleton(100), "function");
    assert.strictEqual(typeof SingletonComponent(0), "function");
    assert.strictEqual(typeof SingletonComponent(100), "function");

    // 4.4 PrefabManager Template and Override Component ID Validation
    const pfWorld = new World();
    const prefabMgr = new PrefabManager(pfWorld);
    assert.throws(
      () => prefabMgr.register("InvalidCompPrefab", {
        name: "InvalidCompPrefab",
        components: [{ id: -1, value: {} }]
      }),
      /\[ECS\] Invalid Component ID: -1 in prefab 'InvalidCompPrefab'/
    );
    assert.throws(
      () => prefabMgr.register("InvalidRelPrefab", {
        name: "InvalidRelPrefab",
        components: [{ id: 100, value: {} }],
        relationships: [{ id: 65536, targetTag: "tag" }]
      }),
      /\[ECS\] Invalid Component ID: 65536 in prefab 'InvalidRelPrefab'/
    );
    prefabMgr.register("ValidPrefab", {
      name: "ValidPrefab",
      components: [{ id: 100, value: { v: 1 } }]
    });
    const badOverrides = new Map<number, unknown>([[65536, { v: 2 }]]);
    assert.throws(
      () => prefabMgr.spawn("ValidPrefab", badOverrides),
      /\[ECS\] Invalid Component ID: 65536 in overrides for prefab 'ValidPrefab'/
    );

    // 4.5 State Integrity Preservation after Rejected Operations
    const preMask = regWorld.getMask(testEntity);
    const preValue = regWorld.getComponent(testEntity, VALID_ID);
    assert.throws(() => regWorld.addComponent(testEntity, -1, { corrupt: true }));
    assert.throws(() => regWorld.setComponent(testEntity, 65536, { corrupt: true }));
    assert.throws(() => regWorld.updateComponent(testEntity, NaN, c => c));
    assert.throws(() => regWorld.mutateComponent(testEntity, Infinity, () => {}));
    assert.throws(() => regWorld.edit(testEntity).add(-1, { corrupt: true }));
    assert.throws(() => regWorld.edit(testEntity).remove(65536));

    // Entity state must remain completely unaltered
    assert.strictEqual(regWorld.getMask(testEntity), preMask, "Mask must be unmutated after rejected operations");
    assert.deepStrictEqual(regWorld.getComponent(testEntity, VALID_ID), preValue, "Component value must be intact after rejected operations");
    assert.strictEqual(regWorld.count(Aspect.all(VALID_ID)), 1, "Query count must remain consistent");

    // 4.6 Distinguishing Invalid IDs from Valid Absent Components
    const ABSENT_VALID_ID = 5000; // Valid ID in range [100..65535], but absent on testEntity
    assert.strictEqual(regWorld.getComponent(testEntity, ABSENT_VALID_ID), undefined, "Absent component returns undefined");
    assert.strictEqual(regWorld.hasComponent(testEntity, ABSENT_VALID_ID), false, "Absent component returns false");
    assert.strictEqual(regWorld.setComponent(testEntity, ABSENT_VALID_ID, { data: "fail" }), false, "Setting absent component returns false");
    assert.strictEqual(regWorld.updateComponent(testEntity, ABSENT_VALID_ID, c => c), false, "Updating absent component returns false");
    assert.strictEqual(regWorld.mutateComponent(testEntity, ABSENT_VALID_ID, () => {}), false, "Mutating absent component returns false");

    // Track removal observer to prove removing absent component is a safe no-op that emits NO notifications
    let removeNotificationFired = false;
    regWorld.subscribeOnRemove(ABSENT_VALID_ID, () => {
      removeNotificationFired = true;
    });

    regWorld.removeComponent(testEntity, ABSENT_VALID_ID);
    assert.strictEqual(removeNotificationFired, false, "Removing absent component must not fire remove observer");
    assert.deepStrictEqual(regWorld.getComponent(testEntity, VALID_ID), { data: "initial" }, "Storage remains intact after removing absent component");

    // Batch editor absent component handling
    const edit = regWorld.edit(testEntity);
    assert.strictEqual(edit.get(ABSENT_VALID_ID), undefined, "Editor get for absent component returns undefined");
    assert.strictEqual(edit.has(ABSENT_VALID_ID), false, "Editor has for absent component returns false");
    edit.remove(ABSENT_VALID_ID);
    edit.commit();
    assert.strictEqual(removeNotificationFired, false, "Editor removing absent component must not fire remove observer");

    // 4.7 Reserved Component ID Usage & Legitimate Internal Component Operation (Task 11)
    const resWorld = new World();
    const UNUSED_RESERVED_ID = 50; // In range [0..99], but not registered in InternalComponents
    const UNUSED_RESERVED_ID_2 = 99; // Boundary of reserved range [0..99]
    const validTarget = resWorld.createEntity();
    const entityA = resWorld.createEntity();

    // 1. Unused reserved IDs cannot be introduced into world storage through any public mutation API
    assert.throws(
      () => resWorld.addComponent(entityA, UNUSED_RESERVED_ID, { data: "illegal" }),
      /\[ECS\] Cannot add unregistered reserved component ID: 50/,
      "addComponent must reject unused reserved component IDs"
    );
    assert.throws(
      () => resWorld.addComponent(entityA, UNUSED_RESERVED_ID_2, { data: "illegal" }),
      /\[ECS\] Cannot add unregistered reserved component ID: 99/,
      "addComponent must reject unused reserved component IDs at range boundary"
    );
    assert.throws(
      () => resWorld.edit(entityA).add(UNUSED_RESERVED_ID, { data: "illegal" }),
      /\[ECS\] Cannot add unregistered reserved component ID: 50/,
      "EntityEditor.add must reject unused reserved component IDs"
    );
    assert.throws(
      () => resWorld.buildEntity().add(UNUSED_RESERVED_ID, { data: "illegal" }),
      /\[ECS\] Cannot add unregistered reserved component ID: 50/,
      "buildEntity().add must reject unused reserved component IDs"
    );
    assert.throws(
      () => resWorld.relationships.add(entityA, UNUSED_RESERVED_ID, validTarget),
      /\[ECS\] Cannot add unregistered reserved component ID: 50/,
      "relationships.add must reject unused reserved component IDs"
    );
    assert.throws(
      () => resWorld.applyBatchChanges(entityA, 1n << BigInt(UNUSED_RESERVED_ID), new Map([[UNUSED_RESERVED_ID, {}]]), new Set()),
      /\[ECS\] Cannot add unregistered reserved component ID: 50/,
      "applyBatchChanges must reject unused reserved component IDs"
    );

    // PrefabManager validation of reserved IDs
    const pfManager = new PrefabManager(resWorld);
    assert.throws(
      () => pfManager.register("BadReservedPrefab", {
        name: "BadReservedPrefab",
        components: [{ id: UNUSED_RESERVED_ID, value: {} }]
      }),
      /\[ECS\] Cannot use unregistered reserved component ID: 50 in prefab 'BadReservedPrefab'/,
      "PrefabManager.register must reject unregistered reserved IDs in component templates"
    );
    assert.throws(
      () => pfManager.register("BadReservedRelPrefab", {
        name: "BadReservedRelPrefab",
        components: [{ id: 100, value: {} }],
        relationships: [{ id: UNUSED_RESERVED_ID, targetTag: "tag" }]
      }),
      /\[ECS\] Cannot use unregistered reserved component ID: 50 in prefab 'BadReservedRelPrefab'/,
      "PrefabManager.register must reject unregistered reserved IDs in relationship templates"
    );
    pfManager.register("GoodPrefabForOverride", {
      name: "GoodPrefabForOverride",
      components: [{ id: 100, value: { v: 1 } }]
    });
    assert.throws(
      () => pfManager.spawn("GoodPrefabForOverride", new Map([[UNUSED_RESERVED_ID, { v: 2 }]])),
      /\[ECS\] Cannot use unregistered reserved component ID: 50 in overrides for prefab 'GoodPrefabForOverride'/,
      "PrefabManager.spawn must reject unregistered reserved IDs in overrides"
    );

    // 2. Legitimate registered internal components (InternalComponents) remain fully usable
    const internalEnt = resWorld.createEntity();
    resWorld.addComponent(internalEnt, InternalComponents.CLOCK, { tick: 100 });
    resWorld.addComponent(internalEnt, InternalComponents.ENGINE_STATS, { fps: 60 });
    assert.strictEqual(resWorld.hasComponent(internalEnt, InternalComponents.CLOCK), true);
    assert.strictEqual(resWorld.hasComponent(internalEnt, InternalComponents.ENGINE_STATS), true);
    assert.deepStrictEqual(resWorld.getComponent(internalEnt, InternalComponents.CLOCK), { tick: 100 });
    assert.deepStrictEqual(resWorld.getComponent(internalEnt, InternalComponents.ENGINE_STATS), { fps: 60 });

    // Internal components in query APIs
    assert.strictEqual(resWorld.count(Aspect.all(InternalComponents.CLOCK)), 1);
    assert.strictEqual(resWorld.findFirst(Aspect.all(InternalComponents.CLOCK)), internalEnt);
    assert.deepStrictEqual(resWorld.getEntities(Aspect.all(InternalComponents.CLOCK, InternalComponents.ENGINE_STATS)), [internalEnt]);
    assert.deepStrictEqual(Array.from(resWorld.view(Aspect.all(InternalComponents.CLOCK))), [internalEnt]);

    // Internal components in EntityEditor and Relationships
    resWorld.edit(internalEnt).add(InternalComponents.PROGRESS, { percent: 75 }).commit();
    assert.deepStrictEqual(resWorld.getComponent(internalEnt, InternalComponents.PROGRESS), { percent: 75 });
    resWorld.relationships.add(internalEnt, InternalComponents.INPUT, validTarget);
    assert.deepStrictEqual(resWorld.relationships.getTargetsArray(internalEnt, InternalComponents.INPUT), [validTarget]);

    // Internal components in PrefabManager
    pfManager.register("InternalPrefab", {
      name: "InternalPrefab",
      components: [{ id: InternalComponents.SCREEN, value: { width: 800, height: 600 } }]
    });
    const spawnedInternal = pfManager.spawn("InternalPrefab");
    assert.strictEqual(resWorld.hasComponent(spawnedInternal, InternalComponents.SCREEN), true);
    assert.deepStrictEqual(resWorld.getComponent(spawnedInternal, InternalComponents.SCREEN), { width: 800, height: 600 });

    // 3. User component boundaries 100 and 65535 remain supported, 65536 is rejected
    const boundEnt = resWorld.createEntity();
    resWorld.addComponent(boundEnt, USER_COMPONENT_ID_START, { name: "minUser" }); // 100
    resWorld.addComponent(boundEnt, MAX_COMPONENT_ID, { name: "maxUser" }); // 65535
    assert.strictEqual(resWorld.hasComponent(boundEnt, USER_COMPONENT_ID_START), true);
    assert.strictEqual(resWorld.hasComponent(boundEnt, MAX_COMPONENT_ID), true);
    assert.deepStrictEqual(resWorld.getComponent(boundEnt, USER_COMPONENT_ID_START), { name: "minUser" });
    assert.deepStrictEqual(resWorld.getComponent(boundEnt, MAX_COMPONENT_ID), { name: "maxUser" });
    assert.throws(
      () => resWorld.addComponent(boundEnt, MAX_COMPONENT_ID + 1, { name: "outOfBounds" }),
      /\[ECS\] Invalid Component ID: 65536/,
      "addComponent must reject 65536"
    );

    // 4. Rejected operations leave storage, query results, and observer counts unchanged
    const testEnt2 = resWorld.createEntity();
    const VALID_USER_ID = 200;
    resWorld.addComponent(testEnt2, VALID_USER_ID, { v: "initial" });

    let maskChangeCount = 0;
    let addObserverCount = 0;
    resWorld.subscribeOnMaskChange(() => { maskChangeCount++; });
    resWorld.subscribeOnAdd(VALID_USER_ID, () => { addObserverCount++; });

    const maskBeforeRejections = resWorld.getMask(testEnt2);
    const valueBeforeRejections = resWorld.getComponent(testEnt2, VALID_USER_ID);
    const queryCountBefore = resWorld.count(Aspect.all(VALID_USER_ID));

    // Attempt invalid and unregistered reserved operations
    assert.throws(() => resWorld.addComponent(testEnt2, UNUSED_RESERVED_ID, { corrupt: true }));
    assert.throws(() => resWorld.addComponent(testEnt2, MAX_COMPONENT_ID + 1, { corrupt: true }));
    assert.throws(() => resWorld.edit(testEnt2).add(UNUSED_RESERVED_ID, { corrupt: true }));
    assert.throws(() => resWorld.edit(testEnt2).add(MAX_COMPONENT_ID + 1, { corrupt: true }));
    assert.throws(() => resWorld.relationships.add(testEnt2, UNUSED_RESERVED_ID, validTarget));
    assert.throws(() => resWorld.relationships.add(testEnt2, MAX_COMPONENT_ID + 1, validTarget));

    // Verify storage, query, and observer count invariance
    assert.strictEqual(resWorld.getMask(testEnt2), maskBeforeRejections, "Mask must be unaltered after rejected operations");
    assert.deepStrictEqual(resWorld.getComponent(testEnt2, VALID_USER_ID), valueBeforeRejections, "Component value must be unaltered");
    assert.strictEqual(resWorld.count(Aspect.all(VALID_USER_ID)), queryCountBefore, "Query count must be unaltered");
    assert.strictEqual(maskChangeCount, 0, "No mask change events should have fired");
    assert.strictEqual(addObserverCount, 0, "No component add events should have fired");
  }

  // 5. Batch Changes Consistency and Observer Integrity (BAT-001 - BAT-005, OBS-001 - OBS-007)
  {
    const bWorld = new World();
    const CA = 195;
    const CB = 196;
    const CC = 197;
    bWorld.registerComponent(CA);
    bWorld.registerComponent(CB);
    bWorld.registerComponent(CC);

    const maskChanges: Array<{ entity: number; oldMask: bigint; newMask: bigint }> = [];
    bWorld.subscribeOnMaskChange((entity, oldMask, newMask) => {
      maskChanges.push({ entity, oldMask, newMask });
    });

    const addEvents: Array<{ entity: number; compId: number }> = [];
    const removeEvents: Array<{ entity: number; compId: number }> = [];
    bWorld.subscribeOnAdd(CA, (e, c) => addEvents.push({ entity: e, compId: c }));
    bWorld.subscribeOnAdd(CB, (e, c) => addEvents.push({ entity: e, compId: c }));
    bWorld.subscribeOnAdd(CC, (e, c) => addEvents.push({ entity: e, compId: c }));
    bWorld.subscribeOnRemove(CA, (e, c) => removeEvents.push({ entity: e, compId: c }));
    bWorld.subscribeOnRemove(CB, (e, c) => removeEvents.push({ entity: e, compId: c }));
    bWorld.subscribeOnRemove(CC, (e, c) => removeEvents.push({ entity: e, compId: c }));

    const ent = bWorld.createEntity();
    bWorld.addComponent(ent, CA, { name: "A" });
    maskChanges.length = 0; // reset for batch observation
    addEvents.length = 0;
    removeEvents.length = 0;

    // Batch: replace CA (no add/remove event), add CB and CC
    bWorld.edit(ent)
      .add(CA, { name: "A_batch" }) // replace
      .add(CB, { name: "B_batch" }) // add
      .add(CC, { name: "C_batch" }) // add
      .commit();

    assert.deepStrictEqual(bWorld.getComponent(ent, CA), { name: "A_batch" });
    assert.deepStrictEqual(bWorld.getComponent(ent, CB), { name: "B_batch" });
    assert.deepStrictEqual(bWorld.getComponent(ent, CC), { name: "C_batch" });
    assert.strictEqual(bWorld.getMask(ent), (1n << BigInt(CA)) | (1n << BigInt(CB)) | (1n << BigInt(CC)));

    // Verify mask change notification emitted exactly one structural move
    assert.strictEqual(maskChanges.length, 1);
    assert.strictEqual(maskChanges[0].entity, ent);
    assert.strictEqual(maskChanges[0].oldMask, 1n << BigInt(CA));
    assert.strictEqual(maskChanges[0].newMask, (1n << BigInt(CA)) | (1n << BigInt(CB)) | (1n << BigInt(CC)));

    // Verify component add/remove events: CA replaced (no add event), CB and CC added
    assert.strictEqual(addEvents.length, 2);
    assert.ok(addEvents.some(ev => ev.compId === CB));
    assert.ok(addEvents.some(ev => ev.compId === CC));
    assert.strictEqual(removeEvents.length, 0);

    // Batch: Simultaneous removals and additions
    maskChanges.length = 0;
    addEvents.length = 0;
    removeEvents.length = 0;
    bWorld.edit(ent)
      .remove(CA)
      .remove(CB)
      .commit();

    assert.strictEqual(bWorld.hasComponent(ent, CA), false);
    assert.strictEqual(bWorld.hasComponent(ent, CB), false);
    assert.deepStrictEqual(bWorld.getComponent(ent, CC), { name: "C_batch" });
    assert.strictEqual(bWorld.getMask(ent), 1n << BigInt(CC));
    assert.strictEqual(maskChanges.length, 1);
    assert.strictEqual(removeEvents.length, 2);
    assert.ok(removeEvents.some(ev => ev.compId === CA));
    assert.ok(removeEvents.some(ev => ev.compId === CB));
    assert.strictEqual(addEvents.length, 0);

    // No-op batch: commit without edits
    maskChanges.length = 0;
    addEvents.length = 0;
    removeEvents.length = 0;
    bWorld.edit(ent).commit();
    assert.strictEqual(maskChanges.length, 0, "No-op batch must not emit mask changes or alter state");
    assert.strictEqual(addEvents.length, 0);
    assert.strictEqual(removeEvents.length, 0);
    assert.deepStrictEqual(bWorld.getComponent(ent, CC), { name: "C_batch" });
  }

  console.log("World tests completed!");
}

if (require.main === module) {
  testWorld();
}
