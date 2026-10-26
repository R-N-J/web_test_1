import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";
import { IteratingSystem } from "../ECS/System";
import { Scheduler } from "../ECS/Scheduler";
import { EventBus } from "../core/EventBus";
import { PrefabDefinition } from "../ECS/PrefabManager";
import { EntityId } from "../ECS/Archetype";

// Benchmark IDs
const C_POS = 100;
const C_VEL = 101;
const C_RENDER = 102;
const C_HEALTH = 103;
const C_AI = 104;
const REL_PARENT = 200;

export interface BenchmarkResult {
  name: string;
  operations: number;
  durationMs: number;
  opsPerSec: number;
  avgOpMs: number;
  unit: string;
  samples: number;
}

export function formatResult(res: BenchmarkResult): string {
  const opsStr = res.opsPerSec > 1000000
    ? `${(res.opsPerSec / 1000000).toFixed(2)}M ${res.unit}/s`
    : res.opsPerSec > 1000
    ? `${(res.opsPerSec / 1000).toFixed(2)}k ${res.unit}/s`
    : `${res.opsPerSec.toFixed(2)} ${res.unit}/s`;

  let singularUnit = res.unit;
  if (singularUnit.endsWith("ies")) {
    singularUnit = singularUnit.replace(/ies$/, "y");
  } else if (
    singularUnit.endsWith("ses") ||
    singularUnit.endsWith("shes") ||
    singularUnit.endsWith("ches") ||
    singularUnit.endsWith("xes")
  ) {
    singularUnit = singularUnit.replace(/es$/, "");
  } else if (singularUnit.endsWith("s") && !singularUnit.endsWith("ss")) {
    singularUnit = singularUnit.slice(0, -1);
  }

  const timeStr = res.avgOpMs < 0.001
    ? `${(res.avgOpMs * 1000000).toFixed(1)} ns/${singularUnit}`
    : res.avgOpMs < 1
    ? `${(res.avgOpMs * 1000).toFixed(2)} µs/${singularUnit}`
    : `${res.avgOpMs.toFixed(3)} ms/${singularUnit}`;

  return `  ${res.name.padEnd(58)} | ${opsStr.padStart(18)} | ${timeStr.padStart(16)} | (${res.durationMs.toFixed(2)} ms median, ${res.samples} runs of ${res.operations.toLocaleString()} ${res.unit})`;
}

/**
 * Executes a benchmark with multiple warmup and sample passes, returning median timing metrics.
 */
export function measure(
  name: string,
  operations: number,
  fn: () => void,
  options: { warmupRuns?: number; sampleRuns?: number; unit?: string } = {}
): BenchmarkResult {
  const warmupRuns = options.warmupRuns ?? 3;
  const sampleRuns = options.sampleRuns ?? 5;
  const unit = options.unit ?? "ops";

  // Warmup passes for JIT tiering
  for (let i = 0; i < warmupRuns; i++) {
    fn();
  }

  // Sample runs
  const durations: number[] = [];
  for (let s = 0; s < sampleRuns; s++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    durations.push(Math.max(end - start, 0.0001));
  }

  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const durationMs = durations.length % 2 === 0
    ? (durations[mid - 1] + durations[mid]) / 2
    : durations[mid];

  const opsPerSec = (operations / durationMs) * 1000;
  const avgOpMs = durationMs / operations;

  return { name, operations, durationMs, opsPerSec, avgOpMs, unit, samples: sampleRuns };
}

/**
 * Executes a benchmark where workload setup is explicitly separated from the timed operation.
 */
export function measureWithSetup<T>(
  name: string,
  operations: number,
  setup: () => T,
  work: (state: T) => void,
  options: { warmupRuns?: number; sampleRuns?: number; unit?: string } = {}
): BenchmarkResult {
  const warmupRuns = options.warmupRuns ?? 3;
  const sampleRuns = options.sampleRuns ?? 5;
  const unit = options.unit ?? "ops";

  // Warmup passes
  for (let i = 0; i < warmupRuns; i++) {
    const state = setup();
    work(state);
  }

  // Sample runs
  const durations: number[] = [];
  for (let s = 0; s < sampleRuns; s++) {
    const state = setup();
    const start = performance.now();
    work(state);
    const end = performance.now();
    durations.push(Math.max(end - start, 0.0001));
  }

  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const durationMs = durations.length % 2 === 0
    ? (durations[mid - 1] + durations[mid]) / 2
    : durations[mid];

  const opsPerSec = (operations / durationMs) * 1000;
  const avgOpMs = durationMs / operations;

  return { name, operations, durationMs, opsPerSec, avgOpMs, unit, samples: sampleRuns };
}

