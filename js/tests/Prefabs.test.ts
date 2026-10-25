import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { PrefabManager, PrefabDefinition } from "../ECS/PrefabManager";
import { Aspect } from "../ECS/Aspect";

/**
 * Test the PrefabManager functionality and regression suites.
 */
export function testPrefabManager() {
  console.log("Running PrefabManager tests...");

  const world = new World();
  const prefabManager = new PrefabManager(world);

  // Component IDs
  const POSITION = 100;
  const HEALTH = 101;
  const PLAYER = 102;
  const STATS = 103;
  const INVENTORY = 104;
  const FACTION = 105;
  const REL_EQUIP = 106;

  world.registerComponent(POSITION);
  world.registerComponent(HEALTH);
  world.registerComponent(PLAYER);
  world.registerComponent(STATS);
  world.registerComponent(INVENTORY);
  world.registerComponent(FACTION);
  world.registerComponent(REL_EQUIP);
  world.relationships.registerRelation(REL_EQUIP);

  // Register serializer for Set component (INVENTORY)
  world.registerComponentSerializer(INVENTORY, {
    serialize(val: unknown) {
      return val instanceof Set ? { __isSet: true, items: Array.from(val) } : val;
    },
    deserialize(val: unknown) {
      if (val && typeof val === "object" && "__isSet" in val) {
        return new Set((val as { __isSet: boolean; items: unknown[] }).items);
      }
      return val;
    }
  });

  // ==========================================
  // 1. Registration and Definition Isolation
  // ==========================================
  console.log("  Testing Prefab Registration and Definition Isolation...");

  const heroDef: PrefabDefinition = {
    name: "Hero",
    components: [
      { id: PLAYER, value: { name: "Default Hero" } },
      { id: HEALTH, value: { current: 100, max: 100 } },
      { id: POSITION, value: { x: 0, y: 0 } },
      { id: INVENTORY, value: new Set(["potion", "torch"]) }
    ],
    groups: ["HEROES", "LIVING"]
  };

  prefabManager.register("Hero", heroDef);
  assert.strictEqual(prefabManager.has("Hero"), true, "Prefab Manager should have 'Hero' prefab");

  // Mutate original nested component values in place
  (heroDef.components[0].value as { name: string }).name = "Externally Mutated Hero";
  (heroDef.components[1].value as { current: number; max: number }).current = 999;

  // Preserve replacement of component value reference and appending new component
  heroDef.components[1].value = { current: 888, max: 888 };
  heroDef.components.push({ id: STATS, value: { str: 99 } });

  // Spawn an entity and ensure it received the uncorrupted template values (deep isolation)
  const hero1 = prefabManager.spawn("Hero");
  assert.strictEqual(world.isValid(hero1), true, "Spawned entity should be valid");
  assert.deepStrictEqual(
    world.getComponent<{ name: string }>(hero1, PLAYER),
    { name: "Default Hero" },
    "Spawned entity should retain original PLAYER name despite in-place definition mutation"
  );
  assert.deepStrictEqual(
    world.getComponent<{ current: number; max: number }>(hero1, HEALTH),
    { current: 100, max: 100 },
    "Spawned entity should retain original HEALTH values despite in-place definition mutation and reference replacement"
  );
  assert.strictEqual(world.hasComponent(hero1, STATS), false, "Spawned entity should not have pushed component");

  // Overwrite/replace definition
  const heroV2: PrefabDefinition = {
    name: "Hero",
    components: [
      { id: PLAYER, value: { name: "Hero V2" } },
      { id: HEALTH, value: { current: 150, max: 150 } }
    ]
  };
  prefabManager.register("Hero", heroV2);
  const heroV2Instance = prefabManager.spawn("Hero");
  assert.deepStrictEqual(world.getComponent(heroV2Instance, PLAYER), { name: "Hero V2" });
  assert.deepStrictEqual(world.getComponent(heroV2Instance, HEALTH), { current: 150, max: 150 });

  // Re-register original clean Hero template
  prefabManager.register("Hero", {
    name: "Hero",
    components: [
      { id: PLAYER, value: { name: "Default Hero" } },
      { id: HEALTH, value: { current: 100, max: 100 } },
      { id: POSITION, value: { x: 0, y: 0 } },
      { id: INVENTORY, value: new Set(["potion", "torch"]) }
    ],
    groups: ["HEROES", "LIVING"]
  });

  // Invalid/malformed registration checks
  assert.throws(
    () => prefabManager.register("", heroDef),
    /\[ECS\] Invalid prefab name/
  );
  assert.throws(
    // @ts-expect-error testing invalid input
    () => prefabManager.register("BadDef", null),
    /\[ECS\] Invalid prefab definition/
  );
  assert.throws(
    // @ts-expect-error testing invalid input
    () => prefabManager.register("BadDef", { name: "BadDef", components: "not-an-array" }),
    /\[ECS\] Invalid prefab definition/
  );
  assert.throws(
    () => prefabManager.register("BadCompId", {
      name: "BadCompId",
      components: [{ id: -1, value: {} }]
    }),
    /\[ECS\] Invalid Component ID: -1/
  );
  assert.throws(
    () => prefabManager.register("UnregReserved", {
      name: "UnregReserved",
      components: [{ id: 50, value: {} }]
    }),
    /\[ECS\] Cannot use unregistered reserved component ID: 50/
  );
  assert.throws(
    () => prefabManager.register("BadRelId", {
      name: "BadRelId",
      components: [{ id: PLAYER, value: {} }],
      relationships: [{ id: 65536, targetTag: "target" }]
    }),
    /\[ECS\] Invalid Component ID: 65536/
  );
  assert.throws(
    () => prefabManager.register("BadRelTag", {
      name: "BadRelTag",
      components: [{ id: PLAYER, value: {} }],
      relationships: [{ id: REL_EQUIP, targetTag: "" }]
    }),
    /\[ECS\] Invalid relationship targetTag/
  );

  // registerAll validation
  prefabManager.registerAll([
    {
      name: "Goblin",
      components: [
        { id: HEALTH, value: { current: 30, max: 30 } },
        { id: POSITION, value: { x: 10, y: 10 } }
      ],
      groups: ["MONSTERS", "LIVING"]
    },
    {
      name: "Orc",
      components: [
        { id: HEALTH, value: { current: 80, max: 80 } },
        { id: POSITION, value: { x: 20, y: 20 } }
      ],
      groups: ["MONSTERS", "LIVING"]
    }
  ]);
  assert.strictEqual(prefabManager.has("Goblin"), true);
  assert.strictEqual(prefabManager.has("Orc"), true);

  // ==========================================
  // 2. Independent Mutable Component Data
  // ==========================================
  console.log("  Testing Independent Mutable Component Data...");

  const instA = prefabManager.spawn("Hero");
  const instB = prefabManager.spawn("Hero");

  assert.notStrictEqual(instA, instB, "Spawned entities must have distinct IDs");
  assert.strictEqual(world.isValid(instA), true);
  assert.strictEqual(world.isValid(instB), true);

  // Mutate component on instA
  const healthA = world.getComponent<{ current: number; max: number }>(instA, HEALTH)!;
  const healthB = world.getComponent<{ current: number; max: number }>(instB, HEALTH)!;
  assert.notStrictEqual(healthA, healthB, "Spawned entities must not share component object references");

  healthA.current = 25;
  assert.strictEqual(healthA.current, 25);
  assert.strictEqual(healthB.current, 100, "Mutating instA health must not mutate instB health");

  // Mutate Set component on instA
  const invA = world.getComponent<Set<string>>(instA, INVENTORY)!;
  const invB = world.getComponent<Set<string>>(instB, INVENTORY)!;
  assert.notStrictEqual(invA, invB, "Spawned entities must not share Set references");
  invA.add("excalibur");
  assert.strictEqual(invA.has("excalibur"), true);
  assert.strictEqual(invB.has("excalibur"), false, "Mutating instA inventory must not mutate instB inventory");

  // ==========================================
  // 3. Spawning with Overrides
  // ==========================================
  console.log("  Testing Spawning with Overrides...");

  const heroOverrides = new Map<number, unknown>([
    [POSITION, { x: 77, y: 88 }],
    [PLAYER, { name: "Overridden Hero" }],
    [STATS, { str: 18, dex: 14 }] // Extra component not in template
  ]);

  const customHero = prefabManager.spawn("Hero", heroOverrides);
  assert.deepStrictEqual(world.getComponent(customHero, POSITION), { x: 77, y: 88 });
  assert.deepStrictEqual(world.getComponent(customHero, PLAYER), { name: "Overridden Hero" });
  assert.deepStrictEqual(world.getComponent(customHero, STATS), { str: 18, dex: 14 });
  assert.deepStrictEqual(world.getComponent(customHero, HEALTH), { current: 100, max: 100 });

  // Verify override object was cloned so mutating heroOverrides map values does not affect customHero
  (heroOverrides.get(POSITION) as { x: number; y: number }).x = 999;
  assert.strictEqual(world.getComponent<{ x: number }>(customHero, POSITION)?.x, 77);

  // Overrides validation
  assert.throws(
    () => prefabManager.spawn("Hero", new Map([[-5, {}]])),
    /\[ECS\] Invalid Component ID: -5/
  );
  assert.throws(
    () => prefabManager.spawn("Hero", new Map([[50, {}]])),
    /\[ECS\] Cannot use unregistered reserved component ID: 50/
  );
  assert.throws(
    () => prefabManager.spawn("NonExistentPrefab"),
    /\[ECS\] CRITICAL: Prefab Template 'NonExistentPrefab' not found/
  );

  // ==========================================
  // 4. Metadata: Tags, Groups, and Failure Atomicity
  // ==========================================
  console.log("  Testing Metadata (Tags, Groups) and Failure Atomicity...");

  // Spawning with groups in definition
  const goblin1 = prefabManager.spawn("Goblin");
  assert.strictEqual(world.groups.has("MONSTERS", goblin1), true);
  assert.strictEqual(world.groups.has("LIVING", goblin1), true);
  assert.strictEqual(world.groups.has("HEROES", goblin1), false);
  assert.ok(world.getEntitiesByGroup("MONSTERS").includes(goblin1));

  // spawnWithTag
  const taggedHero = prefabManager.spawnWithTag("Hero", "PLAYER_ONE");
  assert.strictEqual(world.tags.get("PLAYER_ONE"), taggedHero);
  assert.strictEqual(world.tags.getTag(taggedHero), "PLAYER_ONE");

  // Tag collision: attempt spawnWithTag with already assigned tag
  const initialEntityCount = world.getEntities(Aspect.EMPTY).length;
  assert.throws(
    () => prefabManager.spawnWithTag("Hero", "PLAYER_ONE"),
    /Tag Collision! Tag 'PLAYER_ONE'/i
  );

  // Assert failure atomicity: no orphaned/leaked entity in world, count remains unchanged
  const postCollisionCount = world.getEntities(Aspect.EMPTY).length;
  assert.strictEqual(postCollisionCount, initialEntityCount, "Failed spawnWithTag must not leak orphan entities into the world");
  assert.strictEqual(world.tags.get("PLAYER_ONE"), taggedHero, "Original tag owner must remain unchanged");

  // ==========================================
  // 5. Relationships and Multi-Prefab Linking
  // ==========================================
  console.log("  Testing Relationships and Tag-based Resolution...");

  // Create weapon entity and tag it
  const sword = world.createEntity();
  world.tags.register("holy_blade", sword);
  world.addComponent(sword, STATS, { damage: 50 });

  prefabManager.register("Knight", {
    name: "Knight",
    components: [
      { id: PLAYER, value: { name: "Sir Lancelot" } },
      { id: HEALTH, value: { current: 120, max: 120 } }
    ],
    relationships: [
      { id: REL_EQUIP, targetTag: "holy_blade" }
    ],
    groups: ["KNIGHTS", "HEROES"]
  });

  const knight = prefabManager.spawn("Knight");
  assert.strictEqual(world.relationships.getTargets(knight, REL_EQUIP), sword);
  assert.deepStrictEqual(world.relationships.getTargetsArray(knight, REL_EQUIP), [sword]);
  assert.strictEqual(world.relationships.countRelated(REL_EQUIP, sword), 1);
  assert.deepStrictEqual(Array.from(world.relationships.getRelated(REL_EQUIP, sword)), [knight]);

  // Missing relationship targetTag: relation is omitted safely without error or partial corrupt entity
  prefabManager.register("MissingGearSoldier", {
    name: "MissingGearSoldier",
    components: [{ id: PLAYER, value: { name: "Grunt" } }],
    relationships: [{ id: REL_EQUIP, targetTag: "non_existent_weapon" }]
  });
  const soldier = prefabManager.spawn("MissingGearSoldier");
  assert.strictEqual(world.isValid(soldier), true);
  assert.strictEqual(world.hasComponent(soldier, REL_EQUIP), false, "Missing targetTag must safely omit relation");
  assert.strictEqual(world.relationships.getTargets(soldier, REL_EQUIP), undefined);

  // Deleting weapon cleans up relationship from knight
  world.deleteEntity(sword);
  assert.strictEqual(world.hasComponent(knight, REL_EQUIP), false);
  assert.strictEqual(world.relationships.countRelated(REL_EQUIP, sword), 0);

  // ==========================================
  // 6. World.clear and Lifecycle Safety
  // ==========================================
  console.log("  Testing World.clear and Lifecycle Safety...");

  // Clear world: entities and metadata cleared, but prefab templates remain intact
  world.clear();
  assert.strictEqual(world.getEntities(Aspect.EMPTY).length, 0);
  assert.strictEqual(prefabManager.has("Hero"), true, "Prefab templates must survive World.clear()");
  assert.strictEqual(prefabManager.has("Goblin"), true);

  // Spawn new instances post-clear
  const postClearHero = prefabManager.spawnWithTag("Hero", "NEW_HERO");
  assert.strictEqual(world.isValid(postClearHero), true);
  assert.strictEqual(world.tags.get("NEW_HERO"), postClearHero);
  assert.strictEqual(world.groups.has("HEROES", postClearHero), true);
  assert.deepStrictEqual(world.getComponent(postClearHero, HEALTH), { current: 100, max: 100 });

  // Test PrefabManager.clear()
  prefabManager.clear();
  assert.strictEqual(prefabManager.has("Hero"), false, "PrefabManager.clear() must remove all templates");
  assert.throws(
    () => prefabManager.spawn("Hero"),
    /\[ECS\] CRITICAL: Prefab Template 'Hero' not found/
  );

  // ==========================================
  // 7. Snapshot Persistence of Spawned Entities
  // ==========================================
  console.log("  Testing Snapshot Persistence of Spawned Entities...");

  const snapWorld = new World();
  snapWorld.registerComponent(POSITION);
  snapWorld.registerComponent(HEALTH);
  snapWorld.registerComponent(PLAYER);
  snapWorld.registerComponent(INVENTORY);
  snapWorld.registerComponent(REL_EQUIP);
  snapWorld.relationships.registerRelation(REL_EQUIP);

  snapWorld.registerComponentSerializer(INVENTORY, {
    serialize(val: unknown) {
      return val instanceof Set ? { __isSet: true, items: Array.from(val) } : val;
    },
    deserialize(val: unknown) {
      if (val && typeof val === "object" && "__isSet" in val) {
        return new Set((val as { __isSet: boolean; items: unknown[] }).items);
      }
      return val;
    }
  });

  const snapPrefabs = new PrefabManager(snapWorld);
  snapPrefabs.register("Wizard", {
    name: "Wizard",
    components: [
      { id: PLAYER, value: { name: "Gandalf" } },
      { id: HEALTH, value: { current: 60, max: 60 } },
      { id: INVENTORY, value: new Set(["staff", "spellbook"]) }
    ],
    groups: ["CASTERS", "LIVING"]
  });

  const wiz = snapPrefabs.spawnWithTag("Wizard", "WIZ_1");

  const snapshot = snapWorld.saveSnapshot();

  const restoredWorld = new World();
  restoredWorld.registerComponent(POSITION);
  restoredWorld.registerComponent(HEALTH);
  restoredWorld.registerComponent(PLAYER);
  restoredWorld.registerComponent(INVENTORY);
  restoredWorld.registerComponent(REL_EQUIP);
  restoredWorld.relationships.registerRelation(REL_EQUIP);

  restoredWorld.registerComponentSerializer(INVENTORY, {
    serialize(val: unknown) {
      return val instanceof Set ? { __isSet: true, items: Array.from(val) } : val;
    },
    deserialize(val: unknown) {
      if (val && typeof val === "object" && "__isSet" in val) {
        return new Set((val as { __isSet: boolean; items: unknown[] }).items);
      }
      return val;
    }
  });

  restoredWorld.loadSnapshot(snapshot);

  const restoredWiz = restoredWorld.tags.get("WIZ_1");
  assert.strictEqual(restoredWiz, wiz);
  assert.strictEqual(restoredWorld.isValid(restoredWiz!), true);
  assert.deepStrictEqual(restoredWorld.getComponent(restoredWiz!, PLAYER), { name: "Gandalf" });
  assert.deepStrictEqual(restoredWorld.getComponent(restoredWiz!, HEALTH), { current: 60, max: 60 });
  const restoredInv = restoredWorld.getComponent<Set<string>>(restoredWiz!, INVENTORY);
  assert.ok(restoredInv instanceof Set);
  assert.strictEqual(restoredInv.has("staff"), true);
  assert.strictEqual(restoredInv.has("spellbook"), true);
  assert.strictEqual(restoredWorld.groups.has("CASTERS", restoredWiz!), true);

  console.log("PrefabManager tests completed successfully!");
}

if (require.main === module) {
  testPrefabManager();
}
