import { BaseSystem } from "./System";
import { World } from "./World";
import { InternalComponents, EngineStats } from "./InternalComponents";
import { getSystemOrder, getSystemPriority, getInjectMetadata } from "./Decorators";


export type SystemConstructor<T extends BaseSystem> = { new (...args: never[]): T };

export class Scheduler {
  private systems: BaseSystem[] = [];

  constructor(private world: World) {
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
    // Perform Dependency Injection
    this.injectDependencies(system);
    this.systems.push(system);

    // Resolution: Auto-register systems with the world's event bus
    this.world.events.register(system);
    // Perform a robust sort
    this.systems = this.topologicalSort(this.systems);
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
      } else if (inject.type === 'MANAGER') {
        // NEW: Check if this was marked as a Singleton by the decorator
        if (inject.id !== undefined) {
          const value = this.world.getSingleton(inject.id);

          if (value === undefined) {
            // Hard stop if a required singleton is missing during bootstrap
            const msg = `[ECS Framework] Wiring Failed: System '${system.constructor.name}' required Singleton ID ${inject.id}, but it was not found in the World. Initialized it in your Scene or App bootstrap.`;
            console.error(msg);
            throw new Error(msg);
          }

          systemAsRecord[inject.propertyKey] = value;
          continue;
        }


        // --- MANAGER INJECTION ---
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
   * Pro-level Topological Sort to resolve @Before and @After dependencies.
   */
  private topologicalSort(systems: BaseSystem[]): BaseSystem[] {
    // Pro-Tip: Pre-sort by priority so systems without rules
    // are naturally ordered by their numerical weight.
    const sortedSystems = [...systems].sort((a, b) =>
      getSystemPriority(a) - getSystemPriority(b)
    );

    const sorted: BaseSystem[] = [];
    const visited = new Set<BaseSystem>();
    const temp = new Set<BaseSystem>();

    const visit = (sys: BaseSystem) => {
      if (temp.has(sys)) {
        const msg = `[ECS] CRITICAL: Circular dependency detected involving ${sys.constructor.name}`;
        console.error(msg);
        throw new Error(msg);
      }
      if (visited.has(sys)) return;

      temp.add(sys);

      const order = getSystemOrder(sys);
      const sysName = sys.constructor.name;

      // Check against the priority-ordered list
      for (const other of sortedSystems) {
        const otherName = other.constructor.name;
        const otherOrder = getSystemOrder(other);

        if (order.after.includes(otherName) || otherOrder.before.includes(sysName)) {
          visit(other);
        }
      }

      temp.delete(sys);
      visited.add(sys);
      sorted.push(sys);
    };

    for (const sys of sortedSystems) {
      if (!visited.has(sys)) visit(sys);
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
   * Wipes all systems and triggers their cleanup hooks.
   * Essential for level transitions to prevent observer leaks.
   */
  public clear(): void {
    for (const system of this.systems) {
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
      system.cleanup();
      this.systems.splice(index, 1);
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

    // Enter deferred mode to protect system iteration
    this.world.setDeferred(true);

    for (const system of this.systems) {
      if (system.enabled) {
        const sysStart = performance.now();

        system.runUpdate(dt);

        systemStats.push({
          name: system.constructor.name,
          duration: performance.now() - sysStart
        });
      }
    }

    // Exit deferred mode and apply all structural changes at once
    this.world.setDeferred(false);

    // Update global engine stats singleton
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
}
