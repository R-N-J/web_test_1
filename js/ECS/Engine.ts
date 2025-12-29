import { World } from "./World";
import { Scheduler } from "./Scheduler";
import { BaseSystem } from "./System";
import { ComponentId } from "./Archetype";
import { bootstrapEcs } from "./ComponentRegistry";
import { Scene } from "./Scene";
import { PrefabDefinition } from "./PrefabManager";
import { Director } from "./Director";


export interface EngineConfiguration {
  components: Record<string, ComponentId>;
  systems: { new (world: World): BaseSystem }[];
  director?: { new (world: World): Director };
  prefabs?: PrefabDefinition[];
  assets?: { key: string, url: string, type: 'JSON' | 'AUDIO' }[]; // Asset manifest
}

/**
 * The 'Framework' wrapper. This class manages the
 * lifecycle and discovery of systems and data.
 */
export class Engine {
  public readonly world: World;
  public readonly scheduler: Scheduler;
  private initPromise: Promise<void> | null = null;
  public director?: Director; // Access to the active director

  constructor(config: EngineConfiguration) {
    console.log(`[ECS Framework] Initializing...`);

    this.world = new World();
    this.scheduler = new Scheduler(this.world);
    this.world.setScheduler(this.scheduler);

    // 1. Discovery: Data Schema
    // We wrap this in a try/catch because if ComponentRegistry throws a collision error,
    // we want to ensure it has the [ECS Framework] tag in the console.
    try {
      bootstrapEcs(this.world, config.components);
      console.log(`[ECS Framework] ${Object.keys(config.components).length} components registered.`);
    } catch (e) {
      console.error(`[ECS Framework] CRITICAL: Data Schema registration failed. Check your Component IDs for collisions.`, e);
      throw e;
    }

    // 2. Discovery: Prefabs
    if (config.prefabs) {
      this.world.prefabs.registerAll(config.prefabs);
      console.log(`[ECS Framework] ${config.prefabs.length} prefabs discovered.`);
    }

    // 3. Discovery: Assets (Parallel async loading)
    const assetPromises: Promise<unknown>[] = [];
    if (config.assets) {
      console.log(`[ECS Framework] Loading ${config.assets.length} assets...`);
      for (const asset of config.assets) {
        if (asset.type === 'JSON') {
          // Fire off the requests. We don't await here to keep startup fast (parallel loading).
          assetPromises.push(this.world.assets.loadJson(asset.key, asset.url).catch(() => {}));
        } else if (asset.type === 'AUDIO') {
          assetPromises.push(this.world.assets.loadAudio(asset.key, asset.url).catch(() => {}));
        }
      }
    }

    // Store the aggregate promise so the user can 'await engine.whenReady()'
    this.initPromise = assetPromises.length > 0
      ? Promise.all(assetPromises).then(() => console.log(`[ECS Framework] All assets loaded.`))
      : Promise.resolve(); // If no assets, we are ready immediately


    // 4. Discovery: Director (The Brain)
    if (config.director) {
      try {
        this.director = new config.director(this.world);
        this.scheduler.add(this.director);
        console.log(`[ECS Framework] Director '${config.director.name}' initialized.`);
      } catch (e) {
        const msg = `[ECS Framework] CRITICAL: Failed to initialize Director '${config.director.name}'.`;
        console.error(msg, e);
        throw new Error(msg);
      }
    }


    // 5. Discovery: Systems (The Logic)
    // This is the most important try/catch. It catches errors in the system constructors
    // or failed @Inject dependencies and identifies exactly which system failed.
    for (const SystemClass of config.systems) {
      try {
        const systemInstance = new SystemClass(this.world);
        this.scheduler.add(systemInstance);
      } catch (e) {
        const msg = `[ECS Framework] CRITICAL: Failed to instantiate system '${SystemClass.name}'. Check for missing @Inject dependencies, circular dependencies, or constructor errors.`;
        console.error(msg, e);
        throw new Error(msg);
      }
    }
    console.log(`[ECS Framework] ${config.systems.length} systems active and topologically sorted.`);
  }

  /**
   * Use this in your main entry point to ensure the engine is fully populated
   * before starting the first scene.
   */
  public async whenReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    console.log(`[ECS Framework] Engine ready.`);
  }

  public start(initialScene: Scene): void {
    if (this.world.assets && !this.world.assets.isReady) {
      console.warn(`[ECS Framework] WARNING: engine.start() called before engine.whenReady(). Some assets may not be available yet.`);
    }
    console.log(`[ECS Framework] Starting Scene: ${initialScene.name}`);
    this.world.scenes?.switchTo(initialScene);
  }

  public update(dt: number = 1.0): void {
    this.scheduler.update(dt);
  }
}