// -------------------------------------------------------------
// 1. Entity Allocation, Deletion, and ID Recycling
// -------------------------------------------------------------
export function runEntityBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const count of [10000, 50000]) {
    results.push(measureWithSetup(
      `Entity Allocation (${count.toLocaleString()} entities)`,
      count,
      () => new World(),
      (world) => {
        for (let i = 0; i < count; i++) {
          world.createEntity();
        }
      },
      { unit: "entities" }
    ));
  }

  for (const count of [10000, 50000]) {
    results.push(measureWithSetup(
      `Entity Deletion & Slot Recycling (${count.toLocaleString()} entities)`,
      count * 2,
      () => {
        const world = new World();
        const entities: EntityId[] = [];
        for (let i = 0; i < count; i++) {
          entities.push(world.createEntity());
        }
        return { world, entities };
      },
      ({ world, entities }) => {
        for (let i = 0; i < count; i++) {
          world.deleteEntity(entities[i]);
        }
        for (let i = 0; i < count; i++) {
          world.createEntity(); // re-allocates from free pool
        }
      },
      { unit: "ops" }
    ));
  }

  return results;
}

// -------------------------------------------------------------
// 2. Component Additions/Removals & Archetype Transitions
// -------------------------------------------------------------
export function runComponentBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const ENTITY_COUNT = 10000;

  // Structural component additions (transmute 0 -> POS -> VEL -> RENDER)
  results.push(measureWithSetup(
    `Component Additions (transmute x3, ${ENTITY_COUNT.toLocaleString()} entities)`,
    ENTITY_COUNT * 3,
    () => {
      const world = new World();
      world.registerComponent(C_POS);
      world.registerComponent(C_VEL);
      world.registerComponent(C_RENDER);
      const entities: EntityId[] = [];
      for (let i = 0; i < ENTITY_COUNT; i++) {
        entities.push(world.createEntity());
      }
      return { world, entities };
    },
    ({ world, entities }) => {
      for (let i = 0; i < ENTITY_COUNT; i++) {
        world.addComponent(entities[i], C_POS, { x: i, y: i });
        world.addComponent(entities[i], C_VEL, { vx: 1, vy: 1 });
        world.addComponent(entities[i], C_RENDER, { sprite: "hero" });
      }
    },
    { unit: "transmutes" }
  ));

  // Non-structural in-place mutation
  results.push(measureWithSetup(
    `Non-structural In-Place Mutation (${ENTITY_COUNT.toLocaleString()} entities x 10 passes)`,
    ENTITY_COUNT * 10,
    () => {
      const world = new World();
      world.registerComponent(C_POS);
      const entities: EntityId[] = [];
      for (let i = 0; i < ENTITY_COUNT; i++) {
        const e = world.createEntity();
        world.addComponent(e, C_POS, { x: 0, y: 0 });
        entities.push(e);
      }
      return { world, entities };
    },
    ({ world, entities }) => {
      for (let pass = 0; pass < 10; pass++) {
        for (let i = 0; i < ENTITY_COUNT; i++) {
          world.mutateComponent<{ x: number; y: number }>(entities[i], C_POS, (pos) => {
            pos.x += 1;
          });
        }
      }
    },
    { unit: "mutations" }
  ));

  // Batch edits via EntityEditor
  results.push(measureWithSetup(
    `Batch Edits (EntityEditor, 3 adds in 1 move, ${ENTITY_COUNT.toLocaleString()} entities)`,
    ENTITY_COUNT,
    () => {
      const world = new World();
      world.registerComponent(C_POS);
      world.registerComponent(C_VEL);
      world.registerComponent(C_RENDER);
      const entities: EntityId[] = [];
      for (let i = 0; i < ENTITY_COUNT; i++) {
        entities.push(world.createEntity());
      }
      return { world, entities };
    },
    ({ world, entities }) => {
      for (let i = 0; i < ENTITY_COUNT; i++) {
        world.edit(entities[i])
          .add(C_POS, { x: i, y: i })
          .add(C_VEL, { vx: 1, vy: 1 })
          .add(C_RENDER, { sprite: "hero" })
          .commit();
      }
    },
    { unit: "entities" }
  ));

  return results;
}

