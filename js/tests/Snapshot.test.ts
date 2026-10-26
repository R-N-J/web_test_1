import assert from "node:assert/strict";
import { World, WorldSnapshot, ECS_SNAPSHOT_VERSION } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";
import { Scheduler } from "../ECS/Scheduler";
import { BaseSystem } from "../ECS/System";
import { Subscribe } from "../ECS/Decorators";
import { ComponentSerializer } from "../ECS/ComponentManager";
import { registerEcsSerializers } from "../ECS/ComponentRegistry";

export function testSnapshot(): void {
  console.log("--- Task 22: Snapshot Serialization, Restoration & Persistence Tests ---");

  const C_POS = 100;
  const C_HEALTH = 101;
  const C_NAME = 102;
  const C_INVENTORY = 103;
  const C_REL_LEADER = 104;
  const C_REL_TARGETS = 105;
  const C_CUSTOM_MAP = 106;

  interface Position {
    x: number;
    y: number;
  }

  interface Health {
    current: number;
    max: number;
  }

  // =========================================================================
  // 22.1: Round-Trip State Preservation & Data Fidelity
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_HEALTH);
    world.registerComponent(C_NAME);

    // Entity 1: POS + HEALTH + NAME
    const e1 = world.createEntity();
    world.addComponent(e1, C_POS, { x: 10, y: 25 });
    world.addComponent(e1, C_HEALTH, { current: 80, max: 100 });
    world.addComponent(e1, C_NAME, "Warrior");

    // Entity 2: POS + HEALTH
    const e2 = world.createEntity();
    world.addComponent(e2, C_POS, { x: 50, y: 75 });
    world.addComponent(e2, C_HEALTH, { current: 30, max: 50 });

    // Entity 3: NAME only
    const e3 = world.createEntity();
    world.addComponent(e3, C_NAME, "NPC Guide");

    // Capture snapshot
    const snapshot = world.saveSnapshot();
    assert.strictEqual(snapshot.version, ECS_SNAPSHOT_VERSION);
    assert.strictEqual(snapshot.archetypes.length, 3, "Snapshot should contain 3 distinct archetypes");

    // Restore into a fresh world
    const restoredWorld = new World();
    restoredWorld.registerComponent(C_POS);
    restoredWorld.registerComponent(C_HEALTH);
    restoredWorld.registerComponent(C_NAME);

    restoredWorld.loadSnapshot(snapshot);

    // Assert entity validity and IDs
    assert.strictEqual(restoredWorld.isValid(e1), true);
    assert.strictEqual(restoredWorld.isValid(e2), true);
    assert.strictEqual(restoredWorld.isValid(e3), true);

    // Assert component values
    assert.deepStrictEqual(restoredWorld.getComponent<Position>(e1, C_POS), { x: 10, y: 25 });
    assert.deepStrictEqual(restoredWorld.getComponent<Health>(e1, C_HEALTH), { current: 80, max: 100 });
    assert.strictEqual(restoredWorld.getComponent<string>(e1, C_NAME), "Warrior");

    assert.deepStrictEqual(restoredWorld.getComponent<Position>(e2, C_POS), { x: 50, y: 75 });
    assert.deepStrictEqual(restoredWorld.getComponent<Health>(e2, C_HEALTH), { current: 30, max: 50 });
    assert.strictEqual(restoredWorld.hasComponent(e2, C_NAME), false);

    assert.strictEqual(restoredWorld.getComponent<string>(e3, C_NAME), "NPC Guide");
    assert.strictEqual(restoredWorld.hasComponent(e3, C_POS), false);
    assert.strictEqual(restoredWorld.hasComponent(e3, C_HEALTH), false);

    // Assert query agreement in restored world
    const posEntities = restoredWorld.getEntities(Aspect.all(C_POS));
    assert.strictEqual(posEntities.length, 2);
    assert.strictEqual(posEntities.includes(e1), true);
    assert.strictEqual(posEntities.includes(e2), true);

    const healthEntities = restoredWorld.getEntities(Aspect.all(C_HEALTH));
    assert.strictEqual(healthEntities.length, 2);
    assert.strictEqual(healthEntities.includes(e1), true);
    assert.strictEqual(healthEntities.includes(e2), true);
  }

  // =========================================================================
  // 22.2: Entity ID / Generation Validity & Deterministic Recycling
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);

    const e0 = world.createEntity();
    world.addComponent(e0, C_POS, { x: 1, y: 1 });

    const e1 = world.createEntity();
    world.addComponent(e1, C_POS, { x: 2, y: 2 });

    const e2 = world.createEntity();
    world.addComponent(e2, C_POS, { x: 3, y: 3 });

    // Delete e1 -> index slot enters free pool with incremented generation
    world.deleteEntity(e1);
    assert.strictEqual(world.isValid(e1), false);

    const snapshot = world.saveSnapshot();
    assert.strictEqual(snapshot.freeEntities.length, 1);
    const expectedRecycledId = snapshot.freeEntities[0];

    // Restore snapshot into fresh world
    const restoredWorld = new World();
    restoredWorld.registerComponent(C_POS);
    restoredWorld.loadSnapshot(snapshot);

    assert.strictEqual(restoredWorld.isValid(e0), true);
    assert.strictEqual(restoredWorld.isValid(e1), false, "Deleted entity must remain invalid after load");
    assert.strictEqual(restoredWorld.isValid(e2), true);

    // Creating a new entity in restored world must deterministically reuse the recycled ID
    const newEnt = restoredWorld.createEntity();
    assert.strictEqual(newEnt, expectedRecycledId, "New entity must reuse the exact free-pool ID deterministically");
    assert.notStrictEqual(newEnt, e1, "Recycled ID must have an incremented generation compared to deleted e1");
    assert.strictEqual(restoredWorld.isValid(newEnt), true);
    assert.strictEqual(restoredWorld.isValid(e1), false, "Stale e1 reference remains invalid");
  }

  // =========================================================================
  // 22.3: Entity References & Relationship Rebuilding
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_REL_LEADER);
    world.registerComponent(C_REL_TARGETS);

    registerEcsSerializers(world, {
      REL_MEMBER_OF: C_REL_LEADER,
      REL_TARGETS: C_REL_TARGETS
    });

    const leader = world.createEntity();
    world.addComponent(leader, C_POS, { x: 0, y: 0 });

    const minion1 = world.createEntity();
    world.relationships.add(minion1, C_REL_LEADER, leader, true); // 1-to-1 exclusive

    const minion2 = world.createEntity();
    world.relationships.add(minion2, C_REL_LEADER, leader, true);

    const targetA = world.createEntity();
    const targetB = world.createEntity();

    // 1-to-many relationship (Set)
    world.relationships.add(leader, C_REL_TARGETS, targetA, false);
    world.relationships.add(leader, C_REL_TARGETS, targetB, false);

    // Save and serialize to JSON string to test full persistence pipeline
    const snapshot = world.saveSnapshot();
    const jsonString = JSON.stringify(snapshot);
    const parsedSnapshot = JSON.parse(jsonString) as WorldSnapshot;

    // Restore in fresh world
    const restoredWorld = new World();
    restoredWorld.registerComponent(C_POS);
    restoredWorld.registerComponent(C_REL_LEADER);
    restoredWorld.registerComponent(C_REL_TARGETS);

    registerEcsSerializers(restoredWorld, {
      REL_MEMBER_OF: C_REL_LEADER,
      REL_TARGETS: C_REL_TARGETS
    });

    restoredWorld.loadSnapshot(parsedSnapshot);

    // Forward relationship queries
    assert.strictEqual(restoredWorld.relationships.getTargets(minion1, C_REL_LEADER), leader);
    assert.strictEqual(restoredWorld.relationships.getTargets(minion2, C_REL_LEADER), leader);

    const leaderTargets = restoredWorld.relationships.getTargets(leader, C_REL_TARGETS);
    assert.strictEqual(leaderTargets instanceof Set, true);
    const leaderSet = leaderTargets as Set<number>;
    assert.strictEqual(leaderSet.size, 2);
    assert.strictEqual(leaderSet.has(targetA), true);
    assert.strictEqual(leaderSet.has(targetB), true);

    // Reverse relationship queries (reconstructed index)
    const followers = Array.from(restoredWorld.relationships.getRelated(C_REL_LEADER, leader));
    assert.strictEqual(followers.length, 2);
    assert.strictEqual(followers.includes(minion1), true);
    assert.strictEqual(followers.includes(minion2), true);
    assert.strictEqual(restoredWorld.relationships.countRelated(C_REL_LEADER, leader), 2);

    const targetingEntities = Array.from(restoredWorld.relationships.getRelated(C_REL_TARGETS, targetA));
    assert.deepStrictEqual(targetingEntities, [leader]);

    // Deleting target in restored world properly cleans up relationship
    restoredWorld.deleteEntity(targetA);
    const updatedTargets = restoredWorld.relationships.getTargets(leader, C_REL_TARGETS);
    assert.strictEqual(updatedTargets instanceof Set, true);
    const updatedSet = updatedTargets as Set<number>;
    assert.strictEqual(updatedSet.size, 1);
    assert.strictEqual(updatedSet.has(targetA), false);
    assert.strictEqual(updatedSet.has(targetB), true);
  }

  // =========================================================================
  // 22.4: Mutable Nested Component Data & Immutability Guarantees
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_INVENTORY);

    const e1 = world.createEntity();
    world.addComponent(e1, C_POS, { x: 10, y: 20 });
    world.addComponent(e1, C_INVENTORY, { items: ["Sword", "Shield"], gold: 100 });

    const snapshot = world.saveSnapshot();

    // Mutate live entity after saveSnapshot
    world.getComponent<{ x: number; y: number }>(e1, C_POS)!.x = 999;
    world.getComponent<{ items: string[]; gold: number }>(e1, C_INVENTORY)!.items.push("Potion");
    world.getComponent<{ items: string[]; gold: number }>(e1, C_INVENTORY)!.gold = 500;

    // Restore snapshot into fresh world
    const restoredWorld = new World();
    restoredWorld.registerComponent(C_POS);
    restoredWorld.registerComponent(C_INVENTORY);
    restoredWorld.loadSnapshot(snapshot);

    // Assert restored world contains the snapshot's state, unaffected by post-save mutation
    assert.deepStrictEqual(restoredWorld.getComponent<Position>(e1, C_POS), { x: 10, y: 20 });
    assert.deepStrictEqual(
      restoredWorld.getComponent<{ items: string[]; gold: number }>(e1, C_INVENTORY),
      { items: ["Sword", "Shield"], gold: 100 }
    );

    // Mutate restored entity: assert snapshot in memory is not mutated
    restoredWorld.getComponent<{ items: string[]; gold: number }>(e1, C_INVENTORY)!.items.push("Helmet");
    const restoredAgainWorld = new World();
    restoredAgainWorld.registerComponent(C_POS);
    restoredAgainWorld.registerComponent(C_INVENTORY);
    restoredAgainWorld.loadSnapshot(snapshot);

    assert.deepStrictEqual(
      restoredAgainWorld.getComponent<{ items: string[]; gold: number }>(e1, C_INVENTORY),
      { items: ["Sword", "Shield"], gold: 100 }
    );
  }

  // =========================================================================
  // 22.5: Custom Serializer Round-Trip (Non-JSON Native Map)
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_CUSTOM_MAP);

    const MapSerializer: ComponentSerializer = {
      serialize(value: unknown): unknown {
        if (value instanceof Map) {
          return { __type: "Map", entries: Array.from(value.entries()) };
        }
        return value;
      },
      deserialize(value: unknown): unknown {
        if (value && typeof value === "object" && "__type" in value && (value as { __type?: unknown }).__type === "Map") {
          const mapData = value as { __type: "Map"; entries: [string, number][] };
          return new Map(mapData.entries);
        }
        return value;
      }
    };

    world.registerComponentSerializer(C_CUSTOM_MAP, MapSerializer);

    const e1 = world.createEntity();
    const map = new Map<string, number>();
    map.set("strength", 18);
    map.set("dexterity", 14);
    world.addComponent(e1, C_CUSTOM_MAP, map);

    const snapshot = world.saveSnapshot();
    const jsonStr = JSON.stringify(snapshot);
    const parsed = JSON.parse(jsonStr) as WorldSnapshot;

    const restoredWorld = new World();
    restoredWorld.registerComponent(C_CUSTOM_MAP);
    restoredWorld.registerComponentSerializer(C_CUSTOM_MAP, MapSerializer);
    restoredWorld.loadSnapshot(parsed);

    const restoredMap = restoredWorld.getComponent<Map<string, number>>(e1, C_CUSTOM_MAP);
    assert.strictEqual(restoredMap instanceof Map, true);
    assert.strictEqual(restoredMap?.get("strength"), 18);
    assert.strictEqual(restoredMap?.get("dexterity"), 14);
  }

  // =========================================================================
  // 22.6: Tags, Groups & Singletons Persistence
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_HEALTH);

    const hero = world.createEntity();
    world.addComponent(hero, C_POS, { x: 5, y: 5 });
    world.tags.register("PLAYER", hero);
    world.groups.add("party", hero);
    world.groups.add("allies", hero);

    const companion = world.createEntity();
    world.addComponent(companion, C_POS, { x: 6, y: 5 });
    world.tags.register("COMPANION", companion);
    world.groups.add("party", companion);

    const enemy = world.createEntity();
    world.addComponent(enemy, C_POS, { x: 20, y: 20 });
    world.tags.register("BOSS", enemy);
    world.groups.add("enemies", enemy);

    // Global singleton
    world.setSingleton(C_HEALTH, { current: 1000, max: 1000 });

    const snapshot = world.saveSnapshot();

    // Restore
    const restoredWorld = new World();
    restoredWorld.registerComponent(C_POS);
    restoredWorld.registerComponent(C_HEALTH);
    restoredWorld.loadSnapshot(snapshot);

    // Tags
    assert.strictEqual(restoredWorld.tags.get("PLAYER"), hero);
    assert.strictEqual(restoredWorld.tags.get("COMPANION"), companion);
    assert.strictEqual(restoredWorld.tags.get("BOSS"), enemy);
    assert.strictEqual(restoredWorld.tags.getTag(hero), "PLAYER");
    assert.strictEqual(restoredWorld.countTag("PLAYER"), 1);

    // Groups
    const party = restoredWorld.groups.getEntities("party", restoredWorld);
    assert.strictEqual(party.length, 2);
    assert.strictEqual(party.includes(hero), true);
    assert.strictEqual(party.includes(companion), true);
    assert.strictEqual(restoredWorld.countGroup("party"), 2);

    const allies = restoredWorld.getEntitiesByGroup("allies");
    assert.deepStrictEqual(allies, [hero]);

    const enemies = restoredWorld.getEntitiesByGroup("enemies");
    assert.deepStrictEqual(enemies, [enemy]);

    // Singleton
    assert.strictEqual(restoredWorld.hasSingleton(C_HEALTH), true);
    assert.deepStrictEqual(restoredWorld.getSingleton<Health>(C_HEALTH), { current: 1000, max: 1000 });
  }

  // =========================================================================
  // 22.7: Empty World & Zero-Component Entity Persistence
  // =========================================================================
  {
    // 1. Completely empty world
    const emptyWorld = new World();
    const emptySnap = emptyWorld.saveSnapshot();
    assert.strictEqual(emptySnap.archetypes.length, 0);

    const restoredEmpty = new World();
    restoredEmpty.loadSnapshot(emptySnap);
    assert.strictEqual(restoredEmpty.tags.has("__world_singletons__"), true);

    // 2. Unpositioned entity with 0 components
    const worldWithEmptyEnt = new World();
    const emptyEnt = worldWithEmptyEnt.createEntity();
    assert.strictEqual(worldWithEmptyEnt.isValid(emptyEnt), true);
    assert.strictEqual(worldWithEmptyEnt.getMask(emptyEnt), 0n);

    const snap = worldWithEmptyEnt.saveSnapshot();
    const restoredWithEmpty = new World();
    restoredWithEmpty.loadSnapshot(snap);

    assert.strictEqual(restoredWithEmpty.isValid(emptyEnt), true);
    assert.strictEqual(restoredWithEmpty.getMask(emptyEnt), 0n);
  }

  // =========================================================================
  // 22.8: Invalid / Malformed Snapshots & Failure Atomicity (SAV-003, SAV-004, SAV-005)
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_HEALTH);
    world.registerComponent(C_REL_TARGETS);
    registerEcsSerializers(world, { REL_TARGETS: C_REL_TARGETS });

    const liveEnt1 = world.createEntity();
    world.addComponent(liveEnt1, C_POS, { x: 100, y: 200 });
    world.addComponent(liveEnt1, C_HEALTH, { current: 50, max: 100 });
    world.tags.register("HERO", liveEnt1);
    world.groups.add("players", liveEnt1);

    const liveEnt2 = world.createEntity();
    world.addComponent(liveEnt2, C_POS, { x: 300, y: 400 });
    world.relationships.add(liveEnt1, C_REL_TARGETS, liveEnt2, false);

    function assertLiveWorldIntact(context: string): void {
      assert.strictEqual(world.isValid(liveEnt1), true, `${context}: liveEnt1 must remain valid`);
      assert.strictEqual(world.isValid(liveEnt2), true, `${context}: liveEnt2 must remain valid`);
      assert.deepStrictEqual(world.getComponent<Position>(liveEnt1, C_POS), { x: 100, y: 200 }, `${context}: liveEnt1 POS preserved`);
      assert.deepStrictEqual(world.getComponent<Health>(liveEnt1, C_HEALTH), { current: 50, max: 100 }, `${context}: liveEnt1 HEALTH preserved`);
      assert.deepStrictEqual(world.getComponent<Position>(liveEnt2, C_POS), { x: 300, y: 400 }, `${context}: liveEnt2 POS preserved`);
      assert.strictEqual(world.tags.get("HERO"), liveEnt1, `${context}: tag preserved`);
      assert.strictEqual(world.groups.has("players", liveEnt1), true, `${context}: group preserved`);
      assert.deepStrictEqual(world.relationships.getTargetsArray(liveEnt1, C_REL_TARGETS), [liveEnt2], `${context}: relation preserved`);
      assert.strictEqual(world.getEntities(Aspect.all(C_POS)).length, 2, `${context}: POS query count`);
      assert.strictEqual(world.getEntities(Aspect.all(C_HEALTH)).length, 1, `${context}: HEALTH query count`);
    }

    // Baseline assertion
    assertLiveWorldIntact("Initial setup");

    // 1. Incompatible snapshot version
    const invalidVerSnap = {
      version: 999,
      nextEntityId: 10,
      entityVersions: [1],
      freeEntities: [],
      archetypes: [],
      tags: {},
      groups: {}
    } as unknown as WorldSnapshot;

    assert.throws(
      () => world.loadSnapshot(invalidVerSnap),
      /Unsupported ECS snapshot version: 999/,
      "Loading incompatible snapshot version must throw"
    );
    assertLiveWorldIntact("After invalid version");

    // 2. Null / non-object snapshot
    assert.throws(
      () => world.loadSnapshot(null as unknown as WorldSnapshot),
      /Invalid snapshot/,
      "Null snapshot must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot("invalid-string" as unknown as WorldSnapshot),
      /Invalid snapshot/,
      "String snapshot must be rejected"
    );
    assertLiveWorldIntact("After non-object snapshot");

    // 3. Malformed top-level snapshot structure
    assert.throws(
      () => world.loadSnapshot({ version: ECS_SNAPSHOT_VERSION } as unknown as WorldSnapshot),
      /Malformed snapshot/,
      "Snapshot missing required structures must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: -1,
        entityVersions: [],
        freeEntities: [],
        archetypes: [],
        tags: {},
        groups: {}
      }),
      /nextEntityId/,
      "Negative nextEntityId must be rejected"
    );
    assertLiveWorldIntact("After malformed top-level structures");

    // 4. Invalid nextEntityId and entityVersions values
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 5,
        entityVersions: [1, 1], // Length < nextEntityId
        freeEntities: [],
        archetypes: [],
        tags: {},
        groups: {}
      }),
      /entityVersions/,
      "entityVersions length less than nextEntityId must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 70000], // Version > MAX_GENERATION (65535)
        freeEntities: [],
        archetypes: [],
        tags: {},
        groups: {}
      }),
      /entityVersions/,
      "entityVersions with generation > 65535 must be rejected"
    );
    assertLiveWorldIntact("After invalid entityVersions");

    // 5. Invalid freeEntities values
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [65536 * 10 + 1], // Index 10 >= nextEntityId 2
        archetypes: [],
        tags: {},
        groups: {}
      }),
      /freeEntities/,
      "freeEntities with out-of-bounds index must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [65536 * 1 + 2], // Generation 2 !== entityVersions[1] (1)
        archetypes: [],
        tags: {},
        groups: {}
      }),
      /freeEntities/,
      "freeEntities with generation mismatch must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [65536 * 1 + 1, 65536 * 1 + 1], // Duplicate free entity
        archetypes: [],
        tags: {},
        groups: {}
      }),
      /freeEntities/,
      "Duplicate freeEntities must be rejected"
    );
    assertLiveWorldIntact("After invalid freeEntities");

    // 6. Invalid archetype mask strings (would make BigInt throw or negative)
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: "invalid_mask_string",
            entities: [65536 * 1 + 1],
            columns: { [C_POS]: [{ x: 1, y: 1 }] }
          }
        ],
        tags: {},
        groups: {}
      }),
      /mask/,
      "Invalid mask string must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: "-100",
            entities: [65536 * 1 + 1],
            columns: { [C_POS]: [{ x: 1, y: 1 }] }
          }
        ],
        tags: {},
        groups: {}
      }),
      /mask/,
      "Negative mask string must be rejected before mutating state"
    );
    assertLiveWorldIntact("After invalid mask strings");

    // 7. Inconsistency between archetype mask and component column IDs
    const expectedMaskForPos = (1n << BigInt(C_POS)).toString();
    const wrongMask = (1n << BigInt(C_HEALTH)).toString();

    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: wrongMask, // Claims HEALTH mask but columns have POS
            entities: [65536 * 1 + 1],
            columns: { [C_POS]: [{ x: 1, y: 1 }] }
          }
        ],
        tags: {},
        groups: {}
      }),
      /Archetype mask mismatch/,
      "Archetype mask mismatch with column IDs must be rejected before mutating state"
    );
    assertLiveWorldIntact("After mask-to-columns mismatch");

    // 8. Duplicate entity IDs across archetypes and malformed entity IDs
    const validEntId = 65536 * 1 + 1;
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: expectedMaskForPos,
            entities: [validEntId],
            columns: { [C_POS]: [{ x: 1, y: 1 }] }
          },
          {
            mask: (1n << BigInt(C_HEALTH)).toString(),
            entities: [validEntId], // Duplicate entity ID in second archetype!
            columns: { [C_HEALTH]: [{ current: 10, max: 10 }] }
          }
        ],
        tags: {},
        groups: {}
      }),
      /Duplicate entity ID/,
      "Duplicate entity ID across archetypes must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: expectedMaskForPos,
            entities: [65536 * 5 + 1], // Index 5 >= nextEntityId 2
            columns: { [C_POS]: [{ x: 1, y: 1 }] }
          }
        ],
        tags: {},
        groups: {}
      }),
      /entity ID/,
      "Out of bounds entity ID in archetype must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [validEntId], // Also listed in freeEntities
        archetypes: [
          {
            mask: expectedMaskForPos,
            entities: [validEntId],
            columns: { [C_POS]: [{ x: 1, y: 1 }] }
          }
        ],
        tags: {},
        groups: {}
      }),
      /entity ID/,
      "Entity present in both archetype and freeEntities must be rejected"
    );
    assertLiveWorldIntact("After duplicate/malformed entity IDs");

    // 9. Malformed component column data
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: "1",
            entities: [validEntId],
            columns: {
              [-5]: [{ x: 1, y: 1 }] // Invalid negative component ID
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /Invalid Component ID/,
      "Invalid negative component ID must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: "1",
            entities: [validEntId],
            columns: {
              50: [{ x: 1, y: 1 }] // Unregistered reserved engine ID
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /unregistered reserved component ID: 50/,
      "Unregistered reserved component ID must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: expectedMaskForPos,
            entities: [validEntId],
            columns: {
              [C_POS]: [{ x: 1, y: 1 }, { x: 2, y: 2 }] // Column length 2 !== entities length 1
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /Malformed column data/,
      "Mismatched column length must be rejected before mutating state"
    );
    assertLiveWorldIntact("After malformed component columns");

    // 10. Malformed tags and groups data
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [],
        tags: { "": validEntId }, // Empty tag name
        groups: {}
      }),
      /tag/,
      "Empty tag name must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [],
        tags: { "PLAYER": 999999 }, // Invalid non-existent entity ID
        groups: {}
      }),
      /tag/,
      "Invalid entity ID in tags must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [],
        tags: { "TAG_A": validEntId, "TAG_B": validEntId }, // Multiple tags for same entity
        groups: {}
      }),
      /multiple tags/,
      "Entity assigned to multiple tags in snapshot must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [],
        tags: {},
        groups: { "party": "not-an-array" as unknown as number[] }
      }),
      /group/,
      "Group with non-array entities must be rejected"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 2,
        entityVersions: [1, 1],
        freeEntities: [],
        archetypes: [],
        tags: {},
        groups: { "party": [999999] } // Invalid entity ID in group
      }),
      /group/,
      "Group with invalid entity ID must be rejected"
    );
    assertLiveWorldIntact("After malformed tags and groups");

    // 11. Custom component deserializer that throws during restoration
    const C_THROWING = 150;
    world.registerComponent(C_THROWING);
    world.registerComponentSerializer(C_THROWING, {
      serialize(v: unknown) { return v; },
      deserialize() {
        throw new Error("Deserializer intentional failure: corrupted payload");
      }
    });

    const throwingSnap: WorldSnapshot = {
      version: ECS_SNAPSHOT_VERSION,
      nextEntityId: 2,
      entityVersions: [1, 1],
      freeEntities: [],
      archetypes: [
        {
          mask: (1n << BigInt(C_THROWING)).toString(),
          entities: [validEntId],
          columns: {
            [C_THROWING]: ["corrupted_data"]
          }
        }
      ],
      tags: {},
      groups: {}
    };

    assert.throws(
      () => world.loadSnapshot(throwingSnap),
      /Deserializer intentional failure: corrupted payload/,
      "Custom deserializer failure must propagate before mutating world state"
    );
    assertLiveWorldIntact("After throwing custom deserializer");

    // 12. Malformed registered relationship component data
    const C_REL_SINGLE = 160;
    const C_REL_MULTI = 161;
    const C_ORDINARY_NUM = 162;
    const C_ORDINARY_SET = 163;

    world.registerComponent(C_REL_SINGLE);
    world.relationships.registerRelation(C_REL_SINGLE);

    world.registerComponent(C_REL_MULTI);
    world.relationships.registerRelation(C_REL_MULTI);
    registerEcsSerializers(world, { REL_MULTI: C_REL_MULTI });

    world.registerComponent(C_ORDINARY_NUM);
    world.registerComponent(C_ORDINARY_SET);
    world.registerComponentSerializer(C_ORDINARY_SET, {
      serialize(v: unknown) {
        if (v instanceof Set) return { __custom_set: true, items: Array.from(v) };
        return v;
      },
      deserialize(v: unknown) {
        if (v && typeof v === "object" && "__custom_set" in v && "items" in v && Array.isArray((v as { items: unknown[] }).items)) {
          return new Set((v as { items: unknown[] }).items);
        }
        return v;
      }
    });

    const subjectEntId = 65536 * 1 + 1; // Index 1, generation 1
    const targetEntId = 65536 * 2 + 1;  // Index 2, generation 1
    const unallocatedEntId = 65536 * 50 + 1; // Index 50 >= nextEntityId (3)
    const staleEntId = 65536 * 2 + 2;   // Index 2, generation 2 !== entityVersions[2] (1)
    const freeTargetId = 65536 * 3 + 1; // Index 3, generation 1 (in freeEntities)

    // 12.1 Single-target relationship containing unallocated entity ID
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [freeTargetId],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: [unallocatedEntId]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target entity ID/,
      "Single-target relationship with unallocated target must be rejected before mutating state"
    );
    assertLiveWorldIntact("After unallocated single-target relationship");

    // 12.2 Single-target relationship containing stale entity ID (generation mismatch)
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [freeTargetId],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: [staleEntId]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target entity ID/,
      "Single-target relationship with stale generation target must be rejected before mutating state"
    );
    assertLiveWorldIntact("After stale generation single-target relationship");

    // 12.3 Single-target relationship containing free entity ID
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [freeTargetId],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: [freeTargetId]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target entity ID/,
      "Single-target relationship targeting free entity must be rejected before mutating state"
    );
    assertLiveWorldIntact("After free entity single-target relationship");

    // 12.4 Single-target relationship containing invalid numeric ID (e.g. 0, negative, NaN)
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: [0]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target entity ID/,
      "Single-target relationship targeting entity ID 0 must be rejected before mutating state"
    );
    assertLiveWorldIntact("After invalid entity ID 0 relationship");

    // 12.5 Set relationship containing an invalid / unallocated target ID
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [freeTargetId],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_MULTI)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_MULTI]: [
                { __rogue1_ecs: "Set", values: [targetEntId, unallocatedEntId] }
              ]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target in Set/,
      "Set relationship containing unallocated target must be rejected before mutating state"
    );
    assertLiveWorldIntact("After Set with unallocated target");

    // 12.6 Set relationship containing stale / free entity ID
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [freeTargetId],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_MULTI)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_MULTI]: [
                { __rogue1_ecs: "Set", values: [targetEntId, freeTargetId] }
              ]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target in Set/,
      "Set relationship containing free entity target must be rejected before mutating state"
    );
    assertLiveWorldIntact("After Set with free entity target");

    // 12.7 Set relationship containing malformed non-EntityId values (strings, objects, null)
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_MULTI)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_MULTI]: [
                { __rogue1_ecs: "Set", values: ["invalid_string_target"] }
              ]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target in Set/,
      "Set relationship containing string value must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_MULTI)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_MULTI]: [
                { __rogue1_ecs: "Set", values: [{ id: targetEntId }] }
              ]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /invalid or unallocated target in Set/,
      "Set relationship containing object value must be rejected before mutating state"
    );
    assertLiveWorldIntact("After Set with malformed non-EntityId values");

    // 12.8 Registered relationship component with unsupported value type
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: ["string_not_supported_for_relationship"]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /unsupported value type/,
      "Registered relationship with string value must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: [true]
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /unsupported value type/,
      "Registered relationship with boolean value must be rejected before mutating state"
    );
    assert.throws(
      () => world.loadSnapshot({
        version: ECS_SNAPSHOT_VERSION,
        nextEntityId: 4,
        entityVersions: [1, 1, 1, 1],
        freeEntities: [],
        archetypes: [
          {
            mask: (1n << BigInt(C_REL_SINGLE)).toString(),
            entities: [subjectEntId],
            columns: {
              [C_REL_SINGLE]: [[targetEntId]] // Raw array instead of Set serializer
            }
          }
        ],
        tags: {},
        groups: {}
      }),
      /unsupported value type/,
      "Registered relationship with raw array value must be rejected before mutating state"
    );
    assertLiveWorldIntact("After unsupported relationship value types");

    // 12.9 Ordinary numeric and Set-valued components are NOT misinterpreted as relationships
    const ordinarySnap: WorldSnapshot = {
      version: ECS_SNAPSHOT_VERSION,
      nextEntityId: 4,
      entityVersions: [1, 1, 1, 1],
      freeEntities: [],
      archetypes: [
        {
          mask: ((1n << BigInt(C_ORDINARY_NUM)) | (1n << BigInt(C_ORDINARY_SET))).toString(),
          entities: [subjectEntId],
          columns: {
            [C_ORDINARY_NUM]: [0], // Number 0 is not a valid EntityId, but valid for ordinary component!
            [C_ORDINARY_SET]: [
              { __custom_set: true, items: ["sword", "shield", "potion"] } // Strings in Set are valid for non-relationship!
            ]
          }
        }
      ],
      tags: {},
      groups: {}
    };

    const ordinaryTestWorld = new World();
    ordinaryTestWorld.registerComponent(C_ORDINARY_NUM);
    ordinaryTestWorld.registerComponent(C_ORDINARY_SET);
    ordinaryTestWorld.registerComponentSerializer(C_ORDINARY_SET, {
      serialize(v: unknown) {
        if (v instanceof Set) return { __custom_set: true, items: Array.from(v) };
        return v;
      },
      deserialize(v: unknown) {
        if (v && typeof v === "object" && "__custom_set" in v && "items" in v && Array.isArray((v as { items: unknown[] }).items)) {
          return new Set((v as { items: unknown[] }).items);
        }
        return v;
      }
    });

    // Should load cleanly without throwing relationship errors
    ordinaryTestWorld.loadSnapshot(ordinarySnap);
    assert.strictEqual(ordinaryTestWorld.getComponent<number>(subjectEntId, C_ORDINARY_NUM), 0);
    const loadedSet = ordinaryTestWorld.getComponent<Set<string>>(subjectEntId, C_ORDINARY_SET);
    assert.strictEqual(loadedSet instanceof Set, true);
    assert.strictEqual(loadedSet?.has("sword"), true);
    assert.strictEqual(loadedSet?.has("shield"), true);
    assert.strictEqual(loadedSet?.has("potion"), true);

    // 12.10 Valid registered relationship representations round-trip cleanly
    const validRelSnap: WorldSnapshot = {
      version: ECS_SNAPSHOT_VERSION,
      nextEntityId: 4,
      entityVersions: [1, 1, 1, 1],
      freeEntities: [],
      archetypes: [
        {
          mask: ((1n << BigInt(C_REL_SINGLE)) | (1n << BigInt(C_REL_MULTI))).toString(),
          entities: [subjectEntId],
          columns: {
            [C_REL_SINGLE]: [targetEntId],
            [C_REL_MULTI]: [
              { __rogue1_ecs: "Set", values: [targetEntId] }
            ]
          }
        },
        {
          mask: (1n << BigInt(C_POS)).toString(),
          entities: [targetEntId],
          columns: {
            [C_POS]: [{ x: 500, y: 600 }]
          }
        }
      ],
      tags: {},
      groups: {}
    };

    const validRelWorld = new World();
    validRelWorld.registerComponent(C_POS);
    validRelWorld.registerComponent(C_REL_SINGLE);
    validRelWorld.registerComponent(C_REL_MULTI);
    validRelWorld.relationships.registerRelation(C_REL_SINGLE);
    validRelWorld.relationships.registerRelation(C_REL_MULTI);
    registerEcsSerializers(validRelWorld, { REL_MULTI: C_REL_MULTI });

    validRelWorld.loadSnapshot(validRelSnap);
    assert.strictEqual(validRelWorld.relationships.getTargets(subjectEntId, C_REL_SINGLE), targetEntId);
    assert.deepStrictEqual(validRelWorld.relationships.getTargetsArray(subjectEntId, C_REL_MULTI), [targetEntId]);
    assert.strictEqual(validRelWorld.relationships.countRelated(C_REL_SINGLE, targetEntId), 1);
    assert.strictEqual(validRelWorld.relationships.countRelated(C_REL_MULTI, targetEntId), 1);
  }

  // =========================================================================
  // 22.9: Scheduler Systems & EventBus Rebinding Across Load
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);

    const scheduler = new Scheduler(world);

    class CombatSystem extends BaseSystem {
      public eventCount = 0;
      public lastEvent = "";

      public update(): void {}

      @Subscribe("COMBAT_HIT")
      public onCombatHit(ev: { type: string; details: string }): void {
        this.eventCount++;
        this.lastEvent = ev.details;
      }
    }

    const combatSys = new CombatSystem(world);
    scheduler.add(combatSys);

    const e1 = world.createEntity();
    world.addComponent(e1, C_POS, { x: 1, y: 1 });

    const snapshot = world.saveSnapshot();

    // Publish event before load
    world.events.publish({ type: "COMBAT_HIT", details: "Hit 1" });
    assert.strictEqual(combatSys.eventCount, 1);
    assert.strictEqual(combatSys.lastEvent, "Hit 1");

    // Load snapshot into same world with attached scheduler
    world.loadSnapshot(snapshot);

    // Publish event after load: system must receive event exactly once
    world.events.publish({ type: "COMBAT_HIT", details: "Hit 2" });
    assert.strictEqual(combatSys.eventCount, 2, "Rebound system must receive event exactly once");
    assert.strictEqual(combatSys.lastEvent, "Hit 2");
  }

  // =========================================================================
  // 22.10: Prefabs & Scene Transitions Integration
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_HEALTH);

    world.prefabs.register("Goblin", {
      name: "Goblin",
      components: [
        { id: C_POS, value: { x: 0, y: 0 } },
        { id: C_HEALTH, value: { current: 30, max: 30 } }
      ],
      groups: ["monsters"]
    });

    const g1 = world.prefabs.spawn("Goblin", new Map([
      [C_POS, { x: 10, y: 15 }]
    ]));
    world.tags.register("GOBLIN_1", g1);

    const snapshot = world.saveSnapshot();

    const restoredWorld = new World();
    restoredWorld.registerComponent(C_POS);
    restoredWorld.registerComponent(C_HEALTH);

    // Register prefab template in restored world
    restoredWorld.prefabs.register("Goblin", {
      name: "Goblin",
      components: [
        { id: C_POS, value: { x: 0, y: 0 } },
        { id: C_HEALTH, value: { current: 30, max: 30 } }
      ],
      groups: ["monsters"]
    });

    restoredWorld.loadSnapshot(snapshot);

    // Restored spawned entity matches
    assert.strictEqual(restoredWorld.tags.get("GOBLIN_1"), g1);
    assert.deepStrictEqual(restoredWorld.getComponent<Position>(g1, C_POS), { x: 10, y: 15 });
    assert.deepStrictEqual(restoredWorld.getComponent<Health>(g1, C_HEALTH), { current: 30, max: 30 });
    assert.strictEqual(restoredWorld.countGroup("monsters"), 1);

    // Prefab template can immediately spawn new independent instances in restored world
    const g2 = restoredWorld.prefabs.spawn("Goblin", new Map([
      [C_POS, { x: 20, y: 25 }]
    ]));
    assert.strictEqual(restoredWorld.isValid(g2), true);
    assert.notStrictEqual(g2, g1);
    assert.strictEqual(restoredWorld.countGroup("monsters"), 2);
  }

  // =========================================================================
  // 22.11: Repeated Save / Restore Cycles
  // =========================================================================
  {
    const world = new World();
    world.registerComponent(C_POS);
    world.registerComponent(C_HEALTH);

    let currentSnapshot: WorldSnapshot | null = null;

    for (let cycle = 1; cycle <= 5; cycle++) {
      // Modify world
      const ent = world.createEntity();
      world.addComponent(ent, C_POS, { x: cycle * 10, y: cycle * 20 });
      world.addComponent(ent, C_HEALTH, { current: cycle * 50, max: 100 });
      world.tags.register(`TAG_${cycle}`, ent);
      world.groups.add("cycle_group", ent);

      // Save
      currentSnapshot = world.saveSnapshot();

      // Load into new world and verify
      const testWorld = new World();
      testWorld.registerComponent(C_POS);
      testWorld.registerComponent(C_HEALTH);
      testWorld.loadSnapshot(currentSnapshot);

      assert.strictEqual(testWorld.tags.get(`TAG_${cycle}`), ent);
      assert.deepStrictEqual(testWorld.getComponent<Position>(ent, C_POS), { x: cycle * 10, y: cycle * 20 });
      assert.strictEqual(testWorld.countGroup("cycle_group"), cycle);
    }
  }

  console.log("--- Task 22: Snapshot Serialization & Persistence Tests Passed ---");
}
