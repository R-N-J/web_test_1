import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { SceneManager } from "../ECS/SceneManager";
import { Scene } from "../ECS/Scene";
import { Aspect } from "../ECS/Aspect";
import { BaseSystem, IteratingSystem } from "../ECS/System";
import { Subscribe } from "../ECS/Decorators";

/**
 * A configurable test scene for lifecycle tracking.
 */
class TestScene implements Scene {
  public name: string;
  public entered = false;
  public exited = false;
  public enterCount = 0;
  public exitCount = 0;
  public onEnterCallback?: (world: World) => void;
  public onExitCallback?: (world: World) => void;

  constructor(name: string) {
    this.name = name;
  }

  public onEnter(world: World): void {
    this.entered = true;
    this.enterCount++;
    if (this.onEnterCallback) {
      this.onEnterCallback(world);
    }
  }

  public onExit(world: World): void {
    this.exited = true;
    this.exitCount++;
    if (this.onExitCallback) {
      this.onExitCallback(world);
    }
  }
}

// User-defined component IDs for scene testing (100..65535)
const CMP_HEALTH = 100;
const CMP_POSITION = 101;
const CMP_RENDER = 102;
const REL_FOLLOWS = 103;

/**
 * A persistent event listener system for testing scheduler rebind across scenes.
 */
class PersistentEventSystem extends BaseSystem {
  public eventCount = 0;
  public lastEventPayload: string | null = null;

  @Subscribe("TEST_SCENE_EVENT")
  public onTestEvent(event: { type: string; payload: string }): void {
    this.eventCount++;
    this.lastEventPayload = event.payload;
  }

  public update(): void {}
}

/**
 * A persistent iterating system for testing query/mask observer survival across scenes.
 */
class PersistentIteratingSystem extends IteratingSystem {
  public processedEntities: number[] = [];

  constructor(world: World) {
    super(world, Aspect.all(CMP_HEALTH, CMP_POSITION));
  }

  public override update(dt: number): void {
    this.processedEntities = [];
    super.update(dt);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected processEntity(entity: number, _dt: number): void {
    this.processedEntities.push(entity);
  }
}

/**
 * A scene-specific system that should run only while its scene is active.
 */
class SceneSpecificSystem extends BaseSystem {
  public executionCount = 0;

