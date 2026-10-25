import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";
import { Mapper } from "../ECS/Mapper";
import { EntityId, Archetype, MAX_COMPONENT_ID } from "../ECS/Archetype";
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

  // 6. World Reset and Lifecycle (WLD-001 - WLD-006)
  {
    // 6.1 Entity and Storage Reset (WLD-002, WLD-005)
    const resetWorld = new World();
    const R_C1 = 210;
    const R_C2 = 211;
    const R_C3 = 212;
    resetWorld.registerComponent(R_C1);
    resetWorld.registerComponent(R_C2);
    resetWorld.registerComponent(R_C3);

    const e1 = resetWorld.createEntity();
    const e2 = resetWorld.createEntity();
    const e3 = resetWorld.createEntity();

    resetWorld.addComponent(e1, R_C1, { val: "e1_c1" });
    resetWorld.addComponent(e1, R_C2, { val: "e1_c2" });
    resetWorld.addComponent(e2, R_C2, { val: "e2_c2" });
    resetWorld.addComponent(e3, R_C3, { val: "e3_c3" });

    assert.strictEqual(resetWorld.isValid(e1), true);
    assert.strictEqual(resetWorld.isValid(e2), true);
    assert.strictEqual(resetWorld.isValid(e3), true);
    assert.strictEqual(resetWorld.hasComponent(e1, R_C1), true);

    // Perform World.clear()
    resetWorld.clear();

    // Verify all pre-clear entity IDs are completely invalidated
    assert.strictEqual(resetWorld.isValid(e1), false, "e1 must be invalid after clear");
    assert.strictEqual(resetWorld.isValid(e2), false, "e2 must be invalid after clear");
    assert.strictEqual(resetWorld.isValid(e3), false, "e3 must be invalid after clear");

    // Verify old IDs cannot read, write, or query component data
    assert.strictEqual(resetWorld.getComponent(e1, R_C1), undefined);
    assert.strictEqual(resetWorld.hasComponent(e1, R_C1), false);
    assert.strictEqual(resetWorld.setComponent(e1, R_C1, { val: "corrupt" }), false);
    assert.strictEqual(resetWorld.updateComponent(e1, R_C1, () => ({ val: "corrupt" })), false);
    assert.strictEqual(resetWorld.mutateComponent(e1, R_C1, () => {}), false);

    // Create new entities in the cleared world and verify normal operation
    const newE1 = resetWorld.createEntity();
    const newE2 = resetWorld.createEntity();
    assert.strictEqual(resetWorld.isValid(newE1), true);
    assert.strictEqual(resetWorld.isValid(newE2), true);

    // CRITICAL: New entities MUST NOT reuse old IDs from before World.clear()
    assert.notStrictEqual(newE1, e1, "newE1 must not reuse e1 ID");
    assert.notStrictEqual(newE1, e2, "newE1 must not reuse e2 ID");
    assert.notStrictEqual(newE1, e3, "newE1 must not reuse e3 ID");
    assert.notStrictEqual(newE2, e1, "newE2 must not reuse e1 ID");
    assert.notStrictEqual(newE2, e2, "newE2 must not reuse e2 ID");
    assert.notStrictEqual(newE2, e3, "newE2 must not reuse e3 ID");

    // Pre-clear IDs must REMAIN invalid even after new entities are created
    assert.strictEqual(resetWorld.isValid(e1), false, "e1 must remain invalid after new entity allocation");
    assert.strictEqual(resetWorld.isValid(e2), false, "e2 must remain invalid after new entity allocation");
    assert.strictEqual(resetWorld.isValid(e3), false, "e3 must remain invalid after new entity allocation");

    // Stale pre-clear IDs cannot read/write/delete new entity storage
    assert.strictEqual(resetWorld.getComponent(e1, R_C1), undefined);
    assert.strictEqual(resetWorld.hasComponent(e1, R_C1), false);
    assert.strictEqual(resetWorld.setComponent(e1, R_C1, { val: "stale" }), false);
    resetWorld.deleteEntity(e1); // Must not delete newE1

    resetWorld.addComponent(newE1, R_C1, { val: "new_e1_c1" });
    resetWorld.addComponent(newE2, R_C2, { val: "new_e2_c2" });

    assert.deepStrictEqual(resetWorld.getComponent(newE1, R_C1), { val: "new_e1_c1" });
    assert.deepStrictEqual(resetWorld.getComponent(newE2, R_C2), { val: "new_e2_c2" });
    assert.strictEqual(resetWorld.hasComponent(newE1, R_C1), true);
    assert.strictEqual(resetWorld.hasComponent(newE1, R_C2), false);

    resetWorld.deleteEntity(newE1);
    assert.strictEqual(resetWorld.isValid(newE1), false);
    assert.strictEqual(resetWorld.isValid(newE2), true);

    // 6.2 Singleton and Internal Component Lifecycle (WLD-001, WLD-003)
    const singWorld = new World();
    const USER_SING_ID = 215;
    singWorld.registerComponent(USER_SING_ID);

    const initialSingEntity = singWorld.getSingletonEntity();
    assert.strictEqual(singWorld.isValid(initialSingEntity), true, "Singleton entity must be valid on world init");
    assert.strictEqual(singWorld.tags.getTag(initialSingEntity), "__world_singletons__", "Singleton entity must have __world_singletons__ tag");

    singWorld.setSingleton(InternalComponents.CLOCK, { turn: 5 });
    singWorld.setSingleton(USER_SING_ID, { setting: "active" });

    assert.deepStrictEqual(singWorld.getSingleton(InternalComponents.CLOCK), { turn: 5 });
    assert.deepStrictEqual(singWorld.getSingleton(USER_SING_ID), { setting: "active" });

    // Clear world
    singWorld.clear();

    const postClearSingEntity = singWorld.getSingletonEntity();
    assert.strictEqual(singWorld.isValid(postClearSingEntity), true, "Recreated singleton entity must be valid after clear");
    assert.notStrictEqual(postClearSingEntity, initialSingEntity, "Recreated singleton must have a different ID from pre-clear singleton");
    assert.strictEqual(singWorld.isValid(initialSingEntity), false, "Pre-clear singleton ID must remain invalid");
    assert.strictEqual(singWorld.tags.getTag(postClearSingEntity), "__world_singletons__", "Recreated singleton entity must have __world_singletons__ tag");

    // Setting singletons after clear must work without failing
    singWorld.setSingleton(InternalComponents.CLOCK, { turn: 1 });
    singWorld.setSingleton(USER_SING_ID, { setting: "reset_done" });

    assert.deepStrictEqual(singWorld.getSingleton(InternalComponents.CLOCK), { turn: 1 });
    assert.deepStrictEqual(singWorld.getSingleton(USER_SING_ID), { setting: "reset_done" });

    // getOrCreateSingleton after clear
    const createdStats = singWorld.getOrCreateSingleton(InternalComponents.ENGINE_STATS, { entities: 0, archetypes: 0, systems: [], lastUpdateMs: 0 });
    assert.deepStrictEqual(createdStats, { entities: 0, archetypes: 0, systems: [], lastUpdateMs: 0 });
    assert.deepStrictEqual(singWorld.getSingleton(InternalComponents.ENGINE_STATS), { entities: 0, archetypes: 0, systems: [], lastUpdateMs: 0 });

    // Internal components remain registered and usable
    for (const internalId of Object.values(InternalComponents)) {
      assert.strictEqual(singWorld.isComponentRegistered(internalId), true, `Internal component ${internalId} must remain registered`);
    }

    // 6.3 Query Cache Reset & Archetype Isolation (WLD-002, QRY-006)
    const qWorld = new World();
    const Q_A = 220;
    const Q_B = 221;
    const Q_C = 222;
    qWorld.registerComponent(Q_A);
    qWorld.registerComponent(Q_B);
    qWorld.registerComponent(Q_C);

    const qe1 = qWorld.createEntity();
    const qe2 = qWorld.createEntity();
    qWorld.addComponent(qe1, Q_A, { a: 1 });
    qWorld.addComponent(qe1, Q_B, { b: 1 });
    qWorld.addComponent(qe2, Q_A, { a: 2 });

    const aspAllA = Aspect.all(Q_A);
    const aspAllAB = Aspect.all(Q_A, Q_B);
    const aspOne = Aspect.one(Q_B, Q_C);

    // Warm query cache
    assert.strictEqual(qWorld.count(aspAllA), 2);
    assert.strictEqual(qWorld.count(aspAllAB), 1);
    assert.strictEqual(qWorld.count(aspOne), 1);

    // Clear world
    qWorld.clear();

    // Queries immediately return 0 for user components
    assert.strictEqual(qWorld.count(aspAllA), 0, "Query cache must not return stale entities after clear");
    assert.strictEqual(qWorld.count(aspAllAB), 0);
    assert.strictEqual(qWorld.count(aspOne), 0);
    assert.deepStrictEqual(qWorld.getEntities(aspAllA), []);
    assert.strictEqual(qWorld.findFirst(aspAllA), undefined);

    // Create new entities and verify fresh query matching
    const qeNew = qWorld.createEntity();
    qWorld.addComponent(qeNew, Q_A, { a: 99 });
    qWorld.addComponent(qeNew, Q_B, { b: 99 });

    assert.strictEqual(qWorld.count(aspAllA), 1);
    assert.strictEqual(qWorld.count(aspAllAB), 1);
    assert.strictEqual(qWorld.count(aspOne), 1);
    assert.deepStrictEqual(qWorld.getEntities(aspAllAB), [qeNew]);
    assert.strictEqual(qWorld.findFirst(aspAllAB), qeNew);

    // 6.4 Pending Operations, Deferred Mode & EntityEditor Cancellation (WLD-002, BAT-005)
    const defWorld = new World();
    const DEF_C1 = 225;
    const DEF_C2 = 226;
    defWorld.registerComponent(DEF_C1);
    defWorld.registerComponent(DEF_C2);

    const defEnt = defWorld.createEntity();
    defWorld.setDeferred(true);

    defWorld.addComponent(defEnt, DEF_C1, { deferred: true });
    defWorld.deleteEntity(defEnt);

    // Create uncommitted active editors
    const editor = defWorld.edit(defEnt).add(DEF_C2, { editorVal: true });
    const builder = defWorld.buildEntity().add(DEF_C1, { builderVal: true });

    // Clear before flush
    defWorld.clear();

    // Verify that right after clear, the old entity index is invalid
    assert.strictEqual(defWorld.isValid(defEnt), false, "defEnt must be invalid immediately after clear");

    // Verify deferred mode was reset
    const liveEnt = defWorld.createEntity();
    defWorld.addComponent(liveEnt, DEF_C1, { immediate: true });
    assert.deepStrictEqual(defWorld.getComponent(liveEnt, DEF_C1), { immediate: true }, "Operations after clear must apply immediately");

    // Flushing must not replay stale deferred operations (e.g. stale deleteEntity)
    defWorld.flush();
    assert.strictEqual(defWorld.isValid(liveEnt), true, "liveEnt must remain valid; stale deleteEntity must not replay");
    assert.deepStrictEqual(defWorld.getComponent(liveEnt, DEF_C1), { immediate: true }, "liveEnt component must remain intact");

    // Committing discarded editors after clear must be safe no-ops
    editor.commit();
    builder.commit();
    assert.strictEqual(defWorld.count(Aspect.all(DEF_C2)), 0, "Cancelled editor commit must not add components to world");

    // 6.5 Tags, Groups, and Relationships Reset (WLD-002, WLD-005)
    const mgrWorld = new World();
    const REL_ID = 230;
    mgrWorld.registerComponent(REL_ID);

    const tagEnt = mgrWorld.createEntity();
    const grpEnt1 = mgrWorld.createEntity();
    const grpEnt2 = mgrWorld.createEntity();
    const subjEnt = mgrWorld.createEntity();
    const targetEnt = mgrWorld.createEntity();

    mgrWorld.tags.register("player", tagEnt);
    mgrWorld.groups.add("enemies", grpEnt1);
    mgrWorld.groups.add("enemies", grpEnt2);
    mgrWorld.relationships.add(subjEnt, REL_ID, targetEnt);

    assert.strictEqual(mgrWorld.tags.findFirst("player", mgrWorld), tagEnt);
    assert.strictEqual(mgrWorld.groups.count("enemies"), 2);
    assert.deepStrictEqual(mgrWorld.relationships.getTargetsArray(subjEnt, REL_ID), [targetEnt]);

    // Clear world
    mgrWorld.clear();

    // Verify all old tags, groups, and relationships are wiped
    assert.strictEqual(mgrWorld.tags.findFirst("player", mgrWorld), undefined);
    assert.deepStrictEqual(mgrWorld.tags.getEntities("player", mgrWorld), []);
    assert.strictEqual(mgrWorld.groups.count("enemies"), 0);
    assert.deepStrictEqual(mgrWorld.groups.getEntities("enemies", mgrWorld), []);
    assert.deepStrictEqual(mgrWorld.relationships.getTargetsArray(subjEnt, REL_ID), []);
    assert.deepStrictEqual(Array.from(mgrWorld.relationships.getRelated(REL_ID, targetEnt)), []);

    // Create new tags, groups, and relationships in cleared world
    const newHero = mgrWorld.createEntity();
    const newMonster = mgrWorld.createEntity();
    mgrWorld.tags.register("player", newHero);
    mgrWorld.groups.add("enemies", newMonster);
    mgrWorld.relationships.add(newMonster, REL_ID, newHero);

    assert.strictEqual(mgrWorld.tags.findFirst("player", mgrWorld), newHero);
    assert.deepStrictEqual(mgrWorld.groups.getEntities("enemies", mgrWorld), [newMonster]);
    assert.deepStrictEqual(mgrWorld.relationships.getTargetsArray(newMonster, REL_ID), [newHero]);
    assert.deepStrictEqual(Array.from(mgrWorld.relationships.getRelated(REL_ID, newHero)), [newMonster]);

    // 6.6 Observers and EventBus Lifecycle (WLD-002, WLD-004, OBS-006)
    const obsWorld = new World();
    const OBS_C = 235;
    obsWorld.registerComponent(OBS_C);

    let oldAddFired = 0;
    let oldRemoveFired = 0;
    let oldMaskFired = 0;
    let oldEventFired = 0;

    obsWorld.subscribeOnAdd(OBS_C, () => { oldAddFired++; });
    obsWorld.subscribeOnRemove(OBS_C, () => { oldRemoveFired++; });
    obsWorld.subscribeOnMaskChange(() => { oldMaskFired++; });
    obsWorld.events.subscribe("test_event", () => { oldEventFired++; });

    const preObsEnt = obsWorld.createEntity();
    obsWorld.addComponent(preObsEnt, OBS_C, { val: 1 });
    assert.strictEqual(oldAddFired, 1);
    assert.strictEqual(oldMaskFired, 1);

    // Clear world
    obsWorld.clear();

    // Verify old observers and event handlers do NOT fire on post-clear actions
    const postObsEnt = obsWorld.createEntity();
    obsWorld.addComponent(postObsEnt, OBS_C, { val: 2 });
    obsWorld.removeComponent(postObsEnt, OBS_C);
    obsWorld.events.publish({ type: "test_event" });

    assert.strictEqual(oldAddFired, 1, "Old add observer must not fire after clear");
    assert.strictEqual(oldRemoveFired, 0, "Old remove observer must not fire after clear");
    assert.strictEqual(oldMaskFired, 1, "Old mask observer must not fire after clear");
    assert.strictEqual(oldEventFired, 0, "Old event handler must not fire after clear");

    // Register new observers after clear and verify they function properly
    let newAddFired = 0;
    let newRemoveFired = 0;
    let newMaskFired = 0;
    let newEventFired = 0;

    obsWorld.subscribeOnAdd(OBS_C, () => { newAddFired++; });
    obsWorld.subscribeOnRemove(OBS_C, () => { newRemoveFired++; });
    obsWorld.subscribeOnMaskChange(() => { newMaskFired++; });
    obsWorld.events.subscribe("test_event_2", () => { newEventFired++; });

    obsWorld.addComponent(postObsEnt, OBS_C, { val: 3 });
    obsWorld.removeComponent(postObsEnt, OBS_C);
    obsWorld.events.publish({ type: "test_event_2" });

    assert.strictEqual(newAddFired, 1);
    assert.strictEqual(newRemoveFired, 1);
    assert.strictEqual(newMaskFired, 2);
    assert.strictEqual(newEventFired, 1);

    // 6.7 Repeated Reset Cycles (WLD-006)
    const cycleWorld = new World();
    const CYC_C1 = 240;
    const CYC_C2 = 241;
    cycleWorld.registerComponent(CYC_C1);
    cycleWorld.registerComponent(CYC_C2);

    const historicalIds = new Set<EntityId>();

    for (let cycle = 1; cycle <= 5; cycle++) {
      // Prior cycle IDs must remain invalid at start of new cycle
      for (const oldId of historicalIds) {
        assert.strictEqual(cycleWorld.isValid(oldId), false, `Historical ID ${oldId} from prior cycle must be invalid`);
      }

      // Create entities
      const entA = cycleWorld.createEntity();
      const entB = cycleWorld.createEntity();
      const singEnt = cycleWorld.getSingletonEntity();

      // No new entity ID or singleton can match any previous cycle's IDs
      assert.strictEqual(historicalIds.has(entA), false, `entA ${entA} must be a brand new unique ID`);
      assert.strictEqual(historicalIds.has(entB), false, `entB ${entB} must be a brand new unique ID`);
      assert.strictEqual(historicalIds.has(singEnt), false, `singEnt ${singEnt} must be a brand new unique ID`);

      historicalIds.add(entA);
      historicalIds.add(entB);
      historicalIds.add(singEnt);

      cycleWorld.addComponent(entA, CYC_C1, { cycle, role: "A" });
      cycleWorld.addComponent(entB, CYC_C1, { cycle, role: "B" });
      cycleWorld.addComponent(entB, CYC_C2, { cycle, extra: true });

      cycleWorld.tags.register(`hero_cycle_${cycle}`, entA);
      cycleWorld.groups.add(`cycle_group`, entB);
      cycleWorld.setSingleton(InternalComponents.CLOCK, { turn: cycle * 10 });

      // Verify state in cycle
      assert.strictEqual(cycleWorld.count(Aspect.all(CYC_C1)), 2);
      assert.strictEqual(cycleWorld.count(Aspect.all(CYC_C2)), 1);
      assert.strictEqual(cycleWorld.tags.findFirst(`hero_cycle_${cycle}`, cycleWorld), entA);
      assert.strictEqual(cycleWorld.groups.count(`cycle_group`), 1);
      assert.deepStrictEqual(cycleWorld.getSingleton(InternalComponents.CLOCK), { turn: cycle * 10 });

      // Clear for next cycle
      cycleWorld.clear();

      // Assert post-clear invariants
      assert.strictEqual(cycleWorld.isValid(entA), false);
      assert.strictEqual(cycleWorld.isValid(entB), false);
      assert.strictEqual(cycleWorld.isValid(singEnt), false);
      assert.strictEqual(cycleWorld.count(Aspect.all(CYC_C1)), 0);
      assert.strictEqual(cycleWorld.count(Aspect.all(CYC_C2)), 0);
      assert.strictEqual(cycleWorld.groups.count(`cycle_group`), 0);
      assert.strictEqual(cycleWorld.isValid(cycleWorld.getSingletonEntity()), true);
    }

    // 6.8 Snapshot Save / Load with Singleton Restoration (WLD-003, WLD-004)
    const snapWorld = new World();
    const SNAP_C = 245;
    snapWorld.registerComponent(SNAP_C);

    const snapEnt = snapWorld.createEntity();
    snapWorld.addComponent(snapEnt, SNAP_C, { payload: "entity_data" });
    snapWorld.setSingleton(InternalComponents.CLOCK, { turn: 42 });
    snapWorld.setSingleton(SNAP_C, { payload: "singleton_data" });
    snapWorld.tags.register("target", snapEnt);

    const snapshot = snapWorld.saveSnapshot();

    // Clear world
    snapWorld.clear();
    assert.strictEqual(snapWorld.count(Aspect.all(SNAP_C)), 0);

    // Load snapshot
    snapWorld.loadSnapshot(snapshot);

    assert.strictEqual(snapWorld.count(Aspect.all(SNAP_C)), 2, "Entities and singleton with SNAP_C must be restored");
    assert.deepStrictEqual(snapWorld.getSingleton(InternalComponents.CLOCK), { turn: 42 }, "Clock singleton restored");
    assert.deepStrictEqual(snapWorld.getSingleton(SNAP_C), { payload: "singleton_data" }, "User singleton restored");

    const loadedTarget = snapWorld.tags.findFirst("target", snapWorld);
    assert.ok(loadedTarget !== undefined);
    assert.deepStrictEqual(snapWorld.getComponent(loadedTarget, SNAP_C), { payload: "entity_data" });

    // Modifying singleton after loadSnapshot
    snapWorld.setSingleton(InternalComponents.CLOCK, { turn: 43 });
    assert.deepStrictEqual(snapWorld.getSingleton(InternalComponents.CLOCK), { turn: 43 });

    // 6.9 Snapshot Entity ID and Generation Pool Round-Trip (WLD-003, WLD-004)
    const rtWorld = new World();
    const RT_COMP = 246;
    rtWorld.registerComponent(RT_COMP);

    const rtE1 = rtWorld.createEntity();
    const rtE2 = rtWorld.createEntity();
    rtWorld.addComponent(rtE1, RT_COMP, { v: 10 });
    rtWorld.addComponent(rtE2, RT_COMP, { v: 20 });
    // Delete rtE1 so it is in freeEntities with incremented generation
    rtWorld.deleteEntity(rtE1);

    const rtSnapshot = rtWorld.saveSnapshot();
    const freePoolBefore = rtSnapshot.freeEntities;

    // Reset and load
    const restoredWorld = new World();
    restoredWorld.registerComponent(RT_COMP);
    restoredWorld.loadSnapshot(rtSnapshot);

    // Verify exact entity ID preservation: rtE2 must be valid, rtE1 must remain invalid
    assert.strictEqual(restoredWorld.isValid(rtE2), true, "Active entity rtE2 must be valid with identical ID after snapshot load");
    assert.strictEqual(restoredWorld.isValid(rtE1), false, "Deleted entity rtE1 must remain invalid after snapshot load");
    assert.deepStrictEqual(restoredWorld.getComponent(rtE2, RT_COMP), { v: 20 });
    assert.deepStrictEqual(restoredWorld.saveSnapshot().freeEntities, freePoolBefore, "Free entity pool in saved snapshot must match original");

    // Creating an entity in restoredWorld should recycle from the loaded free pool (index of rtE1 with next generation)
    const recycledInRestored = restoredWorld.createEntity();
    assert.strictEqual(Math.floor(recycledInRestored / 65536), Math.floor(rtE1 / 65536), "Restored world recycles from loaded free pool");
    assert.notStrictEqual(recycledInRestored, rtE1, "Recycled entity ID must have incremented generation compared to original rtE1");
    assert.strictEqual(restoredWorld.isValid(rtE1), false, "Original rtE1 ID remains invalid");
    assert.strictEqual(restoredWorld.isValid(recycledInRestored), true);
  }

  // ==========================================
  // Task 14: Column Query Correctness (viewColumns, viewColumnsStrict)
  // ==========================================

  // 14.1 Column/entity alignment and data mapping
  {
    const colWorld = new World();
    const POS = 100;
    const VEL = 101;
    const HP = 102;
    colWorld.registerComponent(POS);
    colWorld.registerComponent(VEL);
    colWorld.registerComponent(HP);

    const e1 = colWorld.buildEntity().with(POS, { x: 10, y: 20 }).with(VEL, { vx: 1, vy: 2 }).with(HP, { cur: 100 }).commit();
    const e2 = colWorld.buildEntity().with(POS, { x: 30, y: 40 }).with(VEL, { vx: 3, vy: 4 }).with(HP, { cur: 200 }).commit();
    const e3 = colWorld.buildEntity().with(POS, { x: 50, y: 60 }).with(VEL, { vx: 5, vy: 6 }).with(HP, { cur: 300 }).commit();

    const aspect = Aspect.all(POS, VEL);
    let totalArchetypes = 0;
    let totalEntities = 0;

    for (const { arch, entities, columns } of colWorld.viewColumns(aspect, POS, VEL, HP)) {
      totalArchetypes++;
      assert.strictEqual(columns.length, 3, "Must yield exactly 3 columns");
      const [posCol, velCol, hpCol] = columns;
      assert.ok(posCol !== undefined && velCol !== undefined && hpCol !== undefined);
      assert.strictEqual(posCol.length, entities.length);
      assert.strictEqual(velCol.length, entities.length);
      assert.strictEqual(hpCol.length, entities.length);
      assert.deepStrictEqual(entities, [e1, e2, e3]);

      for (let row = 0; row < entities.length; row++) {
        totalEntities++;
        const ent = entities[row];
        assert.deepStrictEqual(posCol[row], colWorld.getComponent(ent, POS));
        assert.deepStrictEqual(velCol[row], colWorld.getComponent(ent, VEL));
        assert.deepStrictEqual(hpCol[row], colWorld.getComponent(ent, HP));
        assert.strictEqual(arch.getValue(POS, row), posCol[row]);
        assert.strictEqual(arch.getValue(VEL, row), velCol[row]);
        assert.strictEqual(arch.getValue(HP, row), hpCol[row]);
      }
    }

    assert.strictEqual(totalArchetypes, 1);
    assert.strictEqual(totalEntities, 3);
  }

  // 14.2 Missing columns in ordinary viewColumns API (yields undefined for missing column)
  {
    const missingColWorld = new World();
    const C_A = 110;
    const C_B = 111;
    const C_C = 112;
    missingColWorld.registerComponent(C_A);
    missingColWorld.registerComponent(C_B);
    missingColWorld.registerComponent(C_C);

    // Archetype 1: has C_A only
    const eA = missingColWorld.buildEntity().with(C_A, { name: "onlyA" }).commit();
    // Archetype 2: has C_B only
    const eB = missingColWorld.buildEntity().with(C_B, { name: "onlyB" }).commit();
    // Archetype 3: has C_A and C_B
    const eAB = missingColWorld.buildEntity().with(C_A, { name: "AB_A" }).with(C_B, { name: "AB_B" }).commit();

    // Query matches all entities with at least C_A or C_B
    const aspect = Aspect.one(C_A, C_B);
    const results = Array.from(missingColWorld.viewColumns(aspect, C_A, C_B, C_C));

    assert.strictEqual(results.length, 3, "Must yield all 3 matching archetypes");

    let foundA = false;
    let foundB = false;
    let foundAB = false;

    for (const { entities, columns } of results) {
      assert.strictEqual(columns.length, 3);
      const [colA, colB, colC] = columns;
      // C_C is absent in all archetypes
      assert.strictEqual(colC, undefined, "Missing column C_C must be undefined");

      if (entities.includes(eA)) {
        foundA = true;
        assert.ok(colA !== undefined, "colA must be defined for archetype with C_A");
        assert.strictEqual(colB, undefined, "colB must be undefined for archetype without C_B");
        assert.strictEqual(colA.length, 1);
        assert.deepStrictEqual(colA[0], { name: "onlyA" });
      } else if (entities.includes(eB)) {
        foundB = true;
        assert.strictEqual(colA, undefined, "colA must be undefined for archetype without C_A");
        assert.ok(colB !== undefined, "colB must be defined for archetype with C_B");
        assert.strictEqual(colB.length, 1);
        assert.deepStrictEqual(colB[0], { name: "onlyB" });
      } else if (entities.includes(eAB)) {
        foundAB = true;
        assert.ok(colA !== undefined, "colA must be defined for archetype with C_A and C_B");
        assert.ok(colB !== undefined, "colB must be defined for archetype with C_A and C_B");
        assert.strictEqual(colA.length, 1);
        assert.strictEqual(colB.length, 1);
        assert.deepStrictEqual(colA[0], { name: "AB_A" });
        assert.deepStrictEqual(colB[0], { name: "AB_B" });
      }
    }

    assert.strictEqual(foundA, true);
    assert.strictEqual(foundB, true);
    assert.strictEqual(foundAB, true);
  }

  // 14.3 Strict behavior: viewColumnsStrict throws on missing column, safe on no-match
  {
    const strictWorld = new World();
    const S_A = 120;
    const S_B = 121;
    const S_C = 122;
    const S_UNUSED = 123;
    strictWorld.registerComponent(S_A);
    strictWorld.registerComponent(S_B);
    strictWorld.registerComponent(S_C);
    strictWorld.registerComponent(S_UNUSED);

    strictWorld.buildEntity().with(S_A, { a: 1 }).commit();
    strictWorld.buildEntity().with(S_A, { a: 2 }).with(S_B, { b: 2 }).commit();

    // 1. viewColumnsStrict on Aspect.all(S_A, S_B) requesting S_A, S_B
    let countStrict = 0;
    for (const { entities, columns: [colA, colB] } of strictWorld.viewColumnsStrict(Aspect.all(S_A, S_B), S_A, S_B)) {
      countStrict += entities.length;
      assert.ok(colA !== undefined && colB !== undefined);
      assert.strictEqual(colA.length, entities.length);
      assert.strictEqual(colB.length, entities.length);
    }
    assert.strictEqual(countStrict, 1);

    // 2. viewColumnsStrict on Aspect.all(S_A) requesting S_A, S_B -> throws because archetype with only S_A lacks S_B
    assert.throws(
      () => {
        Array.from(strictWorld.viewColumnsStrict(Aspect.all(S_A), S_A, S_B));
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /viewColumnsStrict: archetype mask=.* is missing column for componentId=121/);
        return true;
      },
      "viewColumnsStrict must throw with archetype mask and component ID when column is missing"
    );

    // 3. Query that matches NO archetypes does NOT throw
    let noMatchCount = 0;
    for (const { entities } of strictWorld.viewColumnsStrict(Aspect.all(S_UNUSED), S_UNUSED, S_A)) {
      noMatchCount += entities.length;
    }
    assert.strictEqual(noMatchCount, 0, "Query matching no archetypes must not throw and yields 0 chunks");

    // Unsatisfiable Aspect.one() matching no entities
    let unsatisfiableCount = 0;
    for (const { entities } of strictWorld.viewColumnsStrict(Aspect.one(), S_A)) {
      unsatisfiableCount += entities.length;
    }
    assert.strictEqual(unsatisfiableCount, 0);

    // 4. Empty Aspect (matches all) requesting S_A throws if an archetype lacks S_A
    strictWorld.buildEntity().with(S_C, { c: 1 }).commit(); // archetype with only S_C
    assert.throws(
      () => {
        Array.from(strictWorld.viewColumnsStrict(Aspect.EMPTY, S_A));
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /viewColumnsStrict: archetype mask=.* is missing column for componentId=120/);
        return true;
      },
      "viewColumnsStrict with Aspect.EMPTY must throw if any matching archetype lacks requested column"
    );
  }

  // 14.4 Edge Cases: empty componentIds, duplicate component IDs, invalid IDs, composite Aspects
  {
    const edgeWorld = new World();
    const E_A = 130;
    const E_B = 131;
    const E_C = 132;
    const E_D = 133;
    edgeWorld.registerComponent(E_A);
    edgeWorld.registerComponent(E_B);
    edgeWorld.registerComponent(E_C);
    edgeWorld.registerComponent(E_D);

    const ent1 = edgeWorld.buildEntity().with(E_A, { val: "A" }).with(E_C, { val: "C" }).commit();
    const ent2 = edgeWorld.buildEntity().with(E_B, { val: "B" }).with(E_D, { val: "D" }).commit();

    // 1. Empty componentIds
    const emptyColsResults = Array.from(edgeWorld.viewColumns(Aspect.all(E_A)));
    assert.strictEqual(emptyColsResults.length, 1);
    assert.deepStrictEqual(emptyColsResults[0].entities, [ent1]);
    assert.deepStrictEqual(emptyColsResults[0].columns, []);

    const emptyColsStrictResults = Array.from(edgeWorld.viewColumnsStrict(Aspect.all(E_A)));
    assert.strictEqual(emptyColsStrictResults.length, 1);
    assert.deepStrictEqual(emptyColsStrictResults[0].entities, [ent1]);
    assert.deepStrictEqual(emptyColsStrictResults[0].columns, []);

    // 2. Duplicate component IDs
    for (const { entities, columns } of edgeWorld.viewColumns(Aspect.all(E_A), E_A, E_A)) {
      assert.strictEqual(columns.length, 2);
      assert.strictEqual(columns[0], columns[1], "Duplicate component IDs must return the same column reference");
      assert.deepStrictEqual(columns[0]![0], { val: "A" });
      assert.deepStrictEqual(columns[1]![0], { val: "A" });
      assert.strictEqual(entities[0], ent1);
    }

    for (const { entities, columns } of edgeWorld.viewColumnsStrict(Aspect.all(E_A), E_A, E_A)) {
      assert.strictEqual(columns.length, 2);
      assert.strictEqual(columns[0], columns[1]);
      assert.deepStrictEqual(columns[0][0], { val: "A" });
      assert.strictEqual(entities[0], ent1);
    }

    // 3. Composite Aspect behavior: (E_A or E_B) AND (E_C or E_D)
    const compositeAspect = Aspect.one(E_A, E_B).and(Aspect.one(E_C, E_D));
    const compEntities: number[] = [];
    for (const { entities } of edgeWorld.viewColumns(compositeAspect)) {
      compEntities.push(...entities);
    }
    assert.strictEqual(compEntities.length, 2);
    assert.ok(compEntities.includes(ent1));
    assert.ok(compEntities.includes(ent2));

    // 4. Invalid Component ID validation
    const invalidIds = [-1, 1.5, NaN, Infinity, 65536];
    for (const badId of invalidIds) {
      assert.throws(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Array.from(edgeWorld.viewColumns(Aspect.all(E_A), badId as any));
        },
        { name: "Error", message: /Invalid Component ID/ },
        `viewColumns must reject invalid component ID ${badId}`
      );

      assert.throws(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Array.from(edgeWorld.viewColumnsStrict(Aspect.all(E_A), badId as any));
        },
        { name: "Error", message: /Invalid Component ID/ },
        `viewColumnsStrict must reject invalid component ID ${badId}`
      );
    }
  }

  // 14.5 Structural mutations: transitions, deletions, swap-and-pop relocation, batch edits, deferred flushes
  {
    const mutWorld = new World();
    const M_POS = 140;
    const M_VEL = 141;
    const M_TAG = 142;
    mutWorld.registerComponent(M_POS);
    mutWorld.registerComponent(M_VEL);
    mutWorld.registerComponent(M_TAG);

    // Create 3 entities in POS+VEL archetype
    const m1 = mutWorld.buildEntity().with(M_POS, { x: 1 }).with(M_VEL, { v: 10 }).commit();
    const m2 = mutWorld.buildEntity().with(M_POS, { x: 2 }).with(M_VEL, { v: 20 }).commit();
    const m3 = mutWorld.buildEntity().with(M_POS, { x: 3 }).with(M_VEL, { v: 30 }).commit();

    const aspect = Aspect.all(M_POS, M_VEL);

    // Initial check
    const initialChunks = Array.from(mutWorld.viewColumnsStrict(aspect, M_POS, M_VEL));
    assert.strictEqual(initialChunks.length, 1);
    assert.deepStrictEqual(initialChunks[0].entities, [m1, m2, m3]);
    assert.deepStrictEqual(initialChunks[0].columns[0], [{ x: 1 }, { x: 2 }, { x: 3 }]);
    assert.deepStrictEqual(initialChunks[0].columns[1], [{ v: 10 }, { v: 20 }, { v: 30 }]);

    // 1. Swap-and-pop row relocation: delete non-last row m2
    // m3 should move to row 1 (index of m2)
    mutWorld.deleteEntity(m2);

    const postDeleteChunks = Array.from(mutWorld.viewColumnsStrict(aspect, M_POS, M_VEL));
    assert.strictEqual(postDeleteChunks.length, 1);
    assert.deepStrictEqual(postDeleteChunks[0].entities, [m1, m3]);
    assert.deepStrictEqual(postDeleteChunks[0].columns[0], [{ x: 1 }, { x: 3 }]);
    assert.deepStrictEqual(postDeleteChunks[0].columns[1], [{ v: 10 }, { v: 30 }]);

    // 2. Archetype transition: add M_TAG to m1 (moves m1 to POS+VEL+TAG archetype)
    mutWorld.addComponent(m1, M_TAG, { tag: "leader" });

    const postAddChunks = Array.from(mutWorld.viewColumns(aspect, M_POS, M_VEL, M_TAG));
    assert.strictEqual(postAddChunks.length, 2, "Must yield both POS+VEL and POS+VEL+TAG archetypes");

    let foundPV = false;
    let foundPVT = false;
    for (const chunk of postAddChunks) {
      if (chunk.entities.includes(m1)) {
        foundPVT = true;
        assert.deepStrictEqual(chunk.entities, [m1]);
        assert.deepStrictEqual(chunk.columns[0]![0], { x: 1 });
        assert.deepStrictEqual(chunk.columns[1]![0], { v: 10 });
        assert.deepStrictEqual(chunk.columns[2]![0], { tag: "leader" });
      } else if (chunk.entities.includes(m3)) {
        foundPV = true;
        assert.deepStrictEqual(chunk.entities, [m3]);
        assert.deepStrictEqual(chunk.columns[0]![0], { x: 3 });
        assert.deepStrictEqual(chunk.columns[1]![0], { v: 30 });
        assert.strictEqual(chunk.columns[2], undefined, "M_TAG is absent in POS+VEL archetype");
      }
    }
    assert.strictEqual(foundPV, true);
    assert.strictEqual(foundPVT, true);

    // 3. Batch editing: change m3 to have M_TAG and remove M_VEL
    mutWorld.edit(m3).add(M_TAG, { tag: "scout" }).remove(M_VEL).commit();

    // m3 is now in POS+TAG archetype; Aspect.all(M_POS, M_VEL) only matches m1
    const postBatchChunks = Array.from(mutWorld.viewColumnsStrict(aspect, M_POS, M_VEL));
    assert.strictEqual(postBatchChunks.length, 1);
    assert.deepStrictEqual(postBatchChunks[0].entities, [m1]);

    // 4. Deferred operations
    mutWorld.setDeferred(true);
    // Queue deferred addition of M_VEL back to m3 and delete m1
    mutWorld.addComponent(m3, M_VEL, { v: 99 });
    mutWorld.deleteEntity(m1);

    // Before flush, viewColumns reflects pre-flush state (m1 has POS+VEL, m3 does not)
    const preFlushChunks = Array.from(mutWorld.viewColumnsStrict(aspect, M_POS, M_VEL));
    assert.strictEqual(preFlushChunks.length, 1);
    assert.deepStrictEqual(preFlushChunks[0].entities, [m1]);

    // Flush deferred queue
    mutWorld.setDeferred(false);

    // After flush, m1 is deleted and m3 is in POS+TAG+VEL archetype (matches aspect)
    const postFlushChunks = Array.from(mutWorld.viewColumnsStrict(aspect, M_POS, M_VEL));
    assert.strictEqual(postFlushChunks.length, 1);
    assert.deepStrictEqual(postFlushChunks[0].entities, [m3]);
    assert.deepStrictEqual(postFlushChunks[0].columns[0], [{ x: 3 }]);
    assert.deepStrictEqual(postFlushChunks[0].columns[1], [{ v: 99 }]);

    // 5. Empty archetype handling: delete m3 so POS+TAG+VEL archetype becomes empty
    mutWorld.deleteEntity(m3);
    const emptyArchChunks = Array.from(mutWorld.viewColumns(aspect, M_POS, M_VEL));
    assert.strictEqual(emptyArchChunks.length, 0, "Empty archetypes with 0 entities must not yield empty chunks");

    const emptyStrictChunks = Array.from(mutWorld.viewColumnsStrict(aspect, M_POS, M_VEL));
    assert.strictEqual(emptyStrictChunks.length, 0, "Empty archetypes with 0 entities must not yield empty chunks in viewColumnsStrict");
  }

  // 14.6 Strict queries against empty matching archetypes
  {
    const emptyMatchWorld = new World();
    const COMP_A = 150;
    const COMP_B = 151;
    emptyMatchWorld.registerComponent(COMP_A);
    emptyMatchWorld.registerComponent(COMP_B);

    const entA = emptyMatchWorld.buildEntity().with(COMP_A, { val: "A" }).commit();
    const entB = emptyMatchWorld.buildEntity().with(COMP_B, { val: "B" }).commit();

    emptyMatchWorld.deleteEntity(entB);

    const aspect = Aspect.one(COMP_A, COMP_B);

    const ordinaryResults = Array.from(emptyMatchWorld.viewColumns(aspect, COMP_A));
    assert.strictEqual(ordinaryResults.length, 1, "viewColumns must skip empty B-only archetype and yield only nonempty matching archetype");
    assert.deepStrictEqual(ordinaryResults[0].entities, [entA]);
    assert.deepStrictEqual(ordinaryResults[0].columns[0], [{ val: "A" }]);

    assert.throws(
      () => {
        Array.from(emptyMatchWorld.viewColumnsStrict(aspect, COMP_A));
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /viewColumnsStrict: archetype mask=.* is missing column for componentId=150/);
        return true;
      },
      "viewColumnsStrict must throw for empty matching archetype lacking requested column"
    );
  }

  // ==========================================
  // Task 15: Query Iteration and Structural Mutation Safety
  // ==========================================

  // 15.1 Query API agreement across aspects, groups, and tags
  {
    const qWorld = new World();
    const C_A = 160;
    const C_B = 161;
    const C_C = 162;
    const C_D = 163;
    qWorld.registerComponent(C_A);
    qWorld.registerComponent(C_B);
    qWorld.registerComponent(C_C);
    qWorld.registerComponent(C_D);

    const e1 = qWorld.buildEntity().with(C_A, { val: 1 }).with(C_B, { val: 10 }).tag("hero").group("party").commit();
    const e2 = qWorld.buildEntity().with(C_B, { val: 20 }).with(C_C, { val: 200 }).group("party").commit();
    const e3 = qWorld.buildEntity().with(C_A, { val: 3 }).with(C_C, { val: 300 }).group("monsters").commit();
    const e4 = qWorld.buildEntity().with(C_A, { val: 4 }).with(C_B, { val: 40 }).with(C_C, { val: 400 }).with(C_D, { val: 4000 }).tag("boss").group("monsters").commit();

    assert.ok(qWorld.isValid(e1) && qWorld.isValid(e2) && qWorld.isValid(e3) && qWorld.isValid(e4));

    const testAspects = [
      Aspect.all(C_A),
      Aspect.all(C_A, C_B),
      Aspect.one(C_B, C_C),
      Aspect.exclude(C_D),
      Aspect.one(C_A, C_B).and(Aspect.one(C_C, C_D)),
      Aspect.EMPTY,
      Aspect.all(),
      Aspect.exclude(),
      Aspect.one(), // unsatisfiable
    ];

    for (const asp of testAspects) {
      const arr = qWorld.getEntities(asp);
      const iter = Array.from(qWorld.view(asp));
      const cnt = qWorld.count(asp);
      const first = qWorld.findFirst(asp);
      const archs = qWorld.getArchetypes(asp);

      // 1. Array and Iterator agreement (membership and length)
      assert.deepStrictEqual(new Set(iter), new Set(arr), `Iterator and Array forms must yield identical entity membership for aspect ${asp.allMask}`);
      assert.strictEqual(iter.length, arr.length, `Iterator and Array forms must yield same number of items`);

      // 2. Count agreement
      assert.strictEqual(cnt, arr.length, `world.count() must equal getEntities().length`);

      // 3. No duplicate entity IDs
      const uniqueSet = new Set(arr);
      assert.strictEqual(uniqueSet.size, arr.length, `Query results must not contain duplicate entity IDs`);

      // 4. findFirst contract
      if (arr.length === 0) {
        assert.strictEqual(first, undefined, `findFirst must return undefined when no entities match`);
      } else {
        assert.ok(first !== undefined && arr.includes(first), `findFirst must return an entity present in matching results`);
        assert.ok(qWorld.matches(first!, asp), `findFirst entity must actually match the aspect`);
      }

      // 5. Archetype membership consistency
      const entitiesFromArchs: number[] = [];
      for (const arch of archs) {
        assert.ok(asp.matches(arch.mask), `getArchetypes() must only return matching archetypes`);
        entitiesFromArchs.push(...arch.entities);
      }
      assert.deepStrictEqual(new Set(entitiesFromArchs), new Set(arr), `Entities aggregated from matching archetypes must equal query result membership`);
      assert.strictEqual(entitiesFromArchs.length, arr.length, `Entities aggregated from archetypes must match query result count`);
    }

    // Group API agreement
    for (const grp of ["party", "monsters", "emptyGroup"]) {
      const grpArr = qWorld.getEntitiesByGroup(grp);
      const grpIter = Array.from(qWorld.viewGroup(grp));
      const grpCnt = qWorld.countGroup(grp);
      const grpFirst = qWorld.findFirstInGroup(grp);

      assert.deepStrictEqual(new Set(grpIter), new Set(grpArr));
      assert.strictEqual(grpIter.length, grpArr.length);
      assert.strictEqual(grpCnt, grpArr.length);
      if (grpArr.length === 0) {
        assert.strictEqual(grpFirst, undefined);
      } else {
        assert.ok(grpFirst !== undefined && grpArr.includes(grpFirst));
        assert.ok(qWorld.groups.has(grp, grpFirst!));
      }
    }

    // Tag API agreement
    for (const tag of ["hero", "boss", "nonExistent"]) {
      const tagArr = qWorld.getEntitiesByTag(tag);
      const tagIter = Array.from(qWorld.viewTag(tag));
      const tagCnt = qWorld.countTag(tag);
      const tagFirst = qWorld.findFirstWithTag(tag);

      assert.deepStrictEqual(new Set(tagIter), new Set(tagArr));
      assert.strictEqual(tagIter.length, tagArr.length);
      assert.strictEqual(tagCnt, tagArr.length);
      if (tagArr.length === 0) {
        assert.strictEqual(tagFirst, undefined);
      } else {
        assert.ok(tagFirst !== undefined && tagArr.includes(tagFirst));
        assert.strictEqual(qWorld.tags.getTag(tagFirst!), tag);
      }
    }
  }

  // 15.2 Component changes during iteration
  {
    const mutWorld = new World();
    const CMP_POS = 170;
    const CMP_VEL = 171;
    const CMP_FLY = 172;
    mutWorld.registerComponent(CMP_POS);
    mutWorld.registerComponent(CMP_VEL);
    mutWorld.registerComponent(CMP_FLY);

    const ent1 = mutWorld.buildEntity().with(CMP_POS, { x: 1 }).with(CMP_VEL, { v: 1 }).commit();
    const ent2 = mutWorld.buildEntity().with(CMP_POS, { x: 2 }).with(CMP_VEL, { v: 2 }).commit();
    const ent3 = mutWorld.buildEntity().with(CMP_POS, { x: 3 }).with(CMP_VEL, { v: 3 }).commit();

    const aspect = Aspect.all(CMP_POS, CMP_VEL);

    // 1. Deferred mode: adding and removing components during world.view()
    mutWorld.setDeferred(true);
    const visitedEntities: number[] = [];

    for (const entity of mutWorld.view(aspect)) {
      visitedEntities.push(entity);
      if (entity === ent1) {
        // Transmute ent1 out of aspect (remove CMP_VEL)
        mutWorld.removeComponent(entity, CMP_VEL);
      } else if (entity === ent2) {
        // Transmute ent2 to new archetype POS+VEL+FLY (still matches aspect)
        mutWorld.addComponent(entity, CMP_FLY, { altitude: 100 });
      }
    }

    // During deferred iteration, all 3 entities were visited exactly once
    assert.strictEqual(visitedEntities.length, 3);
    assert.deepStrictEqual(new Set(visitedEntities), new Set([ent1, ent2, ent3]));

    // Pre-flush query still returns all 3 entities
    assert.strictEqual(mutWorld.count(aspect), 3);

    // Flush deferred operations
    mutWorld.setDeferred(false);

    // Post-flush: ent1 has POS only (does not match POS+VEL), ent2 has POS+VEL+FLY (matches), ent3 has POS+VEL (matches)
    assert.strictEqual(mutWorld.hasComponent(ent1, CMP_VEL), false);
    assert.strictEqual(mutWorld.hasComponent(ent2, CMP_FLY), true);
    const postFlushEntities = mutWorld.getEntities(aspect);
    assert.strictEqual(postFlushEntities.length, 2);
    assert.deepStrictEqual(new Set(postFlushEntities), new Set([ent2, ent3]));
    assert.ok(!postFlushEntities.includes(ent1));

    // 2. Snapshot array iteration with immediate mutations
    const visitedSnapshot: number[] = [];
    for (const entity of mutWorld.getEntities(aspect)) {
      visitedSnapshot.push(entity);
      // Immediately add CMP_FLY specifically to ent3
      if (entity === ent3) {
        mutWorld.addComponent(entity, CMP_FLY, { altitude: 200 });
      }
    }
    assert.strictEqual(visitedSnapshot.length, 2);
    assert.deepStrictEqual(new Set(visitedSnapshot), new Set([ent2, ent3]));
    assert.strictEqual(mutWorld.hasComponent(ent3, CMP_FLY), true);
    assert.deepStrictEqual(mutWorld.getComponent(ent2, CMP_FLY), { altitude: 100 });
    assert.deepStrictEqual(mutWorld.getComponent(ent3, CMP_FLY), { altitude: 200 });
    const flyEntities = mutWorld.getEntities(Aspect.all(CMP_POS, CMP_VEL, CMP_FLY));
    assert.strictEqual(flyEntities.length, 2);
    assert.deepStrictEqual(new Set(flyEntities), new Set([ent2, ent3]));
  }

  // 15.3 Deletion during iteration and swap-and-pop relocation
  {
    const delWorld = new World();
    const D_A = 180;
    const D_B = 181;
    delWorld.registerComponent(D_A);
    delWorld.registerComponent(D_B);

    const d1 = delWorld.buildEntity().with(D_A, { id: 1 }).with(D_B, { val: "one" }).commit();
    const d2 = delWorld.buildEntity().with(D_A, { id: 2 }).with(D_B, { val: "two" }).commit();
    const d3 = delWorld.buildEntity().with(D_A, { id: 3 }).with(D_B, { val: "three" }).commit();
    const d4 = delWorld.buildEntity().with(D_A, { id: 4 }).with(D_B, { val: "four" }).commit();

    const aspect = Aspect.all(D_A, D_B);

    // 1. Deferred deletion during streaming iteration (deleting current entity and another non-last entity)
    delWorld.setDeferred(true);
    const visitedInDeferred: number[] = [];

    for (const entity of delWorld.view(aspect)) {
      visitedInDeferred.push(entity);
      if (entity === d1) {
        // Delete current entity
        delWorld.deleteEntity(d1);
      } else if (entity === d2) {
        // Delete another entity (d3) that hasn't been visited yet
        delWorld.deleteEntity(d3);
      }
    }

    // Deferred iteration visited all 4 entities without skipping or crashing
    assert.strictEqual(visitedInDeferred.length, 4);
    assert.deepStrictEqual(new Set(visitedInDeferred), new Set([d1, d2, d3, d4]));

    // Flush deletions
    delWorld.setDeferred(false);

    // Post-flush: d1 and d3 are deleted; d2 and d4 remain valid and matching
    assert.strictEqual(delWorld.isValid(d1), false);
    assert.strictEqual(delWorld.isValid(d3), false);
    assert.strictEqual(delWorld.isValid(d2), true);
    assert.strictEqual(delWorld.isValid(d4), true);
    assert.deepStrictEqual(new Set(delWorld.getEntities(aspect)), new Set([d2, d4]));

    // 2. Snapshot iteration with immediate deletion and swap-and-pop relocation
    const d5 = delWorld.buildEntity().with(D_A, { id: 5 }).with(D_B, { val: "five" }).commit();
    const d6 = delWorld.buildEntity().with(D_A, { id: 6 }).with(D_B, { val: "six" }).commit();
    assert.ok(delWorld.isValid(d5) && delWorld.isValid(d6));

    const snapshotList = delWorld.getEntities(aspect);
    assert.strictEqual(snapshotList.length, 4);

    // Select the second-to-last entry (an unvisited, non-last entity in the archetype) and the last entity
    const targetToDelete = snapshotList[snapshotList.length - 2];
    const lastEntity = snapshotList[snapshotList.length - 1];
    const lastEntityVal = delWorld.getComponent(lastEntity, D_B);
    const firstEntity = snapshotList[0];

    const processedEntities: number[] = [];
    for (const entity of snapshotList) {
      if (!delWorld.isValid(entity)) continue;
      processedEntities.push(entity);
      if (entity === firstEntity) {
        // Trigger deletion of the unvisited, non-last entity while processing the first entry
        delWorld.deleteEntity(targetToDelete);
      }
    }

    // Target entity is now invalid
    assert.strictEqual(delWorld.isValid(targetToDelete), false);

    // Last entity remains valid and its component values are preserved after swap-and-pop relocation
    assert.strictEqual(delWorld.isValid(lastEntity), true);
    assert.deepStrictEqual(delWorld.getComponent(lastEntity, D_B), lastEntityVal);

    // Iteration skipped the invalidated entity and processed all valid remaining snapshot entries
    const expectedRemaining = snapshotList.filter((e) => e !== targetToDelete);
    assert.strictEqual(processedEntities.length, snapshotList.length - 1);
    assert.deepStrictEqual(new Set(processedEntities), new Set(expectedRemaining));
    assert.deepStrictEqual(new Set(delWorld.getEntities(aspect)), new Set(expectedRemaining));
  }

  // 15.4 Entity creation during iteration
  {
    const createWorld = new World();
    const C_X = 190;
    createWorld.registerComponent(C_X);

    const eInit1 = createWorld.buildEntity().with(C_X, { v: 1 }).commit();
    const eInit2 = createWorld.buildEntity().with(C_X, { v: 2 }).commit();

    const aspect = Aspect.all(C_X);

    // 1. Deferred creation during view()
    createWorld.setDeferred(true);
    const visited: number[] = [];
    let spawnedInDeferred: number = -1;

    for (const entity of createWorld.view(aspect)) {
      visited.push(entity);
      if (entity === eInit1) {
        spawnedInDeferred = createWorld.buildEntity().with(C_X, { v: 99 }).commit();
      }
    }

    // Active iteration yielded only pre-existing matching entities
    assert.strictEqual(visited.length, 2);
    assert.deepStrictEqual(new Set(visited), new Set([eInit1, eInit2]));
    assert.strictEqual(createWorld.count(aspect), 2);

    // Flush deferred operations
    createWorld.setDeferred(false);

    // Post-flush: newly created entity is now present in queries
    assert.strictEqual(createWorld.count(aspect), 3);
    assert.ok(createWorld.getEntities(aspect).includes(spawnedInDeferred));

    // 2. Snapshot iteration with immediate creation
    const snapshotVisited: number[] = [];
    let spawnedInSnapshot: number = -1;

    for (const entity of createWorld.getEntities(aspect)) {
      snapshotVisited.push(entity);
      if (entity === eInit1) {
        spawnedInSnapshot = createWorld.buildEntity().with(C_X, { v: 100 }).commit();
      }
    }

    // Snapshot iteration is fixed to snapshot length at time of query
    assert.strictEqual(snapshotVisited.length, 3);
    assert.ok(!snapshotVisited.includes(spawnedInSnapshot));

    // Subsequent query includes newly created entity
    assert.strictEqual(createWorld.count(aspect), 4);
    assert.ok(createWorld.getEntities(aspect).includes(spawnedInSnapshot));
  }

  // 15.5 Deferred operations lifecycle and query consistency
  {
    const defWorld = new World();
    const COMP_1 = 200;
    const COMP_2 = 201;
    const COMP_3 = 202;
    defWorld.registerComponent(COMP_1);
    defWorld.registerComponent(COMP_2);
    defWorld.registerComponent(COMP_3);

    const entA = defWorld.buildEntity().with(COMP_1, { name: "A" }).commit();
    const entB = defWorld.buildEntity().with(COMP_1, { name: "B" }).with(COMP_2, { val: 2 }).commit();
    const entC = defWorld.buildEntity().with(COMP_2, { val: 3 }).commit();

    const asp1 = Aspect.all(COMP_1);
    const asp2 = Aspect.all(COMP_2);
    const asp12 = Aspect.all(COMP_1, COMP_2);

    // Verify baseline query state
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp1)), new Set([entA, entB]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp2)), new Set([entB, entC]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp12)), new Set([entB]));

    // Enter deferred mode
    defWorld.setDeferred(true);

    // Queue mutations:
    // 1. Add COMP_2 to entA (will match asp12)
    defWorld.addComponent(entA, COMP_2, { val: 1 });
    // 2. Remove COMP_1 from entB (will no longer match asp1 or asp12)
    defWorld.removeComponent(entB, COMP_1);
    // 3. Delete entC
    defWorld.deleteEntity(entC);
    // 4. Batch edit: create entD with COMP_1 and COMP_3
    const entD = defWorld.buildEntity().with(COMP_1, { name: "D" }).with(COMP_3, { tag: "extra" }).commit();

    // While deferred mode is active, queries MUST reflect pre-flush state (STR-004, STR-005)
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp1)), new Set([entA, entB]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp2)), new Set([entB, entC]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp12)), new Set([entB]));
    assert.strictEqual(defWorld.count(asp1), 2);
    assert.strictEqual(defWorld.count(asp2), 2);
    assert.strictEqual(defWorld.count(asp12), 1);
    assert.strictEqual(defWorld.isValid(entC), true);

    // Flush deferred operations
    defWorld.flush();

    // After flush, all queries immediately reflect the applied mutations (STR-007)
    assert.strictEqual(defWorld.isValid(entC), false);
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp1)), new Set([entA, entD]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp2)), new Set([entA, entB]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(asp12)), new Set([entA]));
    assert.deepStrictEqual(new Set(defWorld.getEntities(Aspect.all(COMP_1, COMP_3))), new Set([entD]));

    // Exit deferred mode safely
    defWorld.setDeferred(false);
  }

  // 15.6 Cache invalidation and empty archetypes
  {
    const cacheWorld = new World();
    const T_A = 210;
    const T_B = 211;
    cacheWorld.registerComponent(T_A);
    cacheWorld.registerComponent(T_B);

    const aspectA = Aspect.all(T_A);
    const aspectB = Aspect.all(T_B);
    const aspectAB = Aspect.all(T_A, T_B);

    // Populate query cache
    assert.strictEqual(cacheWorld.count(aspectA), 0);
    assert.strictEqual(cacheWorld.count(aspectB), 0);
    assert.strictEqual(cacheWorld.count(aspectAB), 0);

    // 1. Create entities introducing archetypes A, B, and AB
    const entityA = cacheWorld.buildEntity().with(T_A, { val: "A" }).commit();
    const entityB = cacheWorld.buildEntity().with(T_B, { val: "B" }).commit();
    const entityAB = cacheWorld.buildEntity().with(T_A, { val: "AB_A" }).with(T_B, { val: "AB_B" }).commit();

    // Cached queries must accurately return matches without manual cache invalidation
    assert.deepStrictEqual(new Set(cacheWorld.getEntities(aspectA)), new Set([entityA, entityAB]));
    assert.deepStrictEqual(new Set(cacheWorld.getEntities(aspectB)), new Set([entityB, entityAB]));
    assert.deepStrictEqual(new Set(cacheWorld.getEntities(aspectAB)), new Set([entityAB]));

    // 2. Empty out archetype A by deleting entityA
    cacheWorld.deleteEntity(entityA);

    assert.deepStrictEqual(new Set(cacheWorld.getEntities(aspectA)), new Set([entityAB]));
    assert.strictEqual(cacheWorld.count(aspectA), 1);
    assert.strictEqual(cacheWorld.findFirst(aspectA), entityAB);

    // 3. Empty out archetype AB by removing T_B from entityAB (moves entityAB to archetype A)
    cacheWorld.removeComponent(entityAB, T_B);

    // Archetype AB is now completely empty (0 entities)
    assert.strictEqual(cacheWorld.count(aspectAB), 0);
    assert.deepStrictEqual(cacheWorld.getEntities(aspectAB), []);
    assert.strictEqual(cacheWorld.findFirst(aspectAB), undefined);
    assert.deepStrictEqual(Array.from(cacheWorld.view(aspectAB)), []);

    // Archetype A now contains entityAB
    assert.deepStrictEqual(new Set(cacheWorld.getEntities(aspectA)), new Set([entityAB]));
    assert.strictEqual(cacheWorld.count(aspectA), 1);

    // 4. Re-populate archetype AB
    const entityAB2 = cacheWorld.buildEntity().with(T_A, { val: "new_A" }).with(T_B, { val: "new_B" }).commit();
    assert.deepStrictEqual(new Set(cacheWorld.getEntities(aspectAB)), new Set([entityAB2]));
    assert.strictEqual(cacheWorld.count(aspectAB), 1);
    assert.strictEqual(cacheWorld.findFirst(aspectAB), entityAB2);
  }

  // 15.7 Nested / reentrant queries
  {
    const nestWorld = new World();
    const N_A = 220;
    const N_B = 221;
    nestWorld.registerComponent(N_A);
    nestWorld.registerComponent(N_B);

    const nA1 = nestWorld.buildEntity().with(N_A, { id: "a1" }).commit();
    const nA2 = nestWorld.buildEntity().with(N_A, { id: "a2" }).commit();
    const nB1 = nestWorld.buildEntity().with(N_B, { id: "b1" }).commit();
    const nB2 = nestWorld.buildEntity().with(N_B, { id: "b2" }).commit();
    const nB3 = nestWorld.buildEntity().with(N_B, { id: "b3" }).commit();

    assert.ok(nestWorld.isValid(nA1) && nestWorld.isValid(nA2) && nestWorld.isValid(nB1) && nestWorld.isValid(nB2) && nestWorld.isValid(nB3));

    const aspA = Aspect.all(N_A);
    const aspB = Aspect.all(N_B);

    // 1. Nested queries on different aspects
    const pairs: [number, number][] = [];
    for (const a of nestWorld.view(aspA)) {
      for (const b of nestWorld.view(aspB)) {
        pairs.push([a, b]);
      }
    }
    assert.strictEqual(pairs.length, 2 * 3, "Cartesian product of nested view() streams must yield 6 pairs");
    const expectedPairs = new Set([
      `${nA1},${nB1}`, `${nA1},${nB2}`, `${nA1},${nB3}`,
      `${nA2},${nB1}`, `${nA2},${nB2}`, `${nA2},${nB3}`,
    ]);
    const actualPairs = new Set(pairs.map(([a, b]) => `${a},${b}`));
    assert.deepStrictEqual(actualPairs, expectedPairs);

    // 2. Nested queries on the exact same aspect (reentrant query caching)
    const selfPairs: [number, number][] = [];
    for (const a1 of nestWorld.view(aspA)) {
      for (const a2 of nestWorld.view(aspA)) {
        selfPairs.push([a1, a2]);
      }
    }
    assert.strictEqual(selfPairs.length, 2 * 2, "Reentrant query on identical aspect must yield 4 pairs");
    const expectedSelfPairs = new Set([
      `${nA1},${nA1}`, `${nA1},${nA2}`,
      `${nA2},${nA1}`, `${nA2},${nA2}`,
    ]);
    const actualSelfPairs = new Set(selfPairs.map(([a1, a2]) => `${a1},${a2}`));
    assert.deepStrictEqual(actualSelfPairs, expectedSelfPairs);

    // 3. Nested queries with deferred mutations queued in inner loop (without duplicate additions)
    nestWorld.setDeferred(true);
    let innerExecutions = 0;
    const queuedB = new Set<number>();

    for (const a of nestWorld.view(aspA)) {
      for (const b of nestWorld.view(aspB)) {
        innerExecutions++;
        if (!queuedB.has(b)) {
          queuedB.add(b);
          // Queue deferred component addition once per B entity
          nestWorld.addComponent(b, N_A, { id: `converted_${b}_from_${a}` });
        }
      }
    }

    assert.strictEqual(innerExecutions, 6);
    assert.strictEqual(queuedB.size, 3);
    nestWorld.setDeferred(false); // flush

    // After flush, all B entities now also have N_A
    assert.strictEqual(nestWorld.count(aspA), 2 + 3);
    assert.deepStrictEqual(new Set(nestWorld.getEntities(aspA)), new Set([nA1, nA2, nB1, nB2, nB3]));
    assert.strictEqual(nestWorld.hasComponent(nB1, N_A), true);
    assert.strictEqual(nestWorld.hasComponent(nB2, N_A), true);
    assert.strictEqual(nestWorld.hasComponent(nB3, N_A), true);
  }

  // ==========================================
  // Task 16: Entity and Component Storage Integrity
  // ==========================================

  // Helper to rigorously assert storage and archetype invariants across the entire World
  function assertStorageInvariants(
    w: World,
    expectedLiveEntities: number[],
    expectedUnpositionedEntities: number[] = []
  ): void {
    // 1. Assert expected live-entity list has no duplicates
    const liveSet = new Set(expectedLiveEntities);
    assert.strictEqual(
      liveSet.size,
      expectedLiveEntities.length,
      "Expected live-entity list must not contain duplicates"
    );

    const unpositionedSet = new Set(expectedUnpositionedEntities);
    for (const ent of expectedUnpositionedEntities) {
      assert.ok(
        liveSet.has(ent),
        `Unpositioned entity ${ent} must be present in expected live entities list`
      );
    }

    const seenEntitiesInArchetypes = new Set<number>();
    const em = (w as unknown as { entities: { getLocation(e: number): { arch: Archetype; row: number } | undefined } }).entities;
    const cm = (w as unknown as { components: { getArchetypes(): IterableIterator<Archetype> } }).components;

    // 2. Validate every expected live entity
    for (const ent of expectedLiveEntities) {
      assert.strictEqual(w.isValid(ent), true, `Entity ${ent} must be valid`);
      const mask = w.getMask(ent);
      const loc = em.getLocation(ent);
      const isUnpositioned = unpositionedSet.has(ent);

      if (isUnpositioned) {
        // Explicitly unpositioned entity: must have no location and mask 0n
        assert.strictEqual(
          loc,
          undefined,
          `Explicitly unpositioned entity ${ent} must not have an EntityManager location`
        );
        assert.strictEqual(
          mask,
          0n,
          `Explicitly unpositioned entity ${ent} must have mask 0n`
        );
      } else {
        // Positioned entity: must have a valid location
        assert.ok(
          loc !== undefined,
          `Entity ${ent} is not in expectedUnpositionedEntities and must have a valid EntityManager location`
        );
        // Location row must point back to that exact entity
        assert.strictEqual(
          loc.arch.entities[loc.row],
          ent,
          `Entity ${ent} location row ${loc.row} must point back to that exact entity in archetype`
        );
        // Entity mask must match archetype mask
        assert.strictEqual(
          mask,
          loc.arch.mask,
          `Entity ${ent} mask ${mask} must match its location archetype mask ${loc.arch.mask}`
        );

        // Verify SoA column alignment and component values
        for (const [compId, col] of loc.arch.columns) {
          assert.strictEqual(
            col.length,
            loc.arch.entities.length,
            `Column ${compId} length must match archetype entity count`
          );
          const valInCol: unknown = col[loc.row];
          const valFromWorld: unknown = w.getComponent(ent, compId);
          assert.deepStrictEqual(
            valInCol,
            valFromWorld,
            `Column ${compId} value at row ${loc.row} must match world.getComponent for entity ${ent}`
          );
          assert.strictEqual(
            (mask & (1n << BigInt(compId))) !== 0n,
            true,
            `Component ${compId} in column must be represented in entity mask`
          );
        }
      }
    }

    // 3. For every archetype in the ComponentManager:
    for (const arch of cm.getArchetypes()) {
      // Verify column mask in both directions
      let computedMask = 0n;
      for (const [compId, col] of arch.columns) {
        assert.strictEqual(
          col.length,
          arch.entities.length,
          `Column ${compId} length must equal entities length in archetype`
        );
        assert.strictEqual(
          (arch.mask & (1n << BigInt(compId))) !== 0n,
          true,
          `Column component ID ${compId} must have its corresponding bit set in archetype mask ${arch.mask}`
        );
        computedMask |= (1n << BigInt(compId));
      }
      assert.strictEqual(
        computedMask,
        arch.mask,
        `Archetype columns must exactly match archetype mask ${arch.mask} in both directions`
      );

      // Verify entity validity, uniqueness across archetypes, and location symmetry
      const archEntitySet = new Set<number>();
      for (let r = 0; r < arch.entities.length; r++) {
        const ent = arch.entities[r];
        assert.strictEqual(w.isValid(ent), true, `Archetype must not contain dead entity ${ent}`);
        assert.ok(liveSet.has(ent), `Archetype entity ${ent} must be in expected live entities set`);
        assert.ok(
          !unpositionedSet.has(ent),
          `Archetype must not contain explicitly unpositioned entity ${ent}`
        );
        assert.ok(!archEntitySet.has(ent), `Archetype must not contain duplicate entity ${ent}`);
        archEntitySet.add(ent);

        assert.ok(!seenEntitiesInArchetypes.has(ent), `Entity ${ent} must belong to at most one archetype`);
        seenEntitiesInArchetypes.add(ent);

        // Verify entity's stored location points back to this archetype and row
        const loc = em.getLocation(ent);
        assert.ok(loc !== undefined, `Entity ${ent} in archetype must have a valid EntityManager location`);
        assert.strictEqual(loc!.arch, arch, `Entity ${ent} location archetype must match current archetype`);
        assert.strictEqual(loc!.row, r, `Entity ${ent} location row must equal row ${r}`);

        // Verify World.getMask(entity) === archetype.mask
        assert.strictEqual(
          w.getMask(ent),
          arch.mask,
          `World.getMask for entity ${ent} in archetype must equal archetype mask ${arch.mask}`
        );

        // Verify column values at row r match getComponent
        for (const [compId, col] of arch.columns) {
          assert.deepStrictEqual(
            col[r],
            w.getComponent(ent, compId),
            `Column ${compId} at row ${r} must equal getComponent for entity ${ent}`
          );
        }
      }
    }

    // 4. Verify every positioned expected live entity was seen in an archetype, and unpositioned was not
    for (const ent of expectedLiveEntities) {
      if (unpositionedSet.has(ent)) {
        assert.ok(
          !seenEntitiesInArchetypes.has(ent),
          `Explicitly unpositioned entity ${ent} must not appear in any archetype`
        );
      } else {
        assert.ok(
          seenEntitiesInArchetypes.has(ent),
          `Positioned live entity ${ent} must be present in exactly one archetype`
        );
      }
    }
  }

  // 16.1 Storage and Archetype Invariants (ARC-001 - ARC-011, ENT-001 - ENT-006)
  {
    const invWorld = new World();
    const S_POS = 230;
    const S_VEL = 231;
    const S_HP = 232;
    invWorld.registerComponent(S_POS);
    invWorld.registerComponent(S_VEL);
    invWorld.registerComponent(S_HP);

    const liveList: number[] = [];

    // Step A: Create empty entity
    const e0 = invWorld.createEntity();
    liveList.push(e0);
    assertStorageInvariants(invWorld, liveList, [e0]);

    // Step B: Create multiple entities across various archetypes
    const e1 = invWorld.buildEntity().with(S_POS, { x: 10, y: 20 }).commit();
    const e2 = invWorld.buildEntity().with(S_POS, { x: 30, y: 40 }).with(S_VEL, { vx: 1, vy: 2 }).commit();
    const e3 = invWorld.buildEntity().with(S_POS, { x: 50, y: 60 }).with(S_VEL, { vx: 3, vy: 4 }).with(S_HP, { hp: 100 }).commit();
    const e4 = invWorld.buildEntity().with(S_HP, { hp: 50 }).commit();
    liveList.push(e1, e2, e3, e4);
    assertStorageInvariants(invWorld, liveList, [e0]);

    // Step C: Modify entity components (structural moves)
    invWorld.addComponent(e1, S_VEL, { vx: 5, vy: 5 }); // e1 moves to POS+VEL archetype
    invWorld.removeComponent(e3, S_HP); // e3 moves to POS+VEL archetype
    invWorld.removeComponent(e4, S_HP); // e4 moves to empty archetype (0n) - has valid location in empty archetype
    assertStorageInvariants(invWorld, liveList, [e0]);

    // Step D: Delete entity
    invWorld.deleteEntity(e2);
    const remaining = liveList.filter(e => e !== e2);
    assertStorageInvariants(invWorld, remaining, [e0]);

    // Step E: Non-structural mutation (in-place replacement)
    invWorld.setComponent(e1, S_POS, { x: 99, y: 99 });
    assertStorageInvariants(invWorld, remaining, [e0]);
  }

  // 16.2 Structural Transitions and Swap-and-Pop Relocation (ARC-006 - ARC-011, CMP-006 - CMP-010)
  {
    const stWorld = new World();
    const C_A = 233;
    const C_B = 234;
    const C_C = 235;
    stWorld.registerComponent(C_A);
    stWorld.registerComponent(C_B);
    stWorld.registerComponent(C_C);

    // 1. Transition between archetypes and back (A -> AB -> ABC -> BC -> C -> Empty -> A)
    const ent = stWorld.createEntity();
    assert.strictEqual(stWorld.getMask(ent), 0n);
    assertStorageInvariants(stWorld, [ent], [ent]);

    // -> A
    stWorld.addComponent(ent, C_A, { a: 1 });
    assert.strictEqual(stWorld.getMask(ent), 1n << BigInt(C_A));
    assert.deepStrictEqual(stWorld.getComponent(ent, C_A), { a: 1 });
    assertStorageInvariants(stWorld, [ent]);

    // -> AB
    stWorld.addComponent(ent, C_B, { b: 2 });
    assert.strictEqual(stWorld.getMask(ent), (1n << BigInt(C_A)) | (1n << BigInt(C_B)));
    assert.deepStrictEqual(stWorld.getComponent(ent, C_A), { a: 1 });
    assert.deepStrictEqual(stWorld.getComponent(ent, C_B), { b: 2 });
    assertStorageInvariants(stWorld, [ent]);

    // -> ABC
    stWorld.addComponent(ent, C_C, { c: 3 });
    assert.strictEqual(stWorld.getMask(ent), (1n << BigInt(C_A)) | (1n << BigInt(C_B)) | (1n << BigInt(C_C)));
    assert.deepStrictEqual(stWorld.getComponent(ent, C_A), { a: 1 });
    assert.deepStrictEqual(stWorld.getComponent(ent, C_B), { b: 2 });
    assert.deepStrictEqual(stWorld.getComponent(ent, C_C), { c: 3 });
    assertStorageInvariants(stWorld, [ent]);

    // -> BC (remove A)
    stWorld.removeComponent(ent, C_A);
    assert.strictEqual(stWorld.getMask(ent), (1n << BigInt(C_B)) | (1n << BigInt(C_C)));
    assert.strictEqual(stWorld.hasComponent(ent, C_A), false);
    assert.strictEqual(stWorld.getComponent(ent, C_A), undefined);
    assert.deepStrictEqual(stWorld.getComponent(ent, C_B), { b: 2 });
    assert.deepStrictEqual(stWorld.getComponent(ent, C_C), { c: 3 });
    assertStorageInvariants(stWorld, [ent]);

    // -> C (remove B)
    stWorld.removeComponent(ent, C_B);
    assert.strictEqual(stWorld.getMask(ent), 1n << BigInt(C_C));
    assert.deepStrictEqual(stWorld.getComponent(ent, C_C), { c: 3 });
    assertStorageInvariants(stWorld, [ent]);

    // -> Empty (remove C)
    stWorld.removeComponent(ent, C_C);
    assert.strictEqual(stWorld.getMask(ent), 0n);
    assert.strictEqual(stWorld.hasComponent(ent, C_C), false);
    // Entity lost its last component: resides in empty archetype (mask 0n, location valid, not unpositioned)
    assertStorageInvariants(stWorld, [ent]);

    // -> A (add A back)
    stWorld.addComponent(ent, C_A, { a: 100 });
    assert.strictEqual(stWorld.getMask(ent), 1n << BigInt(C_A));
    assert.deepStrictEqual(stWorld.getComponent(ent, C_A), { a: 100 });
    assertStorageInvariants(stWorld, [ent]);

    // 2. Removing an absent component (safe no-op, CMP-010)
    stWorld.removeComponent(ent, C_B); // ent only has C_A
    assert.strictEqual(stWorld.getMask(ent), 1n << BigInt(C_A));
    assert.deepStrictEqual(stWorld.getComponent(ent, C_A), { a: 100 });

    // 3. Adding an already present component (replaces value in place, CMP-007, STR-003)
    const locBefore = (stWorld as unknown as { entities: { getLocation(e: number): { arch: Archetype; row: number } } }).entities.getLocation(ent);
    stWorld.addComponent(ent, C_A, { a: 200 });
    const locAfter = (stWorld as unknown as { entities: { getLocation(e: number): { arch: Archetype; row: number } } }).entities.getLocation(ent);
    assert.strictEqual(locBefore.arch, locAfter.arch, "In-place replacement must not churn archetype");
    assert.strictEqual(locBefore.row, locAfter.row, "In-place replacement must preserve row location");
    assert.deepStrictEqual(stWorld.getComponent(ent, C_A), { a: 200 });

    // 4. Detailed swap-and-pop row relocation and EntityManager location updates
    const spWorld = new World();
    spWorld.registerComponent(C_A);
    spWorld.registerComponent(C_B);

    const sp1 = spWorld.buildEntity().with(C_A, { id: 1 }).with(C_B, { name: "one" }).commit();
    const sp2 = spWorld.buildEntity().with(C_A, { id: 2 }).with(C_B, { name: "two" }).commit();
    const sp3 = spWorld.buildEntity().with(C_A, { id: 3 }).with(C_B, { name: "three" }).commit();
    const sp4 = spWorld.buildEntity().with(C_A, { id: 4 }).with(C_B, { name: "four" }).commit();

    const arch = (spWorld as unknown as { entities: { getLocation(e: number): { arch: Archetype; row: number } } }).entities.getLocation(sp1)!.arch;
    assert.strictEqual(arch.entities.length, 4);
    assert.deepStrictEqual(arch.entities, [sp1, sp2, sp3, sp4]);

    // Delete sp2 (row 1, non-last row). Last entity sp4 (row 3) should swap into row 1.
    spWorld.deleteEntity(sp2);

    assert.strictEqual(arch.entities.length, 3);
    assert.deepStrictEqual(arch.entities, [sp1, sp4, sp3]);
    assertStorageInvariants(spWorld, [sp1, sp3, sp4]);

    // Verify component values for relocated entity sp4 and untouched entities sp1, sp3
    assert.deepStrictEqual(spWorld.getComponent(sp1, C_B), { name: "one" });
    assert.deepStrictEqual(spWorld.getComponent(sp4, C_B), { name: "four" });
    assert.deepStrictEqual(spWorld.getComponent(sp3, C_B), { name: "three" });

    // Delete sp1 (row 0, non-last row). Last entity sp3 (row 2) should swap into row 0.
    spWorld.deleteEntity(sp1);

    assert.strictEqual(arch.entities.length, 2);
    assert.deepStrictEqual(arch.entities, [sp3, sp4]);
    assertStorageInvariants(spWorld, [sp3, sp4]);

    assert.deepStrictEqual(spWorld.getComponent(sp3, C_B), { name: "three" });
    assert.deepStrictEqual(spWorld.getComponent(sp4, C_B), { name: "four" });

    // Delete sp4 (row 1, last row). No other entity relocated.
    spWorld.deleteEntity(sp4);
    assert.strictEqual(arch.entities.length, 1);
    assert.deepStrictEqual(arch.entities, [sp3]);
    assertStorageInvariants(spWorld, [sp3]);
    assert.deepStrictEqual(spWorld.getComponent(sp3, C_B), { name: "three" });
  }

  // 16.3 EntityEditor and Batch Changes (BAT-001 - BAT-005)
  {
    const edWorld = new World();
    const E_A = 236;
    const E_B = 237;
    const E_C = 238;
    edWorld.registerComponent(E_A);
    edWorld.registerComponent(E_B);
    edWorld.registerComponent(E_C);

    // 1. Multiple additions and tag/group in one batch
    const ent1 = edWorld.createEntity();
    const editor1 = edWorld.edit(ent1);
    editor1.add(E_A, { a: 1 })
      .add(E_B, { b: 2 })
      .add(E_C, { c: 3 })
      .tag("Hero")
      .group("Party");

    assert.strictEqual(editor1.has(E_A), true);
    assert.strictEqual(editor1.has(E_B), true);
    assert.strictEqual(editor1.has(E_C), true);
    assert.deepStrictEqual(editor1.get(E_A), { a: 1 });

    const committedId1 = editor1.commit();
    assert.strictEqual(committedId1, ent1);
    assert.strictEqual(editor1.isCommitted, true);
    assert.strictEqual(edWorld.getMask(ent1), (1n << BigInt(E_A)) | (1n << BigInt(E_B)) | (1n << BigInt(E_C)));
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_A), { a: 1 });
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_B), { b: 2 });
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_C), { c: 3 });
    assert.strictEqual(edWorld.tags.getTag(ent1), "Hero");
    assert.strictEqual(edWorld.groups.has("Party", ent1), true);

    // 2. Repeated commit is idempotent (BAT-005)
    editor1.commit();
    assert.strictEqual(edWorld.getMask(ent1), (1n << BigInt(E_A)) | (1n << BigInt(E_B)) | (1n << BigInt(E_C)));

    // 3. Repeated operations on the same component in one editor
    const editor2 = edWorld.edit(ent1);
    editor2.add(E_A, { a: 10 }) // overwrite addition
      .add(E_A, { a: 20 })
      .remove(E_B) // remove existing
      .add(E_B, { b: 200 }) // re-add removed
      .remove(E_C); // remove existing

    editor2.commit();
    assert.strictEqual(edWorld.getMask(ent1), (1n << BigInt(E_A)) | (1n << BigInt(E_B)));
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_A), { a: 20 });
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_B), { b: 200 });
    assert.strictEqual(edWorld.hasComponent(ent1, E_C), false);

    // 4. Add then remove same component in editor -> net no addition
    const ent2 = edWorld.createEntity();
    const editor3 = edWorld.edit(ent2);
    editor3.add(E_A, { a: "temp" }).remove(E_A).add(E_B, { b: "kept" });
    editor3.commit();
    assert.strictEqual(edWorld.getMask(ent2), 1n << BigInt(E_B));
    assert.strictEqual(edWorld.hasComponent(ent2, E_A), false);
    assert.deepStrictEqual(edWorld.getComponent(ent2, E_B), { b: "kept" });

    // 5. Editor clear() removes all existing components
    const editor4 = edWorld.edit(ent1);
    editor4.clear().add(E_C, { c: "only_c" });
    editor4.commit();
    assert.strictEqual(edWorld.getMask(ent1), 1n << BigInt(E_C));
    assert.strictEqual(edWorld.hasComponent(ent1, E_A), false);
    assert.strictEqual(edWorld.hasComponent(ent1, E_B), false);
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_C), { c: "only_c" });

    // 6. Editor cancellation
    const editor5 = edWorld.edit(ent1);
    editor5.add(E_A, { a: "cancelled" }).remove(E_C);
    editor5.cancel();
    editor5.commit(); // Should be no-op after cancel
    assert.strictEqual(edWorld.getMask(ent1), 1n << BigInt(E_C));
    assert.deepStrictEqual(edWorld.getComponent(ent1, E_C), { c: "only_c" });

    // 7. Editor on deleted / invalid entity
    const ent3 = edWorld.createEntity();
    const editor6 = edWorld.edit(ent3);
    editor6.add(E_A, { a: "ghost" });
    edWorld.deleteEntity(ent3); // Deleted before commit
    editor6.commit(); // Safe no-op, does not revive or corrupt
    assert.strictEqual(edWorld.isValid(ent3), false);
    assert.strictEqual(edWorld.hasComponent(ent3, E_A), false);
  }

  // 16.4 Immediate versus Deferred Operations Equivalence (STR-001 - STR-009)
  {
    const makeWorld = () => {
      const w = new World();
      const D_1 = 239;
      const D_2 = 240;
      const D_3 = 241;
      w.registerComponent(D_1);
      w.registerComponent(D_2);
      w.registerComponent(D_3);
      return { w, D_1, D_2, D_3 };
    };

    // 1. Equivalent mutation sequences produce identical final state
    const imm = makeWorld();
    const def = makeWorld();

    // Immediate sequence
    const immE1 = imm.w.createEntity();
    const immE2 = imm.w.createEntity();
    imm.w.addComponent(immE1, imm.D_1, { v: 1 });
    imm.w.addComponent(immE1, imm.D_2, { v: 2 });
    imm.w.addComponent(immE2, imm.D_2, { v: 20 });
    imm.w.addComponent(immE2, imm.D_3, { v: 30 });
    imm.w.addComponent(immE1, imm.D_1, { v: 100 }); // value replacement via addComponent
    imm.w.removeComponent(immE1, imm.D_2);
    imm.w.addComponent(immE1, imm.D_3, { v: 300 });

    // Deferred sequence
    def.w.setDeferred(true);
    const defE1 = def.w.createEntity();
    const defE2 = def.w.createEntity();
    def.w.addComponent(defE1, def.D_1, { v: 1 });
    def.w.addComponent(defE1, def.D_2, { v: 2 });
    def.w.addComponent(defE2, def.D_2, { v: 20 });
    def.w.addComponent(defE2, def.D_3, { v: 30 });
    def.w.addComponent(defE1, def.D_1, { v: 100 }); // queued replacement via addComponent
    def.w.removeComponent(defE1, def.D_2);
    def.w.addComponent(defE1, def.D_3, { v: 300 });
    def.w.setDeferred(false); // flush

    // Invariant verification on both worlds
    assertStorageInvariants(imm.w, [immE1, immE2]);
    assertStorageInvariants(def.w, [defE1, defE2]);

    // Compare final validity, masks, and component values
    assert.strictEqual(imm.w.getMask(immE1), def.w.getMask(defE1));
    assert.strictEqual(imm.w.getMask(immE2), def.w.getMask(defE2));
    assert.deepStrictEqual(imm.w.getComponent(immE1, imm.D_1), def.w.getComponent(defE1, def.D_1));
    assert.deepStrictEqual(imm.w.getComponent(immE1, imm.D_3), def.w.getComponent(defE1, def.D_3));
    assert.deepStrictEqual(imm.w.getComponent(immE2, imm.D_2), def.w.getComponent(defE2, def.D_2));
    assert.deepStrictEqual(imm.w.getComponent(immE2, imm.D_3), def.w.getComponent(defE2, def.D_3));

    // Compare query memberships and counts across both worlds
    const aspD1 = Aspect.all(imm.D_1);
    const aspD2 = Aspect.all(imm.D_2);
    const aspD3 = Aspect.all(imm.D_3);
    const aspD1D3 = Aspect.all(imm.D_1, imm.D_3);

    assert.strictEqual(imm.w.count(aspD1), def.w.count(aspD1));
    assert.strictEqual(imm.w.count(aspD2), def.w.count(aspD2));
    assert.strictEqual(imm.w.count(aspD3), def.w.count(aspD3));
    assert.strictEqual(imm.w.count(aspD1D3), def.w.count(aspD1D3));

    assert.deepStrictEqual(imm.w.getEntities(aspD1), [immE1]);
    assert.deepStrictEqual(def.w.getEntities(aspD1), [defE1]);
    assert.deepStrictEqual(imm.w.getEntities(aspD2), [immE2]);
    assert.deepStrictEqual(def.w.getEntities(aspD2), [defE2]);
    assert.deepStrictEqual(new Set(imm.w.getEntities(aspD3)), new Set([immE1, immE2]));
    assert.deepStrictEqual(new Set(def.w.getEntities(aspD3)), new Set([defE1, defE2]));
    assert.deepStrictEqual(imm.w.getEntities(aspD1D3), [immE1]);
    assert.deepStrictEqual(def.w.getEntities(aspD1D3), [defE1]);

    // 2. Queued mutations on an entity followed by queued deleteEntity
    const delQueueWorld = makeWorld();
    delQueueWorld.w.setDeferred(true);
    const dqE = delQueueWorld.w.createEntity();
    delQueueWorld.w.addComponent(dqE, delQueueWorld.D_1, { v: 1 });
    delQueueWorld.w.addComponent(dqE, delQueueWorld.D_2, { v: 2 });
    delQueueWorld.w.deleteEntity(dqE);
    delQueueWorld.w.setDeferred(false); // flush

    assert.strictEqual(delQueueWorld.w.isValid(dqE), false);
    assert.strictEqual(delQueueWorld.w.hasComponent(dqE, delQueueWorld.D_1), false);
    assert.strictEqual(delQueueWorld.w.getMask(dqE), 0n);
    assertStorageInvariants(delQueueWorld.w, []);

    // 3. Queued deleteEntity followed by queued addComponent on the deleted ID
    const staleQueueWorld = makeWorld();
    staleQueueWorld.w.setDeferred(true);
    const sqE = staleQueueWorld.w.createEntity();
    staleQueueWorld.w.deleteEntity(sqE);
    staleQueueWorld.w.addComponent(sqE, staleQueueWorld.D_1, { v: "stale" }); // Target deleted
    staleQueueWorld.w.setDeferred(false); // flush

    assert.strictEqual(staleQueueWorld.w.isValid(sqE), false);
    assert.strictEqual(staleQueueWorld.w.hasComponent(sqE, staleQueueWorld.D_1), false);
    assertStorageInvariants(staleQueueWorld.w, []);
  }

  // 16.5 Atomicity, Failure Paths, and Recycled Entity Cleanliness (CMP-004, CMP-012, ENT-007, ENT-008)
  {
    const failWorld = new World();
    const F_A = 242;
    const F_B = 243;
    failWorld.registerComponent(F_A);
    failWorld.registerComponent(F_B);

    const fEnt = failWorld.buildEntity().with(F_A, { a: "initial" }).commit();
    const initialMask = failWorld.getMask(fEnt);

    // 1. Rejected operations on invalid Component IDs do not mutate storage or masks
    const invalidIds = [-1, 1.5, NaN, Infinity, 65536, "invalid" as unknown as number];
    for (const badId of invalidIds) {
      assert.throws(() => failWorld.addComponent(fEnt, badId, { bad: true }), /Invalid Component ID/);
      assert.throws(() => failWorld.removeComponent(fEnt, badId), /Invalid Component ID/);
      assert.throws(() => failWorld.getComponent(fEnt, badId), /Invalid Component ID/);
      assert.throws(() => failWorld.hasComponent(fEnt, badId), /Invalid Component ID/);
      assert.throws(() => failWorld.setComponent(fEnt, badId, { bad: true }), /Invalid Component ID/);
      assert.throws(() => failWorld.updateComponent(fEnt, badId, () => ({})), /Invalid Component ID/);
      assert.throws(() => failWorld.mutateComponent(fEnt, badId, () => {}), /Invalid Component ID/);

      const ed = failWorld.edit(fEnt);
      assert.throws(() => ed.add(badId, { bad: true }), /Invalid Component ID/);
      assert.throws(() => ed.remove(badId), /Invalid Component ID/);
      assert.throws(() => ed.get(badId), /Invalid Component ID/);
      assert.throws(() => ed.has(badId), /Invalid Component ID/);
      ed.cancel();
    }

    // Verify entity state remained completely unchanged after all rejected calls and storage invariants hold
    assert.strictEqual(failWorld.getMask(fEnt), initialMask);
    assert.deepStrictEqual(failWorld.getComponent(fEnt, F_A), { a: "initial" });
    assert.strictEqual(failWorld.hasComponent(fEnt, F_B), false);
    assertStorageInvariants(failWorld, [fEnt]);

    // 2. Unregistered reserved component ID rejection
    const unregReservedId = 50;
    assert.throws(
      () => failWorld.addComponent(fEnt, unregReservedId, { data: 1 }),
      /Cannot add unregistered reserved component ID/
    );
    const edReserved = failWorld.edit(fEnt);
    assert.throws(
      () => edReserved.add(unregReservedId, { data: 1 }),
      /Cannot add unregistered reserved component ID/
    );
    edReserved.cancel();

    assert.strictEqual(failWorld.getMask(fEnt), initialMask);
    assert.deepStrictEqual(failWorld.getComponent(fEnt, F_A), { a: "initial" });
    assertStorageInvariants(failWorld, [fEnt]);

    // 3. Recycled entity IDs do not expose components from prior entity lifetimes
    const recWorld = new World();
    recWorld.registerComponent(F_A);
    recWorld.registerComponent(F_B);

    const oldEnt = recWorld.buildEntity().with(F_A, { secret: "old_a" }).with(F_B, { secret: "old_b" }).commit();
    assert.strictEqual(recWorld.hasComponent(oldEnt, F_A), true);
    assert.strictEqual(recWorld.hasComponent(oldEnt, F_B), true);
    assertStorageInvariants(recWorld, [oldEnt]);

    // Delete oldEnt and recycle its index slot
    recWorld.deleteEntity(oldEnt);
    assert.strictEqual(recWorld.isValid(oldEnt), false);
    assertStorageInvariants(recWorld, []);

    const newEnt = recWorld.createEntity(); // Reuses index slot with advanced generation
    assert.notStrictEqual(newEnt, oldEnt);
    assert.strictEqual(recWorld.isValid(newEnt), true);
    assert.strictEqual(recWorld.isValid(oldEnt), false);

    // Verify newEnt is completely clean (no leftover components or mask)
    assert.strictEqual(recWorld.getMask(newEnt), 0n);
    assert.strictEqual(recWorld.hasComponent(newEnt, F_A), false);
    assert.strictEqual(recWorld.hasComponent(newEnt, F_B), false);
    assert.strictEqual(recWorld.getComponent(newEnt, F_A), undefined);
    assert.strictEqual(recWorld.getComponent(newEnt, F_B), undefined);
    assertStorageInvariants(recWorld, [newEnt], [newEnt]);

    // Old entity ID cannot access or mutate new entity's state
    assert.strictEqual(recWorld.getComponent(oldEnt, F_A), undefined);
    recWorld.addComponent(oldEnt, F_A, { hacked: true });
    assert.strictEqual(recWorld.hasComponent(newEnt, F_A), false);
    assertStorageInvariants(recWorld, [newEnt], [newEnt]);
  }

  // 16.6 Observer Notifications for Immediate and Batched Changes (OBS-001 - OBS-007)
  {
    const obsWorld = new World();
    const O_A = 244;
    const O_B = 245;
    obsWorld.registerComponent(O_A);
    obsWorld.registerComponent(O_B);

    const addEventsA: number[] = [];
    const removeEventsA: number[] = [];
    const addEventsB: number[] = [];
    const removeEventsB: number[] = [];
    const maskEvents: { entity: number; oldMask: bigint; newMask: bigint }[] = [];

    obsWorld.subscribeOnAdd(O_A, (e) => addEventsA.push(e));
    obsWorld.subscribeOnRemove(O_A, (e) => removeEventsA.push(e));
    obsWorld.subscribeOnAdd(O_B, (e) => addEventsB.push(e));
    obsWorld.subscribeOnRemove(O_B, (e) => removeEventsB.push(e));
    obsWorld.subscribeOnMaskChange((entity, oldMask, newMask) => maskEvents.push({ entity, oldMask, newMask }));

    const oEnt = obsWorld.createEntity();

    // 1. Immediate Add Component A
    obsWorld.addComponent(oEnt, O_A, { val: 1 });
    assert.deepStrictEqual(addEventsA, [oEnt]);
    assert.deepStrictEqual(removeEventsA, []);
    assert.strictEqual(maskEvents.length, 1);
    assert.strictEqual(maskEvents[0].oldMask, 0n);
    assert.strictEqual(maskEvents[0].newMask, 1n << BigInt(O_A));

    // 2. Immediate Add Component A again (value replacement -> no add event, no mask change)
    obsWorld.addComponent(oEnt, O_A, { val: 2 });
    assert.deepStrictEqual(addEventsA, [oEnt]); // No duplicate event
    assert.strictEqual(maskEvents.length, 1);

    // 3. Immediate Remove Absent Component B (no-op -> no remove event, no mask change)
    obsWorld.removeComponent(oEnt, O_B);
    assert.deepStrictEqual(removeEventsB, []);
    assert.strictEqual(maskEvents.length, 1);

    // 4. Immediate Add Component B
    obsWorld.addComponent(oEnt, O_B, { val: 10 });
    assert.deepStrictEqual(addEventsB, [oEnt]);
    assert.strictEqual(maskEvents.length, 2);
    assert.strictEqual(maskEvents[1].oldMask, 1n << BigInt(O_A));
    assert.strictEqual(maskEvents[1].newMask, (1n << BigInt(O_A)) | (1n << BigInt(O_B)));

    // 5. Immediate Remove Component A
    obsWorld.removeComponent(oEnt, O_A);
    assert.deepStrictEqual(removeEventsA, [oEnt]);
    assert.strictEqual(maskEvents.length, 3);
    assert.strictEqual(maskEvents[2].oldMask, (1n << BigInt(O_A)) | (1n << BigInt(O_B)));
    assert.strictEqual(maskEvents[2].newMask, 1n << BigInt(O_B));

    // 6. Batch Edit with simultaneous Add and Remove
    const batchEnt = obsWorld.buildEntity().with(O_A, { val: 100 }).commit();
    // Clear event history
    addEventsA.length = 0;
    removeEventsA.length = 0;
    addEventsB.length = 0;
    removeEventsB.length = 0;
    maskEvents.length = 0;

    const editor = obsWorld.edit(batchEnt);
    editor.remove(O_A).add(O_B, { val: 200 }).commit();

    assert.deepStrictEqual(removeEventsA, [batchEnt]);
    assert.deepStrictEqual(addEventsB, [batchEnt]);
    assert.deepStrictEqual(addEventsA, []);
    assert.deepStrictEqual(removeEventsB, []);
    assert.strictEqual(maskEvents.length, 1);
    assert.strictEqual(maskEvents[0].oldMask, 1n << BigInt(O_A));
    assert.strictEqual(maskEvents[0].newMask, 1n << BigInt(O_B));
  }

  console.log("World tests completed!");
}

if (require.main === module) {
  testWorld();
}
