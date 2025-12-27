import { World } from "./World";
import { Aspect } from "./Aspect";
import { Archetype, EntityId } from "./Archetype";
import { getSystemAspect, getSystemInterval, getSystemGroup, getSystemTag } from "./Decorators";
import type { MaskObserver } from "./ComponentManager";


export abstract class BaseSystem {
  public enabled = true;
  private _initialized = false; // Track first run

  abstract update(dt: number): void;

  /**
   * Internal wrapper to ensure onEnable is called before the first update.
   */
  public runUpdate(dt: number): void {
    if (!this.enabled) return;

    if (!this._initialized) {
      this.onEnable();
      this._initialized = true;
    }

    this.update(dt);
  }

  /** Hook for one-time setup that requires the World to be fully populated. */
  protected onEnable(): void {}

  /**
   * Toggles the system's processing state and triggers lifecycle hooks.
   */
  public toggle(state?: boolean): void {
    const newState = state !== undefined ? state : !this.enabled;
    if (this.enabled === newState) return;

    this.enabled = newState;
    if (this.enabled) {
      this.onResume();
    } else {
      this.onPause();
    }
  }

  /** Called when the system is enabled/resumed. */
  protected onResume(): void {}

  /** Called when the system is disabled/paused. */
  protected onPause(): void {}


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
  protected requiredGroup?: string;
  protected requiredTag?: string;


  private readonly maskObserver: MaskObserver;

  constructor(protected world: World, aspect?: Aspect) {
    super();
    this.aspect = aspect || getSystemAspect(this.constructor);
    this.requiredGroup = getSystemGroup(this.constructor);
    this.requiredTag = getSystemTag(this.constructor);


    // Remove the initializeMembership. Now the system subscribes to mask changes instead.
    // We still subscribe to structural changes, but ONLY to trigger hooks
    // like onEntityAdded/Removed. We no longer maintain a local 'membership' Set.
    this.maskObserver = (entity, oldMask, newMask) => {
      const oldMatch = this.aspect.matches(oldMask);
      const newMatch = this.aspect.matches(newMask);

      if (oldMatch === newMatch) return;

      if (newMatch) {
        this.onEntityAdded(entity);
      } else {
        this.onEntityRemoved(entity);
      }
    };

    this.world.subscribeOnMaskChange(this.maskObserver);
  }

  /**
   * Checks if a specific entity currently matches this system's Aspect.
   * Now uses the world's mask for a live check.
   */
  protected matches(entity: EntityId): boolean {
    return this.world.matches(entity, this.aspect);
  }

  /**
   * Returns the total number of entities currently matched by this system.
   * Calculated on-demand by summing matching archetype lengths.
   */
  public getMatchedCount(): number {
    let count = 0;
    for (const arch of this.world.getArchetypes(this.aspect)) {
      count += arch.entities.length;
    }
    return count;
  }


  /**
   * Executes a callback for every entity currently matched by this system.
   */
  protected forEach(callback: (entity: EntityId) => void): void {
    for (const arch of this.world.getArchetypes(this.aspect)) {
      const entities = arch.entities;
      for (let i = 0; i < entities.length; i++) {
        callback(entities[i]);
      }
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
   * Shortcut to get a global singleton component.
   */
  protected getSingleton<T>(id: number): T | undefined {
    return this.world.getSingleton<T>(id);
  }

  /**
   * Shortcut to check if a global singleton component exists.
   */
  protected hasSingleton(id: number): boolean {
    return this.world.hasSingleton(id);
  }

  /**
   * The core loop. It avoids checking every entity by processing
   * pre-filtered chunks of memory (Archetypes).
   */
  update(dt: number): void {
    if (!this.enabled) return;

    if (this.requiredTag) {
      for (const entity of this.world.viewTag(this.requiredTag)) {
        if (this.world.matches(entity, this.aspect)) this.processEntity(entity, dt);
      }
    } else if (this.requiredGroup) {
      for (const entity of this.world.viewGroup(this.requiredGroup)) {
        if (this.world.matches(entity, this.aspect)) this.processEntity(entity, dt);
      }
    } else {
      const matchingArchetypes = this.world.getArchetypes(this.aspect);
      for (const arch of matchingArchetypes) {
        // Efficiency fix: skip archetypes that have been cleared but not yet garbage collected
        if (arch.entities.length === 0) continue;
        this.processArchetype(arch, dt);
      }
    }
  }

  /**
   * Optimized: Processes an entire chunk of memory (Archetype) at once.
   * for High Performance, Override this if you want to use world.viewColumnsStrict to fetch raw columns.
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
  protected interval: number;

  constructor(world: World, aspect?: Aspect, interval?: number) {
    super(world, aspect);
    // Use 'interval' if provided, otherwise check decorator metadata
    this.interval = interval ?? getSystemInterval(this.constructor) ?? 1;
  }

  update(dt: number): void {
    this.accumulator += dt;
    if (this.accumulator >= this.interval) {   // It has been 'interval' number of turns!
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







