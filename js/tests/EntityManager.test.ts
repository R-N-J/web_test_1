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
  assert.notStrictEqual(e1, e3, "e3 should be different from e1 due to versioning");

  // Test: ENT-010 Duplicate recycling and invalid ID safety
  const e4 = em.createEntity();
  assert.strictEqual(em.isValid(e4), true, "e4 should be valid");
  em.recycleEntity(e4);
  assert.strictEqual(em.isValid(e4), false, "e4 should be invalid after first recycle");

  // Recycle e4 a second time (duplicate recycling)
  em.recycleEntity(e4);
  assert.strictEqual(em.isValid(e4), false, "e4 should remain invalid after duplicate recycle");

  // Attempt to recycle non-existent / invalid IDs
  em.recycleEntity(-1);
  em.recycleEntity(999999);

  // Allocate new entities after duplicate recycling
  const e5 = em.createEntity();
  const e6 = em.createEntity();
  assert.notStrictEqual(e5, e6, "e5 and e6 must be distinct entities; duplicate recycling must not duplicate pool entries");
  assert.strictEqual(em.isValid(e5), true, "e5 should be valid");
  assert.strictEqual(em.isValid(e6), true, "e6 should be valid");
  assert.strictEqual(em.isValid(e4), false, "e4 must remain invalid");

  // --- Tests: ENT-007 - ENT-011 Entity ID Boundary & Specification Enforcement ---

  // 1. Generation sequence and lifecycle validity
  const emBoundary = new EntityManager();
  const ent0 = emBoundary.createEntity();
  assert.strictEqual(emBoundary.isValid(ent0), true, "Newly created entity must be valid");

  // 2. Recycling through generation limit and wraparound (ENT-007, ENT-008, ENT-011)
  // Recycle and reallocate through at least 255 recycling cycles
  let currentId = ent0;
  for (let cycle = 1; cycle <= 255; cycle++) {
    emBoundary.recycleEntity(currentId);
    assert.strictEqual(
      emBoundary.isValid(currentId),
      false,
      `Stale ID from cycle ${cycle} must be invalid immediately after recycling`
    );
    currentId = emBoundary.createEntity();
    assert.strictEqual(emBoundary.isValid(currentId), true, `Newly created entity at cycle ${cycle} must be valid`);
  }

  // After 255+ recycling cycles, original ent0 must remain invalid and new entity ID must be different
  assert.strictEqual(
    emBoundary.isValid(ent0),
    false,
    "Stale entity ID from generation 1 must remain invalid after 255 recycling cycles (ENT-007, ENT-008)"
  );
  assert.notStrictEqual(
    currentId,
    ent0,
    "Newly allocated entity ID must not collide with stale entity ID from generation 1 (ENT-005, ENT-008)"
  );

  // 3. Validation of negative, fractional, special, unsafe, and never-allocated IDs (ENT-009)
  const freshEm = new EntityManager();
  assert.strictEqual(freshEm.isValid(0), false, "ID 0 before any allocation is invalid");
  assert.strictEqual(freshEm.isValid(1), false, "ID 1 before any allocation is invalid");

  const liveE1 = freshEm.createEntity();
  assert.strictEqual(freshEm.isValid(liveE1), true, "live entity ID must be valid");

  // Non-integer and special numeric values must be invalid (ENT-009)
  assert.strictEqual(freshEm.isValid(1.5), false, "Fractional ID 1.5 must be invalid");
  assert.strictEqual(freshEm.isValid(NaN), false, "NaN must be invalid");
  assert.strictEqual(freshEm.isValid(Infinity), false, "Infinity must be invalid");
  assert.strictEqual(freshEm.isValid(-Infinity), false, "-Infinity must be invalid");

  // Negative and out-of-range IDs must be invalid (ENT-009)
  assert.strictEqual(freshEm.isValid(-1), false, "Negative ID -1 must be invalid");
  assert.strictEqual(freshEm.isValid(-256), false, "Negative ID -256 must be invalid");
  assert.strictEqual(freshEm.isValid(Number.MAX_SAFE_INTEGER), false, "Unallocated MAX_SAFE_INTEGER must be invalid");
  assert.strictEqual(freshEm.isValid(Number.MAX_SAFE_INTEGER + 1), false, "Unsafe integer must be invalid");
  assert.strictEqual(freshEm.isValid(9999999), false, "Never-allocated high ID must be invalid");

  // 4. Maximum generation and slot retirement (ENT-011)
  const retireEm = new EntityManager();
  // Simulate slot 0 at maximum generation 65,535
  retireEm.loadVersions([65535]);
  retireEm.setNextEntityId(1);
  const maxGenEntity = 0 * 65536 + 65535;
  assert.strictEqual(retireEm.isValid(maxGenEntity), true, "Entity at generation 65535 is valid");

  // Recycle entity at max generation -> slot should be permanently retired
  retireEm.recycleEntity(maxGenEntity);
  assert.strictEqual(retireEm.isValid(maxGenEntity), false, "Max generation entity is invalid after recycling");
  assert.strictEqual(retireEm.getFreeEntities().length, 0, "Retired slot must not be added to freeEntities pool");

  // Creating a new entity must allocate a new slot (index 1), not slot 0
  const nextEntity = retireEm.createEntity();
  const nextIndex = Math.floor(nextEntity / 65536);
  assert.strictEqual(nextIndex, 1, "New entity must be allocated at index 1 after slot 0 is retired");
  assert.strictEqual(retireEm.isValid(nextEntity), true, "New entity at index 1 is valid");

  // All historical entity IDs for retired slot 0 must remain invalid
  for (let gen = 1; gen <= 65535; gen += 1000) {
    const historicalId = 0 * 65536 + gen;
    assert.strictEqual(retireEm.isValid(historicalId), false, `Historical ID with gen ${gen} for retired slot must remain invalid`);
  }

  // 5. Safe arithmetic range and MAX_SAFE_INTEGER bounds (ENT-011)
  const maxSafeIndex = Math.floor(Number.MAX_SAFE_INTEGER / 65536); // 137,438,953,471 (2^37 - 1)
  const maxPossibleSafeId = maxSafeIndex * 65536 + 65535;
  assert.strictEqual(maxPossibleSafeId, Number.MAX_SAFE_INTEGER, "Max possible ID equals Number.MAX_SAFE_INTEGER (2^53 - 1)");
  assert.strictEqual(Math.floor(maxPossibleSafeId / 65536), maxSafeIndex, "Max safe index decodes accurately via integer division");
  assert.strictEqual(maxPossibleSafeId % 65536, 65535, "Max generation decodes accurately via modulo");

  // --- Tests: Free-List Entity IDs Invalidity Prior to Allocation (ENT-001, ENT-007 - ENT-011) ---
  const freeEm = new EntityManager();
  const fe1 = freeEm.createEntity();
  assert.strictEqual(freeEm.isValid(fe1), true, "Allocated entity fe1 must be valid");

  freeEm.recycleEntity(fe1);
  assert.strictEqual(freeEm.isValid(fe1), false, "Recycled entity fe1 must be invalid");

  const freePool = freeEm.getFreeEntities();
  assert.strictEqual(freePool.length, 1, "Free pool must contain 1 recycled entity ID");
  const waitingFreeId = freePool[0];

  // 1. Verify waiting free-list ID is invalid before reallocation
  assert.strictEqual(
    freeEm.isValid(waitingFreeId),
    false,
    "Entity ID waiting in free pool must be invalid prior to reallocation (ENT-001, ENT-007)"
  );

  // 2. Verify that an ID waiting in the free pool cannot be recycled again or used to access another entity
  freeEm.recycleEntity(waitingFreeId);
  assert.strictEqual(freeEm.getFreeEntities().length, 1, "Recycling waiting free ID must be a no-op");
  assert.strictEqual(freeEm.getLocation(waitingFreeId), undefined, "Location of waiting free ID must be undefined");
  assert.strictEqual(freeEm.getComponentValue(waitingFreeId, 1), undefined, "Component lookup on free ID must be undefined");
  assert.strictEqual(freeEm.setComponentValue(waitingFreeId, 1, {}), false, "Setting component on free ID must return false");

  // 3. Verify that createEntity() returns the recycled ID and that isValid() then returns true
  const reallocated = freeEm.createEntity();
  assert.strictEqual(reallocated, waitingFreeId, "createEntity() must return the recycled ID from the free pool");
  assert.strictEqual(freeEm.isValid(reallocated), true, "Allocated entity must be valid after createEntity()");
  assert.strictEqual(freeEm.getFreeEntities().length, 0, "Free pool must be empty after reallocating");

  // 4. Zero-component entity validity
  const zeroCompEntity = freeEm.createEntity();
  assert.strictEqual(freeEm.getLocation(zeroCompEntity), undefined, "Zero-component entity has no storage location");
  assert.strictEqual(freeEm.isValid(zeroCompEntity), true, "Zero-component entity must be valid without components");

  // --- Tests: Entity Capacity Growth Beyond Initial 1024 Limit (ENT-001, ENT-011) ---
  const growEm = new EntityManager();
  const createdIds: number[] = [];
  const TOTAL_GROWTH_ENTITIES = 1100;

  // 1. Create at least 1,025 entities (1,100 entities)
  for (let i = 0; i < TOTAL_GROWTH_ENTITIES; i++) {
    const eid = growEm.createEntity();
    createdIds.push(eid);
    assert.strictEqual(growEm.isValid(eid), true, `Entity ${i} must be valid upon creation`);
    assert.strictEqual(Math.floor(eid / 65536), i, `Entity ${i} index must match allocation order`);
    assert.strictEqual(eid % 65536, 1, `Entity ${i} initial generation must be 1`);
  }

  assert.strictEqual(createdIds.length, TOTAL_GROWTH_ENTITIES);
  // Verify all created IDs are distinct
  const uniqueIds = new Set(createdIds);
  assert.strictEqual(uniqueIds.size, TOTAL_GROWTH_ENTITIES, "All 1,100 created entity IDs must be unique");

  // 2. Recycling and slot retirement beyond 1024 capacity
  const targetRecycleIndex = 1050;
  const targetRecycleId = createdIds[targetRecycleIndex];
  growEm.recycleEntity(targetRecycleId);
  assert.strictEqual(growEm.isValid(targetRecycleId), false, "Recycled entity at index 1050 must be invalid");

  const recycledReallocated = growEm.createEntity();
  assert.strictEqual(Math.floor(recycledReallocated / 65536), targetRecycleIndex, "Reallocation should reuse slot 1050");
  assert.strictEqual(recycledReallocated % 65536, 2, "Reallocated entity must have incremented generation 2");
  assert.strictEqual(growEm.isValid(recycledReallocated), true, "Reallocated entity at index 1050 must be valid");

  // Slot retirement beyond 1024
  const slotRetireEm = new EntityManager();
  // Simulate array of 1100 elements with index 1050 at MAX_GENERATION
  const customVersions = new Array(1100).fill(1);
  customVersions[1050] = 65535;
  slotRetireEm.loadVersions(customVersions);
  const maxGenGrownId = 1050 * 65536 + 65535;
  assert.strictEqual(slotRetireEm.isValid(maxGenGrownId), true, "Slot 1050 at gen 65535 must be valid");

  slotRetireEm.recycleEntity(maxGenGrownId);
  assert.strictEqual(slotRetireEm.isValid(maxGenGrownId), false, "Slot 1050 must be invalid after retirement");
  assert.strictEqual(slotRetireEm.getFreeEntities().length, 0, "Retired slot 1050 must not be added to free pool");

  const newAllocGrown = slotRetireEm.createEntity();
  assert.strictEqual(Math.floor(newAllocGrown / 65536), 1100, "New allocation after slot retirement must use next index 1100");
  assert.strictEqual(slotRetireEm.isValid(newAllocGrown), true, "New entity at index 1100 must be valid");

  // 3. clear() and hardReset() on grown manager
  growEm.clear();
  assert.strictEqual(growEm.getNextEntityId(), 0, "clear() resets nextEntityId to 0");
  for (const oldId of createdIds) {
    assert.strictEqual(growEm.isValid(oldId), false, "All previously created IDs must be invalid after clear()");
  }
  const postClearEntity = growEm.createEntity();
  assert.strictEqual(Math.floor(postClearEntity / 65536), 0, "First entity after clear() must allocate at index 0");
  assert.strictEqual(growEm.isValid(postClearEntity), true, "First entity after clear() must be valid");

  growEm.hardReset();
  assert.strictEqual(growEm.getNextEntityId(), 0, "hardReset() resets nextEntityId to 0");
  const postResetEntity = growEm.createEntity();
  assert.strictEqual(Math.floor(postResetEntity / 65536), 0, "First entity after hardReset() must allocate at index 0");
  assert.strictEqual(growEm.isValid(postResetEntity), true, "First entity after hardReset() must be valid");

  console.log("EntityManager tests completed!");
}

if (require.main === module) {
  testEntityManager();
}
