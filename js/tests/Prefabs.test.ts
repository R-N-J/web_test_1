import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { PrefabManager, PrefabDefinition } from "../ECS/PrefabManager";

/**
 * Test the PrefabManager functionality.
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

  world.registerComponent(POSITION);
  world.registerComponent(HEALTH);
  world.registerComponent(PLAYER);
  world.registerComponent(STATS);

  // 1. Test: Registration
  const heroPrefab: PrefabDefinition = {
    name: "Hero",
    components: [
      { id: PLAYER, value: { name: "Default Hero" } },
      { id: HEALTH, value: { current: 100, max: 100 } },
      { id: POSITION, value: { x: 0, y: 0 } }
    ]
  };

  prefabManager.register("Hero", heroPrefab);
  assert.strictEqual(prefabManager.has("Hero"), true, "Prefab Manager should have 'Hero' prefab");

  // 2. Test: Spawning
  const hero1 = prefabManager.spawn("Hero");
  assert.strictEqual(world.isValid(hero1), true, "Spawned entity should be valid");
  assert.strictEqual(world.hasComponent(hero1, PLAYER), true, "Spawned entity should have PLAYER component");

  const health = world.getComponent<{ current: number }>(hero1, HEALTH);
  assert.strictEqual(health?.current, 100, "Spawned entity should have correct component value");

  // 3. Test: Spawning with Overrides
  const overrides = new Map<number, unknown>();
  overrides.set(POSITION, { x: 50, y: 50 });
  overrides.set(PLAYER, { name: "Special Hero" });

  const hero2 = prefabManager.spawn("Hero", overrides);
  const pos2 = world.getComponent<{ x: number }>(hero2, POSITION);
  const player2 = world.getComponent<{ name: string }>(hero2, PLAYER);

  assert.strictEqual(pos2?.x, 50, "Spawned entity should have overridden position");
  assert.strictEqual(player2?.name, "Special Hero", "Spawned entity should have overridden name");
  assert.strictEqual(world.getComponent<{ current: number }>(hero2, HEALTH)?.current, 100, "Spawned entity should keep default health");

  // 4. Test: Spawning with Tag
  const hero3 = prefabManager.spawnWithTag("Hero", "main_player");
  assert.strictEqual(world.tags.get("main_player"), hero3, "Spawned entity should be correctly tagged");

  // 5. Test: Prefab with Relationships
  // We need a target first
  const weapon = world.createEntity();
  world.tags.register("holy_sword", weapon);

  const heroWithSwordPrefab: PrefabDefinition = {
    name: "Knight",
    components: [
      { id: PLAYER, value: { name: "Knight" } }
    ],
    relationships: [
      { id: STATS, targetTag: "holy_sword" } // Using STATS as a relation for simplicity
    ]
  };

  prefabManager.register("Knight", heroWithSwordPrefab);
  const knight = prefabManager.spawn("Knight");

  const relations = world.relationships.getTargetsArray(knight, STATS);
  assert.strictEqual(relations.length, 1, "Knight should have 1 relationship");
  assert.strictEqual(relations[0], weapon, "Knight should be related to the sword");

  console.log("PrefabManager tests completed!");
}

if (require.main === module) {
  testPrefabManager();
}
