import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";

// Mock RPG Component IDs
const POSITION = 1;
const STATS = 2;
const NAME = 3;
const INVENTORY = 4;
const RELATION_OWNER = 10;
const GAME_STATE = 50;

interface Position { x: number; y: number; }
interface Stats { hp: number; maxHp: number; level: number; }
interface Name { value: string; }
interface Inventory { items: string[]; }
interface GameState { paused: boolean; difficulty: string; }

/**
 * Advanced RPG scenario tests for the ECS framework.
 * Tests complex interactions: buildEntity, update/mutate, viewColumns, Mappers, Relationships, and Singletons.
 */
export function testRPGScenario() {
  console.log("Running RPG Scenario tests...");

  const world = new World();

  // Registration
  world.registerComponent(POSITION);
  world.registerComponent(STATS);
  world.registerComponent(NAME);
  world.registerComponent(INVENTORY);
  world.registerComponent(RELATION_OWNER);
  world.registerComponent(GAME_STATE);

  // 1. Creating World and Entities using buildEntity (Fluent API)
  const player = world.buildEntity()
    .add(NAME, { value: "Hero" })
    .add(POSITION, { x: 0, y: 0 })
    .add(STATS, { hp: 100, maxHp: 100, level: 1 })
    .add(INVENTORY, { items: ["Sword", "Shield"] })
    .tag("player")
    .commit();

  assert.strictEqual(world.isValid(player), true, "Player should be valid");
  assert.strictEqual(world.hasComponent(player, NAME), true, "Player should have a name");
  assert.strictEqual(world.getComponent<Name>(player, NAME)?.value, "Hero", "Player name should be Hero");

  // 2. Adding more entities (Monsters)
  const goblin = world.buildEntity()
    .add(NAME, { value: "Goblin" })
    .add(POSITION, { x: 5, y: 5 })
    .add(STATS, { hp: 30, maxHp: 30, level: 1 })
    .group("monsters")
    .commit();

  const orc = world.buildEntity()
    .add(NAME, { value: "Orc" })
    .add(POSITION, { x: 10, y: 10 })
    .add(STATS, { hp: 80, maxHp: 80, level: 3 })
    .group("monsters")
    .commit();

  // 3. Modifying data in components
  // Move player via updateComponent (functional update)
  world.updateComponent<Position>(player, POSITION, (pos) => {
    pos.x += 1;
    pos.y += 1;
    return pos;
  });
  assert.strictEqual(world.getComponent<Position>(player, POSITION)?.x, 1, "Player should have moved to x=1");

  // Damage goblin using mutateComponent (direct mutation)
  world.mutateComponent<Stats>(goblin, STATS, (stats) => {
    stats.hp -= 10;
  });
  assert.strictEqual(world.getComponent<Stats>(goblin, STATS)?.hp, 20, "Goblin should have 20 HP left");

  // 4. Querying and Iterating
  const monsters = world.getEntitiesByGroup("monsters");
  assert.strictEqual(monsters.length, 2, "There should be 2 monsters");

  // Find all combatants (Name + Stats)
  const combatantsAspect = Aspect.all(NAME, STATS);
  const combatants = world.getEntities(combatantsAspect);
  assert.strictEqual(combatants.length, 3, "There should be 3 combatants (Player + Goblin + Orc)");

  // 5. Using viewColumns for efficient data access (SoA access)
  let totalHp = 0;
  for (const { entities, columns: [statsCol] } of world.viewColumns(combatantsAspect, STATS)) {
    for (let i = 0; i < entities.length; i++) {
      totalHp += (statsCol[i] as Stats).hp;
    }
  }
  assert.strictEqual(totalHp, 100 + 20 + 80, `Total HP should be 200, got ${totalHp}`);

  // 6. Using Mapper for ultra-fast access
  const statsMapper = world.getMapper<Stats>(STATS);
  const playerStats = statsMapper.get(player);
  if (playerStats) {
    assert.strictEqual(playerStats.hp, 100, "Mapper should return player stats");
    statsMapper.set(player, { ...playerStats, hp: 90 });
    assert.strictEqual(world.getComponent<Stats>(player, STATS)?.hp, 90, "Mapper set should update world data");
  } else {
    assert.fail("Player stats should exist in mapper");
  }

  // 7. Testing duplicateEntity (Doppelganger effect)
  const clone = world.duplicateEntity(player);
  assert.strictEqual(world.getComponent<Name>(clone, NAME)?.value, "Hero", "Clone should have same name");
  assert.strictEqual(world.getComponent<Stats>(clone, STATS)?.hp, 90, "Clone should have same HP");
  assert.notStrictEqual(clone, player, "Clone should be a different entity");
  assert.strictEqual(world.getEntitiesByTag("player").length, 1, "Tags should not be duplicated");

  // 8. Relationships (Entity-to-Entity links)
  const sword = world.buildEntity().add(NAME, { value: "Excalibur" }).commit();
  world.relationships.add(sword, RELATION_OWNER, player);

  assert.strictEqual(world.relationships.getTargets(sword, RELATION_OWNER), player, "Sword should be owned by player");

  const related = Array.from(world.relationships.getRelated(RELATION_OWNER, player));
  assert.strictEqual(related.includes(sword), true, "Player should be related to the sword");

  // 9. Singletons (Global Game State)
  world.setSingleton(GAME_STATE, { paused: false, difficulty: "hard" });
  assert.strictEqual(world.getSingleton<GameState>(GAME_STATE)?.paused, false, "Singleton should be retrievable");
  assert.strictEqual(world.getSingleton<GameState>(GAME_STATE)?.difficulty, "hard", "Singleton data should be correct");

  console.log("RPG Scenario tests completed!");
}

if (require.main === module) {
  testRPGScenario();
}