  public update(): void {
    this.executionCount++;
  }
}

/**
 * Comprehensive test suite for SceneManager functionality and lifecycle integrity.
 */
export function testSceneManager() {
  console.log("Running SceneManager tests...");

  // =========================================================================
  // 20.1 Scene Registration and Lookup
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    const menuScene = new TestScene("MainMenu");
    const gameScene = new TestScene("Gameplay");

    // Register valid scenes
    sceneManager.register(menuScene);
    assert.strictEqual(sceneManager.has("MainMenu"), true, "Should have MainMenu registered");
    assert.strictEqual(sceneManager.has("Gameplay"), false, "Should not have Gameplay registered yet");
    assert.strictEqual(sceneManager.get("MainMenu"), menuScene, "get('MainMenu') should return menuScene");
    assert.strictEqual(sceneManager.get("Gameplay"), undefined, "get('Gameplay') should return undefined");

    // RegisterAll
    sceneManager.registerAll([gameScene]);
    assert.strictEqual(sceneManager.has("Gameplay"), true, "Should have Gameplay registered after registerAll");

    // Overwrite / replace registered scene with same name
    const updatedMenuScene = new TestScene("MainMenu");
    sceneManager.register(updatedMenuScene);
    assert.strictEqual(sceneManager.get("MainMenu"), updatedMenuScene, "Overwritten scene should be updatedMenuScene");

    // Unregister
    assert.strictEqual(sceneManager.unregister("MainMenu"), true, "unregister('MainMenu') should return true");
    assert.strictEqual(sceneManager.has("MainMenu"), false, "Should no longer have MainMenu");
    assert.strictEqual(sceneManager.unregister("NonExistent"), false, "unregister('NonExistent') should return false");

    // Rejection of invalid scenes in register
    assert.throws(
      () => sceneManager.register(null as unknown as Scene),
      /\[SceneManager\] Cannot switch to invalid scene/,
      "register(null) should throw"
    );
    assert.throws(
      () => sceneManager.register(undefined as unknown as Scene),
      /\[SceneManager\] Cannot switch to invalid scene/,
      "register(undefined) should throw"
    );
    assert.throws(
      () => sceneManager.register({ name: "" } as unknown as Scene),
      /\[SceneManager\] Cannot switch to invalid scene/,
      "register with empty name should throw"
    );
    assert.throws(
      () => sceneManager.register({ name: "Bad", onEnter: () => {} } as unknown as Scene),
      /\[SceneManager\] Cannot switch to invalid scene/,
      "register with missing onExit should throw"
    );
    assert.throws(
      () => sceneManager.registerAll(null as unknown as Scene[]),
      /\[SceneManager\] Expected an array of scenes/,
      "registerAll(null) should throw"
    );

    // SwitchTo by registered name
    sceneManager.register(gameScene);
    sceneManager.switchTo("Gameplay");
    assert.strictEqual(sceneManager.getCurrentSceneName(), "Gameplay", "Current scene name should be Gameplay");
    assert.strictEqual(sceneManager.getCurrentScene(), gameScene, "Current scene object should be gameScene");
    assert.strictEqual(gameScene.entered, true, "Gameplay scene should have entered");

    // Unregister active scene name does not implicitly deactivate current scene
    const additionalScene = new TestScene("ExtraScene");
    sceneManager.register(additionalScene);
    assert.strictEqual(sceneManager.unregister("Gameplay"), true, "unregister('Gameplay') should return true");
    assert.strictEqual(sceneManager.has("Gameplay"), false, "Gameplay should no longer be in registry");
    assert.strictEqual(sceneManager.getCurrentSceneName(), "Gameplay", "Active scene name should remain Gameplay after unregister");
    assert.strictEqual(sceneManager.getCurrentScene(), gameScene, "Active scene object should remain gameScene after unregister");

    // Re-register Gameplay
    sceneManager.register(gameScene);
    assert.strictEqual(sceneManager.has("Gameplay"), true);

    // SwitchTo unknown registered name must throw actionable error
    assert.throws(
      () => sceneManager.switchTo("UnknownScene"),
      /\[SceneManager\] Unknown scene: 'UnknownScene'/,
      "switchTo unknown name should throw"
    );
    // Active scene must remain uncorrupted after failed switch
    assert.strictEqual(sceneManager.getCurrentSceneName(), "Gameplay", "Current scene should remain Gameplay after failed switch");

    // Clear registered scenes: clears registry only, does not deactivate active scene
    sceneManager.clear();
    assert.strictEqual(sceneManager.has("Gameplay"), false, "Registered scenes should no longer contain Gameplay after clear()");
    assert.strictEqual(sceneManager.has("ExtraScene"), false, "Registered scenes should no longer contain ExtraScene after clear()");
    assert.strictEqual(sceneManager.getCurrentSceneName(), "Gameplay", "Active scene name should still identify Gameplay after clear()");
    assert.strictEqual(sceneManager.getCurrentScene(), gameScene, "Active scene object should still be gameScene after clear()");

    // Name-based switch fails after clearing registry, without altering active scene reference
    assert.throws(
      () => sceneManager.switchTo("Gameplay"),
      /\[SceneManager\] Unknown scene: 'Gameplay'/,
      "switchTo('Gameplay') should throw because registry was cleared"
    );
    assert.strictEqual(sceneManager.getCurrentSceneName(), "Gameplay", "Active scene name should remain Gameplay after failed switch");
    assert.strictEqual(sceneManager.getCurrentScene(), gameScene, "Active scene object should remain gameScene after failed switch");
  }

  // =========================================================================
  // 20.2 Lifecycle Hook Execution Order
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    const eventLog: string[] = [];

    const sceneA = new TestScene("SceneA");
    sceneA.onEnterCallback = () => eventLog.push("SceneA.onEnter");
    sceneA.onExitCallback = () => eventLog.push("SceneA.onExit");

