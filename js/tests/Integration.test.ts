import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";
import { Scheduler } from "../ECS/Scheduler";
import { BaseSystem, IteratingSystem } from "../ECS/System";
import { Priority, Subscribe } from "../ECS/Decorators";
import { SceneManager } from "../ECS/SceneManager";
import { Scene } from "../ECS/Scene";
import { registerEcsSerializers } from "../ECS/ComponentRegistry";
import { ComponentId, EntityId } from "../ECS/Archetype";
import { USER_COMPONENT_ID_START } from "../ECS/InternalComponents";

// Component IDs for integration tests
const C_POS: ComponentId = USER_COMPONENT_ID_START + 10;
const C_VEL: ComponentId = USER_COMPONENT_ID_START + 11;
const C_HEALTH: ComponentId = USER_COMPONENT_ID_START + 12;
const C_RENDER: ComponentId = USER_COMPONENT_ID_START + 13;
const C_STATS: ComponentId = USER_COMPONENT_ID_START + 14;
const REL_PARENT: ComponentId = USER_COMPONENT_ID_START + 210;
const REL_CHILDREN: ComponentId = USER_COMPONENT_ID_START + 211;
const REL_TARGET: ComponentId = USER_COMPONENT_ID_START + 212;
const REL_FRIEND: ComponentId = USER_COMPONENT_ID_START + 213;

const TestComponents = {
  C_POS,
  C_VEL,
  C_HEALTH,
  C_RENDER,
  C_STATS,
  REL_PARENT,
  REL_CHILDREN,
  REL_TARGET,
  REL_FRIEND,
} as const;

function setupIntegrationWorld(): World {
  const world = new World();
  world.registerComponent(C_POS);
  world.registerComponent(C_VEL);
  world.registerComponent(C_HEALTH);
  world.registerComponent(C_RENDER);
  world.registerComponent(C_STATS);
  world.registerComponent(REL_PARENT);
  world.registerComponent(REL_CHILDREN);
  world.registerComponent(REL_TARGET);
  world.registerComponent(REL_FRIEND);

  registerEcsSerializers(world, TestComponents);
  return world;
}

