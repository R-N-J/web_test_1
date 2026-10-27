import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { IteratingSystem, BaseSystem, IntervalSystem, SortedIteratingSystem, PassiveSystem } from "../ECS/System";
import { All, Inject, After, Before, Priority, Subscribe, Interval, Singleton } from "../ECS/Decorators";
import { Aspect } from "../ECS/Aspect";
import { EntityId } from "../ECS/Archetype";
import { InternalComponents, EngineStats } from "../ECS/InternalComponents";
import { Director } from "../ECS/Director";
import { Scene } from "../ECS/Scene";
import { Engine } from "../ECS/Engine";

// Component IDs
const POSITION = 100;
const VELOCITY = 101;

/**
 * A sample system using decorators.
 */
@All(POSITION, VELOCITY)
@Priority(10)
class MovementSystem extends IteratingSystem {
  public updateCalled = false;

  public override update(dt: number): void {
    this.updateCalled = true;
    super.update(dt);
  }

  protected override processEntity(entity: number, dt: number): void {
    const pos = this.getComponent<{ x: number; y: number }>(entity, POSITION);
    const vel = this.getComponent<{ x: number; y: number }>(entity, VELOCITY);
    if (pos && vel) {
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
    }
  }
}

/**
 * Another system that should run after MovementSystem.
 */
@After("MovementSystem")
class LoggerSystem extends BaseSystem {
  private _posMapper: unknown;
  @Inject(POSITION)
  public set positionMapper(val: unknown) { this._posMapper = val; }
  public get positionMapper(): unknown { return this._posMapper; }

  public logCount = 0;

  public override update(): void {
    this.logCount++;
  }
}

/**
 * Test the System and Decorator functionality.
 */