    const sceneB = new TestScene("SceneB");
    sceneB.onEnterCallback = () => eventLog.push("SceneB.onEnter");
    sceneB.onExitCallback = () => eventLog.push("SceneB.onExit");

    // Initial switch: onExit is NOT called on null initial scene
    sceneManager.switchTo(sceneA);
    assert.deepStrictEqual(eventLog, ["SceneA.onEnter"], "Initial switch should only invoke onEnter");
    assert.strictEqual(sceneManager.getCurrentSceneName(), "SceneA");
    assert.strictEqual(sceneManager.getCurrentScene(), sceneA);
    assert.strictEqual(sceneManager.getScheduler(), scheduler);
    assert.strictEqual(sceneManager.getWorld(), world);

    // Transition A -> B
    sceneManager.switchTo(sceneB);
    assert.deepStrictEqual(
      eventLog,
      ["SceneA.onEnter", "SceneA.onExit", "SceneB.onEnter"],
      "Switch A -> B should execute A.onExit then B.onEnter"
    );
    assert.strictEqual(sceneManager.getCurrentSceneName(), "SceneB");

    // Repeated switch to the same scene instance: B -> B
    sceneManager.switchTo(sceneB);
    assert.deepStrictEqual(
      eventLog,
      ["SceneA.onEnter", "SceneA.onExit", "SceneB.onEnter", "SceneB.onExit", "SceneB.onEnter"],
      "Switch B -> B should execute B.onExit then B.onEnter"
    );

