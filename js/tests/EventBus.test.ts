import assert from "node:assert/strict";
import { EventBus, BaseEvent } from "../core/EventBus";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { BaseSystem } from "../ECS/System";
import { Subscribe } from "../ECS/Decorators";
import { SceneManager } from "../ECS/SceneManager";
import { Scene } from "../ECS/Scene";

export function testEventBus(): void {
  console.log("--- Task 21: EventBus Correctness & Subscription Lifecycle Tests ---");

  // =========================================================================
  // 21.1: Subscription Identity, Duplicates & Event Isolation
  // =========================================================================
  {
    const bus = new EventBus();

    let countA1 = 0;
    let countA2 = 0;
    let countB = 0;

    const handlerA1 = (ev: BaseEvent) => { countA1++; assert.strictEqual(ev.type, "EVENT_A"); };
    const handlerA2 = (ev: BaseEvent) => { countA2++; assert.strictEqual(ev.type, "EVENT_A"); };
    const handlerB = (ev: BaseEvent) => { countB++; assert.strictEqual(ev.type, "EVENT_B"); };

    // Subscribing same handler function multiple times is idempotent
    bus.subscribe("EVENT_A", handlerA1);
    bus.subscribe("EVENT_A", handlerA1);
    assert.strictEqual(bus.listenerCount("EVENT_A"), 1, "Duplicate subscribe with same function reference must be idempotent");

    // Subscribing distinct handlers for same event type
    bus.subscribe("EVENT_A", handlerA2);
    assert.strictEqual(bus.listenerCount("EVENT_A"), 2, "Distinct handlers for same event type should both be registered");

    // Subscribing to different event type
    bus.subscribe("EVENT_B", handlerB);
    assert.strictEqual(bus.listenerCount("EVENT_B"), 1);

    // Publish EVENT_A: only A handlers run, exactly once each
    bus.publish({ type: "EVENT_A" });
    assert.strictEqual(countA1, 1, "handlerA1 should be called once");
    assert.strictEqual(countA2, 1, "handlerA2 should be called once");
    assert.strictEqual(countB, 0, "handlerB must not be called for EVENT_A");

    // Unsubscribe single handler
    bus.unsubscribe("EVENT_A", handlerA1);
    assert.strictEqual(bus.listenerCount("EVENT_A"), 1);

    // Repeated unsubscribe is safe no-op
    bus.unsubscribe("EVENT_A", handlerA1);
    assert.strictEqual(bus.listenerCount("EVENT_A"), 1);

    // Publish EVENT_A again
    bus.publish({ type: "EVENT_A" });
    assert.strictEqual(countA1, 1, "handlerA1 should not be called after unsubscribe");
    assert.strictEqual(countA2, 2, "handlerA2 should be called again");
    assert.strictEqual(countB, 0);

    // Publish EVENT_B
    bus.publish({ type: "EVENT_B" });
    assert.strictEqual(countB, 1, "handlerB should be called for EVENT_B");
    assert.strictEqual(countA2, 2);
  }

  // =========================================================================
  // 21.2: Dispatch Behavior, Payload Integrity & Event Cancellation
  // =========================================================================
  {
    const bus = new EventBus();

    // Zero-listener dispatch is safe
    assert.doesNotThrow(() => {
      bus.publish({ type: "UNHANDLED_EVENT" });
    }, "Publishing with zero listeners must not throw");

    // Payload integrity
    interface DamageEvent extends BaseEvent {
      type: "DAMAGE";
      targetId: number;
      amount: number;
      meta?: { crit: boolean };
    }

    let receivedEvent: DamageEvent | null = null;
    bus.subscribe("DAMAGE", (ev: BaseEvent) => {
      receivedEvent = ev as DamageEvent;
    });

    const eventPayload: DamageEvent = {
      type: "DAMAGE",
      targetId: 42,
      amount: 150,
      meta: { crit: true }
    };

    bus.publish(eventPayload);
    assert.strictEqual(receivedEvent, eventPayload, "Handler must receive exact event payload object reference");
    assert.deepStrictEqual(receivedEvent, {
      type: "DAMAGE",
      targetId: 42,
      amount: 150,
      meta: { crit: true }
    });

    // Cancellation: handler setting cancelled = true stops subsequent listeners
    const cancelLog: string[] = [];
    bus.subscribe("CANCEL_TEST", (ev: BaseEvent) => {
      cancelLog.push("listener_1");
      ev.cancelled = true;
    });
    bus.subscribe("CANCEL_TEST", () => {
      cancelLog.push("listener_2");
    });
    bus.subscribe("CANCEL_TEST", () => {
      cancelLog.push("listener_3");
    });

    bus.publish({ type: "CANCEL_TEST" });
    assert.deepStrictEqual(cancelLog, ["listener_1"], "Cancelled event must stop subsequent listeners immediately");

    // Initially cancelled event is not processed by any listeners
    const initialCancelLog: string[] = [];
    bus.subscribe("PRE_CANCELLED", () => {
      initialCancelLog.push("should_not_run");
    });
    bus.publish({ type: "PRE_CANCELLED", cancelled: true });
    assert.strictEqual(initialCancelLog.length, 0, "Pre-cancelled event must not execute any listeners");
  }

  // =========================================================================
  // 21.3: Mutations During Dispatch & Reentrancy
  // =========================================================================
  {
    const bus = new EventBus();

    // 1. Handler unsubscribes itself during dispatch
    let selfUnsubCount = 0;
    const selfUnsubHandler = () => {
      selfUnsubCount++;
      bus.unsubscribe("SELF_UNSUB", selfUnsubHandler);
    };
    bus.subscribe("SELF_UNSUB", selfUnsubHandler);

    bus.publish({ type: "SELF_UNSUB" });
    assert.strictEqual(selfUnsubCount, 1, "Self-unsubscribing handler executes for current dispatch");
    bus.publish({ type: "SELF_UNSUB" });
    assert.strictEqual(selfUnsubCount, 1, "Self-unsubscribing handler must not execute on subsequent dispatch");

    // 2. Handler unsubscribes another pending handler during dispatch
    const unsubOtherLog: string[] = [];
    const otherHandler = () => {
      unsubOtherLog.push("second");
    };
    const firstHandler = () => {
      unsubOtherLog.push("first");
      bus.unsubscribe("UNSUB_OTHER", otherHandler);
    };

    bus.subscribe("UNSUB_OTHER", firstHandler);
    bus.subscribe("UNSUB_OTHER", otherHandler);

    bus.publish({ type: "UNSUB_OTHER" });
    assert.deepStrictEqual(unsubOtherLog, ["first"], "Handler unsubscribed mid-dispatch must be skipped immediately");

    // 3. Handler subscribes a new handler during dispatch
    const subMidLog: string[] = [];
    let newHandlerRan = false;
    const newHandler = () => { newHandlerRan = true; subMidLog.push("new_handler"); };

    const adderHandler = () => {
      subMidLog.push("adder");
      bus.subscribe("SUB_MID", newHandler);
    };

    bus.subscribe("SUB_MID", adderHandler);
    bus.publish({ type: "SUB_MID" });

    assert.deepStrictEqual(subMidLog, ["adder"], "Newly subscribed handler must NOT run during active in-flight dispatch");
    assert.strictEqual(newHandlerRan, false);

    bus.publish({ type: "SUB_MID" });
    assert.strictEqual(newHandlerRan, true, "Newly subscribed handler must run on subsequent dispatch");

    // 4. Handler calls clear() during dispatch
    const clearLog: string[] = [];
    bus.subscribe("CLEAR_MID", () => {
      clearLog.push("first_clear");
      bus.clear();
    });
    bus.subscribe("CLEAR_MID", () => {
      clearLog.push("second_should_not_run");
    });

    bus.publish({ type: "CLEAR_MID" });
    assert.deepStrictEqual(clearLog, ["first_clear"], "Clearing bus mid-dispatch skips remaining in-flight handlers");
    assert.strictEqual(bus.listenerCount("CLEAR_MID"), 0);

    // 5. Nested / reentrant dispatch of different event
    const reentrantLog: string[] = [];
    bus.subscribe("OUTER", () => {
      reentrantLog.push("outer_start");
      bus.publish({ type: "INNER" });
      reentrantLog.push("outer_end");
    });
    bus.subscribe("INNER", () => {
      reentrantLog.push("inner_handled");
    });

    bus.publish({ type: "OUTER" });
    assert.deepStrictEqual(
      reentrantLog,
      ["outer_start", "inner_handled", "outer_end"],
      "Nested dispatch must execute synchronously and return to outer flow"
    );

    // 6. Nested dispatch of same event type with depth limit / termination
    const recursiveLog: string[] = [];
    bus.subscribe("RECURSIVE", (ev: BaseEvent & { depth?: number }) => {
      const currentDepth = ev.depth ?? 0;
      recursiveLog.push(`depth_${currentDepth}`);
      if (currentDepth < 3) {
        bus.publish({ type: "RECURSIVE", depth: currentDepth + 1 });
      }
    });

    bus.publish({ type: "RECURSIVE", depth: 0 });
    assert.deepStrictEqual(
      recursiveLog,
      ["depth_0", "depth_1", "depth_2", "depth_3"],
      "Reentrant dispatch of same event type must execute cleanly"
    );
  }

  // =========================================================================
  // 21.4: Handler Exception Handling & Error Recovery
  // =========================================================================
  {
    const bus = new EventBus();
    const executionLog: string[] = [];

    bus.subscribe("FAIL_TEST", () => {
      executionLog.push("before_error");
    });
    bus.subscribe("FAIL_TEST", () => {
      executionLog.push("throws_error");
      throw new Error("Simulated event handler failure");
    });
    bus.subscribe("FAIL_TEST", () => {
      executionLog.push("after_error_should_not_run");
    });

    // Exception propagates to publish caller
    assert.throws(
      () => bus.publish({ type: "FAIL_TEST" }),
      /Simulated event handler failure/,
      "Handler exception must propagate to caller"
    );

    assert.deepStrictEqual(
      executionLog,
      ["before_error", "throws_error"],
      "Subsequent handlers in failed dispatch must be skipped"
    );

    // EventBus remains usable and uncorrupted after error
    let recoveredCount = 0;
    bus.subscribe("RECOVER_TEST", () => {
      recoveredCount++;
    });

    bus.publish({ type: "RECOVER_TEST" });
    assert.strictEqual(recoveredCount, 1, "EventBus must remain fully operational after a handler exception");
  }

  // =========================================================================
  // 21.5: System Integration & @Subscribe Decorators
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);

    class TestSystemA extends BaseSystem {
      public eventCount = 0;
      public lastPayload = "";

      public update(): void {}

      @Subscribe("SYS_EVENT_A")
      public onEventA(ev: { type: string; payload: string }): void {
        this.eventCount++;
        this.lastPayload = ev.payload;
      }
    }

    class TestSystemB extends BaseSystem {
      public eventCount = 0;

      public update(): void {}

      @Subscribe("SYS_EVENT_A")
      public onEventA(): void {
        this.eventCount++;
      }

      @Subscribe("SYS_EVENT_B")
      public onEventB(): void {
        this.eventCount++;
      }
    }

    const sysA1 = new TestSystemA(world);
    const sysA2 = new TestSystemA(world);
    const sysB = new TestSystemB(world);

    // Register systems with scheduler
    scheduler.add(sysA1);
    scheduler.add(sysA2);
    scheduler.add(sysB);

    assert.strictEqual(world.events.hasSubscriber(sysA1), true);
    assert.strictEqual(world.events.hasSubscriber(sysA2), true);
    assert.strictEqual(world.events.hasSubscriber(sysB), true);

    // Publish SYS_EVENT_A: sysA1, sysA2, sysB all receive it independently
    world.events.publish({ type: "SYS_EVENT_A", payload: "hello" });
    assert.strictEqual(sysA1.eventCount, 1);
    assert.strictEqual(sysA1.lastPayload, "hello");
    assert.strictEqual(sysA2.eventCount, 1);
    assert.strictEqual(sysA2.lastPayload, "hello");
    assert.strictEqual(sysB.eventCount, 1);

    // Publish SYS_EVENT_B: only sysB receives it
    world.events.publish({ type: "SYS_EVENT_B" });
    assert.strictEqual(sysA1.eventCount, 1);
    assert.strictEqual(sysA2.eventCount, 1);
    assert.strictEqual(sysB.eventCount, 2);

    // Removing sysA1 unregisters its event subscriptions
    scheduler.remove(sysA1);
    assert.strictEqual(world.events.hasSubscriber(sysA1), false);

    world.events.publish({ type: "SYS_EVENT_A", payload: "after_remove" });
    assert.strictEqual(sysA1.eventCount, 1, "Removed system must not receive events");
    assert.strictEqual(sysA2.eventCount, 2, "Remaining system must receive event");
    assert.strictEqual(sysA2.lastPayload, "after_remove");
    assert.strictEqual(sysB.eventCount, 3);

    // Scheduler.clear() unregisters all systems
    scheduler.clear();
    assert.strictEqual(world.events.hasSubscriber(sysA2), false);
    assert.strictEqual(world.events.hasSubscriber(sysB), false);

    world.events.publish({ type: "SYS_EVENT_A", payload: "after_clear" });
    world.events.publish({ type: "SYS_EVENT_B" });
    assert.strictEqual(sysA2.eventCount, 2, "Cleared systems must not receive events");
    assert.strictEqual(sysB.eventCount, 3, "Cleared systems must not receive events");
  }

  // =========================================================================
  // 21.6: World Lifecycle, World.clear() & Scheduler Rebinding
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);

    class PersistentSystem extends BaseSystem {
      public count = 0;
      public lastMsg = "";

      public update(): void {}

      @Subscribe("GAME_PULSE")
      public onPulse(ev: { type: string; msg: string }): void {
        this.count++;
        this.lastMsg = ev.msg;
      }
    }

    const persistSys = new PersistentSystem(world);
    scheduler.add(persistSys);

    // Manual ephemeral subscriber
    let ephemeralCount = 0;
    world.events.subscribe("GAME_PULSE", () => {
      ephemeralCount++;
    });

    // Initial dispatch (Cycle 0)
    world.events.publish({ type: "GAME_PULSE", msg: "pulse_0" });
    assert.strictEqual(persistSys.count, 1);
    assert.strictEqual(persistSys.lastMsg, "pulse_0");
    assert.strictEqual(ephemeralCount, 1);

    // Repeat clear & rebind cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      world.clear();

      // Ephemeral handler must be wiped
      world.events.publish({ type: "GAME_PULSE", msg: `pulse_${cycle}` });
      assert.strictEqual(
        persistSys.count,
        1 + cycle,
        `Persistent system receives exactly 1 notification in cycle ${cycle} (no duplicates)`
      );
      assert.strictEqual(persistSys.lastMsg, `pulse_${cycle}`);
      assert.strictEqual(
        ephemeralCount,
        1,
        `Ephemeral listener wiped in clear() must not receive notifications in cycle ${cycle}`
      );
    }
  }

  // =========================================================================
  // 21.7: Scene Lifecycle & SceneManager Transitions
  // =========================================================================
  {
    const world = new World();
    const scheduler = new Scheduler(world);
    const sceneManager = new SceneManager(world, scheduler);

    class GlobalTrackingSystem extends BaseSystem {
      public eventCount = 0;
      public lastData = "";

      public update(): void {}

      @Subscribe("SCENE_EVENT")
      public onSceneEvent(ev: { type: string; data: string }): void {
        this.eventCount++;
        this.lastData = ev.data;
      }
    }

    const globalSys = new GlobalTrackingSystem(world);
    scheduler.add(globalSys);

    let scene1LocalCount = 0;
    let scene2LocalCount = 0;

    const scene1: Scene = {
      name: "DungeonScene",
      onEnter(w: World) {
        w.events.subscribe("SCENE_EVENT", () => {
          scene1LocalCount++;
        });
      },
      onExit() {}
    };

    const scene2: Scene = {
      name: "TownScene",
      onEnter(w: World) {
        w.events.subscribe("SCENE_EVENT", () => {
          scene2LocalCount++;
        });
      },
      onExit() {}
    };

    sceneManager.register(scene1);
    sceneManager.register(scene2);

    // Switch to DungeonScene
    sceneManager.switchTo("DungeonScene");
    world.events.publish({ type: "SCENE_EVENT", data: "dungeon_enter" });

    assert.strictEqual(globalSys.eventCount, 1);
    assert.strictEqual(globalSys.lastData, "dungeon_enter");
    assert.strictEqual(scene1LocalCount, 1);
    assert.strictEqual(scene2LocalCount, 0);

    // Switch to TownScene: DungeonScene ephemeral handler is wiped
    sceneManager.switchTo("TownScene");
    world.events.publish({ type: "SCENE_EVENT", data: "town_enter" });

    assert.strictEqual(globalSys.eventCount, 2, "Persistent system continues receiving events across scene transition");
    assert.strictEqual(globalSys.lastData, "town_enter");
    assert.strictEqual(scene1LocalCount, 1, "Dungeon scene ephemeral handler must not fire in Town scene");
    assert.strictEqual(scene2LocalCount, 1, "Town scene handler fires in Town scene");

    // Switch back to DungeonScene
    sceneManager.switchTo("DungeonScene");
    world.events.publish({ type: "SCENE_EVENT", data: "dungeon_revisit" });

    assert.strictEqual(globalSys.eventCount, 3);
    assert.strictEqual(globalSys.lastData, "dungeon_revisit");
    assert.strictEqual(scene1LocalCount, 2, "Re-entered Dungeon scene receives event");
    assert.strictEqual(scene2LocalCount, 1, "Town scene handler wiped on exit");
  }

  // =========================================================================
  // 21.8: Input Validation, Error Boundaries & Helper Queries
  // =========================================================================
  {
    const bus = new EventBus();

    // subscribe validation
    assert.throws(
      () => bus.subscribe("" as string, () => {}),
      /\[EventBus\] Event type must be a non-empty string/,
      "Empty string event type must be rejected"
    );
    assert.throws(
      () => bus.subscribe("   " as string, () => {}),
      /\[EventBus\] Event type must be a non-empty string/,
      "Whitespace-only event type must be rejected"
    );
    assert.throws(
      () => bus.subscribe(null as unknown as string, () => {}),
      /\[EventBus\] Event type must be a non-empty string/,
      "Null event type must be rejected"
    );
    assert.throws(
      () => bus.subscribe("VALID_TYPE", null as unknown as () => void),
      /\[EventBus\] Event handler must be a function/,
      "Non-function handler must be rejected"
    );

    // publish validation
    assert.throws(
      () => bus.publish(null as unknown as BaseEvent),
      /\[EventBus\] Invalid event object/,
      "Null event object must be rejected"
    );
    assert.throws(
      () => bus.publish({} as unknown as BaseEvent),
      /\[EventBus\] Invalid event object/,
      "Event without type must be rejected"
    );
    assert.throws(
      () => bus.publish({ type: "" } as unknown as BaseEvent),
      /\[EventBus\] Invalid event object/,
      "Event with empty type must be rejected"
    );

    // register / unregister validation
    assert.throws(
      () => bus.register(null as unknown as object),
      /\[EventBus\] Subscriber must be a non-null object/,
      "Null subscriber must be rejected"
    );
    // Unregister with non-tracked or null object is safe no-op
    assert.doesNotThrow(() => bus.unregister(null as unknown as object));
    assert.doesNotThrow(() => bus.unregister({}));

    // @Subscribe decorator input validation
    assert.throws(
      () => Subscribe(""),
      /\[ECS\] @Subscribe requires a non-empty string event type/,
      "@Subscribe with empty event type must be rejected"
    );
    assert.throws(
      () => Subscribe("   "),
      /\[ECS\] @Subscribe requires a non-empty string event type/,
      "@Subscribe with whitespace event type must be rejected"
    );

    // Helper inspection methods
    assert.strictEqual(bus.hasListeners("NON_EXISTENT"), false);
    assert.strictEqual(bus.listenerCount("NON_EXISTENT"), 0);

    const testHandler = () => {};
    bus.subscribe("INSPECT_TYPE", testHandler);
    assert.strictEqual(bus.hasListeners("INSPECT_TYPE"), true);
    assert.strictEqual(bus.listenerCount("INSPECT_TYPE"), 1);

    bus.clear();
    assert.strictEqual(bus.hasListeners("INSPECT_TYPE"), false);
    assert.strictEqual(bus.listenerCount("INSPECT_TYPE"), 0);
  }

  console.log("=== Task 21: EventBus Tests Passed Successfully ===");
}