// -------------------------------------------------------------
// 3. Query Execution, Cache Invalidation & Iteration
// -------------------------------------------------------------
export function runQueryBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const ENTITY_COUNT = 20000;

  // Setup world with diverse archetypes
  const world = new World();
  world.registerComponent(C_POS);
  world.registerComponent(C_VEL);
  world.registerComponent(C_RENDER);
  world.registerComponent(C_HEALTH);
  world.registerComponent(C_AI);

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const e = world.createEntity();
    if (i % 2 === 0) world.addComponent(e, C_POS, { x: i, y: i });
    if (i % 3 === 0) world.addComponent(e, C_VEL, { vx: 1, vy: 1 });
    if (i % 4 === 0) world.addComponent(e, C_RENDER, { sprite: "hero" });
    if (i % 5 === 0) world.addComponent(e, C_HEALTH, { current: 100, max: 100 });
    if (i % 6 === 0) world.addComponent(e, C_AI, { state: "idle" });
  }

  const queryAspect = Aspect.all(C_POS, C_VEL);
  const matchingCount = world.count(queryAspect);

  // Cached count query
  results.push(measure(
    `Query count() across archetypes (${ENTITY_COUNT.toLocaleString()} entities x 1,000 queries)`,
    1000,
    () => {
      for (let i = 0; i < 1000; i++) {
        world.count(queryAspect);
      }
    },
    { unit: "queries" }
  ));

  // Query snapshot getEntities()
  results.push(measure(
    `Query getEntities() snapshot (${matchingCount.toLocaleString()} matches x 200 snapshots)`,
    200,
    () => {
      for (let i = 0; i < 200; i++) {
        world.getEntities(queryAspect);
      }
    },
    { unit: "snapshots" }
  ));

  // Query view() generator iteration (measuring entity iteration throughput)
  results.push(measure(
    `Query view() generator iteration (${matchingCount.toLocaleString()} entities x 100 passes)`,
    matchingCount * 100,
    () => {
      let count = 0;
      for (let i = 0; i < 100; i++) {
        for (const ent of world.view(queryAspect)) {
          if (ent > 0) count++;
        }
      }
      if (count < 0) console.log(count);
    },
    { unit: "entities" }
  ));

  // Column query viewColumns() SoA processing (measuring direct array iteration throughput)
  results.push(measure(
    `Column Query viewColumns() SoA (${matchingCount.toLocaleString()} entities x 100 passes)`,
    matchingCount * 100,
    () => {
      for (let i = 0; i < 100; i++) {
        for (const { entities, columns } of world.viewColumns(queryAspect, C_POS, C_VEL)) {
          const posCol = columns[0] as { x: number; y: number }[];
          const velCol = columns[1] as { vx: number; vy: number }[];
          for (let r = 0; r < entities.length; r++) {
            posCol[r].x += velCol[r].vx;
          }
        }
      }
    },
    { unit: "entities" }
  ));

  return results;
}

