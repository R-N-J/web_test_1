import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { IteratingSystem, BaseSystem } from "../ECS/System";
import { All, Inject, After, Priority, Subscribe } from "../ECS/Decorators";
import { Aspect } from "../ECS/Aspect";
import { EntityId } from "../ECS/Archetype";
import { InternalComponents, EngineStats } from "../ECS/InternalComponents";

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

  console.log("Systems & Decorators tests completed!");
}

if (require.main === module) {
  testSystems();
}