export function testSystems() {
  console.log("Running Systems & Decorators tests...");

  const world = new World();
  const scheduler = new Scheduler(world);

  world.registerComponent(POSITION);
  world.registerComponent(VELOCITY);

  // 1. Test: Aspect Injection via @All
  const moveSystem = new MovementSystem(world);
  // @ts-expect-error - accessing protected property for test
  const aspect = moveSystem.aspect;
  assert.ok(aspect instanceof Aspect, "System should have an Aspect");
  assert.strictEqual(aspect.allMask, (1n << BigInt(POSITION)) | (1n << BigInt(VELOCITY)), "Aspect should have correct masks from @All");

  // 2. Test: Dependency Injection via @Inject
  const loggerSystem = new LoggerSystem(world);
  scheduler.add(moveSystem);
  scheduler.add(loggerSystem);

  assert.notStrictEqual(loggerSystem.positionMapper, undefined, "LoggerSystem should have positionMapper injected");
  assert.strictEqual(loggerSystem.positionMapper, world.getMapper(POSITION), "Injected mapper should be the correct one");

  // 3. Test: Topological Sorting via @After
  // @ts-expect-error - accessing private property for test
  const systems = scheduler.systems;
  assert.ok(systems[0] instanceof MovementSystem, "MovementSystem should be first (priority 10)");
  assert.ok(systems[1] instanceof LoggerSystem, "LoggerSystem should be second (runs after MovementSystem)");

  // 4. Test: Execution
  world.buildEntity()
    .with(POSITION, { x: 0, y: 0 })
    .with(VELOCITY, { x: 1, y: 1 })
    .commit();

  scheduler.update(1.0);

  assert.strictEqual(moveSystem.updateCalled, true, "MovementSystem.update should have been called");
  assert.strictEqual(loggerSystem.logCount, 1, "LoggerSystem.update should have been called once");

  const entity = world.getEntities(Aspect.all(POSITION))[0];
  const pos = world.getComponent<{ x: number }>(entity, POSITION);
  assert.strictEqual(pos?.x, 1, "Entity position should be updated by MovementSystem");

  // 5. Test: Scheduler Exception Safety (SYS-008, SYS-009, STR-008)
  const excWorld = new World();
  const excScheduler = new Scheduler(excWorld);
  excWorld.registerComponent(POSITION);
  excWorld.registerComponent(VELOCITY);

  let sys1Ran = false;
  let sys3Ran = false;

  class PrecedingSystem extends BaseSystem {
    public override update(): void {
      sys1Ran = true;
      const testEnt = this.world.createEntity();
      // Queue a deferred component addition
      this.world.addComponent(testEnt, POSITION, { x: 42, y: 42 });
    }
  }

  class FailingSystem extends BaseSystem {
    public override update(): void {
      throw new Error("Deliberate system failure");
    }
  }

  class SubsequentSystem extends BaseSystem {
    public override update(): void {
      sys3Ran = true;
    }
  }

  const sys1 = new PrecedingSystem(excWorld);
  const sys2 = new FailingSystem(excWorld);
  const sys3 = new SubsequentSystem(excWorld);

  excScheduler.add(sys1);
  excScheduler.add(sys2);
  excScheduler.add(sys3);

  // 5.1 & 5.2: If a system throws, exception propagates, deferred mode is restored, and subsequent systems do not run
  assert.throws(
    () => {
      excScheduler.update(1.0);
    },
    {
      name: "Error",
      message: "Deliberate system failure"
    },
    "Scheduler.update() must propagate system exceptions to caller"
  );

  assert.strictEqual(sys1Ran, true, "PrecedingSystem should have executed before failure");
  assert.strictEqual(sys3Ran, false, "SubsequentSystem must NOT execute after preceding system throws (SYS-009)");
  assert.strictEqual(excWorld.isDeferred, false, "World.isDeferred must be restored to false after system failure (SYS-008, STR-008)");

  // Verify that valid operations queued by PrecedingSystem were flushed when exiting deferred mode
  const posEntities = excWorld.getEntities(Aspect.all(POSITION));
  assert.strictEqual(posEntities.length, 1, "Queued operations from preceding system must be applied during exit flush");
  assert.deepStrictEqual(excWorld.getComponent(posEntities[0], POSITION), { x: 42, y: 42 });

  // 5.3: Scheduler can execute subsequent updates cleanly after disabling/resolving failing system
  excScheduler.setEnabled(FailingSystem, false);
  sys1Ran = false;
  sys3Ran = false;

  excScheduler.update(1.0);
  assert.strictEqual(sys1Ran, true, "PrecedingSystem should execute on subsequent update");
  assert.strictEqual(sys3Ran, true, "SubsequentSystem should execute on subsequent update when failing system is disabled");
  assert.strictEqual(excWorld.isDeferred, false, "World.isDeferred remains false after clean update");

  // 5.4: Deferred operation exception during flush restores deferred state safely (STR-008, STR-009)
  const flushWorld = new World();
  const FLUSH_COMP = 200;
  flushWorld.registerComponent(FLUSH_COMP);

  let flushObserverCallCount = 0;
  flushWorld.subscribeOnAdd(FLUSH_COMP, () => {
    flushObserverCallCount++;
    if (flushObserverCallCount === 2) {
      throw new Error("Observer failure during flush");
    }
  });

  const fe1 = flushWorld.createEntity();
  const fe2 = flushWorld.createEntity();

  flushWorld.setDeferred(true);
  flushWorld.addComponent(fe1, FLUSH_COMP, { v: 1 });
  flushWorld.addComponent(fe2, FLUSH_COMP, { v: 2 });

  // Flushing should throw on fe2 observer
  assert.throws(
    () => {
      flushWorld.setDeferred(false); // triggers flush()
    },
    {
      name: "Error",
      message: "Observer failure during flush"
    },
    "Flush exception must propagate to caller"
  );

  assert.strictEqual(flushWorld.isDeferred, false, "World.isDeferred must be restored to false even if flush throws");
  assert.strictEqual(flushWorld.hasComponent(fe1, FLUSH_COMP), true, "Operation applied before flush error must be retained");

  // Repeated flush after error is safe and idempotent (STR-009)
  assert.doesNotThrow(() => {
    flushWorld.flush();
  }, "Repeated flush() calls after error must be safe");

  // 5.5: System error must not be masked by cleanup/flush error, and engine stats must be recorded
  const dualWorld = new World();
  const dualScheduler = new Scheduler(dualWorld);
  const DUAL_COMP = 201;
  dualWorld.registerComponent(DUAL_COMP);

  dualWorld.subscribeOnAdd(DUAL_COMP, () => {
    throw new Error("Cleanup flush error");
  });

  class FailingSystemWithQueuedOp extends BaseSystem {
    public override update(): void {
      const ent = this.world.createEntity();
      this.world.addComponent(ent, DUAL_COMP, { v: 1 });
      throw new Error("Primary system error");
    }
  }

  dualScheduler.add(new FailingSystemWithQueuedOp(dualWorld));

  assert.throws(
    () => {
      dualScheduler.update(1.0);
    },
    {
      name: "Error",
      message: "Primary system error"
    },
    "Primary system error must not be masked by cleanup flush error"
  );

  assert.strictEqual(dualWorld.isDeferred, false, "World.isDeferred must be false after dual error");
  const dualStats = dualWorld.getSingleton<EngineStats>(InternalComponents.ENGINE_STATS);
  assert.ok(dualStats !== undefined && dualStats.systems.length > 0, "Engine stats must be recorded even if system and flush throw");

  // 5.6: Partial flush failure preserves unprocessed operations without losing them on subsequent flush
  const partWorld = new World();
  const PART_COMP = 202;
  partWorld.registerComponent(PART_COMP);

  let partObserverFail = true;
  let pe1ObsCount = 0;
  let pe2ObsCount = 0;
  let pe3ObsCount = 0;

  const pe1 = partWorld.createEntity();
  const pe2 = partWorld.createEntity();
  const pe3 = partWorld.createEntity();

  partWorld.subscribeOnAdd(PART_COMP, (ent) => {
    if (ent === pe1) pe1ObsCount++;
    if (ent === pe2) {
      pe2ObsCount++;
      if (partObserverFail) {
        throw new Error("Observer error on entity 2");
      }
    }
    if (ent === pe3) pe3ObsCount++;
  });

  partWorld.setDeferred(true);
  partWorld.addComponent(pe1, PART_COMP, { id: 1 });
  partWorld.addComponent(pe2, PART_COMP, { id: 2 });
  partWorld.addComponent(pe3, PART_COMP, { id: 3 });

  // Flush throws on pe2
  assert.throws(
    () => {
      partWorld.setDeferred(false);
    },
    {
      name: "Error",
      message: "Observer error on entity 2"
    },
    "Partial flush failure should throw on failing operation"
  );

  assert.strictEqual(partWorld.hasComponent(pe1, PART_COMP), true, "Operation 1 before failure should be applied");
  assert.strictEqual(partWorld.hasComponent(pe2, PART_COMP), true, "Operation 2 was applied before observer threw");
  assert.strictEqual(partWorld.hasComponent(pe3, PART_COMP), false, "Operation 3 not yet processed before failure");
  assert.strictEqual(pe1ObsCount, 1, "pe1 observer called once during initial flush");
  assert.strictEqual(pe2ObsCount, 1, "pe2 observer called once and threw");
  assert.strictEqual(pe3ObsCount, 0, "pe3 observer not called during initial aborted flush");

  // Disable observer failure and flush again
  partObserverFail = false;
  partWorld.flush();

  assert.strictEqual(partWorld.hasComponent(pe1, PART_COMP), true, "Operation 1 remains applied after subsequent flush");
  assert.strictEqual(partWorld.hasComponent(pe2, PART_COMP), true, "Operation 2 remains applied after subsequent flush");
  assert.strictEqual(partWorld.hasComponent(pe3, PART_COMP), true, "Operation 3 must be processed on subsequent flush, not lost");
  assert.strictEqual(pe1ObsCount, 1, "pe1 observer must not be re-executed on subsequent flush");
  assert.strictEqual(pe2ObsCount, 1, "pe2 was shifted from queue so observer is not replayed");
  assert.strictEqual(pe3ObsCount, 1, "pe3 observer called once on subsequent flush");

  // 5.7: Active EntityEditor.commit() failure during flush preserves remaining uncommitted editors
  const edWorld = new World();
  const ED_COMP1 = 203;
  const ED_COMP2 = 204;
  edWorld.registerComponent(ED_COMP1);
  edWorld.registerComponent(ED_COMP2);

  let edObserverFail = true;
  let ed1ObsCount = 0;
  let ed2ObsCount = 0;

  edWorld.subscribeOnAdd(ED_COMP1, () => {
    ed1ObsCount++;
    if (edObserverFail) {
      throw new Error("Editor 1 observer error");
    }
  });

  edWorld.subscribeOnAdd(ED_COMP2, () => {
    ed2ObsCount++;
  });

  const ede1 = edWorld.createEntity();
  const ede2 = edWorld.createEntity();

  const ed1 = edWorld.edit(ede1).add(ED_COMP1, { a: 1 });
  const ed2 = edWorld.edit(ede2).add(ED_COMP2, { b: 2 });

  assert.throws(
    () => {
      edWorld.flush();
    },
    {
      name: "Error",
      message: "Editor 1 observer error"
    },
    "Flush must throw when an active editor commit throws"
  );

  assert.strictEqual(ed1.isCommitted, false, "Editor 1 must not be marked committed if commit threw");
  assert.strictEqual(ed2.isCommitted, false, "Editor 2 must remain uncommitted after flush aborted");
  assert.strictEqual(ed1ObsCount, 1, "Editor 1 observer called once and threw");
  assert.strictEqual(ed2ObsCount, 0, "Editor 2 observer not called on aborted flush");
  assert.strictEqual(edWorld.hasComponent(ede1, ED_COMP1), true, "Entity 1 already has component in storage (non-transactional)");

  // Resolve observer error and retry flush
  edObserverFail = false;
  edWorld.flush();

  assert.strictEqual(ed1.isCommitted, true, "Editor 1 must be committed after subsequent flush");
  assert.strictEqual(ed2.isCommitted, true, "Editor 2 must be committed after subsequent flush");
  assert.strictEqual(ed1ObsCount, 1, "Editor 1 observer must not be duplicate-notified on retry (non-structural branch taken)");
  assert.strictEqual(ed2ObsCount, 1, "Editor 2 observer called once on successful retry");
  assert.strictEqual(edWorld.hasComponent(ede1, ED_COMP1), true, "Entity 1 has ED_COMP1");
  assert.strictEqual(edWorld.hasComponent(ede2, ED_COMP2), true, "Entity 2 has ED_COMP2");

  // 5.8: Throwing observer interrupts subsequent observers and mask notifications without rolling back storage
  const obsWorld = new World();
  const OBS_COMP_A = 205;
  const OBS_COMP_B = 206;
  obsWorld.registerComponent(OBS_COMP_A);
  obsWorld.registerComponent(OBS_COMP_B);

  let obsA1Count = 0;
  let obsA2Count = 0;
  let maskObsCount = 0;

  obsWorld.subscribeOnAdd(OBS_COMP_A, () => {
    obsA1Count++;
    throw new Error("Observer A1 deliberate failure");
  });

  obsWorld.subscribeOnAdd(OBS_COMP_A, () => {
    obsA2Count++;
  });

  obsWorld.subscribeOnMaskChange(() => {
    maskObsCount++;
  });

  const obsEntity = obsWorld.createEntity();

  assert.throws(
    () => {
      obsWorld.addComponent(obsEntity, OBS_COMP_A, { val: 42 });
    },
    {
      name: "Error",
      message: "Observer A1 deliberate failure"
    },
    "Observer exception must propagate to caller"
  );

  assert.strictEqual(obsA1Count, 1, "First observer was executed once");
  assert.strictEqual(obsA2Count, 0, "Second observer for same component change was aborted");
  assert.strictEqual(maskObsCount, 0, "Mask observer was aborted due to preceding observer error");
  assert.strictEqual(obsWorld.hasComponent(obsEntity, OBS_COMP_A), true, "Storage mutation was committed before observer threw (non-transactional)");
  assert.deepStrictEqual(obsWorld.getComponent(obsEntity, OBS_COMP_A), { val: 42 }, "Committed component value is intact");

  // Subsequent direct addition on the entity operates normally
  let obsBCount = 0;
  obsWorld.subscribeOnAdd(OBS_COMP_B, () => {
    obsBCount++;
  });

  obsWorld.addComponent(obsEntity, OBS_COMP_B, { val: 99 });
  assert.strictEqual(obsBCount, 1, "Subsequent component addition observer fired");
  assert.strictEqual(maskObsCount, 1, "Mask observer fired on subsequent valid component addition");
  assert.strictEqual(obsWorld.hasComponent(obsEntity, OBS_COMP_B), true, "Entity has second component");

  // ==========================================
  // System Execution and Event Lifecycle Across World.clear() (WLD-002, WLD-004, SYS-007)
  // ==========================================
  const sysWorld = new World();
  const sysScheduler = new Scheduler(sysWorld);

  const SYS_POS = 150;
  const SYS_VEL = 151;
  sysWorld.registerComponent(SYS_POS);
  sysWorld.registerComponent(SYS_VEL);

  @All(SYS_POS, SYS_VEL)
  class TestMovementSystem extends IteratingSystem {
    public processedEntities: number[] = [];

    protected override processEntity(entity: number): void {
      this.processedEntities.push(entity);
      const pos = this.getComponent<{ x: number }>(entity, SYS_POS);
      const vel = this.getComponent<{ vx: number }>(entity, SYS_VEL);
      if (pos && vel) {
        pos.x += vel.vx;
      }
    }
  }

  const moveSys = new TestMovementSystem(sysWorld);
  sysScheduler.add(moveSys);

  // 1. Initial run before clear
  const e1 = sysWorld.createEntity();
  sysWorld.addComponent(e1, SYS_POS, { x: 10 });
  sysWorld.addComponent(e1, SYS_VEL, { vx: 2 });

  sysScheduler.update(1.0);
  assert.deepStrictEqual(moveSys.processedEntities, [e1], "System processed e1 on first update");
  assert.deepStrictEqual(sysWorld.getComponent(e1, SYS_POS), { x: 12 });

  // 2. Clear world
  sysWorld.clear();
  moveSys.processedEntities = [];

  // 3. Create new entities after clear and execute scheduler update
  const e2 = sysWorld.createEntity();
  const e3 = sysWorld.createEntity();
  sysWorld.addComponent(e2, SYS_POS, { x: 100 });
  sysWorld.addComponent(e2, SYS_VEL, { vx: 5 });
  sysWorld.addComponent(e3, SYS_POS, { x: 200 }); // missing SYS_VEL, should not match

  sysScheduler.update(1.0);
  assert.deepStrictEqual(moveSys.processedEntities, [e2], "System should process newly created matching entity e2 after clear and ignore e3");
  assert.deepStrictEqual(sysWorld.getComponent(e2, SYS_POS), { x: 105 });
  assert.deepStrictEqual(sysWorld.getComponent(e3, SYS_POS), { x: 200 });

  // 4. Test EventBus re-registration and system lifecycle across clear (WLD-002, WLD-004, SYS-001)
  class TestEventSubscriber {
    public eventCount = 0;
    public lastPayload = "";

    public handleGameEvent(event: { type: string; payload: string }): void {
      this.eventCount++;
      this.lastPayload = event.payload;
    }
  }

  const subscriber = new TestEventSubscriber();
  // Manually subscribe on event bus
  sysWorld.events.subscribe("GAME_EVENT", (ev: { type: string; payload: string }) => subscriber.handleGameEvent(ev));

  sysWorld.events.publish({ type: "GAME_EVENT", payload: "first" });
  assert.strictEqual(subscriber.eventCount, 1);
  assert.strictEqual(subscriber.lastPayload, "first");

  // Clearing world wipes ephemeral event handlers
  sysWorld.clear();
  sysWorld.events.publish({ type: "GAME_EVENT", payload: "stale" });
  assert.strictEqual(subscriber.eventCount, 1, "Wiped ephemeral event handler must not receive event after clear");

  // Re-registering manual handler operates cleanly without duplicate callbacks
  sysWorld.events.subscribe("GAME_EVENT", (ev: { type: string; payload: string }) => subscriber.handleGameEvent(ev));
  sysWorld.events.publish({ type: "GAME_EVENT", payload: "second" });
  assert.strictEqual(subscriber.eventCount, 2);
  assert.strictEqual(subscriber.lastPayload, "second");

  // ==========================================
  // Comprehensive Active System Subscriptions Across Repeated Resets (WLD-002, WLD-004, OBS-001..OBS-006, SYS-001)
  // ==========================================
  const subWorld = new World();
  const subScheduler = new Scheduler(subWorld);

  const C_SUB_A = 200;
  const C_SUB_B = 201;
  const C_SUB_C = 202;
  subWorld.registerComponent(C_SUB_A);
  subWorld.registerComponent(C_SUB_B);
  subWorld.registerComponent(C_SUB_C);

  // System 1: Decorated Event Listener System
  class EventListeningSystem extends BaseSystem {
    public eventReceivedCount = 0;
    public lastEventPayload = "";

    @Subscribe("CUSTOM_ALERT")
    public onCustomAlert(event: { type: string; payload: string }): void {
      this.eventReceivedCount++;
      this.lastEventPayload = event.payload;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public override update(dt: number): void {}
  }

  // System 2: Component Observer System (subscribes via rebind)
  class ComponentObservingSystem extends BaseSystem {
    public addCount = 0;
    public removeCount = 0;
    public lastAddedEntity: EntityId = -1;
    public lastRemovedEntity: EntityId = -1;

    public override rebind(): void {
      super.rebind();
      this.world.subscribeOnAdd(C_SUB_A, (entity) => {
        this.addCount++;
        this.lastAddedEntity = entity;
      });
      this.world.subscribeOnRemove(C_SUB_A, (entity) => {
        this.removeCount++;
        this.lastRemovedEntity = entity;
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public override update(dt: number): void {}
  }

  // System 3: Iterating System with Mask Change Hooks
  @All(C_SUB_B, C_SUB_C)
  class MaskObservingSystem extends IteratingSystem {
    public addedEntities: EntityId[] = [];
    public removedEntities: EntityId[] = [];

    protected override onEntityAdded(entity: EntityId): void {
      this.addedEntities.push(entity);
    }

    protected override onEntityRemoved(entity: EntityId): void {
      this.removedEntities.push(entity);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected override processEntity(entity: EntityId): void {}
  }

  const eventSys = new EventListeningSystem(subWorld);
  const compObsSys = new ComponentObservingSystem(subWorld);
  const maskObsSys = new MaskObservingSystem(subWorld);

  // Register all 3 systems with the scheduler
  subScheduler.add(eventSys);
  subScheduler.add(compObsSys);
  subScheduler.add(maskObsSys);

  // Trigger initial rebind for compObsSys so its add/remove listeners are registered
  compObsSys.rebind();

  // Ephemeral outside-of-scheduler listeners to prove discarded world state does NOT survive
  let ephemeralEventCount = 0;
  subWorld.events.subscribe("CUSTOM_ALERT", () => { ephemeralEventCount++; });
  let ephemeralCompAddCount = 0;
  subWorld.subscribeOnAdd(C_SUB_A, () => { ephemeralCompAddCount++; });

  // --- Initial Phase (Cycle 0: before any world clear) ---
  subWorld.events.publish({ type: "CUSTOM_ALERT", payload: "init_alert" });
  assert.strictEqual(eventSys.eventReceivedCount, 1, "EventSystem received initial event");
  assert.strictEqual(eventSys.lastEventPayload, "init_alert");
  assert.strictEqual(ephemeralEventCount, 1, "Ephemeral event listener received initial event");

  const ent0 = subWorld.createEntity();
  subWorld.addComponent(ent0, C_SUB_A, { val: "ent0_a" });
  assert.strictEqual(compObsSys.addCount, 1, "ComponentObservingSystem notified on add before clear");
  assert.strictEqual(compObsSys.lastAddedEntity, ent0);
  assert.strictEqual(ephemeralCompAddCount, 1, "Ephemeral component listener notified before clear");

  subWorld.addComponent(ent0, C_SUB_B, { val: "ent0_b" });
  assert.strictEqual(maskObsSys.addedEntities.length, 0, "MaskObservingSystem not added yet (missing C_SUB_C)");
  subWorld.addComponent(ent0, C_SUB_C, { val: "ent0_c" });
  assert.strictEqual(maskObsSys.addedEntities.length, 1, "MaskObservingSystem received onEntityAdded");
  assert.strictEqual(maskObsSys.addedEntities[0], ent0);

  subWorld.removeComponent(ent0, C_SUB_B);
  assert.strictEqual(maskObsSys.removedEntities.length, 1, "MaskObservingSystem received onEntityRemoved");
  assert.strictEqual(maskObsSys.removedEntities[0], ent0);

  subWorld.removeComponent(ent0, C_SUB_A);
  assert.strictEqual(compObsSys.removeCount, 1, "ComponentObservingSystem notified on remove before clear");
  assert.strictEqual(compObsSys.lastRemovedEntity, ent0);

  // --- Run Repeated Reset Cycles (Cycles 1 through 3) ---
  for (let cycle = 1; cycle <= 3; cycle++) {
    // Perform World reset
    subWorld.clear();

    // 1. Verify pre-reset entity is invalid and not referenced
    assert.strictEqual(subWorld.isValid(ent0), false, `Pre-reset entity ent0 must be invalid in cycle ${cycle}`);

    // 2. Publish event: Active EventListeningSystem must receive exactly 1 notification per cycle; ephemeral must NOT receive
    subWorld.events.publish({ type: "CUSTOM_ALERT", payload: `alert_cycle_${cycle}` });
    assert.strictEqual(eventSys.eventReceivedCount, 1 + cycle, `EventListeningSystem received event in cycle ${cycle} exactly once (no duplicates)`);
    assert.strictEqual(eventSys.lastEventPayload, `alert_cycle_${cycle}`);
    assert.strictEqual(ephemeralEventCount, 1, `Ephemeral event handler must NOT receive event after clear in cycle ${cycle}`);

    // 3. Create new entity for this cycle
    const cycleEnt = subWorld.createEntity();
    assert.strictEqual(subWorld.isValid(cycleEnt), true);
    assert.notStrictEqual(cycleEnt, ent0, "New entity ID must not collide with pre-clear entity");

    // 4. Test ComponentObservingSystem add/remove on new entity
    subWorld.addComponent(cycleEnt, C_SUB_A, { cycle, name: "cycleEnt" });
    assert.strictEqual(compObsSys.addCount, 1 + cycle, `ComponentObservingSystem addCount incremented exactly once in cycle ${cycle}`);
    assert.strictEqual(compObsSys.lastAddedEntity, cycleEnt, `ComponentObservingSystem received current valid entity in cycle ${cycle}`);
    assert.strictEqual(ephemeralCompAddCount, 1, `Ephemeral component add listener must NOT receive notification in cycle ${cycle}`);

    // 5. Test MaskObservingSystem onEntityAdded/onEntityRemoved on new entity
    subWorld.addComponent(cycleEnt, C_SUB_B, { cycle });
    assert.strictEqual(maskObsSys.addedEntities.length, cycle, `MaskObservingSystem not triggered before full aspect match in cycle ${cycle}`);

    subWorld.addComponent(cycleEnt, C_SUB_C, { cycle });
    assert.strictEqual(maskObsSys.addedEntities.length, 1 + cycle, `MaskObservingSystem addedEntities incremented exactly once in cycle ${cycle}`);
    assert.strictEqual(maskObsSys.addedEntities[maskObsSys.addedEntities.length - 1], cycleEnt);

    subWorld.removeComponent(cycleEnt, C_SUB_C);
    assert.strictEqual(maskObsSys.removedEntities.length, 1 + cycle, `MaskObservingSystem removedEntities incremented exactly once in cycle ${cycle}`);
    assert.strictEqual(maskObsSys.removedEntities[maskObsSys.removedEntities.length - 1], cycleEnt);

    subWorld.removeComponent(cycleEnt, C_SUB_A);
    assert.strictEqual(compObsSys.removeCount, 1 + cycle, `ComponentObservingSystem removeCount incremented exactly once in cycle ${cycle}`);
    assert.strictEqual(compObsSys.lastRemovedEntity, cycleEnt);
  }

  // --- Test System Removal and Cleanup from Scheduler ---
  const eventCountBeforeRemove = eventSys.eventReceivedCount;
  subScheduler.remove(eventSys);
  subWorld.events.publish({ type: "CUSTOM_ALERT", payload: "after_removal" });
  assert.strictEqual(eventSys.eventReceivedCount, eventCountBeforeRemove, "Removed system must no longer receive event notifications");

  const maskAddCountBeforeRemove = maskObsSys.addedEntities.length;
  subScheduler.remove(maskObsSys);
  const entAfterRemove = subWorld.createEntity();
  subWorld.addComponent(entAfterRemove, C_SUB_B, {});
  subWorld.addComponent(entAfterRemove, C_SUB_C, {});
  assert.strictEqual(maskObsSys.addedEntities.length, maskAddCountBeforeRemove, "Removed iterating system must no longer receive onEntityAdded mask notifications");

  // ==========================================
  // 6. Comprehensive System Ordering & Dependency Resolution (SYS-002..SYS-006)
  // ==========================================
  const ordWorld = new World();
  const ordScheduler = new Scheduler(ordWorld);

  // 6.1: Priority ordering (lower numerical value runs earlier)
  @Priority(-50)
  class PriorityMinus50System extends BaseSystem {
    public override update(): void {}
  }

  @Priority(0)
  class PriorityZeroSystem extends BaseSystem {
    public override update(): void {}
  }

  @Priority(10)
  class Priority10System extends BaseSystem {
    public override update(): void {}
  }

  @Priority(500)
  class Priority500System extends BaseSystem {
    public override update(): void {}
  }

  class DefaultPrioritySystem extends BaseSystem { // Priority 1000
    public override update(): void {}
  }

  const p500 = new Priority500System(ordWorld);
  const pMinus50 = new PriorityMinus50System(ordWorld);
  const pDef = new DefaultPrioritySystem(ordWorld);
  const p10 = new Priority10System(ordWorld);
  const p0 = new PriorityZeroSystem(ordWorld);

  ordScheduler.add(p500);
  ordScheduler.add(pMinus50);
  ordScheduler.add(pDef);
  ordScheduler.add(p10);
  ordScheduler.add(p0);

  const ordList = ordScheduler.getSystems();
  assert.strictEqual(ordList[0], pMinus50, "Priority -50 must run first");
  assert.strictEqual(ordList[1], p0, "Priority 0 must run second");
  assert.strictEqual(ordList[2], p10, "Priority 10 must run third");
  assert.strictEqual(ordList[3], p500, "Priority 500 must run fourth");
  assert.strictEqual(ordList[4], pDef, "Default Priority (1000) must run last");

  // 6.2: Priority validation
  assert.throws(
    () => {
      Priority(Number.NaN);
    },
    { name: "Error", message: /Invalid Priority/ },
    "Priority decorator must reject NaN"
  );
  assert.throws(
    () => {
      Priority(Infinity);
    },
    { name: "Error", message: /Invalid Priority/ },
    "Priority decorator must reject Infinity"
  );

  // 6.3: @Before and @After constraints overriding priority
  const constrWorld = new World();
  const constrScheduler = new Scheduler(constrWorld);

  @Priority(100)
  class ConstraintTargetSystem extends BaseSystem {
    public override update(): void {}
  }

  @Priority(10)
  @After("ConstraintTargetSystem")
  class LowPriorityAfterTargetSystem extends BaseSystem {
    public override update(): void {}
  }

  @Priority(1000)
  @Before("ConstraintTargetSystem")
  class HighPriorityBeforeTargetSystem extends BaseSystem {
    public override update(): void {}
  }

  const cTarget = new ConstraintTargetSystem(constrWorld);
  const cAfter = new LowPriorityAfterTargetSystem(constrWorld);
  const cBefore = new HighPriorityBeforeTargetSystem(constrWorld);

  constrScheduler.add(cAfter);
  constrScheduler.add(cTarget);
  constrScheduler.add(cBefore);

  const constrList = constrScheduler.getSystems();
  assert.strictEqual(constrList[0], cBefore, "@Before constraint must place HighPriorityBeforeTargetSystem before Target");
  assert.strictEqual(constrList[1], cTarget, "Target system must run in middle");
  assert.strictEqual(constrList[2], cAfter, "@After constraint must place LowPriorityAfterTargetSystem after Target");

  // 6.4: Missing/optional dependency references are safely ignored
  const optWorld = new World();
  const optScheduler = new Scheduler(optWorld);

  @Before("NonExistentSystemA")
  @After("NonExistentSystemB")
  class OptionalDependencySystem extends BaseSystem {
    public override update(): void {}
  }

  const optSys = new OptionalDependencySystem(optWorld);
  optScheduler.add(optSys);
  assert.strictEqual(optScheduler.getSystems().length, 1);
  assert.strictEqual(optScheduler.getSystems()[0], optSys, "Optional missing dependencies must be handled safely");

  // 6.5: Circular dependency detection
  // Direct cycle: A after B, B after A
  const cycleWorld1 = new World();
  const cycleScheduler1 = new Scheduler(cycleWorld1);

  @After("DirectCycleB")
  class DirectCycleA extends BaseSystem {
    public override update(): void {}
  }

  @After("DirectCycleA")
  class DirectCycleB extends BaseSystem {
    public override update(): void {}
  }

  cycleScheduler1.add(new DirectCycleA(cycleWorld1));
  assert.throws(
    () => {
      cycleScheduler1.add(new DirectCycleB(cycleWorld1));
    },
    { name: "Error", message: /Circular dependency detected/ },
    "Direct cycle (A after B, B after A) must throw circular dependency error"
  );

  // Indirect cycle: A after B, B after C, C after A
  const cycleWorld2 = new World();
  const cycleScheduler2 = new Scheduler(cycleWorld2);

  @After("IndirectCycleC")
  class IndirectCycleA extends BaseSystem {
    public override update(): void {}
  }

  @After("IndirectCycleA")
  class IndirectCycleB extends BaseSystem {
    public override update(): void {}
  }

  @After("IndirectCycleB")
  class IndirectCycleC extends BaseSystem {
    public override update(): void {}
  }

  cycleScheduler2.add(new IndirectCycleA(cycleWorld2));
  cycleScheduler2.add(new IndirectCycleB(cycleWorld2));
  assert.throws(
    () => {
      cycleScheduler2.add(new IndirectCycleC(cycleWorld2));
    },
    { name: "Error", message: /Circular dependency detected/ },
    "Indirect cycle (A -> B -> C -> A) must throw circular dependency error"
  );

  // Contradictory constraints: A before B and A after B
  const cycleWorld3 = new World();
  const cycleScheduler3 = new Scheduler(cycleWorld3);

  @Before("ContradictoryB")
  @After("ContradictoryB")
  class ContradictoryA extends BaseSystem {
    public override update(): void {}
  }

  class ContradictoryB extends BaseSystem {
    public override update(): void {}
  }

  cycleScheduler3.add(new ContradictoryA(cycleWorld3));
  assert.throws(
    () => {
      cycleScheduler3.add(new ContradictoryB(cycleWorld3));
    },
    { name: "Error", message: /Circular dependency detected/ },
    "Contradictory before and after constraints on same system must throw"
  );

  // Self-dependency: A after A
  const cycleWorld4 = new World();
  const cycleScheduler4 = new Scheduler(cycleWorld4);

  @After("SelfReferentialA")
  class SelfReferentialA extends BaseSystem {
    public override update(): void {}
  }

  assert.throws(
    () => {
      cycleScheduler4.add(new SelfReferentialA(cycleWorld4));
    },
    { name: "Error", message: /Circular dependency detected/ },
    "Self-referential dependency must throw"
  );

  // 6.6: Deterministic tie-breaking (equal priority preserves registration order)
  const tieWorld = new World();
  const tieScheduler = new Scheduler(tieWorld);

  class TieSystem1 extends BaseSystem { public override update(): void {} }
  class TieSystem2 extends BaseSystem { public override update(): void {} }
  class TieSystem3 extends BaseSystem { public override update(): void {} }

  const t1 = new TieSystem1(tieWorld);
  const t2 = new TieSystem2(tieWorld);
  const t3 = new TieSystem3(tieWorld);

  tieScheduler.add(t1);
  tieScheduler.add(t2);
  tieScheduler.add(t3);

  const tieList = tieScheduler.getSystems();
  assert.strictEqual(tieList[0], t1);
  assert.strictEqual(tieList[1], t2);
  assert.strictEqual(tieList[2], t3);

  // 6.7: Failure-safe system registration (cycle or wiring error leaves no side effects)
  const failSafeWorld = new World();
  const failSafeScheduler = new Scheduler(failSafeWorld);

  let validRunCount = 0;
  let failedEventCount = 0;

  class ValidExistingSystem extends BaseSystem {
    public override update(): void {
      validRunCount++;
    }
  }

  @After("CycleSystemB")
  class CycleSystemA extends BaseSystem {
    @Subscribe("TEST_FAILSAFE_EVENT")
    public onTestEvent(): void {
      failedEventCount++;
    }
    public override update(): void {}
  }

  @After("CycleSystemA")
  class CycleSystemB extends BaseSystem {
    @Subscribe("TEST_FAILSAFE_EVENT")
    public onTestEvent(): void {
      failedEventCount++;
    }
    public override update(): void {}
  }

  const validSys = new ValidExistingSystem(failSafeWorld);
  const cycleA = new CycleSystemA(failSafeWorld);
  const cycleB = new CycleSystemB(failSafeWorld);

  failSafeScheduler.add(validSys);
  failSafeScheduler.add(cycleA);

  assert.strictEqual(failSafeScheduler.getSystems().length, 2);

  // Attempting to add cycleB creates a cycle between cycleA and cycleB
  assert.throws(
    () => {
      failSafeScheduler.add(cycleB);
    },
    { name: "Error", message: /Circular dependency detected/ },
    "Registration of cycleB must throw circular dependency error"
  );

  // Assertions for failure safety:
  // 1. cycleB was NOT left in scheduler's registered systems list
  assert.strictEqual(failSafeScheduler.getSystems().includes(cycleB), false, "Failed system must not be in scheduler systems");
  assert.strictEqual(failSafeScheduler.getSystems().length, 2, "Scheduler systems length must remain unchanged");
  assert.strictEqual(failSafeScheduler.getSystems()[0], validSys);
  assert.strictEqual(failSafeScheduler.getSystems()[1], cycleA);

  // 2. cycleB event handler must not be subscribed on event bus
  failSafeWorld.events.publish({ type: "TEST_FAILSAFE_EVENT" });
  assert.strictEqual(failedEventCount, 1, "Only cycleA should receive event; cycleB must not be subscribed");

  // 3. Existing registered systems remain in valid order and scheduler updates successfully
  failSafeScheduler.update(1.0);
  assert.strictEqual(validRunCount, 1, "Existing valid system must execute successfully on subsequent update");

  // 6.8: Verify actual runtime execution order via update() tracking
  const execOrderWorld = new World();
  const execOrderScheduler = new Scheduler(execOrderWorld);
  const executionLog: string[] = [];

  @Before("ExecOrderPriority100System")
  @Priority(2000)
  class ExecOrderBeforeOverridingPrioritySystem extends BaseSystem {
    public override update(): void {
      executionLog.push("BEFORE_OVERRIDE_2000");
    }
  }

  @Priority(100)
  class ExecOrderPriority100System extends BaseSystem {
    public override update(): void {
      executionLog.push("P_100");
    }
  }

  @Priority(300)
  class ExecOrderEqualPrioritySystemA extends BaseSystem {
    public override update(): void {
      executionLog.push("EQUAL_A_300");
    }
  }

  @Priority(300)
  class ExecOrderEqualPrioritySystemB extends BaseSystem {
    public override update(): void {
      executionLog.push("EQUAL_B_300");
    }
  }

  @Priority(500)
  class ExecOrderPriority500System extends BaseSystem {
    public override update(): void {
      executionLog.push("P_500");
    }
  }

  @Priority(1000)
  class ExecOrderPriority1000System extends BaseSystem {
    public override update(): void {
      executionLog.push("P_1000");
    }
  }

  @After("ExecOrderPriority1000System")
  @Priority(50)
  class ExecOrderAfterOverridingPrioritySystem extends BaseSystem {
    public override update(): void {
      executionLog.push("AFTER_OVERRIDE_50");
    }
  }

  // Register in arbitrary order
  execOrderScheduler.add(new ExecOrderPriority500System(execOrderWorld));
  execOrderScheduler.add(new ExecOrderPriority1000System(execOrderWorld));
  execOrderScheduler.add(new ExecOrderEqualPrioritySystemA(execOrderWorld));
  execOrderScheduler.add(new ExecOrderEqualPrioritySystemB(execOrderWorld));
  execOrderScheduler.add(new ExecOrderPriority100System(execOrderWorld));
  execOrderScheduler.add(new ExecOrderBeforeOverridingPrioritySystem(execOrderWorld));
  execOrderScheduler.add(new ExecOrderAfterOverridingPrioritySystem(execOrderWorld));

  execOrderScheduler.update(1.0);

  // Assert exact runtime execution sequence:
  // 1. BEFORE_OVERRIDE_2000 (forced before P_100 despite high priority weight)
  // 2. P_100
  // 3. EQUAL_A_300 (equal priority tie-break: registered before B)
  // 4. EQUAL_B_300 (equal priority tie-break: registered after A)
  // 5. P_500
  // 6. P_1000
  // 7. AFTER_OVERRIDE_50 (forced after P_1000 despite low priority weight)
  assert.deepStrictEqual(
    executionLog,
    [
      "BEFORE_OVERRIDE_2000",
      "P_100",
      "EQUAL_A_300",
      "EQUAL_B_300",
      "P_500",
      "P_1000",
      "AFTER_OVERRIDE_50"
    ],
    "Actual runtime update execution sequence must honor priorities, explicit constraints, and deterministic tie-breaking"
  );

  // ==========================================
  // 7. Initialization, Registration & Lifecycle (SYS-001, SYS-006, SYS-007)
  // ==========================================
  const initWorld = new World();
  const initScheduler = new Scheduler(initWorld);

  const C_INIT_DATA = 300;
  const S_INIT_SINGLETON = 301;
  initWorld.registerComponent(C_INIT_DATA);
  initWorld.registerComponent(S_INIT_SINGLETON);
  initWorld.setSingleton(S_INIT_SINGLETON, { configValue: 42 });

  class FullyInjectedSystem extends BaseSystem {
    private _mapper: unknown;
    private _events: unknown;
    private _tags: unknown;
    private _singleton: unknown;

    @Inject(C_INIT_DATA)
    public set mapper(val: unknown) { this._mapper = val; }
    public get mapper(): unknown { return this._mapper; }

    @Inject()
    public set events(val: unknown) { this._events = val; }
    public get events(): unknown { return this._events; }

    @Inject()
    public set tags(val: unknown) { this._tags = val; }
    public get tags(): unknown { return this._tags; }

    @Singleton(S_INIT_SINGLETON)
    public set singleton(val: unknown) { this._singleton = val; }
    public get singleton(): unknown { return this._singleton; }

    public onEnableCount = 0;
    public updateCount = 0;

    protected override onEnable(): void {
      this.onEnableCount++;
    }

    public override update(): void {
      this.updateCount++;
    }
  }

  const fullyInjected = new FullyInjectedSystem(initWorld);
  initScheduler.add(fullyInjected);

  // Verify dependency injections
  assert.strictEqual(fullyInjected.mapper, initWorld.getMapper(C_INIT_DATA));
  assert.strictEqual(fullyInjected.events, initWorld.events);
  assert.strictEqual(fullyInjected.tags, initWorld.tags);
  assert.deepStrictEqual(fullyInjected.singleton, { configValue: 42 });

  // 7.1: onEnable is called before first execution, not at registration
  assert.strictEqual(fullyInjected.onEnableCount, 0, "onEnable must not be called upon registration");
  initScheduler.update(1.0);
  assert.strictEqual(fullyInjected.onEnableCount, 1, "onEnable must be called exactly once upon first update");
  assert.strictEqual(fullyInjected.updateCount, 1);

  initScheduler.update(1.0);
  assert.strictEqual(fullyInjected.onEnableCount, 1, "onEnable must not be re-called on subsequent update");
  assert.strictEqual(fullyInjected.updateCount, 2);

  // 7.2: Idempotent registration of duplicate system instance
  initScheduler.add(fullyInjected);
  assert.strictEqual(initScheduler.getSystems().length, 1, "Registering identical system must be idempotent");
  initScheduler.update(1.0);
  assert.strictEqual(fullyInjected.updateCount, 3, "Duplicate registration must not cause multiple executions per pass");

  // 7.3: Invalid system rejection
  assert.throws(
    () => {
      // @ts-expect-error - testing invalid system registration
      initScheduler.add(null);
    },
    { name: "Error", message: /Invalid system/ },
    "Scheduler.add must reject null"
  );

  // 7.4: Missing required singleton throws actionable wiring error
  const S_MISSING = 302;
  initWorld.registerComponent(S_MISSING);

  class MissingSingletonSystem extends BaseSystem {
    private _singletonVal: unknown;
    @Singleton(S_MISSING)
    public set singletonVal(val: unknown) { this._singletonVal = val; }
    public get singletonVal(): unknown { return this._singletonVal; }
    public override update(): void {}
  }

  assert.throws(
    () => {
      initScheduler.add(new MissingSingletonSystem(initWorld));
    },
    { name: "Error", message: /Wiring Failed: System 'MissingSingletonSystem' required Singleton ID 302/ },
    "Missing singleton must throw actionable wiring error"
  );

  // 7.5: System removal and clear
  let cleanupCalled = false;
  class CleanupTestSystem extends BaseSystem {
    public override update(): void {}
    public override cleanup(): void {
      cleanupCalled = true;
    }
  }

  const clSys = new CleanupTestSystem(initWorld);
  initScheduler.add(clSys);
  assert.strictEqual(initScheduler.getSystems().includes(clSys), true);

  initScheduler.remove(clSys);
  assert.strictEqual(initScheduler.getSystems().includes(clSys), false);
  assert.strictEqual(cleanupCalled, true, "Scheduler.remove must invoke system.cleanup()");

  initScheduler.clear();
  assert.strictEqual(initScheduler.getSystems().length, 0, "Scheduler.clear must remove all systems");

  // 7.6: Mutation during update pass (Snapshot protection)
  const mutWorld = new World();
  const mutScheduler = new Scheduler(mutWorld);

  let sysLateRan = false;
  class LateSystem extends BaseSystem {
    public lateRuns = 0;
    public override update(): void {
      sysLateRan = true;
      this.lateRuns++;
    }
  }

  const lateSys = new LateSystem(mutWorld);

  let removedSysRan = false;
  class SystemToBeRemoved extends BaseSystem {
    public override update(): void {
      removedSysRan = true;
    }
  }
  const toRemove = new SystemToBeRemoved(mutWorld);

  class DynamicMutatingSystem extends BaseSystem {
    public override update(): void {
      // Dynamically add a system during update pass
      mutScheduler.add(lateSys);
      // Dynamically remove a system during update pass
      mutScheduler.remove(toRemove);
    }
  }

  mutScheduler.add(new DynamicMutatingSystem(mutWorld));
  mutScheduler.add(toRemove);

  // First update pass: DynamicMutatingSystem runs, adds lateSys and removes toRemove
  mutScheduler.update(1.0);
  assert.strictEqual(sysLateRan, false, "Dynamically added system must not run in the current update pass");
  assert.strictEqual(removedSysRan, false, "Dynamically removed system must not run later in the current pass");

  // Second update pass: lateSys now executes exactly once
  mutScheduler.update(1.0);
  assert.strictEqual(sysLateRan, true, "Dynamically added system must run on the next update pass");
  assert.strictEqual(lateSys.lateRuns, 1, "Dynamically added system must execute exactly once in second pass");

  // 7.7: Calling Scheduler.clear() during active update pass
  const clearMutWorld = new World();
  const clearMutScheduler = new Scheduler(clearMutWorld);

  let preClearRan = false;
  let postClearRan = false;
  let clearedCleanupCount = 0;

  class PreClearSystem extends BaseSystem {
    public override update(): void {
      preClearRan = true;
      clearMutScheduler.clear(); // Clear all systems mid-pass
    }
  }

  class PostClearSystem extends BaseSystem {
    public override update(): void {
      postClearRan = true;
    }
    public override cleanup(): void {
      clearedCleanupCount++;
    }
  }

  clearMutScheduler.add(new PreClearSystem(clearMutWorld));
  const postSys = new PostClearSystem(clearMutWorld);
  clearMutScheduler.add(postSys);

  clearMutScheduler.update(1.0);
  assert.strictEqual(preClearRan, true, "PreClearSystem should run");
  assert.strictEqual(postClearRan, false, "PostClearSystem must be skipped when scheduler is cleared mid-pass");
  assert.strictEqual(clearedCleanupCount, 1, "PostClearSystem cleanup should have been invoked during clear()");
  assert.strictEqual(clearMutScheduler.getSystems().length, 0, "Scheduler systems must be empty after mid-pass clear()");

  // 7.8: Registering multiple instances of the same system class
  const multiWorld = new World();
  const multiScheduler = new Scheduler(multiWorld);

  class WorkerSystem extends BaseSystem {
    constructor(world: World, public readonly id: string) {
      super(world);
    }
    public runs = 0;
    public override update(): void {
      this.runs++;
    }
  }

  const worker1 = new WorkerSystem(multiWorld, "worker-1");
  const worker2 = new WorkerSystem(multiWorld, "worker-2");

  multiScheduler.add(worker1);
  multiScheduler.add(worker2);

  assert.strictEqual(multiScheduler.getSystems().length, 2, "Multiple distinct instances of same class must be supported");
  multiScheduler.update(1.0);
  assert.strictEqual(worker1.runs, 1);
  assert.strictEqual(worker2.runs, 1);

  // 7.9: Removing and re-adding the exact same system instance mid-pass
  const readdWorld = new World();
  const readdScheduler = new Scheduler(readdWorld);

  let readdEventsReceived = 0;
  let readdCleanups = 0;
  let readdUpdates = 0;

  class SystemBWithEvents extends BaseSystem {
    public override cleanup(): void {
      readdCleanups++;
    }

    @Subscribe("READD_EVENT")
    public onEvent(): void {
      readdEventsReceived++;
    }

    public override update(): void {
      readdUpdates++;
    }
  }

  const sysB = new SystemBWithEvents(readdWorld);

  class SystemARemovingAndReaddingB extends BaseSystem {
    public runs = 0;
    public override update(): void {
      this.runs++;
      if (this.runs === 1) {
        // Remove system B before B's turn in current pass
        readdScheduler.remove(sysB);
        // Re-add the exact same B instance before B's turn
        readdScheduler.add(sysB);
      }
    }
  }

  const sysA = new SystemARemovingAndReaddingB(readdWorld);

  readdScheduler.add(sysA);
  readdScheduler.add(sysB);

  // First update pass: sysA runs, removes sysB, and re-adds sysB
  readdScheduler.update(1.0);

  // In Pass 1:
  // sysA executed.
  // sysB was removed and re-added mid-pass, so sysB MUST NOT execute in pass 1!
  assert.strictEqual(readdUpdates, 0, "System B must not execute in the active pass when removed and re-added mid-pass");
  assert.strictEqual(readdCleanups, 1, "System B cleanup must be called upon removal");

  // Verify event bus subscription for sysB is active and not duplicated
  readdWorld.events.publish({ type: "READD_EVENT" });
  assert.strictEqual(readdEventsReceived, 1, "System B event handler must be subscribed exactly once after re-adding");

  // Second update pass: sysB executes normally
  readdScheduler.update(1.0);
  assert.strictEqual(readdUpdates, 1, "System B must execute on subsequent update pass after being re-added");

  // Verify event handling after pass 2
  readdWorld.events.publish({ type: "READD_EVENT" });
  assert.strictEqual(readdEventsReceived, 2, "System B event handler must remain subscribed without duplication");

  // ==========================================
  // 8. System State, Toggling, Pause & Resume (SYS-010)
  // ==========================================
  const stateWorld = new World();
  const stateScheduler = new Scheduler(stateWorld);

  class StateTestSystem extends BaseSystem {
    public updateCount = 0;
    public pauses = 0;
    public resumes = 0;

    protected override onPause(): void {
      this.pauses++;
    }

    protected override onResume(): void {
      this.resumes++;
    }

    public override update(): void {
      this.updateCount++;
    }
  }

  const stateSys = new StateTestSystem(stateWorld);
  stateScheduler.add(stateSys);

  stateScheduler.update(1.0);
  assert.strictEqual(stateSys.updateCount, 1);

  // Toggle state
  stateSys.toggle(false);
  assert.strictEqual(stateSys.enabled, false);
  assert.strictEqual(stateSys.pauses, 1);

  stateScheduler.update(1.0);
  assert.strictEqual(stateSys.updateCount, 1, "Disabled system must not update");

  stateSys.toggle(true);
  assert.strictEqual(stateSys.enabled, true);
  assert.strictEqual(stateSys.resumes, 1);

  stateScheduler.update(1.0);
  assert.strictEqual(stateSys.updateCount, 2, "Re-enabled system must update");

  // pauseAll & resumeAll
  stateScheduler.pauseAll();
  assert.strictEqual(stateSys.enabled, false);
  assert.strictEqual(stateSys.pauses, 2);

  stateScheduler.resumeAll();
  assert.strictEqual(stateSys.enabled, true);
  assert.strictEqual(stateSys.resumes, 2);

  // setEnabled by constructor
  stateScheduler.setEnabled(StateTestSystem, false);
  assert.strictEqual(stateSys.enabled, false);
  assert.strictEqual(stateSys.pauses, 3);

  stateScheduler.setEnabled(StateTestSystem, true);
  assert.strictEqual(stateSys.enabled, true);
  assert.strictEqual(stateSys.resumes, 3);

  // ==========================================
  // 9. Interval Systems (SYS-011)
  // ==========================================
  const intWorld = new World();
  const intScheduler = new Scheduler(intWorld);

  const C_INT_COMP = 400;
  intWorld.registerComponent(C_INT_COMP);

  @All(C_INT_COMP)
  @Interval(3)
  class DecoratedIntervalSystem extends IntervalSystem {
    public executions: number[] = [];

    protected override processEntity(_entity: EntityId, dt: number): void {
      this.executions.push(dt);
    }
  }

  const intEntity = intWorld.createEntity();
  intWorld.addComponent(intEntity, C_INT_COMP, { val: 1 });

  const intSys = new DecoratedIntervalSystem(intWorld);
  intScheduler.add(intSys);

  // Update 1 (dt = 1): accumulator = 1 < 3 -> no run
  intScheduler.update(1.0);
  assert.strictEqual(intSys.executions.length, 0);
  assert.strictEqual(intSys.getAccumulator(), 1.0);

  // Update 2 (dt = 1): accumulator = 2 < 3 -> no run
  intScheduler.update(1.0);
  assert.strictEqual(intSys.executions.length, 0);
  assert.strictEqual(intSys.getAccumulator(), 2.0);

  // Update 3 (dt = 1): accumulator = 3 >= 3 -> runs with dt = 3, accumulator resets to 0
  intScheduler.update(1.0);
  assert.strictEqual(intSys.executions.length, 1);
  assert.strictEqual(intSys.executions[0], 3.0);
  assert.strictEqual(intSys.getAccumulator(), 0);

  // Update 4 (dt = 2): accumulator = 2 < 3 -> no run
  intScheduler.update(2.0);
  assert.strictEqual(intSys.executions.length, 1);
  assert.strictEqual(intSys.getAccumulator(), 2.0);

  // Update 5 (dt = 2): accumulator = 4 >= 3 -> runs with dt = 4, accumulator resets to 0
  intScheduler.update(2.0);
  assert.strictEqual(intSys.executions.length, 2);
  assert.strictEqual(intSys.executions[1], 4.0);
  assert.strictEqual(intSys.getAccumulator(), 0);

  // Fractional intervals & Multi-step boundary tests
  class FractionalIntervalSystem extends IntervalSystem {
    public runCount = 0;
    public passedDts: number[] = [];
    protected override processEntity(_ent: EntityId, dt: number): void {
      this.runCount++;
      this.passedDts.push(dt);
    }
  }

  const fracSys = new FractionalIntervalSystem(intWorld, Aspect.all(C_INT_COMP), 1.0);
  intScheduler.add(fracSys);

  // Tick 1: dt = 0.3 (accum = 0.3 < 1.0)
  intScheduler.update(0.3);
  assert.strictEqual(fracSys.runCount, 0);
  assert.strictEqual(Math.round(fracSys.getAccumulator() * 100) / 100, 0.3);

  // Tick 2: dt = 0.3 (accum = 0.6 < 1.0)
  intScheduler.update(0.3);
  assert.strictEqual(fracSys.runCount, 0);
  assert.strictEqual(Math.round(fracSys.getAccumulator() * 100) / 100, 0.6);

  // Pause and update while paused
  fracSys.toggle(false);
  intScheduler.update(0.3);
  assert.strictEqual(fracSys.runCount, 0);
  assert.strictEqual(Math.round(fracSys.getAccumulator() * 100) / 100, 0.6, "Accumulator must remain 0.6 while paused");

  // Resume and tick with dt = 0.4 -> reaches 1.0 exactly
  fracSys.toggle(true);
  intScheduler.update(0.4);
  assert.strictEqual(fracSys.runCount, 1, "Should execute on reaching boundary of 1.0");
  assert.strictEqual(Math.round(fracSys.passedDts[0] * 100) / 100, 1.0, "Should receive accumulated dt of 1.0");
  assert.strictEqual(fracSys.getAccumulator(), 0, "Accumulator should reset to 0 after execution");

  // Invalid interval validation
  assert.throws(
    () => {
      Interval(0);
    },
    { name: "Error", message: /Invalid Interval/ },
    "@Interval must reject 0"
  );
  assert.throws(
    () => {
      Interval(-2);
    },
    { name: "Error", message: /Invalid Interval/ },
    "@Interval must reject negative interval"
  );
  assert.throws(
    () => {
      Interval(Number.NaN);
    },
    { name: "Error", message: /Invalid Interval/ },
    "@Interval must reject NaN"
  );
  assert.throws(
    () => {
      class BadIntervalSystem extends IntervalSystem {
        protected override processEntity(): void {}
      }
      new BadIntervalSystem(intWorld, Aspect.all(C_INT_COMP), -1);
    },
    { name: "Error", message: /Invalid interval/ },
    "IntervalSystem constructor must reject negative interval"
  );

  // Interval pause and rebind reset
  const accBefore = intSys.getAccumulator(); // 0.5 from fractional test updates
  intSys.toggle(false);
  intScheduler.update(1.0);
  assert.strictEqual(intSys.getAccumulator(), accBefore, "Accumulator must not advance while disabled");

  intSys.toggle(true);
  intScheduler.update(1.0);
  assert.strictEqual(intSys.getAccumulator(), accBefore + 1.0);

  intSys.resetAccumulator();
  assert.strictEqual(intSys.getAccumulator(), 0);

  intScheduler.update(1.0);
  assert.strictEqual(intSys.getAccumulator(), 1.0);
  intWorld.clear(); // World clear calls scheduler.rebind() -> system.rebind()
  assert.strictEqual(intSys.getAccumulator(), 0, "World clear must reset interval accumulator");

  // ==========================================
  // 10. Scheduler Exception Recovery (SYS-008, SYS-009)
  // ==========================================
  const recWorld = new World();
  const recScheduler = new Scheduler(recWorld);

  let stepA = 0;
  let stepB = 0;
  let shouldFail = true;

  @Priority(10)
  class RecoverableStepA extends BaseSystem {
    public override update(): void {
      stepA++;
      if (shouldFail) {
        throw new Error("Simulated failure in StepA");
      }
    }
  }

  @Priority(20)
  class RecoverableStepB extends BaseSystem {
    public override update(): void {
      stepB++;
    }
  }

  recScheduler.add(new RecoverableStepA(recWorld));
  recScheduler.add(new RecoverableStepB(recWorld));

  assert.throws(
    () => {
      recScheduler.update(1.0);
    },
    { name: "Error", message: "Simulated failure in StepA" }
  );

  assert.strictEqual(stepA, 1);
  assert.strictEqual(stepB, 0, "StepB must not execute when StepA throws");
  assert.strictEqual(recWorld.isDeferred, false, "Deferred mode must be restored on error");

  // Now clear error condition and verify scheduler executes cleanly
  shouldFail = false;
  recScheduler.update(1.0);
  assert.strictEqual(stepA, 2, "StepA must execute on retry");
  assert.strictEqual(stepB, 1, "StepB must execute on retry");

  // ==========================================
  // 11. SortedIteratingSystem and PassiveSystem
  // ==========================================
  const sortWorld = new World();
  const sortScheduler = new Scheduler(sortWorld);

  const C_SORT_VAL = 500;
  sortWorld.registerComponent(C_SORT_VAL);

  @All(C_SORT_VAL)
  class TestSortedSystem extends SortedIteratingSystem {
    public processedOrder: number[] = [];

    public override sort(a: EntityId, b: EntityId): number {
      const valA = this.getComponent<{ val: number }>(a, C_SORT_VAL)?.val ?? 0;
      const valB = this.getComponent<{ val: number }>(b, C_SORT_VAL)?.val ?? 0;
      return valA - valB;
    }

    protected override processEntity(entity: EntityId): void {
      const val = this.getComponent<{ val: number }>(entity, C_SORT_VAL)?.val ?? 0;
      this.processedOrder.push(val);
    }
  }

  class TestPassiveSystem extends PassiveSystem {
    public manualCalls = 0;
    public customAction(): void {
      this.manualCalls++;
    }
  }

  const sortedSys = new TestSortedSystem(sortWorld);
  const passSys = new TestPassiveSystem(sortWorld);
  sortScheduler.add(sortedSys);
  sortScheduler.add(passSys);

  const eHigh = sortWorld.createEntity();
  sortWorld.addComponent(eHigh, C_SORT_VAL, { val: 100 });
  const eLow = sortWorld.createEntity();
  sortWorld.addComponent(eLow, C_SORT_VAL, { val: 10 });
  const eMid = sortWorld.createEntity();
  sortWorld.addComponent(eMid, C_SORT_VAL, { val: 50 });

  sortScheduler.update(1.0);
  assert.deepStrictEqual(sortedSys.processedOrder, [10, 50, 100], "SortedIteratingSystem must process entities in sorted order");
  assert.strictEqual(passSys.manualCalls, 0, "PassiveSystem must not update automatically during tick");

  passSys.customAction();
  assert.strictEqual(passSys.manualCalls, 1, "PassiveSystem responds to manual calls");

  // ==========================================
  // 12. Director Lifecycle, Injection, and Event-Driven Transitions
  // ==========================================
  {
    const storageMap = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => storageMap.set(key, String(value)),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
      get length() { return storageMap.size; }
    };
    const prevLocalStorage = (globalThis as unknown as Record<string, unknown>).localStorage;
    (globalThis as unknown as Record<string, unknown>).localStorage = mockLocalStorage;

    try {
      const dirWorld = new World();
      const dirScheduler = new Scheduler(dirWorld);
      dirWorld.setScheduler(dirScheduler);

      class MockScene implements Scene {
        constructor(public readonly name: string) {}
        public entered = false;
        public exited = false;
        public onEnter(): void {
          this.entered = true;
        }
        public onExit(): void {
          this.exited = true;
        }
      }

      const startScene = new MockScene("StartScene");
      const gameOverScene = new MockScene("GameOverScene");
      const nextLevelScene = new MockScene("NextLevelScene");
      const customScene = new MockScene("CustomScene");

      let initializedHookCalled = false;

      class TestGameDirector extends Director {
        public override onInitialize(): void {
          initializedHookCalled = true;
        }

        // Expose injected fields for assertions
        public getInjectedScenes() { return this.scenes; }
        public getInjectedStorage() { return this.storage; }
        public getInjectedTurns() { return this.turns; }

        protected override getGameOverScene(): Scene {
          return gameOverScene;
        }

        protected override getNextLevelScene(): Scene {
          return nextLevelScene;
        }
      }

      // 12.1: Constructor calls onInitialize()
      const director = new TestGameDirector(dirWorld);
      assert.strictEqual(initializedHookCalled, true, "Director constructor must invoke onInitialize()");

      // 12.2: Scheduler registration injects scenes, storage, and turns
      dirScheduler.add(director);
      assert.strictEqual(director.getInjectedScenes(), dirWorld.scenes, "scenes should be injected");
      assert.strictEqual(director.getInjectedStorage(), dirWorld.storage, "storage should be injected");
      assert.strictEqual(director.getInjectedTurns(), dirWorld.turns, "turns should be injected");

      // 12.3: Director is PassiveSystem and does not process entities on scheduler.update()
      dirScheduler.update(1.0);

      // Initial scene start
      dirWorld.scenes!.switchTo(startScene);
      assert.strictEqual(dirWorld.scenes!.getCurrentSceneName(), "StartScene");
      assert.strictEqual(startScene.entered, true);

      // 12.4: PLAYER_DIED event pauses turns and transitions to GameOverScene
      assert.strictEqual(dirWorld.turns!.isPaused, false);
      dirWorld.events.publish({ type: "PLAYER_DIED" });
      assert.strictEqual(dirWorld.turns!.isPaused, true, "PLAYER_DIED must pause turn manager");
      assert.strictEqual(dirWorld.scenes!.getCurrentSceneName(), "GameOverScene", "PLAYER_DIED must transition to GameOverScene");
      assert.strictEqual(gameOverScene.entered, true);
      assert.strictEqual(startScene.exited, true);

      // 12.5: EXIT_REACHED event saves autosave snapshot and transitions to NextLevelScene
      dirWorld.turns!.resume();
      dirWorld.events.publish({ type: "EXIT_REACHED" });
      assert.strictEqual(dirWorld.scenes!.getCurrentSceneName(), "NextLevelScene", "EXIT_REACHED must transition to NextLevelScene");
      assert.strictEqual(nextLevelScene.entered, true);
      assert.strictEqual(dirWorld.storage.exists("autosave"), true, "EXIT_REACHED must create autosave snapshot");

      // 12.6: changeScene() with checkpoint saving vs without saving
      director.changeScene(customScene, true);
      assert.strictEqual(dirWorld.scenes!.getCurrentSceneName(), "CustomScene", "changeScene must switch to target scene");
      assert.strictEqual(customScene.entered, true);
      assert.strictEqual(dirWorld.storage.exists("checkpoint"), true, "changeScene(..., true) must create checkpoint save");

      const directScene = new MockScene("DirectScene");
      director.changeScene(directScene, false);
      assert.strictEqual(dirWorld.scenes!.getCurrentSceneName(), "DirectScene", "changeScene must switch to direct scene");

      // Clean up test saves from localStorage
      dirWorld.storage.delete("autosave");
      dirWorld.storage.delete("checkpoint");

      // 12.7: Engine bootstrapping with Director
      const engine = new Engine({
        components: { POSITION, VELOCITY },
        systems: [],
        director: TestGameDirector,
      });
      assert.ok(engine.director instanceof TestGameDirector, "Engine must instantiate and register Director");
      assert.strictEqual(engine.director.getInjectedScenes(), engine.world.scenes, "Engine must inject scenes into Director");
      assert.strictEqual(engine.director.getInjectedStorage(), engine.world.storage, "Engine must inject storage into Director");
      assert.strictEqual(engine.director.getInjectedTurns(), engine.world.turns, "Engine must inject turns into Director");
    } finally {
      if (prevLocalStorage !== undefined) {
        (globalThis as unknown as Record<string, unknown>).localStorage = prevLocalStorage;
      } else {
        delete (globalThis as unknown as Record<string, unknown>).localStorage;
      }
    }
  }

  console.log("Systems & Decorators tests completed!");
}

if (require.main === module) {
  testSystems();
}