// -------------------------------------------------------------
// 4. Relationship Creation, Reverse-Index Updates, Cleanup & Baseline Comparison
// -------------------------------------------------------------
export function runRelationshipBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const COUNT = 10000;

  // Relationship creation
  results.push(measureWithSetup(
    `Relationship Creation (1-to-1, ${COUNT.toLocaleString()} pairs)`,
    COUNT,
    () => {
      const world = new World();
      world.relationships.registerRelation(REL_PARENT);
      const parents: EntityId[] = [];
      const children: EntityId[] = [];
      for (let i = 0; i < COUNT; i++) {
        parents.push(world.createEntity());
        children.push(world.createEntity());
      }
      return { world, parents, children };
    },
    ({ world, parents, children }) => {
      for (let i = 0; i < COUNT; i++) {
        world.relationships.add(children[i], REL_PARENT, parents[i]);
      }
    },
    { unit: "relations" }
  ));

  // Dense Reverse Queries (1 parent with 10,000 subjects)
  {
    const world = new World();
    world.relationships.registerRelation(REL_PARENT);
    const parent = world.createEntity();
    for (let i = 0; i < COUNT; i++) {
      const child = world.createEntity();
      world.relationships.add(child, REL_PARENT, parent);
    }

    results.push(measure(
      `Reverse Query getRelated() (dense: 10,000 subjects x 500 queries)`,
      500,
      () => {
        let count = 0;
        for (let i = 0; i < 500; i++) {
          for (const child of world.relationships.getRelated(REL_PARENT, parent)) {
            if (child > 0) count++;
          }
        }
        if (count < 0) console.log(count);
      },
      { unit: "queries" }
    ));

    results.push(measure(
      `Reverse Query countRelated() (dense: 10,000 subjects x 2,000 queries)`,
      2000,
      () => {
        for (let i = 0; i < 2000; i++) {
          world.relationships.countRelated(REL_PARENT, parent);
        }
      },
      { unit: "queries" }
    ));
  }

  // Sparse Reverse Queries: Compare Reverse Index [O(1) bucket + O(k) yield] vs Scan Baseline [O(N) full table scan]
  {
    const world = new World();
    world.relationships.registerRelation(REL_PARENT);
    world.registerComponent(C_POS);
    world.registerComponent(C_VEL);

    // Create 20,000 entities across multiple archetypes, each with REL_PARENT
    const otherParent = world.createEntity();
    for (let i = 0; i < 20000; i++) {
      const e = world.createEntity();
      if (i % 2 === 0) world.addComponent(e, C_POS, { x: i, y: i });
      if (i % 3 === 0) world.addComponent(e, C_VEL, { vx: 1, vy: 1 });
      world.relationships.add(e, REL_PARENT, otherParent);
    }

    const boss = world.createEntity();
    // 5 minions point to boss out of 20,005 relationship rows across 20,007 total entities
    for (let i = 0; i < 5; i++) {
      const minion = world.createEntity();
      world.relationships.add(minion, REL_PARENT, boss);
    }

    // 1. Optimized reverse query via index: O(1) lookup + O(k) iteration over 5 matches
    results.push(measure(
      `Reverse Query getRelated() [Index: O(1)+O(k)] (sparse: 5 of 20k x 10,000 queries)`,
      10000,
      () => {
        let count = 0;
        for (let i = 0; i < 10000; i++) {
          for (const minion of world.relationships.getRelated(REL_PARENT, boss)) {
            if (minion > 0) count++;
          }
        }
        if (count < 0) console.log(count);
      },
      { unit: "queries" }
    ));

    // 2. Scan baseline: Linear archetype and column scan [O(N) table scan across all 20,005 relationship rows in 20,007 entities]
    results.push(measure(
      `Reverse Query Baseline [Table Scan: O(N)] (sparse: 5 of 20k x 1,000 queries)`,
      1000,
      () => {
        let count = 0;
        for (let i = 0; i < 1000; i++) {
          for (const arch of world.getArchetypes(Aspect.EMPTY)) {
            const col = arch.columns.get(REL_PARENT);
            if (!col) continue;
            for (let r = 0; r < arch.entities.length; r++) {
              const val = col[r];
              if (val === boss || (val instanceof Set && val.has(boss))) {
                const minion = arch.entities[r];
                if (minion > 0) count++;
              }
            }
          }
        }
        if (count < 0) console.log(count);
      },
      { unit: "queries" }
    ));

    // countRelated() comparison
    results.push(measure(
      `Reverse Query countRelated() [Index: O(1)+O(k)] (sparse: 5 of 20k x 20,000 queries)`,
      20000,
      () => {
        let total = 0;
        for (let i = 0; i < 20000; i++) {
          total += world.relationships.countRelated(REL_PARENT, boss);
        }
        if (total < 0) console.log(total);
      },
      { unit: "queries" }
    ));

    results.push(measure(
      `Reverse Query countRelated Baseline [Table Scan: O(N)] (sparse: 5 of 20k x 1,000 queries)`,
      1000,
      () => {
        let total = 0;
        for (let i = 0; i < 1000; i++) {
          let count = 0;
          for (const arch of world.getArchetypes(Aspect.EMPTY)) {
            const col = arch.columns.get(REL_PARENT);
            if (!col) continue;
            for (let r = 0; r < arch.entities.length; r++) {
              const val = col[r];
              if (val === boss || (val instanceof Set && val.has(boss))) {
                count++;
              }
            }
          }
          total += count;
        }
        if (total < 0) console.log(total);
      },
      { unit: "queries" }
    ));
  }

  // Relationship cleanup on target deletion
  results.push(measureWithSetup(
    `Relationship Deletion Cleanup (${COUNT.toLocaleString()} related targets)`,
    COUNT,
    () => {
      const world = new World();
      world.relationships.registerRelation(REL_PARENT);
      const parents: EntityId[] = [];
      const children: EntityId[] = [];

      for (let i = 0; i < COUNT; i++) {
        const p = world.createEntity();
        const c = world.createEntity();
        world.relationships.add(c, REL_PARENT, p);
        parents.push(p);
        children.push(c);
      }
      return { world, parents };
    },
    ({ world, parents }) => {
      for (let i = 0; i < COUNT; i++) {
        world.deleteEntity(parents[i]);
      }
    },
    { unit: "deletions" }
  ));

  return results;
}

