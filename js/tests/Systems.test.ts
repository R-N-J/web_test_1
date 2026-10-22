import assert from "node:assert/strict";
import { World } from "../ECS/World";
import { Scheduler } from "../ECS/Scheduler";
import { IteratingSystem, BaseSystem } from "../ECS/System";
import { All, Inject, After, Priority } from "../ECS/Decorators";
import { Aspect } from "../ECS/Aspect";

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
  private _posMapper: any;
  @Inject(POSITION)
  public set positionMapper(val: any) { this._posMapper = val; }
  public get positionMapper() { return this._posMapper; }

  public logCount = 0;

  public override update(_dt: number): void {
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
  // @ts-ignore - accessing protected property for test
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
  // @ts-ignore - accessing private property for test
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

  console.log("Systems & Decorators tests completed!");
}

if (require.main === module) {
  testSystems();
}