export function testCrossSystemIntegration(): void {
  console.log("--- Starting Task 23: ECS Cross-System Integration & Lifecycle Audit ---");

  // =========================================================================
  // 23.1 Entity Lifecycle, ID Recycling, and Cross-Manager Integrity
  // =========================================================================
  {
    console.log("  Testing 23.1: Entity Lifecycle, ID Recycling & Cross-Manager Integrity...");
    const world = setupIntegrationWorld();

    // 1. Create entities with components, tags, groups, and relationships
    const e1 = world.createEntity();
    world.addComponent(e1, C_POS, { x: 10, y: 20 });
    world.addComponent(e1, C_HEALTH, { current: 100, max: 100 });
    world.tags.register("HERO", e1);
    world.groups.add("PLAYERS", e1);
    world.groups.add("ALLIES", e1);

    const e2 = world.createEntity();
    world.addComponent(e2, C_POS, { x: 30, y: 40 });
    world.tags.register("MINION", e2);
    world.groups.add("ENEMIES", e2);

    world.relationships.add(e1, REL_TARGET, e2, true);

    assert.equal(world.tags.getEntity("HERO"), e1);
    assert.equal(world.tags.getTag(e1), "HERO");
    assert.equal(world.groups.has("PLAYERS", e1), true);
    assert.equal(world.relationships.getTargets(e1, REL_TARGET), e2);
    assert.deepEqual(Array.from(world.relationships.getRelated(REL_TARGET, e2)), [e1]);

    const oldIndex = Math.floor(e1 / 65536);
    const oldGen = e1 % 65536;
    const oldId = e1;

    // 2. Delete e1
    world.deleteEntity(e1);
    assert.equal(world.isValid(oldId), false);
    assert.equal(world.tags.has("HERO"), false);
    assert.equal(world.tags.getTag(oldId), undefined);
    assert.equal(world.groups.has("PLAYERS", oldId), false);
    assert.equal(world.relationships.countRelated(REL_TARGET, e2), 0);

    // 3. Allocate replacement entity and verify index recycling with incremented generation
    const recycledE1 = world.createEntity();
    assert.equal(Math.floor(recycledE1 / 65536), oldIndex);
    assert.equal(recycledE1 % 65536, oldGen + 1);
    assert.notEqual(recycledE1, oldId);
    assert.equal(world.isValid(recycledE1), true);

    // Verify recycled entity is completely clean
    assert.equal(world.getMask(recycledE1), 0n);
    assert.equal(world.hasComponent(recycledE1, C_POS), false);
    assert.equal(world.hasComponent(recycledE1, C_HEALTH), false);
    assert.equal(world.tags.getTag(recycledE1), undefined);
    assert.equal(world.groups.has("PLAYERS", recycledE1), false);
    assert.equal(world.relationships.getTargets(recycledE1, REL_TARGET), undefined);

    // Verify stale ID cannot query, mutate, tag, group, or delete recycled replacement
    assert.equal(world.getMask(oldId), 0n);
    assert.equal(world.getComponent(oldId, C_POS), undefined);
    world.tags.unregister(oldId);
    world.groups.remove(oldId);
    world.addComponent(oldId, C_POS, { x: 999, y: 999 });
    assert.equal(world.hasComponent(recycledE1, C_POS), false);
    world.deleteEntity(oldId);
    assert.equal(world.isValid(recycledE1), true);

    // Populate new components and verify queries
    world.addComponent(recycledE1, C_POS, { x: 50, y: 60 });
    world.tags.register("HERO_REBORN", recycledE1);
    world.groups.add("PLAYERS", recycledE1);

    assert.equal(world.tags.getEntity("HERO_REBORN"), recycledE1);
    assert.deepEqual(world.getEntitiesByGroup("PLAYERS"), [recycledE1]);
    assert.deepEqual(world.getEntitiesByTag("HERO_REBORN"), [recycledE1]);
    assert.equal(world.count(Aspect.all(C_POS)), 2); // recycledE1 and e2
  }

  // =========================================================================
  // 23.2 Complex Relationship Networks across Structural Changes and Deletions
  // =========================================================================
  {
    console.log("  Testing 23.2: Complex Relationship Networks across Structural Changes & Deletions...");
    const world = setupIntegrationWorld();

    const parent = world.createEntity();
    world.addComponent(parent, C_POS, { x: 0, y: 0 });

    const childA = world.createEntity();
    world.addComponent(childA, C_POS, { x: 1, y: 1 });

    const childB = world.createEntity();
    world.addComponent(childB, C_POS, { x: 2, y: 2 });

    const childC = world.createEntity();
    world.addComponent(childC, C_POS, { x: 3, y: 3 });

    // Link parent to children (1-to-Many) and children to parent (1-to-1)
    world.relationships.add(parent, REL_CHILDREN, childA, false);
    world.relationships.add(parent, REL_CHILDREN, childB, false);
    world.relationships.add(parent, REL_CHILDREN, childC, false);

    world.relationships.add(childA, REL_PARENT, parent, true);
    world.relationships.add(childB, REL_PARENT, parent, true);
    world.relationships.add(childC, REL_PARENT, parent, true);

    assert.equal(world.relationships.countRelated(REL_CHILDREN, childA), 1);
    assert.equal(world.relationships.countRelated(REL_CHILDREN, childB), 1);
    assert.equal(world.relationships.countRelated(REL_PARENT, parent), 3);

    const childrenSet = world.relationships.getTargets(parent, REL_CHILDREN) as Set<EntityId>;
    assert.equal(childrenSet instanceof Set, true);
    assert.equal(childrenSet.size, 3);
    assert.equal(childrenSet.has(childA), true);
    assert.equal(childrenSet.has(childB), true);
    assert.equal(childrenSet.has(childC), true);

    // Symmetric relationships
    world.relationships.addSymmetric(childA, childB, REL_FRIEND);
    assert.equal(world.relationships.getTargets(childA, REL_FRIEND), childB);
    assert.equal(world.relationships.getTargets(childB, REL_FRIEND), childA);

    // Delete childB (middle child, triggers swap-and-pop if in same archetype)
    world.deleteEntity(childB);
    assert.equal(world.isValid(childB), false);
    assert.equal(childrenSet.size, 2);
    assert.equal(childrenSet.has(childB), false);
    assert.equal(childrenSet.has(childA), true);
    assert.equal(childrenSet.has(childC), true);
    assert.equal(world.relationships.countRelated(REL_PARENT, parent), 2);
    assert.equal(world.hasComponent(childA, REL_FRIEND), false); // Symmetric relation cleanly cleaned up

    // EntityEditor batch modifications: perform component structural changes while confirming existing relationship remains intact
    world.edit(childA)
      .add(C_HEALTH, { current: 50, max: 50 })
      .add(C_RENDER, { sprite: "ChildHero" })
      .commit();

    assert.equal(world.hasComponent(childA, C_HEALTH), true);
    assert.equal(world.hasComponent(childA, C_RENDER), true);
    assert.equal(world.relationships.getTargets(childA, REL_PARENT), parent);

    // Deferred mode batch mutation and deletion
    world.setDeferred(true);
    world.deleteEntity(childA); // Queued in deferred queue
    world.relationships.remove(parent, REL_CHILDREN, childC); // Direct manager operation removes childC

    // Pre-flush: childA is still valid (deletion deferred), childC is removed
    assert.equal(world.isValid(childA), true);
    assert.equal(childrenSet.size, 1);
    assert.equal(childrenSet.has(childA), true);
    assert.equal(childrenSet.has(childC), false);

    // Flush
    world.flush();
    world.setDeferred(false);

    assert.equal(world.isValid(childA), false);
    // Deletion of childA during flush removes the last child, removing the REL_CHILDREN component entirely
    assert.equal(world.hasComponent(parent, REL_CHILDREN), false);
    assert.equal(world.relationships.getTargets(parent, REL_CHILDREN), undefined);
    // childC still points to parent via REL_PARENT
    assert.equal(world.relationships.countRelated(REL_PARENT, parent), 1);

    // Deleting childC removes the last incoming REL_PARENT link
    world.deleteEntity(childC);
    assert.equal(world.relationships.countRelated(REL_PARENT, parent), 0);
  }

  // =========================================================================
  // 23.3 Scheduler Systems, EventBus Subscriptions, World Resets, Scenes & Snapshots
  // =========================================================================
  {
    console.log("  Testing 23.3: Scheduler Systems, EventBus, World Resets, Scenes & Snapshots...");
    const world = setupIntegrationWorld();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    interface DamageEvent {
      type: "Combat:Damage";
      target: EntityId;
      amount: number;
    }

    let combatSystemRuns = 0;
    let eventsHandled = 0;

    @Priority(100)
    class CombatSystem extends IteratingSystem {
      constructor(w: World) {
        super(w, Aspect.all(C_HEALTH));
      }

      public override update(delta: number): void {
        super.update(delta);
        combatSystemRuns++;
      }

      protected override processEntity(entity: EntityId): void {
        const hp = this.world.getComponent(entity, C_HEALTH) as { current: number; max: number };
        if (hp.current <= 0) {
          this.world.deleteEntity(entity);
        }
      }

      @Subscribe("Combat:Damage")
      public onDamage(event: DamageEvent): void {
        eventsHandled++;
        if (this.world.isValid(event.target) && this.world.hasComponent(event.target, C_HEALTH)) {
          const hp = this.world.getComponent(event.target, C_HEALTH) as { current: number; max: number };
          hp.current -= event.amount;
        }
      }
    }

    const combatSys = new CombatSystem(world);
    scheduler.add(combatSys);

    // Scene 1: Battle Scene
    const battleScene: Scene = {
      name: "BattleScene",
      onEnter: (w: World) => {
        const hero = w.createEntity();
        w.addComponent(hero, C_HEALTH, { current: 100, max: 100 });
        w.tags.register("HERO", hero);

        const boss = w.createEntity();
        w.addComponent(boss, C_HEALTH, { current: 50, max: 50 });
        w.tags.register("BOSS", boss);
      },
      onExit: () => {
        // cleanup
      }
    };

    sceneManager.register(battleScene);
    sceneManager.switchTo("BattleScene");

    const hero = world.tags.getEntity("HERO")!;
    const boss = world.tags.getEntity("BOSS")!;
    assert.equal(world.isValid(hero), true);
    assert.equal(world.isValid(boss), true);

    // Publish damage event and run scheduler
    world.events.publish<DamageEvent>({ type: "Combat:Damage", target: boss, amount: 60 });
    assert.equal(eventsHandled, 1);

    scheduler.update(0.1);
    assert.equal(combatSystemRuns, 1);
    assert.equal(world.isValid(boss), false); // Boss died and was deleted
    assert.equal(world.isValid(hero), true);

    // Save snapshot
    const snapshot = world.saveSnapshot();

    // Scene 2: Victory Scene
    const victoryScene: Scene = {
      name: "VictoryScene",
      onEnter: (w: World) => {
        const trophy = w.createEntity();
        w.addComponent(trophy, C_RENDER, { sprite: "Trophy" });
        w.tags.register("VICTORY_CUP", trophy);
      },
      onExit: () => {}
    };

    sceneManager.register(victoryScene);
    sceneManager.switchTo("VictoryScene");

    assert.equal(world.isValid(hero), false); // Old scene entities cleared
    assert.equal(world.tags.has("VICTORY_CUP"), true);

    // Restore snapshot from BattleScene
    world.loadSnapshot(snapshot);
    const restoredHero = world.tags.getEntity("HERO")!;
    assert.equal(world.isValid(restoredHero), true);
    assert.equal(world.tags.has("VICTORY_CUP"), false);

    // Verify combat system is rebound and processes events on restored world
    world.events.publish<DamageEvent>({ type: "Combat:Damage", target: restoredHero, amount: 20 });
    assert.equal(eventsHandled, 2);
    const heroHp = world.getComponent(restoredHero, C_HEALTH) as { current: number; max: number };
    assert.equal(heroHp.current, 80);

    scheduler.update(0.1);
    assert.equal(combatSystemRuns, 2);
    assert.equal(world.isValid(restoredHero), true);
  }

  // =========================================================================
  // 23.4 Prefabs, Mutable Component Data, Snapshots, and Scene Transitions
  // =========================================================================
  {
    console.log("  Testing 23.4: Prefabs, Mutable Data, Snapshots & Scene Transitions...");
    const world = setupIntegrationWorld();

    const targetLeader = world.createEntity();
    world.tags.register("CHIEF_TAG", targetLeader);

    world.prefabs.register("Goblin", {
      name: "Goblin",
      components: [
        { id: C_POS, value: { x: 0, y: 0 } },
        { id: C_HEALTH, value: { current: 30, max: 30 } },
        { id: C_STATS, value: { attack: 5, inventory: ["Dagger", "Potion"] } }
      ],
      relationships: [
        { id: REL_TARGET, targetTag: "CHIEF_TAG" }
      ],
      groups: ["ENEMIES", "MONSTERS"]
    });

    // Spawn 2 goblins
    const g1 = world.prefabs.spawn("Goblin");
    const g2 = world.prefabs.spawn("Goblin");

    assert.notEqual(g1, g2);
    assert.equal(world.groups.has("ENEMIES", g1), true);
    assert.equal(world.groups.has("ENEMIES", g2), true);
    assert.equal(world.relationships.getTargets(g1, REL_TARGET), targetLeader);
    assert.equal(world.relationships.getTargets(g2, REL_TARGET), targetLeader);
    assert.equal(world.relationships.countRelated(REL_TARGET, targetLeader), 2);

    // Mutate g1's nested inventory array
    const g1Stats = world.getComponent(g1, C_STATS) as { attack: number; inventory: string[] };
    const g2Stats = world.getComponent(g2, C_STATS) as { attack: number; inventory: string[] };
    g1Stats.inventory.push("Shield");

    assert.deepEqual(g1Stats.inventory, ["Dagger", "Potion", "Shield"]);
    assert.deepEqual(g2Stats.inventory, ["Dagger", "Potion"]); // g2 unaffected!

    // Save snapshot, clear world, load snapshot
    const snap = world.saveSnapshot();
    world.clear();
    assert.equal(world.isValid(g1), false);
    assert.equal(world.isValid(g2), false);

    world.loadSnapshot(snap);
    assert.equal(world.isValid(g1), true);
    assert.equal(world.isValid(g2), true);
    assert.equal(world.isValid(targetLeader), true);
    assert.deepEqual((world.getComponent(g1, C_STATS) as { inventory: string[] }).inventory, ["Dagger", "Potion", "Shield"]);
    assert.deepEqual((world.getComponent(g2, C_STATS) as { inventory: string[] }).inventory, ["Dagger", "Potion"]);
    assert.equal(world.relationships.getTargets(g1, REL_TARGET), targetLeader);

    // Prefab template persists across World.clear / loadSnapshot
    const g3 = world.prefabs.spawn("Goblin");
    assert.equal(world.isValid(g3), true);
    assert.deepEqual((world.getComponent(g3, C_STATS) as { inventory: string[] }).inventory, ["Dagger", "Potion"]);
    assert.equal(world.relationships.getTargets(g3, REL_TARGET), targetLeader);
  }

  // =========================================================================
  // 23.5 Query Iteration Combined with Structural Changes, Events & Deletions
  // =========================================================================
  {
    console.log("  Testing 23.5: Query Iteration with Structural Changes & Events...");
    const world = setupIntegrationWorld();

    const entities: EntityId[] = [];
    for (let i = 0; i < 5; i++) {
      const e = world.createEntity();
      world.addComponent(e, C_POS, { x: i, y: i });
      world.addComponent(e, C_HEALTH, { current: 100, max: 100 });
      entities.push(e);
    }

    interface DeathEvent {
      type: "Entity:Death";
      entity: EntityId;
    }

    world.events.subscribe<"Entity:Death">("Entity:Death", (ev) => {
      const deathEv = ev as unknown as DeathEvent;
      if (world.isValid(deathEv.entity)) {
        world.deleteEntity(deathEv.entity);
      }
    });

    // Iterate using getEntities() snapshot while publishing events that delete entities
    const querySnapshot = world.getEntities(Aspect.all(C_HEALTH));
    assert.equal(querySnapshot.length, 5);

    const firstEntity = querySnapshot[0];
    const lastEntity = querySnapshot[querySnapshot.length - 1];

    let processedCount = 0;
    for (const ent of querySnapshot) {
      if (!world.isValid(ent)) continue;
      processedCount++;
      if (ent === firstEntity) {
        // Delete lastEntity during iteration
        world.events.publish<DeathEvent>({ type: "Entity:Death", entity: lastEntity });
      }
    }

    // lastEntity was deleted before being processed, so 4 entities processed
    assert.equal(processedCount, 4);
    assert.equal(world.isValid(lastEntity), false);
    assert.equal(world.count(Aspect.all(C_HEALTH)), 4);

    // Deferred iteration test
    world.setDeferred(true);
    const aspectPos = Aspect.all(C_POS);
    const posEntities = world.getEntities(aspectPos);

    for (const ent of posEntities) {
      world.removeComponent(ent, C_POS); // Queued
      world.addComponent(ent, C_RENDER, { sprite: "Ghost" }); // Queued
    }

    // Pre-flush: query count unchanged
    assert.equal(world.count(aspectPos), 4);
    assert.equal(world.count(Aspect.all(C_RENDER)), 0);

    // Flush deferred operations
    world.flush();
    world.setDeferred(false);

    assert.equal(world.count(aspectPos), 0);
    assert.equal(world.count(Aspect.all(C_RENDER)), 4);
  }

  // =========================================================================
  // 23.6 Multi-Cycle World Lifecycle Stress Testing
  // =========================================================================
  {
    console.log("  Testing 23.6: Multi-Cycle World Lifecycle Stress Testing...");
    const world = setupIntegrationWorld();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    let tickCount = 0;
    class MovementSystem extends BaseSystem {
      public override update(): void {
        tickCount++;
      }
    }
    scheduler.add(new MovementSystem(world));

    world.prefabs.register("Player", {
      name: "Player",
      components: [
        { id: C_POS, value: { x: 0, y: 0 } },
        { id: C_HEALTH, value: { current: 100, max: 100 } }
      ],
      groups: ["HEROES"]
    });

    const explorationScene: Scene = {
      name: "Exploration",
      onEnter: (w: World) => {
        w.prefabs.spawnWithTag("Player", "HERO");
      },
      onExit: () => {}
    };

    const dungeonScene: Scene = {
      name: "Dungeon",
      onEnter: (w: World) => {
        w.prefabs.spawnWithTag("Player", "HERO");
        const boss = w.createEntity();
        w.addComponent(boss, C_HEALTH, { current: 500, max: 500 });
        w.tags.register("DUNGEON_BOSS", boss);
      },
      onExit: () => {}
    };

    sceneManager.register(explorationScene);
    sceneManager.register(dungeonScene);

    // Execute 5 full lifecycle cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      sceneManager.switchTo("Exploration");
      const heroExp = world.tags.getEntity("HERO")!;
      assert.equal(world.isValid(heroExp), true);
      assert.equal(world.groups.has("HEROES", heroExp), true);
      scheduler.update(0.1);

      const snap = world.saveSnapshot();

      sceneManager.switchTo("Dungeon");
      const heroDungeon = world.tags.getEntity("HERO")!;
      const boss = world.tags.getEntity("DUNGEON_BOSS")!;
      assert.equal(world.isValid(heroDungeon), true);
      assert.equal(world.isValid(boss), true);
      assert.notEqual(heroExp, heroDungeon); // Fresh entity ID per scene switch

      scheduler.update(0.1);

      // Restore snapshot
      world.loadSnapshot(snap);
      const restoredHero = world.tags.getEntity("HERO")!;
      assert.equal(restoredHero, heroExp);
      assert.equal(world.isValid(restoredHero), true);
      assert.equal(world.tags.has("DUNGEON_BOSS"), false);

      scheduler.update(0.1);
    }

    assert.equal(tickCount, 15); // 3 scheduler updates per cycle * 5 cycles
  }

  console.log("--- Task 23 Cross-System Integration Tests Passed Successfully ---");
}
