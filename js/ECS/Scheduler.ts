import { BaseSystem } from "./System";
import { World } from "./World";
import { InternalComponents, EngineStats } from "./InternalComponents";
import { getSystemOrder, getSystemPriority, getInjectMetadata } from "./Decorators";


export type SystemConstructor<T extends BaseSystem> = { new (...args: never[]): T };

export class Scheduler {
  private systems: BaseSystem[] = [];
  private addedDuringPass: Set<BaseSystem> | null = null;
  private removedDuringPass: Set<BaseSystem> | null = null;

  constructor(private world: World) {
    if (!this.world.scheduler) {
      this.world.setScheduler(this);
    }
    // Initialize stats singleton if it doesn't exist
    if (!this.world.hasSingleton(InternalComponents.ENGINE_STATS)) {
      this.world.setSingleton<EngineStats>(InternalComponents.ENGINE_STATS, {
        entities: 0,
        archetypes: 0,
        systems: [],
        lastUpdateMs: 0
      });
    }
  }

  public add(system: BaseSystem): void {
    if (!system || typeof system !== "object") {
      throw new Error("[ECS] Invalid system: Expected a system instance.");
    }
    if (this.systems.includes(system)) {
      return;
    }

    // 1. Verify topological sort with candidate list before mutating scheduler or event bus state
    const candidateSystems = [...this.systems, system];
    const sorted = this.topologicalSort(candidateSystems);

    // 2. Perform Dependency Injection
    this.injectDependencies(system);

    // 3. Auto-register systems with the world's event bus
    this.world.events.register(system);

    // 4. Commit sorted systems and record addition if an update pass is currently active
    this.systems = sorted;
    if (this.addedDuringPass) {
      this.addedDuringPass.add(system);
    }
  }

  /**
   * Performs automated dependency injection based on @Inject and @Singleton decorators.
   */
  private injectDependencies(system: BaseSystem): void {
    const injections = getInjectMetadata(system);
    const systemAsRecord = system as unknown as Record<string, unknown>;

    for (const inject of injections) {
      if (inject.type === 'MAPPER' && inject.id !== undefined) {
        systemAsRecord[inject.propertyKey] = this.world.getMapper(inject.id);
      } else if (inject.type === 'EVENT_BUS') {
        systemAsRecord[inject.propertyKey] = this.world.events;
      } else if (inject.type === 'SINGLETON' && inject.id !== undefined) {
        const value = this.world.getSingleton(inject.id);

        if (value === undefined) {
          // Hard stop if a required singleton is missing during bootstrap
          const msg = `[ECS Framework] Wiring Failed: System '${system.constructor.name}' required Singleton ID ${inject.id}, but it was not found in the World. Initialized it in your Scene or App bootstrap.`;
          console.error(msg);
          throw new Error(msg);
        }

        systemAsRecord[inject.propertyKey] = value;
      } else if (inject.type === 'MANAGER') {
        const worldAsRecord = this.world as unknown as Record<string, unknown>;
        if (worldAsRecord[inject.propertyKey]) {
          systemAsRecord[inject.propertyKey] = worldAsRecord[inject.propertyKey];
        } else {
          const msg = `[ECS Framework] Injection Failed: System '${system.constructor.name}' requested manager '${inject.propertyKey}', but it wasn't found on the World object.`;
          console.error(msg);
          throw new Error(msg);
        }
      }
    }
  }


