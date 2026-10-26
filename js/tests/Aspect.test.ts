import assert from "node:assert/strict";
import { Aspect } from "../ECS/Aspect";
import { World } from "../ECS/World";
import { QueryManager } from "../ECS/QueryManager";
import { Archetype } from "../ECS/Archetype";
import { One, All, Match, getSystemAspect } from "../ECS/Decorators";

/**
 * Basic tests for the Aspect bitmask matching logic.
 */
export function testAspects() {
  console.log("Running Aspect tests...");

  const COMP_A = 101;
  const COMP_B = 102;
  const COMP_C = 103;
  const COMP_D = 104;
  const COMP_E = 105;
  const COMP_F = 106;

  const bA = 1n << BigInt(COMP_A);
  const bB = 1n << BigInt(COMP_B);
  const bC = 1n << BigInt(COMP_C);
  const bD = 1n << BigInt(COMP_D);
  const bE = 1n << BigInt(COMP_E);
  const bF = 1n << BigInt(COMP_F);

  // Test: All
  const aspectAll = Aspect.all(COMP_A, COMP_B);
  const maskAB = bA | bB;
  const maskABC = maskAB | bC;
  const maskA = bA;

  assert.strictEqual(aspectAll.matches(maskAB), true, "Should match exactly A and B");
  assert.strictEqual(aspectAll.matches(maskABC), true, "Should match A, B, and extra C");
  assert.strictEqual(aspectAll.matches(maskA), false, "Should not match only A");

  // Test: One
  const aspectOne = Aspect.one(COMP_A, COMP_B);
  assert.strictEqual(aspectOne.matches(maskA), true, "Should match only A");
  assert.strictEqual(aspectOne.matches(maskAB), true, "Should match both A and B");
  assert.strictEqual(aspectOne.matches(bC), false, "Should not match only C");

  // Test: Exclude
  const aspectExclude = Aspect.exclude(COMP_C);
  assert.strictEqual(aspectExclude.matches(maskAB), true, "Should match AB without C");
  assert.strictEqual(aspectExclude.matches(maskABC), false, "Should not match if C is present");

  // Test: Complex Combination
  const complex = Aspect.all(COMP_A).one(COMP_B, COMP_C).butNot(COMP_D);
  assert.strictEqual(complex.matches(maskAB), true, "Should match A and B");
  assert.strictEqual(complex.matches(maskA | bD), false, "Should exclude 4");
  assert.strictEqual(complex.matches(maskA), false, "Should require one of B or C");

  // ==========================================
  // Task 9 Regression Tests
  // ==========================================

  // 1. Aspect.one(A, B).and(Aspect.one(C, D)) matches entities with at least one from each group
  const oneAB_and_oneCD = Aspect.one(COMP_A, COMP_B).and(Aspect.one(COMP_C, COMP_D));
  assert.strictEqual(oneAB_and_oneCD.matches(bA | bC), true, "Should match A and C");
  assert.strictEqual(oneAB_and_oneCD.matches(bA | bD), true, "Should match A and D");
  assert.strictEqual(oneAB_and_oneCD.matches(bB | bC), true, "Should match B and C");
  assert.strictEqual(oneAB_and_oneCD.matches(bB | bD), true, "Should match B and D");
  assert.strictEqual(oneAB_and_oneCD.matches(bA | bB | bC | bD), true, "Should match A, B, C, and D");

  // 2. Entity containing only A or B does NOT match Aspect.one(A, B).and(Aspect.one(C, D))
  assert.strictEqual(oneAB_and_oneCD.matches(bA), false, "Should not match entity with only A");
  assert.strictEqual(oneAB_and_oneCD.matches(bB), false, "Should not match entity with only B");
  assert.strictEqual(oneAB_and_oneCD.matches(bA | bB), false, "Should not match entity with only A and B");

  // 3. Entity containing only C or D does NOT match Aspect.one(A, B).and(Aspect.one(C, D))
  assert.strictEqual(oneAB_and_oneCD.matches(bC), false, "Should not match entity with only C");
  assert.strictEqual(oneAB_and_oneCD.matches(bD), false, "Should not match entity with only D");
  assert.strictEqual(oneAB_and_oneCD.matches(bC | bD), false, "Should not match entity with only C and D");

  // 4. Combinations with all(), exclude(), butNot()
  const allA_oneBC_exclD = Aspect.all(COMP_A).and(Aspect.one(COMP_B, COMP_C)).and(Aspect.exclude(COMP_D));
  assert.strictEqual(allA_oneBC_exclD.matches(bA | bB), true, "Should match A and B without D");
  assert.strictEqual(allA_oneBC_exclD.matches(bA | bC), true, "Should match A and C without D");
  assert.strictEqual(allA_oneBC_exclD.matches(bA | bB | bD), false, "Should not match when excluded D is present");
  assert.strictEqual(allA_oneBC_exclD.matches(bB), false, "Should not match when required A is missing");
  assert.strictEqual(allA_oneBC_exclD.matches(bA), false, "Should not match when oneOf(B, C) is missing");

  const combinedExcludes = Aspect.exclude(COMP_A).and(Aspect.exclude(COMP_B));
  assert.strictEqual(combinedExcludes.matches(bC), true, "Should match C");
  assert.strictEqual(combinedExcludes.matches(bA), false, "Should exclude A");
  assert.strictEqual(combinedExcludes.matches(bB), false, "Should exclude B");
  assert.strictEqual(combinedExcludes.matches(bA | bB), false, "Should exclude A and B");

  const combinedAlls = Aspect.all(COMP_A).and(Aspect.all(COMP_B));
  assert.strictEqual(combinedAlls.matches(bA | bB), true, "Should match A and B");
  assert.strictEqual(combinedAlls.matches(bA), false, "Should not match only A");
  assert.strictEqual(combinedAlls.matches(bB), false, "Should not match only B");

  // 5. Static constructors, fluent composition, and combinations of 3+ aspects
  const fluentThreeOneGroups = Aspect.one(COMP_A, COMP_B).one(COMP_C, COMP_D).one(COMP_E, COMP_F);
  assert.strictEqual(fluentThreeOneGroups.matches(bA | bC | bE), true, "Should match A, C, E");
  assert.strictEqual(fluentThreeOneGroups.matches(bB | bD | bF), true, "Should match B, D, F");
  assert.strictEqual(fluentThreeOneGroups.matches(bA | bC), false, "Should not match missing third group (E/F)");
  assert.strictEqual(fluentThreeOneGroups.matches(bA | bE), false, "Should not match missing second group (C/D)");
  assert.strictEqual(fluentThreeOneGroups.matches(bC | bE), false, "Should not match missing first group (A/B)");

  const andThreeOneGroups = Aspect.one(COMP_A, COMP_B)
    .and(Aspect.one(COMP_C, COMP_D))
    .and(Aspect.one(COMP_E, COMP_F));
  assert.strictEqual(andThreeOneGroups.matches(bA | bC | bE), true, "and() 3 groups: should match A, C, E");
  assert.strictEqual(andThreeOneGroups.matches(bA | bC), false, "and() 3 groups: should not match missing third group");

  const complexFluentAnd = Aspect.all(COMP_A)
    .and(Aspect.one(COMP_B, COMP_C))
    .and(Aspect.one(COMP_D, COMP_E))
    .butNot(COMP_F);
  assert.strictEqual(complexFluentAnd.matches(bA | bB | bD), true, "Should match A, B, D without F");
  assert.strictEqual(complexFluentAnd.matches(bA | bB | bD | bF), false, "Should exclude F");
  assert.strictEqual(complexFluentAnd.matches(bA | bB), false, "Should require group D/E");

  // 6. Explicit behavior of empty all(), one(), and exclude() requirements
  // Empty Aspect / EMPTY: matches all entities (no constraints)
  assert.strictEqual(Aspect.EMPTY.matches(0n), true, "EMPTY matches empty mask");
  assert.strictEqual(Aspect.EMPTY.matches(bA | bB), true, "EMPTY matches populated mask");

  // Empty all(): 0 required components -> satisfied by all entities
  const emptyAll = Aspect.all();
  assert.strictEqual(emptyAll.matches(0n), true, "Aspect.all() matches empty mask");
  assert.strictEqual(emptyAll.matches(bA), true, "Aspect.all() matches populated mask");

  // Empty exclude(): 0 excluded components -> satisfied by all entities
  const emptyExclude = Aspect.exclude();
  assert.strictEqual(emptyExclude.matches(0n), true, "Aspect.exclude() matches empty mask");
  assert.strictEqual(emptyExclude.matches(bA), true, "Aspect.exclude() matches populated mask");

  // Empty one(): requiring at least one component from empty set -> unsatisfiable / matches nothing
  const emptyOne = Aspect.one();
  assert.strictEqual(emptyOne.matches(0n), false, "Aspect.one() cannot match empty mask");
  assert.strictEqual(emptyOne.matches(bA | bB), false, "Aspect.one() cannot match populated mask");

  // Empty requirements combined with existing aspects
  assert.strictEqual(Aspect.all(COMP_A).and(Aspect.all()).matches(bA), true, "Aspect.all(A).and(Aspect.all()) matches A");
  assert.strictEqual(Aspect.all(COMP_A).and(Aspect.all()).matches(0n), false, "Aspect.all(A).and(Aspect.all()) requires A");
  assert.strictEqual(Aspect.all(COMP_A).and(Aspect.exclude()).matches(bA), true, "Aspect.all(A).and(Aspect.exclude()) matches A");
  assert.strictEqual(Aspect.all(COMP_A).and(Aspect.one()).matches(bA), false, "Aspect.all(A).and(Aspect.one()) is unsatisfiable");
  assert.strictEqual(Aspect.all(COMP_A).one().matches(bA), false, "Aspect.all(A).one() is unsatisfiable");

  // 7. World queries and cache key separation
  const world = new World();
  world.registerComponent(COMP_A);
  world.registerComponent(COMP_B);
  world.registerComponent(COMP_C);
  world.registerComponent(COMP_D);

  const eOnlyA = world.buildEntity().with(COMP_A, {}).commit();
  const eOnlyC = world.buildEntity().with(COMP_C, {}).commit();
  const eAC = world.buildEntity().with(COMP_A, {}).with(COMP_C, {}).commit();
  const eBD = world.buildEntity().with(COMP_B, {}).with(COMP_D, {}).commit();

  const queryComposite = Aspect.one(COMP_A, COMP_B).and(Aspect.one(COMP_C, COMP_D));
  const matchedEntities = world.getEntities(queryComposite);
  assert.strictEqual(matchedEntities.includes(eAC), true, "World query: should match eAC");
  assert.strictEqual(matchedEntities.includes(eBD), true, "World query: should match eBD");
  assert.strictEqual(matchedEntities.includes(eOnlyA), false, "World query: should NOT match eOnlyA");
  assert.strictEqual(matchedEntities.includes(eOnlyC), false, "World query: should NOT match eOnlyC");
  assert.strictEqual(matchedEntities.length, 2, "World query: should match exactly 2 entities");

  // Cache distinction: Aspect.one(A,B,C,D) vs Aspect.one(A,B).and(Aspect.one(C,D))
  const queryUnion = Aspect.one(COMP_A, COMP_B, COMP_C, COMP_D);
  const unionMatches = world.getEntities(queryUnion);
  assert.strictEqual(unionMatches.length, 4, "Aspect.one(A,B,C,D) should match all 4 entities with any of A,B,C,D");
  assert.strictEqual(world.getEntities(queryComposite).length, 2, "Aspect.one(A,B).and(Aspect.one(C,D)) must not collide with union query in cache");

  // 8. Canonical constructor with oneMasks array representation
  const canonicalSingleOne = new Aspect(bA, [bB], bC);
  assert.strictEqual(canonicalSingleOne.allMask, bA, "Canonical constructor allMask should match");
  assert.deepStrictEqual(canonicalSingleOne.oneMasks, [bB], "Canonical constructor oneMasks should contain single mask");
  assert.strictEqual(canonicalSingleOne.excludeMask, bC, "Canonical constructor excludeMask should match");
  assert.strictEqual(canonicalSingleOne.matches(bA | bB), true, "Canonical aspect should match entity having all and one");
  assert.strictEqual(canonicalSingleOne.matches(bA), false, "Canonical aspect should not match entity missing one");
  assert.strictEqual(canonicalSingleOne.matches(bA | bB | bC), false, "Canonical aspect should exclude entity with excludeMask");

  // Empty oneMasks array in canonical constructor imposes no disjunctive constraint
  const canonicalEmptyOne = new Aspect(bA, [], bC);
  assert.deepStrictEqual(canonicalEmptyOne.oneMasks, [], "Canonical constructor with [] oneMasks should have empty array");
  assert.strictEqual(canonicalEmptyOne.matches(bA), true, "Canonical constructor with [] oneMasks imposes no one requirement");
  assert.strictEqual(canonicalEmptyOne.matches(bA | bC), false, "Canonical constructor with [] oneMasks still excludes excludeMask");

  // Multiple independent oneMasks clauses in canonical constructor
  const canonicalMultiOne = new Aspect(bA, [bB | bC, bD | bE], bF);
  assert.strictEqual(canonicalMultiOne.allMask, bA, "Canonical multi-one allMask should match");
  assert.deepStrictEqual(canonicalMultiOne.oneMasks, [bB | bC, bD | bE], "Canonical multi-one oneMasks should contain both clauses");
  assert.strictEqual(canonicalMultiOne.excludeMask, bF, "Canonical multi-one excludeMask should match");
  assert.strictEqual(canonicalMultiOne.matches(bA | bB | bD), true, "Matches entity with A, B, and D");
  assert.strictEqual(canonicalMultiOne.matches(bA | bC | bE), true, "Matches entity with A, C, and E");
  assert.strictEqual(canonicalMultiOne.matches(bA | bB), false, "Fails when missing second oneMask clause");
  assert.strictEqual(canonicalMultiOne.matches(bA | bD), false, "Fails when missing first oneMask clause");
  assert.strictEqual(canonicalMultiOne.matches(bA | bB | bD | bF), false, "Fails when excluded component F is present");

  // Normalization, deduplication, sorting, and immutability of oneMasks
  const unnormalizedAspect = new Aspect(0n, [bC, bB, bC, bA], 0n);
  assert.deepStrictEqual(unnormalizedAspect.oneMasks, [bA, bB, bC], "oneMasks should be deduplicated and sorted in ascending order");
  assert.strictEqual(Object.isFrozen(unnormalizedAspect.oneMasks), true, "oneMasks array must be frozen");

  // 9. Query caching invalidation and archetype registration safety
  world.registerComponent(COMP_E);
  // Execute initial query to populate activeAspects and queryCache
  const initialA = world.getEntities(Aspect.all(COMP_A));
  assert.strictEqual(initialA.length, 2, "Initial query should find 2 entities with COMP_A");

  // Invalidate query cache via internal queries manager
  (world as unknown as { queries: QueryManager }).queries.invalidateCache();

  // Register a new archetype while cache was invalidated
  const eAE = world.buildEntity().with(COMP_A, {}).with(COMP_E, {}).commit();

  // Re-query after archetype registration must succeed without TypeError and reflect the new entity
  const updatedA = world.getEntities(Aspect.all(COMP_A));
  assert.strictEqual(updatedA.includes(eAE), true, "Re-queried aspect must include entity from newly registered archetype");
  assert.strictEqual(updatedA.length, 3, "Re-queried aspect must find 3 entities with COMP_A");

  // Standalone QueryManager isolation test: verify registerArchetype after invalidateCache without prior query recomputation
  const qm = new QueryManager();
  const arch1 = new Archetype(bA, [COMP_A]);
  const arch2 = new Archetype(bA | bE, [COMP_A, COMP_E]);
  const archetypesList = [arch1];
  assert.strictEqual(qm.getArchetypes(Aspect.all(COMP_A), archetypesList.values()).length, 1);
  qm.invalidateCache();
  // Registering archetype while cache is invalidated must not throw
  assert.doesNotThrow(() => {
    qm.registerArchetype(arch2);
  }, "registerArchetype must not throw when cache is invalidated");
  archetypesList.push(arch2);
  assert.strictEqual(qm.getArchetypes(Aspect.all(COMP_A), archetypesList.values()).length, 2);

  // 10. Decorator aspect injection with multiple disjunctive clauses
  @One(COMP_A, COMP_B)
  @One(COMP_C, COMP_D)
  class MultiOneSystem {}

  const multiOneAspect = getSystemAspect(MultiOneSystem);
  assert.strictEqual(multiOneAspect.oneMasks.length, 2, "Decorator must record 2 separate oneMasks clauses");
  assert.strictEqual(multiOneAspect.matches(bA | bC), true, "Decorated system aspect should match entity with A and C");
  assert.strictEqual(multiOneAspect.matches(bA), false, "Decorated system aspect should not match entity with only A");

  @All(COMP_A)
  @Match(Aspect.one(COMP_B, COMP_C).and(Aspect.one(COMP_D, COMP_E)))
  class MatchedAspectSystem {}

  const matchedAspect = getSystemAspect(MatchedAspectSystem);
  assert.strictEqual(matchedAspect.allMask, bA, "Matched aspect should preserve allMask");
  assert.strictEqual(matchedAspect.oneMasks.length, 2, "Matched aspect should preserve both disjunctive groups");
  assert.strictEqual(matchedAspect.matches(bA | bB | bD), true, "Matched aspect should match A, B, and D");
  assert.strictEqual(matchedAspect.matches(bA | bB), false, "Matched aspect should not match when missing D/E group");

  // 11. Decorator metadata inheritance isolation across subclasses
  @All(COMP_A)
  @One(COMP_B)
  class BaseSystem {}

  @One(COMP_C)
  class SubSystem extends BaseSystem {}

  const baseAspect = getSystemAspect(BaseSystem);
  const subAspect = getSystemAspect(SubSystem);

  assert.strictEqual(baseAspect.allMask, bA, "Base system aspect has allMask A");
  assert.strictEqual(baseAspect.oneMasks.length, 1, "Base system aspect has 1 oneMask group");
  assert.strictEqual(baseAspect.oneMasks[0], bB, "Base system aspect oneMask is B");

  assert.strictEqual(subAspect.allMask, bA, "Sub system inherits allMask A");
  assert.strictEqual(subAspect.oneMasks.length, 2, "Sub system has 2 oneMask groups (B and C)");
  assert.strictEqual(subAspect.oneMasks[0], bB, "Sub system retains inherited B");
  assert.strictEqual(subAspect.oneMasks[1], bC, "Sub system has added C");

  // Verify parent array was not mutated by subclass decorator
  assert.strictEqual(baseAspect.oneMasks.length, 1, "Base system oneMasks array was not mutated by subclass");

  // 12. End-to-end verification of empty Aspect.one() in World queries
  const emptyOneResults = world.getEntities(Aspect.one());
  assert.strictEqual(emptyOneResults.length, 0, "world.getEntities(Aspect.one()) must return 0 entities");
  assert.strictEqual(world.count(Aspect.one()), 0, "world.count(Aspect.one()) must return 0");
  assert.strictEqual(world.findFirst(Aspect.one()), undefined, "world.findFirst(Aspect.one()) must return undefined");

  // Composed empty one in world queries
  const composedEmptyOne = Aspect.all(COMP_A).and(Aspect.one());
  assert.strictEqual(world.getEntities(composedEmptyOne).length, 0, "world.getEntities(Aspect.all(A).and(Aspect.one())) must return 0 entities");
  const fluentEmptyOne = Aspect.all(COMP_A).one();
  assert.strictEqual(world.getEntities(fluentEmptyOne).length, 0, "world.getEntities(Aspect.all(A).one()) must return 0 entities");

  // Ensure unconstrained queries remain functional and separate in query cache
  assert.strictEqual(world.getEntities(Aspect.all(COMP_A)).length, 3, "Unconstrained Aspect.all(COMP_A) query remains intact in cache");

  console.log("Aspect tests completed!");
}

if (require.main === module) {
  testAspects();
}
