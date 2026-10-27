import assert from "node:assert/strict";
import { EntityManager, MAX_GENERATION } from "../ECS/EntityManager";
import { Archetype, ComponentId } from "../ECS/Archetype";

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
  const arch = new Archetype(1n << 1n, [1]); // Dummy archetype with component ID 1
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
  assert.strictEqual(growEm.getNextEntityId(), 1100, "clear() preserves nextEntityId allocated capacity");
  for (const oldId of createdIds) {
    assert.strictEqual(growEm.isValid(oldId), false, "All previously created IDs must be invalid after clear()");
  }
  const postClearEntity = growEm.createEntity();
  assert.strictEqual(growEm.isValid(postClearEntity), true, "First entity after clear() must be valid");
  assert.strictEqual(createdIds.includes(postClearEntity), false, "postClearEntity must not equal any pre-clear entity ID");
  // Pre-clear IDs must remain invalid even after post-clear allocation
  for (const oldId of createdIds) {
    assert.strictEqual(growEm.isValid(oldId), false, "All previously created IDs must remain invalid after post-clear allocation");
  }

  // 4. Generation exhaustion and slot retirement on clear() (ENT-011, WLD-002)
  const exhaustEm = new EntityManager();
  // Artificially set an entity at MAX_GENERATION (65,535)
  exhaustEm.setNextEntityId(1);
  exhaustEm.loadVersions([MAX_GENERATION]);
  const maxGenClearEnt = (0 * 65536) + MAX_GENERATION;
  assert.strictEqual(exhaustEm.isValid(maxGenClearEnt), true, "Entity at MAX_GENERATION must be valid before clear");

  exhaustEm.clear();
  assert.strictEqual(exhaustEm.isValid(maxGenClearEnt), false, "Entity at MAX_GENERATION must be invalid after clear");
  assert.strictEqual(exhaustEm.getFreeEntities().length, 0, "Slot reaching MAX_GENERATION must be retired and not added to free pool on clear()");

  // Allocating a new entity allocates a brand new index
  const nextNewEnt = exhaustEm.createEntity();
  assert.strictEqual(Math.floor(nextNewEnt / 65536), 1, "New entity must allocate at next available index (1) since slot 0 is retired");
  assert.strictEqual(exhaustEm.isValid(maxGenClearEnt), false, "Retired slot entity ID remains permanently invalid");

  growEm.hardReset();
  assert.strictEqual(growEm.getNextEntityId(), 0, "hardReset() resets nextEntityId to 0");
  const postResetEntity = growEm.createEntity();
  assert.strictEqual(Math.floor(postResetEntity / 65536), 0, "First entity after hardReset() must allocate at index 0");
  assert.strictEqual(growEm.isValid(postResetEntity), true, "First entity after hardReset() must be valid");

  // --- Tests: Location Integrity and Component Access Safety ---
  {
    interface PositionComp {
      x: number;
      y: number;
    }
    const C_POS: ComponentId = 100;
    const C_VEL: ComponentId = 101;
    const locEm = new EntityManager();
    const eA = locEm.createEntity();
    const eB = locEm.createEntity();

    const testArch = new Archetype((1n << BigInt(C_POS)) | (1n << BigInt(C_VEL)), [C_POS, C_VEL]);
    testArch.addEntity(eA, new Map<ComponentId, unknown>([
      [C_POS, { x: 10, y: 20 }],
      [C_VEL, { dx: 1, dy: 2 }]
    ]));
    testArch.addEntity(eB, new Map<ComponentId, unknown>([
      [C_POS, { x: 50, y: 60 }],
      [C_VEL, { dx: 5, dy: 6 }]
    ]));

    locEm.setLocation(eA, testArch, 0);
    locEm.setLocation(eB, testArch, 1);

    // Initial valid state check
    assert.deepStrictEqual(locEm.getComponentValue(eA, C_POS), { x: 10, y: 20 });
    assert.deepStrictEqual(locEm.getComponentValue(eB, C_POS), { x: 50, y: 60 });
    assert.strictEqual(locEm.hasComponent(eA, C_POS), true);
    assert.strictEqual(locEm.getMask(eA), testArch.mask);

    // 1. Fractional row index
    locEm.setLocation(eA, testArch, 0.5);
    assert.throws(() => locEm.getComponentValue(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.setComponentValue(eA, C_POS, { x: 999, y: 999 }), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.updateComponentValue<PositionComp>(eA, C_POS, c => ({ ...c, x: 999 })), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.mutateComponent<PositionComp>(eA, C_POS, c => { c.x = 999; }), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.hasComponent(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.getMask(eA), /Inconsistent entity location for entity/);

    // Verify storage was not modified
    assert.deepStrictEqual(testArch.getValue(C_POS, 0), { x: 10, y: 20 });
    assert.deepStrictEqual(testArch.getValue(C_POS, 1), { x: 50, y: 60 });

    // 2. Negative row index
    locEm.setLocation(eA, testArch, -1);
    assert.throws(() => locEm.getComponentValue(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.setComponentValue(eA, C_POS, { x: 999, y: 999 }), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.updateComponentValue<PositionComp>(eA, C_POS, c => ({ ...c, x: 999 })), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.mutateComponent<PositionComp>(eA, C_POS, c => { c.x = 999; }), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.hasComponent(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.getMask(eA), /Inconsistent entity location for entity/);

    // 3. Out-of-range row index
    locEm.setLocation(eA, testArch, 2); // Length is 2, index 2 is out of range
    assert.throws(() => locEm.getComponentValue(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.setComponentValue(eA, C_POS, { x: 999, y: 999 }), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.updateComponentValue<PositionComp>(eA, C_POS, c => ({ ...c, x: 999 })), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.mutateComponent<PositionComp>(eA, C_POS, c => { c.x = 999; }), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.hasComponent(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.getMask(eA), /Inconsistent entity location for entity/);

    locEm.setLocation(eA, testArch, 999);
    assert.throws(() => locEm.getComponentValue(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.setComponentValue(eA, C_POS, { x: 999, y: 999 }), /Inconsistent entity location for entity/);

    // 4. Valid row that belongs to a different entity (Row 1 belongs to eB, not eA)
    locEm.setLocation(eA, testArch, 1);
    assert.throws(
      () => locEm.getComponentValue(eA, C_POS),
      /Inconsistent entity location for entity/,
      "getComponentValue must not read another entity's row"
    );
    assert.throws(
      () => locEm.setComponentValue(eA, C_POS, { x: 999, y: 999 }),
      /Inconsistent entity location for entity/,
      "setComponentValue must not overwrite another entity's row"
    );
    assert.throws(
      () => locEm.updateComponentValue<PositionComp>(eA, C_POS, c => ({ ...c, x: 999 })),
      /Inconsistent entity location for entity/,
      "updateComponentValue must not update another entity's row"
    );
    assert.throws(
      () => locEm.mutateComponent<PositionComp>(eA, C_POS, c => { c.x = 999; }),
      /Inconsistent entity location for entity/,
      "mutateComponent must not mutate another entity's row"
    );
    assert.throws(() => locEm.hasComponent(eA, C_POS), /Inconsistent entity location for entity/);
    assert.throws(() => locEm.getMask(eA), /Inconsistent entity location for entity/);

    // Verify eB's data at row 1 was completely untouched
    assert.deepStrictEqual(locEm.getComponentValue(eB, C_POS), { x: 50, y: 60 });
    assert.deepStrictEqual(testArch.getValue(C_POS, 1), { x: 50, y: 60 });
    assert.deepStrictEqual(testArch.getValue(C_VEL, 1), { dx: 5, dy: 6 });

    // 5. Valid component access continuing to work after restoring the correct location
    locEm.setLocation(eA, testArch, 0);
    assert.deepStrictEqual(locEm.getComponentValue(eA, C_POS), { x: 10, y: 20 });
    assert.strictEqual(locEm.hasComponent(eA, C_POS), true);
    assert.strictEqual(locEm.getMask(eA), testArch.mask);

    // Modify eA and verify only eA is altered
    assert.strictEqual(locEm.setComponentValue(eA, C_POS, { x: 15, y: 25 }), true);
    assert.deepStrictEqual(locEm.getComponentValue(eA, C_POS), { x: 15, y: 25 });
    assert.deepStrictEqual(locEm.getComponentValue(eB, C_POS), { x: 50, y: 60 });

    assert.strictEqual(locEm.updateComponentValue<PositionComp>(eA, C_POS, c => ({ x: c.x + 5, y: c.y + 5 })), true);
    assert.deepStrictEqual(locEm.getComponentValue(eA, C_POS), { x: 20, y: 30 });
    assert.deepStrictEqual(locEm.getComponentValue(eB, C_POS), { x: 50, y: 60 });

    assert.strictEqual(locEm.mutateComponent<PositionComp>(eA, C_POS, c => { c.x = 22; }), true);
    assert.deepStrictEqual(locEm.getComponentValue(eA, C_POS), { x: 22, y: 30 });
    assert.deepStrictEqual(locEm.getComponentValue(eB, C_POS), { x: 50, y: 60 });

    // 6. Zero-component entities, missing components, and unallocated entities
    const eZero = locEm.createEntity();
    assert.strictEqual(locEm.getLocation(eZero), undefined);
    assert.strictEqual(locEm.getComponentValue(eZero, C_POS), undefined);
    assert.strictEqual(locEm.setComponentValue(eZero, C_POS, { x: 1, y: 1 }), false);
    assert.strictEqual(locEm.updateComponentValue(eZero, C_POS, v => v), false);
    assert.strictEqual(locEm.mutateComponent(eZero, C_POS, () => {}), false);
    assert.strictEqual(locEm.hasComponent(eZero, C_POS), false);
    assert.strictEqual(locEm.getMask(eZero), 0n);

    // Missing component ID on positioned entity (e.g. component ID 999 not in archetype)
    assert.strictEqual(locEm.getComponentValue(eA, 999), undefined);
    assert.strictEqual(locEm.setComponentValue(eA, 999, 123), false);
    assert.strictEqual(locEm.updateComponentValue(eA, 999, v => v), false);
    assert.strictEqual(locEm.mutateComponent(eA, 999, () => {}), false);
    assert.strictEqual(locEm.hasComponent(eA, 999), false);

    // Unallocated entity ID
    assert.strictEqual(locEm.getComponentValue(88888, C_POS), undefined);
    assert.strictEqual(locEm.setComponentValue(88888, C_POS, { x: 1, y: 1 }), false);
    assert.strictEqual(locEm.hasComponent(88888, C_POS), false);
    assert.strictEqual(locEm.getMask(88888), 0n);
  }

  console.log("EntityManager tests completed!");
}

if (require.main === module) {
  testEntityManager();
}