    // Transition back B -> A
    sceneManager.switchTo(sceneA);
    assert.deepStrictEqual(
      eventLog,
      [
        "SceneA.onEnter",
        "SceneA.onExit",
        "SceneB.onEnter",
        "SceneB.onExit",
        "SceneB.onEnter",
        "SceneB.onExit",
        "SceneA.onEnter",
      ],
      "Switch B -> A should execute B.onExit then A.onEnter"
    );
    assert.strictEqual(sceneA.enterCount, 2, "SceneA entered twice");
    assert.strictEqual(sceneA.exitCount, 1, "SceneA exited once");
    assert.strictEqual(sceneB.enterCount, 2, "SceneB entered twice");
    assert.strictEqual(sceneB.exitCount, 2, "SceneB exited twice");
  }

  // =========================================================================
  // 20.3 Failure Handling and Atomicity
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    world.registerComponent(CMP_HEALTH);
    const sceneActive = new TestScene("ActiveScene");
    sceneManager.switchTo(sceneActive);

    // Create an entity in the active scene
    const activeEntity = world.createEntity();
    world.addComponent(activeEntity, CMP_HEALTH, { hp: 100 });
    world.tags.register("player", activeEntity);

    // 1. Invalid nextScene input throws early without modifying active scene or clearing world
    assert.throws(
      () => sceneManager.switchTo(null as unknown as Scene),
      /\[SceneManager\] Cannot switch to invalid scene/
    );
    assert.strictEqual(sceneManager.getCurrentSceneName(), "ActiveScene", "Active scene preserved after invalid switch");
    assert.strictEqual(world.isValid(activeEntity), true, "Entity remains valid after rejected invalid switch");
    assert.strictEqual(world.tags.get("player"), activeEntity, "Tag remains intact");

    // 2. Exception in currentScene.onExit: throws, world is NOT cleared, currentScene remains old scene
    const faultyExitScene = new TestScene("FaultyExitScene");
    faultyExitScene.onExitCallback = () => {
      throw new Error("Disk save failed during scene exit!");
    };
    sceneManager.switchTo(faultyExitScene);
    const scene2Entity = world.createEntity();

    const nextNormalScene = new TestScene("NextNormalScene");
    assert.throws(
      () => sceneManager.switchTo(nextNormalScene),
      /Disk save failed during scene exit!/,
      "onExit error should propagate"
    );
    assert.strictEqual(sceneManager.getCurrentSceneName(), "FaultyExitScene", "Scene remains FaultyExitScene when onExit fails");
    assert.strictEqual(world.isValid(scene2Entity), true, "World was NOT cleared because onExit threw before teardown completed");

    // Fix faulty onExit and switch cleanly
    faultyExitScene.onExitCallback = undefined;
    sceneManager.switchTo(nextNormalScene);
    assert.strictEqual(sceneManager.getCurrentSceneName(), "NextNormalScene");
    assert.strictEqual(world.isValid(scene2Entity), false, "World was cleared upon clean switch");

    // 3. Exception in nextScene.onEnter: onExit and world.clear executed, currentScene is set to nextScene, error propagates
    const faultyEnterScene = new TestScene("FaultyEnterScene");
    faultyEnterScene.onEnterCallback = () => {
      throw new Error("Missing asset pack in onEnter!");
    };
    assert.throws(
      () => sceneManager.switchTo(faultyEnterScene),
      /Missing asset pack in onEnter!/,
      "onEnter error should propagate"
    );
    assert.strictEqual(sceneManager.getCurrentSceneName(), "FaultyEnterScene", "Current scene is set to the entering scene");
    assert.strictEqual(world.getEntityCount(), 0, "World was cleared prior to onEnter failure");

    // Recovery: subsequent switch to a working fallback scene restores normal functionality
    const fallbackScene = new TestScene("FallbackMainMenu");
    sceneManager.switchTo(fallbackScene);
    assert.strictEqual(sceneManager.getCurrentSceneName(), "FallbackMainMenu", "Fallback scene entered cleanly");
  }

  // =========================================================================
  // 20.4 World and Entity Lifecycle Across Scenes
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    world.setScheduler(scheduler);
    const sceneManager = world.scenes!;

    world.registerComponent(CMP_HEALTH);
    world.registerComponent(CMP_POSITION);
    world.registerComponent(REL_FOLLOWS);
    world.relationships.registerRelation(REL_FOLLOWS);

    // Register a prefab during bootstrap
    world.prefabs.register("Monster", {
      name: "Monster",
      components: [
        { id: CMP_HEALTH, value: { hp: 50 } },
        { id: CMP_POSITION, value: { x: 5, y: 5 } },
      ],
      groups: ["enemies"],
    });

    const dungeonFloor1 = new TestScene("Dungeon_Floor_1");
    let e1 = -1;
    let e2 = -1;

    dungeonFloor1.onEnterCallback = (w) => {
      e1 = w.createEntity();
      w.addComponent(e1, CMP_HEALTH, { hp: 100 });
      w.tags.register("hero", e1);
      w.groups.add("allies", e1);

      e2 = w.prefabs.spawn("Monster");
      w.relationships.add(e2, REL_FOLLOWS, e1);
    };

    sceneManager.switchTo(dungeonFloor1);
    assert.strictEqual(world.isValid(e1), true);
    assert.strictEqual(world.isValid(e2), true);
    assert.strictEqual(world.relationships.countRelated(REL_FOLLOWS, e1), 1);
    assert.strictEqual(Array.from(world.relationships.getRelated(REL_FOLLOWS, e1)).length, 1);

    // Save a snapshot of Floor 1 state
    const floor1Snapshot = world.saveSnapshot();

    // Switch to Floor 2
    const dungeonFloor2 = new TestScene("Dungeon_Floor_2");
    let floor2Hero = -1;
    dungeonFloor2.onEnterCallback = (w) => {
      // Spawn new hero and new monsters for Floor 2
      floor2Hero = w.createEntity();
      w.addComponent(floor2Hero, CMP_HEALTH, { hp: 120 });
      w.tags.register("hero", floor2Hero);
    };

    sceneManager.switchTo(dungeonFloor2);

    // Invariants:
    // 1. Floor 1 entity IDs are permanently invalid
    assert.strictEqual(world.isValid(e1), false, "Floor 1 hero must be invalid in Floor 2");
    assert.strictEqual(world.isValid(e2), false, "Floor 1 monster must be invalid in Floor 2");

    // 2. Floor 2 hero is valid and has a distinct ID (generation advancement)
    assert.strictEqual(world.isValid(floor2Hero), true, "Floor 2 hero must be valid");
    assert.notStrictEqual(floor2Hero, e1, "Floor 2 hero ID must not collide with Floor 1 hero ID");
    assert.notStrictEqual(floor2Hero, e2, "Floor 2 hero ID must not collide with Floor 1 monster ID");

    // 3. Stale Floor 1 IDs cannot retrieve data or mutate Floor 2
    assert.strictEqual(world.getComponent(e1, CMP_HEALTH), undefined);
    assert.strictEqual(world.hasComponent(e1, CMP_HEALTH), false);

    // 4. Prefabs remain available across scene switch and spawn independent entities
    const floor2Monster = world.prefabs.spawn("Monster");
    assert.strictEqual(world.isValid(floor2Monster), true);
    assert.deepStrictEqual(world.getComponent(floor2Monster, CMP_HEALTH), { hp: 50 });

    // 5. Global singleton entity exists and is operational
    const singletonId = world.getSingletonEntity();
    assert.strictEqual(world.isValid(singletonId), true);
    world.setSingleton(CMP_HEALTH, { globalScore: 999 });
    assert.deepStrictEqual(world.getSingleton(CMP_HEALTH), { globalScore: 999 });

    // 6. Restoring Floor 1 snapshot reconstructs Floor 1 state accurately
    world.loadSnapshot(floor1Snapshot);
    assert.strictEqual(world.isValid(e1), true, "Restored Floor 1 hero is valid");
    assert.strictEqual(world.isValid(e2), true, "Restored Floor 1 monster is valid");
    assert.deepStrictEqual(world.getComponent(e1, CMP_HEALTH), { hp: 100 });
    assert.strictEqual(Array.from(world.relationships.getRelated(REL_FOLLOWS, e1))[0], e2);
  }

  // =========================================================================
  // 20.5 Systems and Scheduler Integration Across Scenes
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    world.setScheduler(scheduler);
    const sceneManager = world.scenes!;

    world.registerComponent(CMP_HEALTH);
    world.registerComponent(CMP_POSITION);

    // Register persistent systems
    const eventSystem = new PersistentEventSystem(world);
    const iteratingSystem = new PersistentIteratingSystem(world);
    scheduler.add(eventSystem);
    scheduler.add(iteratingSystem);

    const sceneSpecificSystem = new SceneSpecificSystem(world);

    const combatScene = new TestScene("CombatScene");
    combatScene.onEnterCallback = (w) => {
      // Add scene-specific system
      w.scheduler?.add(sceneSpecificSystem);

      // Create matching entity
      const e = w.createEntity();
      w.addComponent(e, CMP_HEALTH, { hp: 100 });
      w.addComponent(e, CMP_POSITION, { x: 1, y: 1 });
    };
    combatScene.onExitCallback = (w) => {
      // Remove scene-specific system on exit
      w.scheduler?.remove(sceneSpecificSystem);
    };

    // Enter CombatScene
    sceneManager.switchTo(combatScene);
    scheduler.update(1.0);

    assert.strictEqual(sceneSpecificSystem.executionCount, 1, "SceneSpecificSystem ran once in CombatScene");
    assert.strictEqual(iteratingSystem.processedEntities.length, 1, "IteratingSystem processed 1 entity in CombatScene");

    // Dispatch event in CombatScene
    world.events.publish({ type: "TEST_SCENE_EVENT", payload: "CombatStarted" });
    assert.strictEqual(eventSystem.eventCount, 1);
    assert.strictEqual(eventSystem.lastEventPayload, "CombatStarted");

    // Switch to PeaceScene
    const peaceScene = new TestScene("PeaceScene");
    peaceScene.onEnterCallback = (w) => {
      // Create 2 matching entities in PeaceScene
      const p1 = w.createEntity();
      w.addComponent(p1, CMP_HEALTH, { hp: 200 });
      w.addComponent(p1, CMP_POSITION, { x: 10, y: 10 });

      const p2 = w.createEntity();
      w.addComponent(p2, CMP_HEALTH, { hp: 300 });
      w.addComponent(p2, CMP_POSITION, { x: 20, y: 20 });
    };

    sceneManager.switchTo(peaceScene);
    scheduler.update(1.0);

    // Scene-specific system was removed on exit, so its executionCount should NOT increase
    assert.strictEqual(sceneSpecificSystem.executionCount, 1, "SceneSpecificSystem must not run after scene exit");

    // Persistent iterating system was rebound during world.clear() and processes the 2 new entities
    assert.strictEqual(iteratingSystem.processedEntities.length, 2, "IteratingSystem processed 2 entities in PeaceScene");

    // Persistent event listener receives events in PeaceScene without duplicate invocations
    world.events.publish({ type: "TEST_SCENE_EVENT", payload: "PeaceRestored" });
    assert.strictEqual(eventSystem.eventCount, 2, "PersistentEventSystem received event exactly once per emit");
    assert.strictEqual(eventSystem.lastEventPayload, "PeaceRestored");
  }

  // =========================================================================
  // 20.6 Reentrancy and Repeated Transitions
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    const log: string[] = [];

    const sceneAlpha = new TestScene("Alpha");
    sceneAlpha.onEnterCallback = () => log.push("Alpha.enter");
    sceneAlpha.onExitCallback = () => log.push("Alpha.exit");

    const sceneBeta = new TestScene("Beta");
    sceneBeta.onEnterCallback = () => log.push("Beta.enter");
    sceneBeta.onExitCallback = () => log.push("Beta.exit");

    const sceneGamma = new TestScene("Gamma");
    sceneGamma.onEnterCallback = () => log.push("Gamma.enter");
    sceneGamma.onExitCallback = () => log.push("Gamma.exit");

    // Sequence: Alpha -> Beta -> Alpha -> Gamma -> Alpha
    sceneManager.switchTo(sceneAlpha);
    sceneManager.switchTo(sceneBeta);
    sceneManager.switchTo(sceneAlpha);
    sceneManager.switchTo(sceneGamma);
    sceneManager.switchTo(sceneAlpha);

    assert.deepStrictEqual(log, [
      "Alpha.enter",
      "Alpha.exit",
      "Beta.enter",
      "Beta.exit",
      "Alpha.enter",
      "Alpha.exit",
      "Gamma.enter",
      "Gamma.exit",
      "Alpha.enter",
    ]);
    assert.strictEqual(sceneManager.getCurrentSceneName(), "Alpha");

    // Repeated switches to the same scene: Alpha -> Alpha -> Alpha
    log.length = 0;
    sceneManager.switchTo(sceneAlpha);
    sceneManager.switchTo(sceneAlpha);
    assert.deepStrictEqual(log, ["Alpha.exit", "Alpha.enter", "Alpha.exit", "Alpha.enter"]);

    // Reentrant redirect transition (LoadingScene -> Redirects to TargetScene inside onEnter)
    log.length = 0;
    const finalScene = new TestScene("FinalTarget");
    finalScene.onEnterCallback = () => log.push("FinalTarget.enter");
    finalScene.onExitCallback = () => log.push("FinalTarget.exit");

    const redirectScene = new TestScene("Redirector");
    redirectScene.onEnterCallback = () => {
      log.push("Redirector.enter");
      // Conditionally redirect to finalScene
      sceneManager.switchTo(finalScene);
    };
    redirectScene.onExitCallback = () => log.push("Redirector.exit");

    sceneManager.switchTo(redirectScene);
    assert.deepStrictEqual(log, [
      "Alpha.exit",
      "Redirector.enter",
      "Redirector.exit",
      "FinalTarget.enter",
    ]);
    assert.strictEqual(sceneManager.getCurrentSceneName(), "FinalTarget", "Current scene should be FinalTarget after redirect");
  }

  // =========================================================================
  // 20.7 Reset and Cleanup Stress Testing
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    world.setScheduler(scheduler);
    const sceneManager = world.scenes!;

    world.registerComponent(CMP_HEALTH);
    world.registerComponent(CMP_POSITION);

    const retainedEntities: number[] = [];

    // Run 10 rapid scene transitions in a loop
    for (let i = 0; i < 10; i++) {
      const scene = new TestScene(`DynamicLevel_${i}`);
      scene.onEnterCallback = (w) => {
        const ent = w.createEntity();
        w.addComponent(ent, CMP_HEALTH, { level: i });
        w.addComponent(ent, CMP_POSITION, { x: i, y: i });
        retainedEntities.push(ent);
      };
      sceneManager.switchTo(scene);

      assert.strictEqual(sceneManager.getCurrentSceneName(), `DynamicLevel_${i}`);
      assert.strictEqual(world.getEntityCount(), 1, "Each scene should have exactly 1 entity");
    }

    // Verify all 9 previous entity IDs are permanently invalid and distinct
    for (let i = 0; i < 9; i++) {
      assert.strictEqual(world.isValid(retainedEntities[i]), false, `Entity from level ${i} must be invalid`);
    }
    // Only the last entity (level 9) should be valid
    assert.strictEqual(world.isValid(retainedEntities[9]), true, "Entity from level 9 must be valid");

    // All 10 entity IDs must be completely unique
    const uniqueIds = new Set(retainedEntities);
    assert.strictEqual(uniqueIds.size, 10, "All 10 generated entity IDs must be distinct");

    // Verify manual world.clear() cleans world while preserving current scene reference
    world.clear();
    assert.strictEqual(world.getEntityCount(), 0, "World cleared");
    assert.strictEqual(sceneManager.getCurrentSceneName(), "DynamicLevel_9", "Current scene reference persists");
  }

  // =========================================================================
  // 20.8 Query and Runtime Consistency
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    world.setScheduler(scheduler);
    const sceneManager = world.scenes!;

    world.registerComponent(CMP_HEALTH);
    world.registerComponent(CMP_POSITION);
    world.registerComponent(CMP_RENDER);

    const combatAspect = Aspect.all(CMP_HEALTH, CMP_POSITION);

    const scene1 = new TestScene("Town");
    scene1.onEnterCallback = (w) => {
      const npc1 = w.createEntity();
      w.addComponent(npc1, CMP_HEALTH, { hp: 100 });
      w.tags.register("innkeeper", npc1);
      w.groups.add("townsfolk", npc1);

      const npc2 = w.createEntity();
      w.addComponent(npc2, CMP_HEALTH, { hp: 50 });
      w.addComponent(npc2, CMP_POSITION, { x: 2, y: 3 });
      w.groups.add("townsfolk", npc2);
    };

    sceneManager.switchTo(scene1);

    // Town query checks
    assert.strictEqual(world.count(combatAspect), 1);
    assert.strictEqual(world.getEntitiesByGroup("townsfolk").length, 2);
    assert.strictEqual(world.isValid(world.tags.get("innkeeper")!), true);

    // Switch to Wilderness
    const scene2 = new TestScene("Wilderness");
    let wildBeast = -1;
    scene2.onEnterCallback = (w) => {
      wildBeast = w.createEntity();
      w.addComponent(wildBeast, CMP_HEALTH, { hp: 500 });
      w.addComponent(wildBeast, CMP_POSITION, { x: 50, y: 50 });
      w.addComponent(wildBeast, CMP_RENDER, { sprite: "dragon" });
      w.tags.register("boss", wildBeast);
      w.groups.add("monsters", wildBeast);
    };

    sceneManager.switchTo(scene2);

    // Wilderness query checks:
    // 1. Aspect query returns strictly Wilderness entities
    const matchingEntities = world.getEntities(combatAspect);
    assert.deepStrictEqual(matchingEntities, [wildBeast]);
    assert.strictEqual(world.count(combatAspect), 1);
    assert.strictEqual(world.findFirst(combatAspect), wildBeast);

    // 2. Old Town tags and groups are completely gone
    assert.strictEqual(world.tags.get("innkeeper"), undefined);
    assert.strictEqual(world.getEntitiesByGroup("townsfolk").length, 0);

    // 3. New Wilderness tags and groups are accurate
    assert.strictEqual(world.tags.get("boss"), wildBeast);
    assert.deepStrictEqual(world.getEntitiesByGroup("monsters"), [wildBeast]);
    assert.strictEqual(world.countGroup("monsters"), 1);
    assert.strictEqual(world.findFirstInGroup("monsters"), wildBeast);
  }

  console.log("SceneManager tests completed!");
}

if (require.main === module) {
  testSceneManager();
}
