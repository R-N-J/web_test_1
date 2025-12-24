import { World } from "./World";
import { Aspect } from "./Aspect";
import { Archetype, EntityId } from "./Archetype";
import { getSystemAspect } from "./Decorators";
import type { MaskObserver } from "./ComponentManager";


export abstract class BaseSystem {
  public enabled = true;

  abstract update(dt: number): void;

  /**
   * Toggles the system's processing state.
   */
  public toggle(state?: boolean): void {
    this.enabled = state !== undefined ? state : !this.enabled;
  }

  /**
   * Called when the system is removed from the world.
   * Use this to unsubscribe from observers or clean up event listeners.
   */
  public cleanup(): void {
    // Optional implementation for subclasses

  }
}
/**
 * An optimized system that iterates over matching Archetypes.
 */

export abstract class IteratingSystem extends BaseSystem {
  protected aspect: Aspect;

  private membership = new Set<EntityId>();
  private readonly maskObserver: MaskObserver;

  constructor(protected world: World, aspect?: Aspect) {
    super();
    this.aspect = aspect || getSystemAspect(this.constructor);

    // Seed membership for already-existing entities (important when loading or building worlds).
    this.initializeMembership();

    // Subscribe to structural changes
    this.maskObserver = (entity, oldMask, newMask) => {
      const oldMatch = this.aspect.matches(oldMask);
      const newMatch = this.aspect.matches(newMask);

      if (oldMatch === newMatch) return;

      if (newMatch) {
        this.membership.add(entity);
        this.onEntityAdded(entity);
      } else {
        this.membership.delete(entity);
        this.onEntityRemoved(entity);
      }
    };

    this.world.subscribeOnMaskChange(this.maskObserver);
  }

  /**
   * Checks if a specific entity currently matches this system's Aspect.
   * This is fast (O(1) Set lookup).
   */
  protected matches(entity: EntityId): boolean {
    return this.membership.has(entity);
  }

  /**
   * Returns the total number of entities currently matched by this system.
   */
  public getMatchedCount(): number {
    return this.membership.size;
  }

  /**
   * Executes a callback for every entity currently matched by this system.
   */
  protected forEach(callback: (entity: EntityId) => void): void {
    for (const entity of this.membership) {
      callback(entity);
    }
  }

  /**
   * Called exactly once when an entity begins matching this system's Aspect.
   */
  protected onEntityAdded(_entity: EntityId): void {}

  /**
   * Called exactly once when an entity stops matching this system's Aspect.
   */
  protected onEntityRemoved(_entity: EntityId): void {}

  /**
   * Iterates the world once to seed the membership set and fire onEntityAdded for existing matches.
   */
  private initializeMembership(): void {
    const archetypes = this.world.getArchetypes(this.aspect);
    for (const arch of archetypes) {
      for (const e of arch.entities) {
        if (!this.membership.has(e)) {
          this.membership.add(e);
          this.onEntityAdded(e);
        }
      }
    }
  }

  /**
   * Ensure we unsubscribe to avoid leaks when systems are removed from the Scheduler.
   */
  public override cleanup(): void {
    this.world.unsubscribeOnMaskChange(this.maskObserver);
    super.cleanup();
  }

  /**
   * Shortcut to get component data from the world.
   */
  protected getComponent<T>(entity: number, id: number): T | undefined {
    return this.world.getComponent<T>(entity, id);
  }

  /**
   * Checks if an entity has a specific component.
   */
  protected hasComponent(entity: number, id: number): boolean {
    return this.world.hasComponent(entity, id);
  }

  /**
   * Non-structural write (no archetype move).
   */
  protected setComponent<T>(entity: number, id: number, value: T): boolean {
    return this.world.setComponent(entity, id, value);
  }

  /**
   * Non-structural update (no archetype move).
   */
  protected updateComponent<T>(entity: number, id: number, updater: (current: T) => T): boolean {
    return this.world.updateComponent(entity, id, updater);
  }

  /**
   * Non-structural mutation (no archetype move).
   */
  protected mutateComponent<T>(entity: number, id: number, mutator: (value: T) => void): boolean {
    return this.world.mutateComponent(entity, id, mutator);
  }


  /**
   * The core loop. It avoids checking every entity by processing
   * pre-filtered chunks of memory (Archetypes).
   */
  update(dt: number): void {
    if (!this.enabled) return;

    const matchingArchetypes = this.world.getArchetypes(this.aspect);
    for (const arch of matchingArchetypes) {
      this.processArchetype(arch, dt);
    }
  }

  /**
   * Optimized: Processes an entire chunk of memory (Archetype) at once.
   * High-performance systems can override this to fetch raw columns.
   */
  protected processArchetype(arch: Archetype, dt: number): void {
    const entities = arch.entities;
    const count = entities.length;

    for (let i = 0; i < count; i++) {
      this.processEntity(entities[i], dt);
    }
  }

  abstract processEntity(entity: number, dt: number): void;
}

/**
 * A system that processes entities at a fixed time interval.
 */
export abstract class IntervalSystem extends IteratingSystem {
  private accumulator = 0;

  constructor(world: World, aspect: Aspect, protected interval: number) {
    super(world, aspect);
  }

  update(dt: number): void {
    this.accumulator += dt;
    if (this.accumulator >= this.interval) {
      super.update(this.accumulator);
      this.accumulator = 0;
    }
  }
}

/**
 * A system that sorts entities before processing them.
 */
export abstract class SortedIteratingSystem extends IteratingSystem {
  abstract sort(a: number, b: number): number;

  update(dt: number): void {
    if (!this.enabled) return;

    const archetypes = this.world.getArchetypes(this.aspect);
    const allEntities: number[] = [];

    // Gather all matching entities across archetypes
    for (const arch of archetypes) {
      allEntities.push(...arch.entities);
    }

    // Sort the entire collection
    allEntities.sort((a, b) => this.sort(a, b));

    // Process in sorted order
    for (const entity of allEntities) {
      this.processEntity(entity, dt);
    }
  }
}

/**
 * A system that doesn't run in the main loop.
 * It's called manually or by events (e.g., DamageSystem.process(entity, 10)).
 */
export abstract class PassiveSystem extends BaseSystem {
  update(_dt: number): void { /* Passive: doesn't update on tick */ }
}

/**
 * Executes logic once after a delay.
 */
export class DelayedAction {
  constructor(public delay: number, public action: () => void) {}
}

export class TimeManager extends BaseSystem {
  private actions: DelayedAction[] = [];

  public delay(ms: number, callback: () => void): void {
    this.actions.push(new DelayedAction(ms / 1000, callback));
  }

  update(dt: number): void {
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const a = this.actions[i];
      a.delay -= dt;
      if (a.delay <= 0) {
        a.action();
        this.actions.splice(i, 1);
      }
    }
  }
}





