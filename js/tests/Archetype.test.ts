import assert from "node:assert/strict";
import {
  Archetype,
  ComponentId,
  EntityId,
  isValidComponentId,
  MAX_COMPONENT_ID
} from "../ECS/Archetype";
import { World } from "../ECS/World";
import { EntityManager } from "../ECS/EntityManager";
import { ComponentManager } from "../ECS/ComponentManager";

export function testArchetype(): void {
  console.log("Testing Archetype and SoA Storage...");

  const C_POS: ComponentId = 100;
  const C_VEL: ComponentId = 101;
  const C_HEALTH: ComponentId = 102;
  const C_RENDER: ComponentId = 103;

  const M_POS = 1n << BigInt(C_POS);
  const M_VEL = 1n << BigInt(C_VEL);
  const M_HEALTH = 1n << BigInt(C_HEALTH);

  // 1. Constructor and Schema Validation
  {
    // 1.1 Valid empty archetype (mask 0n, componentIds [])
    const emptyArch = new Archetype(0n, []);
    assert.strictEqual(emptyArch.mask, 0n);
    assert.strictEqual(emptyArch.entities.length, 0);
    assert.strictEqual(emptyArch.columns.size, 0);

    // 1.2 Valid single component archetype
    const singleArch = new Archetype(M_POS, [C_POS]);
    assert.strictEqual(singleArch.mask, M_POS);
    assert.strictEqual(singleArch.columns.size, 1);
    assert.strictEqual(singleArch.hasComponent(C_POS), true);
    assert.strictEqual(singleArch.hasComponent(C_VEL), false);
    assert.deepStrictEqual(singleArch.getColumn(C_POS), []);

    // 1.3 Valid multi-component archetype
    const multiMask = M_POS | M_VEL | M_HEALTH;
    const multiArch = new Archetype(multiMask, [C_POS, C_VEL, C_HEALTH]);
    assert.strictEqual(multiArch.mask, multiMask);
    assert.strictEqual(multiArch.columns.size, 3);
    assert.strictEqual(multiArch.hasComponent(C_POS), true);
    assert.strictEqual(multiArch.hasComponent(C_VEL), true);
    assert.strictEqual(multiArch.hasComponent(C_HEALTH), true);
    assert.strictEqual(multiArch.hasComponent(C_RENDER), false);

    // 1.4 Unordered componentIds list matching mask
    const unorderedArch = new Archetype(multiMask, [C_HEALTH, C_POS, C_VEL]);
    assert.strictEqual(unorderedArch.mask, multiMask);
    assert.strictEqual(unorderedArch.columns.size, 3);

    // 1.5 Mask mismatch rejection
    assert.throws(
      () => new Archetype(0n, [C_POS]),
      /does not match component IDs mask/,
      "Must reject mask 0n when componentIds are provided"
    );
    assert.throws(
      () => new Archetype(M_POS, [C_VEL]),
      /does not match component IDs mask/,
      "Must reject mask when componentIds represent different component"
    );
    assert.throws(
      () => new Archetype(M_POS | M_VEL, [C_POS]),
      /does not match component IDs mask/,
      "Must reject mask when componentIds represent subset of mask"
    );
    assert.throws(
      () => new Archetype(M_POS, [C_POS, C_VEL]),
      /does not match component IDs mask/,
      "Must reject mask when componentIds represent superset of mask"
    );

    // 1.6 Duplicate Component ID rejection
    assert.throws(
      () => new Archetype(M_POS, [C_POS, C_POS]),
      /Duplicate Component ID/,
      "Must reject duplicate component IDs"
    );

    // 1.7 Invalid Mask format rejection
    assert.throws(
      () => new Archetype(-1n, []),
      /Invalid Archetype mask/,
      "Must reject negative bigint mask"
    );
    assert.throws(
      () => new Archetype("invalid" as unknown as bigint, []),
      /Invalid Archetype mask/,
      "Must reject non-bigint mask"
    );

    // 1.8 Non-array componentIds rejection
    assert.throws(
      () => new Archetype(0n, null as unknown as ComponentId[]),
      /Invalid componentIds/,
      "Must reject null componentIds"
    );

    // 1.9 Invalid Component IDs rejection (bounds, fractions, NaN, Infinity)
    assert.throws(
      () => new Archetype(0n, [-1]),
      /Invalid Component ID/,
      "Must reject negative component ID"
    );
    assert.throws(
      () => new Archetype(0n, [1.5]),
      /Invalid Component ID/,
      "Must reject fractional component ID"
    );
    assert.throws(
      () => new Archetype(0n, [NaN]),
      /Invalid Component ID/,
      "Must reject NaN component ID"
    );
    assert.throws(
      () => new Archetype(0n, [Infinity]),
      /Invalid Component ID/,
      "Must reject Infinity component ID"
    );
    assert.throws(
      () => new Archetype(0n, [MAX_COMPONENT_ID + 1]),
      /Invalid Component ID/,
      "Must reject component ID > MAX_COMPONENT_ID"
    );

    // Boundary valid IDs (0 and MAX_COMPONENT_ID)
    const minMask = 1n << 0n;
    const minArch = new Archetype(minMask, [0]);
    assert.strictEqual(minArch.hasComponent(0), true);

    const maxMask = 1n << BigInt(MAX_COMPONENT_ID);
    const maxArch = new Archetype(maxMask, [MAX_COMPONENT_ID]);
    assert.strictEqual(maxArch.hasComponent(MAX_COMPONENT_ID), true);
  }

  // 2. Query and Schema Inspection Methods
  {
    const mask = M_POS | M_VEL;
    const arch = new Archetype(mask, [C_POS, C_VEL]);

    // hasComponent
    assert.strictEqual(arch.hasComponent(C_POS), true);
    assert.strictEqual(arch.hasComponent(C_VEL), true);
    assert.strictEqual(arch.hasComponent(C_HEALTH), false);
    assert.strictEqual(arch.hasComponent(-1), false);
    assert.strictEqual(arch.hasComponent(1.5), false);
    assert.strictEqual(arch.hasComponent(MAX_COMPONENT_ID + 1), false);

    // getColumn
    const posCol = arch.getColumn<{ x: number; y: number }>(C_POS);
    assert.ok(Array.isArray(posCol));
    assert.strictEqual(arch.getColumn(C_HEALTH), undefined);
    assert.strictEqual(arch.getColumn(-1), undefined);
    assert.strictEqual(arch.getColumn(NaN), undefined);

    // requireColumn
    const reqPos = arch.requireColumn<{ x: number; y: number }>(C_POS);
    assert.strictEqual(reqPos, posCol);
    assert.throws(
      () => arch.requireColumn(C_HEALTH),
      /Archetype missing required column for Component 102/
    );
    assert.throws(
      () => arch.requireColumn(-1),
      /Archetype missing required column for Component -1/
    );
  }

  // 3. Entity Addition and SoA Column Alignment
  {
    const mask = M_POS | M_VEL | M_HEALTH;
    const arch = new Archetype(mask, [C_POS, C_VEL, C_HEALTH]);

    const posValues = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 }
    ];
    const velValues = [
      { dx: 10, dy: 20 },
      { dx: 30, dy: 40 },
      { dx: 50, dy: 60 }
    ];
    const hpValues = [
      { current: 100, max: 100 },
      { current: 50, max: 100 },
      { current: 10, max: 100 }
    ];

    const entities: EntityId[] = [1000, 2000, 3000];

    // Add entities with values Map
    for (let i = 0; i < entities.length; i++) {
      const valuesMap = new Map<ComponentId, unknown>([
        [C_POS, posValues[i]],
        [C_VEL, velValues[i]],
        [C_HEALTH, hpValues[i]],
        [C_RENDER, { sprite: "ignored" }] // Extraneous component ID should be safely ignored
      ]);

      const allocatedRow = arch.addEntity(entities[i], valuesMap);
      assert.strictEqual(allocatedRow, i, `Row returned by addEntity must be ${i}`);
    }

    assert.strictEqual(arch.entities.length, 3);
    assert.deepStrictEqual(arch.entities, entities);

    // Verify column lengths and values
    const posCol = arch.requireColumn(C_POS);
    const velCol = arch.requireColumn(C_VEL);
    const hpCol = arch.requireColumn(C_HEALTH);

    assert.strictEqual(posCol.length, 3);
    assert.strictEqual(velCol.length, 3);
    assert.strictEqual(hpCol.length, 3);

    for (let i = 0; i < 3; i++) {
      assert.strictEqual(posCol[i], posValues[i]);
      assert.strictEqual(velCol[i], velValues[i]);
      assert.strictEqual(hpCol[i], hpValues[i]);
      assert.strictEqual(arch.getValue(C_POS, i), posValues[i]);
      assert.strictEqual(arch.getValue(C_VEL, i), velValues[i]);
      assert.strictEqual(arch.getValue(C_HEALTH, i), hpValues[i]);
    }

    // Add entity with undefined / empty Map (all columns receive undefined)
    const emptyValuesMap = new Map<ComponentId, unknown>();
    const undefRow = arch.addEntity(4000, emptyValuesMap);
    assert.strictEqual(undefRow, 3);
    assert.strictEqual(arch.entities.length, 4);
    assert.strictEqual(posCol.length, 4);
    assert.strictEqual(velCol.length, 4);
    assert.strictEqual(hpCol.length, 4);
    assert.strictEqual(posCol[3], undefined);
    assert.strictEqual(velCol[3], undefined);
    assert.strictEqual(hpCol[3], undefined);

    // Add entity with omitted values parameter
    const omittedRow = arch.addEntity(5000);
    assert.strictEqual(omittedRow, 4);
    assert.strictEqual(arch.entities.length, 5);
    assert.strictEqual(posCol.length, 5);
    assert.strictEqual(velCol.length, 5);
    assert.strictEqual(hpCol.length, 5);
    assert.strictEqual(posCol[4], undefined);
  }

  // 4. getValue Behavior with Bounds and Missing Columns
  {
    const arch = new Archetype(M_POS, [C_POS]);
    arch.addEntity(100, new Map([[C_POS, { x: 10, y: 20 }]]));

    // Valid row access
    assert.deepStrictEqual(arch.getValue(C_POS, 0), { x: 10, y: 20 });

    // Invalid row access returns undefined without throwing
    assert.strictEqual(arch.getValue(C_POS, -1), undefined);
    assert.strictEqual(arch.getValue(C_POS, 1), undefined);
    assert.strictEqual(arch.getValue(C_POS, 100), undefined);
    assert.strictEqual(arch.getValue(C_POS, 0.5), undefined);
    assert.strictEqual(arch.getValue(C_POS, NaN), undefined);
    assert.strictEqual(arch.getValue(C_POS, Infinity), undefined);

    // Missing column access throws Error
    assert.throws(
      () => arch.getValue(C_VEL, 0),
      /Component 101 not found in archetype/
    );
  }

  // 5. Swap-and-Pop Removal Mechanics (removeEntity)
  {
    const mask = M_POS | M_VEL;
    const arch = new Archetype(mask, [C_POS, C_VEL]);

    const e0 = 10, vPos0 = { id: 0 }, vVel0 = { v: 0 };
    const e1 = 20, vPos1 = { id: 1 }, vVel1 = { v: 1 };
    const e2 = 30, vPos2 = { id: 2 }, vVel2 = { v: 2 };
    const e3 = 40, vPos3 = { id: 3 }, vVel3 = { v: 3 };

    arch.addEntity(e0, new Map<ComponentId, unknown>([[C_POS, vPos0], [C_VEL, vVel0]]));
    arch.addEntity(e1, new Map<ComponentId, unknown>([[C_POS, vPos1], [C_VEL, vVel1]]));
    arch.addEntity(e2, new Map<ComponentId, unknown>([[C_POS, vPos2], [C_VEL, vVel2]]));
    arch.addEntity(e3, new Map<ComponentId, unknown>([[C_POS, vPos3], [C_VEL, vVel3]]));

    assert.strictEqual(arch.entities.length, 4);

    // 5.1 Remove middle entity (row 1, entity e1). Last entity (e3, row 3) is swapped to row 1.
    const moved1 = arch.removeEntity(1);
    assert.strictEqual(moved1, e3, "removeEntity(1) must return moved entity e3");
    assert.strictEqual(arch.entities.length, 3, "entities length must be 3");
    assert.deepStrictEqual(arch.entities, [e0, e3, e2], "entities array must reflect swap");

    const posCol = arch.requireColumn(C_POS);
    const velCol = arch.requireColumn(C_VEL);
    assert.strictEqual(posCol.length, 3);
    assert.strictEqual(velCol.length, 3);
    assert.deepStrictEqual(posCol, [vPos0, vPos3, vPos2], "pos column must reflect swap");
    assert.deepStrictEqual(velCol, [vVel0, vVel3, vVel2], "vel column must reflect swap");

    // 5.2 Remove first entity (row 0, entity e0). Last entity (e2, row 2) is swapped to row 0.
    const moved2 = arch.removeEntity(0);
    assert.strictEqual(moved2, e2, "removeEntity(0) must return moved entity e2");
    assert.strictEqual(arch.entities.length, 2);
    assert.deepStrictEqual(arch.entities, [e2, e3]);
    assert.deepStrictEqual(posCol, [vPos2, vPos3]);
    assert.deepStrictEqual(velCol, [vVel2, vVel3]);

    // 5.3 Remove last entity (row 1, entity e3). No other entity is moved; movedEntity === removedEntity.
    const moved3 = arch.removeEntity(1);
    assert.strictEqual(moved3, e3, "removeEntity(lastRow) must return e3");
    assert.strictEqual(arch.entities.length, 1);
    assert.deepStrictEqual(arch.entities, [e2]);
    assert.deepStrictEqual(posCol, [vPos2]);
    assert.deepStrictEqual(velCol, [vVel2]);

    // 5.4 Remove final remaining entity (row 0, entity e2).
    const moved4 = arch.removeEntity(0);
    assert.strictEqual(moved4, e2);
    assert.strictEqual(arch.entities.length, 0);
    assert.deepStrictEqual(arch.entities, []);
    assert.deepStrictEqual(posCol, []);
    assert.deepStrictEqual(velCol, []);

    // 5.5 Remove from empty archetype: must return undefined and cause zero mutation
    const emptyRemoved = arch.removeEntity(0);
    assert.strictEqual(emptyRemoved, undefined);
    assert.strictEqual(arch.entities.length, 0);
    assert.strictEqual(posCol.length, 0);
    assert.strictEqual(velCol.length, 0);

    // 5.6 Invalid row removals on populated archetype: must return undefined and cause zero mutation
    arch.addEntity(100, new Map([[C_POS, { x: 1 }], [C_VEL, { v: 1 }]]));
    arch.addEntity(200, new Map([[C_POS, { x: 2 }], [C_VEL, { v: 2 }]]));
    assert.strictEqual(arch.entities.length, 2);

    assert.strictEqual(arch.removeEntity(-1), undefined, "removeEntity(-1) must return undefined");
    assert.strictEqual(arch.removeEntity(-100), undefined, "removeEntity(-100) must return undefined");
    assert.strictEqual(arch.removeEntity(2), undefined, "removeEntity(length) must return undefined");
    assert.strictEqual(arch.removeEntity(100), undefined, "removeEntity(100) must return undefined");
    assert.strictEqual(arch.removeEntity(0.5), undefined, "removeEntity(0.5) must return undefined");
    assert.strictEqual(arch.removeEntity(NaN), undefined, "removeEntity(NaN) must return undefined");
    assert.strictEqual(arch.removeEntity(Infinity), undefined, "removeEntity(Infinity) must return undefined");
    assert.strictEqual(arch.removeEntity(-Infinity), undefined, "removeEntity(-Infinity) must return undefined");

    // Verify storage was not corrupted into sparse array or altered
    assert.strictEqual(arch.entities.length, 2);
    assert.strictEqual(posCol.length, 2);
    assert.strictEqual(velCol.length, 2);
    assert.deepStrictEqual(arch.entities, [100, 200]);
    assert.deepStrictEqual(posCol, [{ x: 1 }, { x: 2 }]);
    assert.deepStrictEqual(velCol, [{ v: 1 }, { v: 2 }]);
  }

  // 6. Reset and Reuse Lifecycle (clear)
  {
    const mask = M_POS | M_HEALTH;
    const arch = new Archetype(mask, [C_POS, C_HEALTH]);

    for (let i = 0; i < 50; i++) {
      arch.addEntity(i + 1, new Map([[C_POS, { x: i }], [C_HEALTH, { hp: 100 }]]));
    }
    assert.strictEqual(arch.entities.length, 50);
    assert.strictEqual(arch.requireColumn(C_POS).length, 50);
    assert.strictEqual(arch.requireColumn(C_HEALTH).length, 50);

    // Clear
    arch.clear();
    assert.strictEqual(arch.entities.length, 0);
    assert.strictEqual(arch.requireColumn(C_POS).length, 0);
    assert.strictEqual(arch.requireColumn(C_HEALTH).length, 0);
    assert.strictEqual(arch.columns.size, 2, "Columns schema must be preserved after clear");
    assert.strictEqual(arch.hasComponent(C_POS), true);
    assert.strictEqual(arch.hasComponent(C_HEALTH), true);

    // Reuse after clear
    const newRow = arch.addEntity(999, new Map([[C_POS, { x: 999 }], [C_HEALTH, { hp: 50 }]]));
    assert.strictEqual(newRow, 0);
    assert.strictEqual(arch.entities.length, 1);
    assert.strictEqual(arch.entities[0], 999);
    assert.deepStrictEqual(arch.getValue(C_POS, 0), { x: 999 });
    assert.deepStrictEqual(arch.getValue(C_HEALTH, 0), { hp: 50 });
  }

  // 7. Location Management Integration Invariants
  {
    // Emulate ComponentManager / EntityManager relocation lifecycle
    const arch = new Archetype(M_POS, [C_POS]);
    const locations = new Map<EntityId, number>();

    const eA = 101, eB = 102, eC = 103, eD = 104;
    locations.set(eA, arch.addEntity(eA, new Map([[C_POS, "A"]])));
    locations.set(eB, arch.addEntity(eB, new Map([[C_POS, "B"]])));
    locations.set(eC, arch.addEntity(eC, new Map([[C_POS, "C"]])));
    locations.set(eD, arch.addEntity(eD, new Map([[C_POS, "D"]])));

    assert.strictEqual(locations.get(eA), 0);
    assert.strictEqual(locations.get(eB), 1);
    assert.strictEqual(locations.get(eC), 2);
    assert.strictEqual(locations.get(eD), 3);

    // Remove eB (row 1)
    const removeTarget = eB;
    const targetRow = locations.get(removeTarget)!;
    const movedEntity = arch.removeEntity(targetRow)!;
    locations.delete(removeTarget);

    if (movedEntity !== removeTarget) {
      locations.set(movedEntity, targetRow);
    }

    // Verify locations and values after swap
    assert.strictEqual(locations.has(eB), false, "eB must be deleted from locations");
    assert.strictEqual(locations.get(eA), 0, "eA remains at row 0");
    assert.strictEqual(locations.get(eC), 2, "eC remains at row 2");
    assert.strictEqual(locations.get(eD), 1, "eD is relocated to row 1");

    assert.strictEqual(arch.entities[locations.get(eA)!], eA);
    assert.strictEqual(arch.entities[locations.get(eC)!], eC);
    assert.strictEqual(arch.entities[locations.get(eD)!], eD);

    assert.strictEqual(arch.getValue(C_POS, locations.get(eA)!), "A");
    assert.strictEqual(arch.getValue(C_POS, locations.get(eC)!), "C");
    assert.strictEqual(arch.getValue(C_POS, locations.get(eD)!), "D");
  }

  // 8. ComponentId validation helper tests
  {
    assert.strictEqual(isValidComponentId(0), true);
    assert.strictEqual(isValidComponentId(100), true);
    assert.strictEqual(isValidComponentId(MAX_COMPONENT_ID), true);
    assert.strictEqual(isValidComponentId(MAX_COMPONENT_ID + 1), false);
    assert.strictEqual(isValidComponentId(-1), false);
    assert.strictEqual(isValidComponentId(1.5), false);
    assert.strictEqual(isValidComponentId(NaN), false);
    assert.strictEqual(isValidComponentId(Infinity), false);
    assert.strictEqual(isValidComponentId("-1"), false);
    assert.strictEqual(isValidComponentId(null), false);
    assert.strictEqual(isValidComponentId(undefined), false);
    assert.strictEqual(isValidComponentId({}), false);
  }

  // 9. Pre-mutation Location Validation and Removal Failure Safety
  {
    const REL_PARENT: ComponentId = 110;

    // 9.1 ComponentManager.transmute with inconsistent / corrupted location
    {
      const world = new World();
      const internalWorld = world as unknown as { entities: EntityManager; components: ComponentManager };
      world.registerComponent(C_POS);
      world.registerComponent(C_VEL);

      const e1 = world.createEntity();
      world.addComponent(e1, C_POS, { x: 10, y: 20 });

      const em = internalWorld.entities;
      const loc = em.getLocation(e1)!;
      assert.ok(loc !== undefined);
      assert.strictEqual(loc.arch.entities[loc.row], e1);

      // Artificially corrupt the location row out of bounds
      em.setLocation(e1, loc.arch, 999);

      // Attempting transmute (e.g. adding C_VEL) must reject before modifying storage
      assert.throws(
        () => world.addComponent(e1, C_VEL, { dx: 1, dy: 2 }),
        /Inconsistent entity location for entity/,
        "transmute must throw on out-of-bounds location row"
      );

      // Verify source archetype remains unmutated
      assert.strictEqual(loc.arch.entities.length, 1);
      assert.strictEqual(loc.arch.entities[0], e1);
      assert.deepStrictEqual(loc.arch.getValue(C_POS, 0), { x: 10, y: 20 });

      // Verify destination archetype was not populated with e1
      const destArch = Array.from(internalWorld.components.getArchetypes()).find(a => a.hasComponent(C_POS) && a.hasComponent(C_VEL));
      assert.strictEqual(destArch?.entities.includes(e1) ?? false, false);

      // Corrupt location to point to wrong entity ID
      const eOther = world.createEntity();
      world.addComponent(eOther, C_POS, { x: 50, y: 60 });
      em.setLocation(e1, loc.arch, 1); // Row 1 holds eOther, not e1

      assert.throws(
        () => world.addComponent(e1, C_VEL, { dx: 1, dy: 2 }),
        /Inconsistent entity location for entity/,
        "transmute must throw when location row holds a different entity"
      );
    }

    // 9.2 ComponentManager.applyBatchChanges with inconsistent / corrupted location
    {
      const world = new World();
      const internalWorld = world as unknown as { entities: EntityManager; components: ComponentManager };
      world.registerComponent(C_POS);
      world.registerComponent(C_VEL);
      world.registerComponent(C_HEALTH);

      const e1 = world.createEntity();
      world.addComponent(e1, C_POS, { x: 10, y: 20 });

      const em = internalWorld.entities;
      const loc = em.getLocation(e1)!;

      // Corrupt row to negative
      em.setLocation(e1, loc.arch, -1);

      const additions = new Map<ComponentId, unknown>([[C_VEL, { dx: 5, dy: 5 }]]);
      const removals = new Set<ComponentId>([C_POS]);
      const newMask = 1n << BigInt(C_VEL);

      assert.throws(
        () => internalWorld.components.applyBatchChanges(e1, newMask, additions, removals),
        /Inconsistent entity location for entity/,
        "applyBatchChanges must throw on negative location row"
      );

      // Verify source archetype was not mutated
      assert.strictEqual(loc.arch.entities.length, 1);
      assert.strictEqual(loc.arch.entities[0], e1);
      assert.deepStrictEqual(loc.arch.getValue(C_POS, 0), { x: 10, y: 20 });
    }

    // 9.3 World.deleteEntity pre-mutation validation and referential atomicity
    {
      const world = new World();
      const internalWorld = world as unknown as { entities: EntityManager; components: ComponentManager };
      world.registerComponent(C_POS);
      world.registerComponent(REL_PARENT);
      world.relationships.registerRelation(REL_PARENT);

      const parent = world.createEntity();
      world.addComponent(parent, C_POS, { x: 0, y: 0 });

      const child = world.createEntity();
      world.addComponent(child, C_POS, { x: 1, y: 1 });
      world.relationships.add(child, REL_PARENT, parent);
      world.tags.register("boss", parent);
      world.groups.add("enemies", parent);

      // Verify initial state
      assert.strictEqual(world.isValid(parent), true);
      assert.strictEqual(world.tags.getTag(parent), "boss");
      assert.strictEqual(world.groups.has("enemies", parent), true);
      assert.strictEqual(world.relationships.getTargets(child, REL_PARENT), parent);
      assert.strictEqual(world.relationships.countRelated(REL_PARENT, parent), 1);

      const em = internalWorld.entities;
      const parentLoc = em.getLocation(parent)!;

      // Corrupt parent's location row
      em.setLocation(parent, parentLoc.arch, 500);

      // Attempting deleteEntity must fail BEFORE relationship cleanup, tag removal, group removal, or ID recycling
      assert.throws(
        () => world.deleteEntity(parent),
        /Inconsistent entity location for entity/,
        "deleteEntity must throw on corrupted location"
      );

      // Verify parent was NOT deleted, corrupted, or recycled
      assert.strictEqual(world.isValid(parent), true, "parent must remain valid");
      assert.strictEqual(world.tags.getTag(parent), "boss", "parent tag must remain intact");
      assert.strictEqual(world.groups.has("enemies", parent), true, "parent group must remain intact");

      // Verify relationship reverse and forward indexes were NOT modified
      assert.strictEqual(world.relationships.getTargets(child, REL_PARENT), parent);
      assert.strictEqual(world.relationships.countRelated(REL_PARENT, parent), 1);
      assert.deepStrictEqual(Array.from(world.relationships.getRelated(REL_PARENT, parent)), [child]);

      // Verify archetype row for parent was not removed or altered
      assert.strictEqual(parentLoc.arch.entities.length, 1);
      assert.strictEqual(parentLoc.arch.entities[0], parent);

      // Restore valid location and verify clean deletion
      em.setLocation(parent, parentLoc.arch, 0);
      world.deleteEntity(parent);

      assert.strictEqual(world.isValid(parent), false, "parent is now deleted");
      assert.strictEqual(world.tags.getTag(parent), undefined);
      assert.strictEqual(world.groups.has("enemies", parent), false);
      assert.strictEqual(world.relationships.getTargets(child, REL_PARENT), undefined);
      assert.strictEqual(world.relationships.countRelated(REL_PARENT, parent), 0);
    }
  }

  console.log("Archetype and SoA Storage tests completed successfully!");
}
