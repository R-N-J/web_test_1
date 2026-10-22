import { World } from "../ECS/World";
import { Aspect } from "../ECS/Aspect";

/**
 * Basic tests for the World class and entity management.
 */
export function testWorld() {
  console.log("Running World tests...");

  const world = new World();
  const COMP_A = 100;
  const COMP_B = 101;

  world.registerComponent(COMP_A);
  world.registerComponent(COMP_B);

  // Test: Entity creation
  const e1 = world.createEntity();
  console.assert(world.isValid(e1) === true, "Entity e1 should be valid");

  // Test: Adding components
  world.addComponent(e1, COMP_A, { value: "A" });
  console.assert(world.hasComponent(e1, COMP_A) === true, "e1 should have COMP_A");

  // Test: Aspect views
  const aspectA = Aspect.all(COMP_A);
  const viewA = world.getEntities(aspectA);
  console.assert(viewA.length === 1, "View A should have one entity");
  console.assert(viewA[0] === e1, "Entity in view A should be e1");

  // Test: Aspect views with multiple entities
  const e2 = world.createEntity();
  world.addComponent(e2, COMP_A, { value: "A2" });
  world.addComponent(e2, COMP_B, { value: "B2" });

  const aspectAB = Aspect.all(COMP_A, COMP_B);
  const viewAB = world.getEntities(aspectAB);
  console.assert(viewAB.length === 1, "View AB should have one entity");
  console.assert(viewAB[0] === e2, "Entity in view AB should be e2");

  // Test: Removal
  world.removeComponent(e2, COMP_B);
  console.assert(world.hasComponent(e2, COMP_B) === false, "e2 should no longer have COMP_B");
  console.assert(world.getEntities(aspectAB).length === 0, "View AB should now be empty");

  // Test: Entity deletion
  world.deleteEntity(e1);
  console.assert(world.isValid(e1) === false, "e1 should now be invalid");
  console.assert(world.getEntities(aspectA).length === 1, "View A should now only have e2");

  console.log("World tests completed!");
}

if (require.main === module) {
  testWorld();
}