// -------------------------------------------------------------
// 5. Scheduler Ordering, Update Dispatch & Deferred Queue
// -------------------------------------------------------------
export function runSchedulerBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const ENTITY_COUNT = 10000;

  class MovementSystem extends IteratingSystem {
    constructor(world: World) {
      super(world, Aspect.all(C_POS, C_VEL));
    }
    protected processEntity(entity: EntityId, dt: number): void {
      if (dt <= 0) return;
      const pos = this.world.getComponent<{ x: number; y: number }>(entity, C_POS);
      const vel = this.world.getComponent<{ vx: number; vy: number }>(entity, C_VEL);
      if (pos && vel) {
        pos.x += vel.vx;
        pos.y += vel.vy;
      }
    }
  }

  class RenderSystem extends IteratingSystem {
    constructor(world: World) {
      super(world, Aspect.all(C_POS, C_RENDER));
    }
    protected processEntity(entity: EntityId, dt: number): void {
      if (entity < 0 || dt < 0) return;
    }
  }

  const world = new World();
  world.registerComponent(C_POS);
  world.registerComponent(C_VEL);
  world.registerComponent(C_RENDER);

  const scheduler = new Scheduler(world);
  scheduler.add(new MovementSystem(world));
  scheduler.add(new RenderSystem(world));

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const e = world.createEntity();
    world.addComponent(e, C_POS, { x: i, y: i });
    world.addComponent(e, C_VEL, { vx: 1, vy: 1 });
    if (i % 2 === 0) world.addComponent(e, C_RENDER, { sprite: "hero" });
  }

  results.push(measure(
    `Scheduler Update Dispatch (${ENTITY_COUNT.toLocaleString()} entities x 200 passes)`,
    200,
    () => {
      for (let pass = 0; pass < 200; pass++) {
        scheduler.update(0.016);
      }
    },
    { unit: "passes" }
  ));

  // Deferred Queue Flushing (measuring throughput of committing queued structural additions)
  results.push(measureWithSetup(
    `Deferred Queue Flushing (${ENTITY_COUNT.toLocaleString()} queued additions x 5 passes)`,
    ENTITY_COUNT * 5,
    () => {
      const dWorld = new World();
      dWorld.registerComponent(C_POS);
      dWorld.registerComponent(C_HEALTH);
      const entities: EntityId[] = [];
      for (let i = 0; i < ENTITY_COUNT; i++) {
        entities.push(dWorld.createEntity());
      }
      return { dWorld, entities };
    },
    ({ dWorld, entities }) => {
      for (let pass = 0; pass < 5; pass++) {
        dWorld.setDeferred(true);
        for (let i = 0; i < ENTITY_COUNT; i++) {
          dWorld.addComponent(entities[i], C_HEALTH, { current: 100, max: 100 });
        }
        dWorld.flush();
        dWorld.setDeferred(false);
      }
    },
    { unit: "flushes" }
  ));

  return results;
}

// -------------------------------------------------------------
// 6. EventBus Dispatch with Increasing Subscribers
// -------------------------------------------------------------
export function runEventBusBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const subscriberCount of [10, 100, 1000]) {
    const bus = new EventBus();
    let handled = 0;

    for (let i = 0; i < subscriberCount; i++) {
      bus.subscribe("TEST_EVENT", () => {
        handled++;
      });
    }

    const DISPATCHES = 5000;
    results.push(measure(
      `EventBus Dispatch (${subscriberCount} subscribers x ${DISPATCHES.toLocaleString()} publishes)`,
      DISPATCHES * subscriberCount,
      () => {
        for (let d = 0; d < DISPATCHES; d++) {
          bus.publish({ type: "TEST_EVENT" });
        }
        if (handled < 0) console.log(handled);
      },
      { unit: "deliveries" }
    ));
  }

  return results;
}

