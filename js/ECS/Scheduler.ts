import { BaseSystem } from "./System";

export type SystemConstructor<T extends BaseSystem> = { new (...args: never[]): T };

export class Scheduler {
  private systems: BaseSystem[] = [];

  public add(system: BaseSystem): void {
    this.systems.push(system);
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
   * Removes a system and triggers its cleanup logic.
   // ... existing code ...
   public setEnabled<T extends BaseSystem>(type: SystemConstructor<T>, enabled: boolean): void {
   const system = this.get(type);
   if (system) system.toggle(enabled);
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
        s.toggle(enabled);
      }
    }
  }

  public update(dt: number): void {
    for (const system of this.systems) {
      if (system.enabled) {
        system.update(dt);
      }
    }
  }
}