  /**
   * Topological Sort to resolve @Before and @After dependencies with priority tie-breaking.
   */
  private topologicalSort(systems: BaseSystem[]): BaseSystem[] {
    const adj = new Map<BaseSystem, BaseSystem[]>();
    const inDegree = new Map<BaseSystem, number>();
    const effectivePriority = new Map<BaseSystem, number>();
    const regIndexMap = new Map<BaseSystem, number>();

    systems.forEach((sys, idx) => {
      adj.set(sys, []);
      inDegree.set(sys, 0);
      effectivePriority.set(sys, getSystemPriority(sys));
      regIndexMap.set(sys, idx);
    });

    for (const sys of systems) {
      const order = getSystemOrder(sys);
      const sysName = sys.constructor.name;

      if (order.before.includes(sysName) || order.after.includes(sysName)) {
        const msg = `[ECS] CRITICAL: Circular dependency detected involving ${sysName}`;
        console.error(msg);
        throw new Error(msg);
      }

      for (const other of systems) {
        if (sys === other) continue;
        const otherName = other.constructor.name;

        if (order.after.includes(otherName)) {
          // 'other' must execute BEFORE 'sys' (edge: other -> sys)
          adj.get(other)!.push(sys);
          inDegree.set(sys, (inDegree.get(sys) ?? 0) + 1);
        }

        if (order.before.includes(otherName)) {
          // 'sys' must execute BEFORE 'other' (edge: sys -> other)
          adj.get(sys)!.push(other);
          inDegree.set(other, (inDegree.get(other) ?? 0) + 1);
        }
      }
    }

    // Propagate effective priorities along explicit constraint directives
    const maxPasses = systems.length;
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (const sys of systems) {
        const order = getSystemOrder(sys);
        const prioSys = effectivePriority.get(sys)!;

        for (const other of systems) {
          if (sys === other) continue;
          const otherName = other.constructor.name;
          const prioOther = effectivePriority.get(other)!;

          // @Before: sys must execute before other -> sys priority must be <= other priority
          if (order.before.includes(otherName) && prioSys >= prioOther) {
            effectivePriority.set(sys, prioOther - 0.0001);
            changed = true;
          }

          // @After: sys must execute after other -> sys priority must be >= other priority
          if (order.after.includes(otherName) && prioSys <= prioOther) {
            effectivePriority.set(sys, prioOther + 0.0001);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    // Kahn's algorithm with priority queue
    const ready: BaseSystem[] = [];
    for (const sys of systems) {
      if ((inDegree.get(sys) ?? 0) === 0) {
        ready.push(sys);
      }
    }

    const sorted: BaseSystem[] = [];
    while (ready.length > 0) {
      ready.sort((a, b) => {
        const prioA = effectivePriority.get(a)!;
        const prioB = effectivePriority.get(b)!;
        if (prioA !== prioB) {
          return prioA - prioB;
        }
        return (regIndexMap.get(a) ?? 0) - (regIndexMap.get(b) ?? 0);
      });

      const next = ready.shift()!;
      sorted.push(next);

      for (const neighbor of adj.get(next) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          ready.push(neighbor);
        }
      }
    }

    if (sorted.length < systems.length) {
      const unvisited = systems.find((s) => !sorted.includes(s));
      const sysName = unvisited ? unvisited.constructor.name : "System";
      const msg = `[ECS] CRITICAL: Circular dependency detected involving ${sysName}`;
      console.error(msg);
      throw new Error(msg);
    }

    return sorted;
  }



  /**
   * Retrieves a system instance by its class type.
   * Useful for inter-system communication.
   */
  public get<T extends BaseSystem>(type: SystemConstructor<T>): T | undefined {
    for (const s of this.systems) {
      if (s.constructor === type) return s as T;
    }
    return undefined;
  }


  /**
   * Returns an unmodifiable list of systems registered with the scheduler.
   */
  public getSystems(): readonly BaseSystem[] {
    return this.systems;
  }

  /**
   * Rebinds all registered systems with the world's event bus and observer pipeline.
   * Called during World.clear() to restore active system subscriptions.
   */
  public rebind(): void {
    for (const system of this.systems) {
      this.world.events.register(system);
      system.rebind();
    }
  }

  /**
   * Wipes all systems and triggers their cleanup hooks.
   * Essential for level transitions to prevent observer leaks.
   */
  public clear(): void {
    if (this.removedDuringPass) {
      for (const system of this.systems) {
        this.removedDuringPass.add(system);
      }
    }
    for (const system of this.systems) {
      this.world.events.unregister(system);
      system.cleanup();
    }
    this.systems = [];
  }

  /**
   * Removes a system and triggers its cleanup logic.
   */
  public remove(system: BaseSystem): void {
    const index = this.systems.indexOf(system);
    if (index !== -1) {
      this.world.events.unregister(system);
      system.cleanup();
      this.systems.splice(index, 1);
      if (this.removedDuringPass) {
        this.removedDuringPass.add(system);
      }
    }
  }

  /**
   * Suspends a system by class type or instance.
   */
  public setEnabled<T extends BaseSystem>(type: SystemConstructor<T>, enabled: boolean): void {
    for (const s of this.systems) {
      if (s.constructor === type) {
        s.toggle(enabled); // This now triggers onPause/onResume
      }
    }
  }

  /**
   * Pauses all systems in the scheduler.
   */
  public pauseAll(): void {
    for (const s of this.systems) {
      s.toggle(false);
    }
  }

  /**
   * Resumes all systems in the scheduler.
   */
  public resumeAll(): void {
    for (const s of this.systems) {
      s.toggle(true);
    }
  }

  public update(dt: number): void {
    const startTime = performance.now();
    const systemStats: { name: string, duration: number }[] = [];

    // Track systems added or removed mid-pass to protect iteration boundaries
    this.addedDuringPass = new Set<BaseSystem>();
    this.removedDuringPass = new Set<BaseSystem>();

    // Enter deferred mode to protect system iteration
    this.world.setDeferred(true);

    let systemError: unknown;
    try {
      const systemsToRun = [...this.systems];
      for (const system of systemsToRun) {
        if (
          system.enabled &&
          this.systems.includes(system) &&
          !this.removedDuringPass.has(system) &&
          !this.addedDuringPass.has(system)
        ) {
          const sysStart = performance.now();
          try {
            system.runUpdate(dt);
          } finally {
            systemStats.push({
              name: system.constructor.name,
              duration: performance.now() - sysStart
            });
          }
        }
      }
    } catch (err) {
      systemError = err;
    } finally {
      this.addedDuringPass = null;
      this.removedDuringPass = null;
    }

    let flushError: unknown;
    try {
      // Exit deferred mode and apply all structural changes at once
      this.world.setDeferred(false);
    } catch (err) {
      flushError = err;
    }

    // Update global engine stats singleton
    try {
      if (this.world.hasSingleton(InternalComponents.ENGINE_STATS)) {
        this.world.mutateComponent<EngineStats>(
          this.world.getSingletonEntity(),
          InternalComponents.ENGINE_STATS,
          (stats) => {
            stats.systems = systemStats;
            stats.lastUpdateMs = performance.now() - startTime;
            // Optimization: only update entity counts occasionally or if needed
            stats.archetypes = this.world.getArchetypeCount();
          }
        );
      }
    } catch {
      // Stats recording error should not mask earlier errors
    }

    if (systemError !== undefined) {
      throw systemError;
    }
    if (flushError !== undefined) {
      throw flushError;
    }
  }
}