// -------------------------------------------------------------
// 7. Prefab Spawning & Deep-Cloning Overhead
// -------------------------------------------------------------
export function runPrefabBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const COUNT = 10000;

  const heroPrefab: PrefabDefinition = {
    name: "Hero",
    components: [
      { id: C_POS, value: { x: 0, y: 0 } },
      { id: C_HEALTH, value: { current: 100, max: 100 } },
      { id: C_RENDER, value: { sprite: "Hero" } }
    ],
    groups: ["Units", "Heroes"]
  };

  results.push(measureWithSetup(
    `Prefab Spawning (${COUNT.toLocaleString()} instances)`,
    COUNT,
    () => {
      const pWorld = new World();
      pWorld.registerComponent(C_POS);
      pWorld.registerComponent(C_HEALTH);
      pWorld.registerComponent(C_RENDER);
      pWorld.prefabs.register("Hero", heroPrefab);
      return pWorld;
    },
    (pWorld) => {
      for (let i = 0; i < COUNT; i++) {
        pWorld.prefabs.spawn("Hero");
      }
    },
    { unit: "spawns" }
  ));

  return results;
}

// -------------------------------------------------------------
// 8. Snapshot Save/Load Costs, Validation & Memory Allocation
// -------------------------------------------------------------
export function runSnapshotBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const ENTITY_COUNT = 5000;

  const world = new World();
  world.registerComponent(C_POS);
  world.registerComponent(C_VEL);
  world.registerComponent(C_HEALTH);
  world.relationships.registerRelation(REL_PARENT);

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const e = world.createEntity();
    world.addComponent(e, C_POS, { x: i, y: i });
    world.addComponent(e, C_VEL, { vx: 1, vy: 1 });
    world.addComponent(e, C_HEALTH, { current: 100, max: 100 });
    if (i % 2 === 0) world.tags.register(`tag_${i}`, e);
    if (i % 3 === 0) world.groups.add("GroupA", e);
  }

  // Snapshot Save
  results.push(measure(
    `Snapshot saveSnapshot() (${ENTITY_COUNT.toLocaleString()} entities x 20 saves)`,
    20,
    () => {
      for (let i = 0; i < 20; i++) {
        world.saveSnapshot();
      }
    },
    { unit: "saves" }
  ));

  // Snapshot Load
  const savedSnapshot = world.saveSnapshot();
  results.push(measureWithSetup(
    `Snapshot loadSnapshot() (${ENTITY_COUNT.toLocaleString()} entities x 20 loads)`,
    20,
    () => {
      const targetWorld = new World();
      targetWorld.registerComponent(C_POS);
      targetWorld.registerComponent(C_VEL);
      targetWorld.registerComponent(C_HEALTH);
      targetWorld.relationships.registerRelation(REL_PARENT);
      return targetWorld;
    },
    (targetWorld) => {
      for (let i = 0; i < 20; i++) {
        targetWorld.loadSnapshot(savedSnapshot);
      }
    },
    { unit: "loads" }
  ));

  return results;
}

// -------------------------------------------------------------
// Main Runner
// -------------------------------------------------------------
export function runAllBenchmarks(): void {
  console.log("==========================================================================================");
  console.log("                     Rogue1 ECS Performance and Scalability Audit                         ");
  console.log("==========================================================================================");

  const sections: Array<{ title: string; runner: () => BenchmarkResult[] }> = [
    { title: "1. Entity Allocation, Deletion, and ID Recycling", runner: runEntityBenchmarks },
    { title: "2. Component Additions/Removals & Archetype Transitions", runner: runComponentBenchmarks },
    { title: "3. Query Execution, Cache Invalidation & Iteration", runner: runQueryBenchmarks },
    { title: "4. Relationship Creation, Reverse-Index & Cleanup", runner: runRelationshipBenchmarks },
    { title: "5. Scheduler Ordering, Update Dispatch & Deferred Queue", runner: runSchedulerBenchmarks },
    { title: "6. EventBus Dispatch with Increasing Subscribers", runner: runEventBusBenchmarks },
    { title: "7. Prefab Spawning & Deep-Cloning Overhead", runner: runPrefabBenchmarks },
    { title: "8. Snapshot Save/Load Costs & Validation", runner: runSnapshotBenchmarks },
  ];

  for (const sec of sections) {
    console.log(`\n--- ${sec.title} ---`);
    const results = sec.runner();
    for (const res of results) {
      console.log(formatResult(res));
    }
  }

  console.log("\n==========================================================================================");
  console.log("                                Benchmark Completed                                       ");
  console.log("==========================================================================================");
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("benchmarks"))) {
  runAllBenchmarks();
}
