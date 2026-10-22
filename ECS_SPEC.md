# ECS Specification — Rogue1

**Status:** Draft — requirements proposed; implementation not yet verified
**Language:** TypeScript
**Primary application:** Turn-based, text-based roguelike
**Architecture:** Entity-Component-System (ECS), archetype-based storage, Struct-of-Arrays (SoA)

## 1. Purpose

This document defines the required behavior, correctness guarantees, and testing criteria for the Rogue1 ECS framework.

The ECS is intended to support a turn-based roguelike with entities such as players, monsters, items, projectiles, doors, traps, and dungeon features. Entities are composed from data-only components, and systems implement game logic by querying and processing entities.

The framework draws inspiration from Artemis-ODB, but **correctness and the needs of this TypeScript project take precedence over exact feature parity with Artemis-ODB**.

This specification is the source of truth for intended behavior. The implementation and `ECS_GUIDE.md` must be checked against it.

### 1.1 Priorities

1. **P0 — Core correctness:** entity identity, component storage, archetype transitions, queries, and structural changes.
2. **P1 — Runtime reliability:** system execution, observers, events, world reset, and scene transitions.
3. **P2 — Framework features:** tags, groups, relationships, prefabs, dependency injection, and persistence.
4. **P3 — Optimization:** performance improvements supported by measurements and tests.

A lower-priority feature must not compromise a higher-priority requirement.

## 2. Scope and design principles

### 2.1 Required principles

- The framework is single-threaded unless concurrency is explicitly introduced in a future specification.
- Entities are identifiers, not objects containing game behavior.
- Components primarily contain data; systems implement behavior.
- Archetypes group entities that have exactly the same set of component types.
- Component data is stored in columns using the existing SoA architecture.
- Systems access entities and component data through the `World`, queries, and mappers.
- Structural changes must not corrupt storage or invalidate active iteration unexpectedly.
- Framework behavior must be deterministic wherever an ordering guarantee is specified.
- Invalid operations must have documented behavior and must never silently corrupt world state.

### 2.2 Out of scope for the core ECS

The ECS core does not implement game-specific movement rules, combat calculations, dungeon generation, field of view, inventory rules, or AI behavior. Those belong in game systems and game-specific components.

The core ECS should support these features without needing to know their game-specific rules.

## 3. Entities and entity identity

**Related code:** `EntityManager.ts`, `World.ts`, `InternalComponents.ts`

### 3.1 Entity creation

- **ENT-001:** Creating an entity returns a unique identifier for a currently live entity.
- **ENT-002:** A newly created entity has no user-defined components unless components are explicitly supplied.
- **ENT-003:** Entities with zero user-defined components must be supported.
- **ENT-004:** Creating an entity must place it in a valid archetype, including an empty archetype if required by the implementation.
- **ENT-005:** Entity creation must not return an identifier that is simultaneously assigned to another live entity.

### 3.2 Entity deletion and recycling

- **ENT-006:** Deleting a live entity removes its components and its membership in relevant archetypes, queries, tags, groups, and relationships.
- **ENT-007:** A deleted entity identifier must immediately be considered invalid, even if its numeric value is later recycled.
- **ENT-008:** An identifier from a previous lifetime must not access or modify a newer entity that reused the same entity index.
- **ENT-009:** `isValid(entity)` must return `false` for deleted, stale, malformed, or never-allocated identifiers.
- **ENT-010:** Deleting an entity more than once must not corrupt entity allocation or storage. The exact public API behavior—no-op or error—must be documented and tested.
- **ENT-011:** Entity allocation and versioning must use a representation whose supported range and overflow behavior are explicitly defined.

Entity IDs may use index and generation/version information. The implementation must prove that its encoding and decoding are safe for the declared range, including JavaScript bitwise-operation limitations.

### 3.3 Entity lifecycle invariants

At all times:

- Every live entity belongs to exactly one archetype.
- Every live entity has exactly one valid storage location within that archetype.
- No deleted entity remains accessible through a query or mapper.
- Recycling an entity identifier must not make an old reference valid again.

## 4. Components and component registration

**Related code:** `ComponentRegistry.ts`, `ComponentManager.ts`, `Mapper.ts`, `InternalComponents.ts`

### 4.1 Component definitions

- **CMP-001:** Components represent data and are identified by registered component IDs.
- **CMP-002:** Component IDs must be valid, stable within a world configuration, and unambiguous.
- **CMP-003:** Registering duplicate component IDs or conflicting registrations must fail clearly.
- **CMP-004:** The framework must validate component IDs before using them to access masks, columns, or archetypes.
- **CMP-005:** TypeScript generics provide compile-time assistance but must not be treated as runtime validation of component data.

The framework must document the supported component ID range and the requirements for registering components. Compile-time checks should be supplemented by runtime validation where uniqueness or validity cannot be guaranteed by TypeScript.

### 4.2 Adding, retrieving, replacing, and removing components

- **CMP-006:** Adding a component to an entity that lacks it creates the component and updates the entity's archetype membership.
- **CMP-007:** Adding a component that already exists must follow one documented rule: replace the value or reject the operation. The selected rule must be consistent across all APIs.
- **CMP-008:** Replacing a component's value must not change the entity's component membership.
- **CMP-009:** Removing a component updates the entity's archetype membership and removes the associated stored value.
- **CMP-010:** Removing an absent component must not corrupt storage or generate a false removal notification.
- **CMP-011:** Accessing a missing component must have documented behavior. APIs returning `undefined` and APIs that throw must be clearly distinguished.
- **CMP-012:** Component operations on invalid entities must not modify any other entity.

### 4.3 Component references and mutation

The public API distinguishes these operations:

- `getComponent<T>()`: retrieves a component value or reference.
- `setComponent<T>()`: replaces the stored value.
- `updateComponent<T>()`: computes and stores a replacement value.
- `mutateComponent<T>()`: modifies the existing value in place.
- `Mapper<T>`: provides equivalent component access through a cached component-specific interface.

The framework must document that retrieving a mutable object may expose the stored reference directly. Mutating that reference may bypass setter methods, validation, and change notifications.

The ECS must not imply that in-place data changes are automatically observable unless a specific mechanism guarantees it.

## 5. Archetypes and storage integrity

**Related code:** `Archetype.ts`, `ComponentManager.ts`, `EntityManager.ts`

### 5.1 Archetype membership

- **ARC-001:** An archetype represents one exact set of component IDs.
- **ARC-002:** Entities with the same component set belong to the same archetype.
- **ARC-003:** Entities with different component sets belong to different archetypes.
- **ARC-004:** Equivalent component sets must resolve to the same archetype rather than creating duplicate archetypes.
- **ARC-005:** Archetype membership and component masks must agree with the entity's actual stored components.

### 5.2 Structural transitions

Adding or removing components may move an entity between archetypes.

- **ARC-006:** A transition preserves all component values that remain part of the entity.
- **ARC-007:** A removed component is no longer accessible after the transition completes.
- **ARC-008:** A newly added component contains the supplied value.
- **ARC-009:** Moving an entity must not duplicate it or accidentally remove a different entity.
- **ARC-010:** Entity-to-row mappings, entity arrays, component columns, and masks remain consistent after every transition.
- **ARC-011:** The implementation must correctly handle moving the last row, moving into an empty archetype, and moving between archetypes with multiple component columns.

Storage correctness takes precedence over preserving row order. Unless explicitly guaranteed, entity iteration order within an archetype is unspecified.

## 6. Aspects and entity queries

**Related code:** `Aspect.ts`, `World.ts`, `Archetype.ts`

### 6.1 Aspect semantics

The following definitions are normative:

- `Aspect.all(A, B)`: an entity must have both A and B.
- `Aspect.one(A, B)`: an entity must have at least one of A or B.
- `Aspect.exclude(A, B)`: an entity must have neither A nor B.
- `butNot(...)`: excludes entities with the specified components.
- `and(...)`: combines the requirements of aspects.

If an aspect contains multiple categories of requirements, the entity must satisfy all applicable categories.

Empty requirement lists must have documented behavior, including for `all`, `one`, and `exclude`.

### 6.2 Query APIs

The framework provides query forms including:

- `world.view(aspect)`
- `world.getEntities(aspect)`
- `world.findFirst(aspect)`
- `world.count(aspect)`
- `world.getArchetypes(aspect)`
- `world.viewColumns(aspect, ...ids)`
- `world.viewColumnsStrict(aspect, ...ids)`

Requirements:

- **QRY-001:** Every query returns only live entities that satisfy the specified requirements.
- **QRY-002:** Query results must not contain duplicate entity IDs.
- **QRY-003:** Query counts must equal the number of matching entities.
- **QRY-004:** Array and iterator query forms must agree on entity membership when evaluated against the same unchanged world state.
- **QRY-005:** Strict column queries must fail clearly if a requested component column is not available.
- **QRY-006:** Cached archetype matches must be invalidated or updated when relevant archetypes are created or otherwise change.
- **QRY-007:** Mutation and deletion during iteration must follow the structural-change rules in Section 7.

Unless explicitly documented, callers must not rely on a particular entity ordering or on `findFirst` returning a particular entity when several entities match.

## 7. Structural changes, batching, and deferred operations

**Related code:** `EntityEditor.ts`, `World.ts`, `ComponentManager.ts`, `Scheduler.ts`

Structural changes include entity creation, deletion, and adding or removing components. These operations can alter archetype membership and invalidate storage iteration.

### 7.1 Immediate operations

- **STR-001:** Outside a deferred-update phase, direct structural operations take effect before the operation returns, unless the API explicitly documents otherwise.
- **STR-002:** After an immediate structural operation completes, subsequent queries reflect the resulting world state.
- **STR-003:** Component data changes that do not alter component membership do not require an archetype transition.

### 7.2 Deferred operations

- **STR-004:** When structural operations are deferred, they are queued and applied at a documented flush boundary.
- **STR-005:** A deferred operation must not corrupt the active archetype iteration.
- **STR-006:** The queue must preserve a documented execution order. The initial expected policy is FIFO.
- **STR-007:** After a successful flush, all successfully applied operations are reflected in storage, queries, and relevant notifications.
- **STR-008:** Exceptions during system execution or flushing must not leave the world permanently stuck in deferred mode.
- **STR-009:** Repeated flushes with no pending operations must be safe.

The implementation must explicitly define whether an entity created through a deferred builder is queryable before commit, whether its ID is available before commit, and what happens when queued operations target an entity that has been deleted before the queue is applied.

### 7.3 EntityEditor and batch changes

`EntityEditor` and the fluent creation APIs exist to group multiple component and metadata operations.

- **BAT-001:** A committed batch produces the same final component membership and values as the equivalent sequence of valid individual operations.
- **BAT-002:** A batch must not leave partially inconsistent archetype storage.
- **BAT-003:** Notifications must accurately represent the changes actually applied.
- **BAT-004:** Explicit `commit()` and automatic flushing must follow documented and consistent lifecycle rules.
- **BAT-005:** Calling `commit()` more than once must not duplicate the batch's effects.

The implementation must decide and test what happens if a batch fails partway through. Full rollback is desirable but is not assumed until implemented and tested.

## 8. Component observers and change notifications

Observers allow framework features and game systems to react to entity or component changes.

- **OBS-001:** Adding a component and removing a component must produce the documented notifications.
- **OBS-002:** Replacing an existing component value must follow a documented notification policy.
- **OBS-003:** Batch edits and direct operations must produce equivalent notifications for equivalent effective changes.
- **OBS-004:** Notifications must not be emitted for changes that were not applied.
- **OBS-005:** Notifications must identify the correct entity and component.
- **OBS-006:** Deleting an entity must not leave stale observer or entity membership state.
- **OBS-007:** Observer exceptions must have documented propagation behavior and must not silently corrupt core storage.

Component notifications and archetype/mask-change notifications are distinct concepts. The framework must document which notification types exist and which operations trigger each one.

## 9. Systems and scheduling

**Related code:** `Scheduler.ts`, `World.ts`, `TurnManager.ts`, `Decorators.ts`

### 9.1 System lifecycle

- **SYS-001:** A registered system is initialized and injected before its first execution.
- **SYS-002:** Systems execute in a documented order.
- **SYS-003:** `@Before` and `@After` constraints are honored when valid.
- **SYS-004:** `@Priority` determines ordering according to its documented rule.
- **SYS-005:** Conflicting constraints and dependency cycles are reported clearly rather than silently producing an arbitrary order.
- **SYS-006:** A system is not executed twice in one scheduler pass unless explicitly configured to do so.

### 9.2 Update and exception behavior

- **SYS-007:** A scheduler update runs the eligible systems in their established order.
- **SYS-008:** The scheduler reliably restores its internal state when a system throws, including deferred-operation mode.
- **SYS-009:** The framework documents whether remaining systems execute after a system throws.
- **SYS-010:** Enabling, disabling, pausing, resuming, and resetting systems or turns must have consistent semantics.
- **SYS-011:** Interval-based systems execute according to the documented tick or time basis, including boundary conditions.

### 9.3 Turn-based gameplay

The framework must support a game loop in which player actions and creature turns can be coordinated without requiring a real-time frame to equal a game turn.

The ECS does not dictate the roguelike's speed or energy rules. A game-specific turn system may implement energy accumulation, creature speed, action costs, and player input.

The framework's `Scheduler` and `TurnManager` must have clearly separated responsibilities, so pausing a turn does not accidentally leave structural changes or scheduler state in an inconsistent condition.

## 10. World lifecycle and internal state

**Related code:** `World.ts`, `InternalComponents.ts`, `SceneManager` implementation

- **WLD-001:** A newly initialized world has valid internal managers and required internal state.
- **WLD-002:** `world.clear()` removes the intended game state without leaving stale entity IDs, component data, query results, tags, groups, relationships, or pending operations.
- **WLD-003:** Internal singleton entities and required singleton values are recreated or deliberately preserved according to a documented policy.
- **WLD-004:** Managers, event subscriptions, and scheduler references remain valid after a clear or scene transition, or are explicitly rebuilt.
- **WLD-005:** Clearing a world and then creating, querying, and deleting entities must work normally.
- **WLD-006:** Repeated clear and reinitialization cycles must not accumulate duplicate systems, subscriptions, or manager state.

A scene transition must define which data belongs to the outgoing scene, which data survives, and which objects are reinitialized. The lifecycle must not depend on an undocumented assumption that clearing entities also resets every other subsystem.

## 11. Tags, groups, and relationships

These are supporting features, not prerequisites for core archetype correctness.

### 11.1 Tags

- A tag identifies at most one live entity.
- Assigning a tag must follow a documented duplicate-tag policy.
- Removing or deleting a tagged entity must not leave a stale tag mapping.
- Tag queries must agree with the tag manager's current state.

### 11.2 Groups

- Groups contain valid entity memberships without duplicates.
- Adding or removing group membership must be reflected in group queries.
- Deleting an entity must clean up its group memberships.
- Group iteration must not return deleted entities.

### 11.3 Relationships

- Relationships must refer to valid entities according to the documented lifetime policy.
- Deleting either endpoint must not leave unusable reverse indexes or dangling references.
- Forward and reverse relationship queries must agree.
- The behavior of relationships when an entity is deleted must be explicitly specified.

## 12. Prefabs, assets, and dependency injection

These features belong to the framework layer.

### 12.1 Prefabs

- A prefab defines a reusable entity template and its initial component data.
- Spawning a prefab creates a new entity with the configured components.
- Spawning multiple instances must not accidentally share mutable component objects when independent instances are expected.
- Invalid prefab definitions must produce actionable errors.

### 12.2 Assets

Asset loading must expose a clear success/failure result. A failed asset load must not be silently treated as a valid loaded asset.

Asset loading and caching must not undermine world initialization or leave the engine permanently in a partially initialized state.

### 12.3 Dependency injection and decorators

- Injected mappers, managers, event buses, and singleton values must refer to the intended world.
- Required dependencies must be available before a system executes.
- Invalid component IDs, unresolved dependencies, and invalid decorator configurations must produce clear errors.
- Decorators that filter systems must agree with the corresponding `Aspect`, group, or tag semantics.

## 13. Snapshots and persistence

**Related code:** `World.ts`, component serialization and storage support

Snapshots are a framework feature and must be validated separately from basic entity operations.

- **SAV-001:** A snapshot contains the state that the persistence contract declares saveable.
- **SAV-002:** Loading a valid snapshot reconstructs equivalent live entities, component membership, and component values.
- **SAV-003:** Snapshot versions are checked and incompatible formats are rejected or migrated according to a documented policy.
- **SAV-004:** Invalid snapshots produce clear errors.
- **SAV-005:** A failed load must not leave the world in an undocumented partially restored state.
- **SAV-006:** Entity IDs, internal entities, relationships, tags, groups, and singleton state must follow explicit persistence rules.
- **SAV-007:** Components containing `Map`, `Set`, or other non-JSON-native data require appropriate serializers or documented restrictions.

Round-trip tests must compare meaningful world state rather than requiring identical internal archetype row positions.

## 14. Error handling and diagnostics

The ECS must provide clear failures for invalid component IDs, invalid entities, missing required components, invalid system dependencies, and malformed snapshots.

The framework must not silently swallow errors that indicate corrupted state. Any intentional recovery behavior must be documented.

Debug assertions or validation helpers should be available to check internal invariants during development. These checks may be disabled or optimized in production after correctness has been established.

## 15. Testing and acceptance criteria

**No requirement is considered verified merely because it is documented or because the TypeScript compiler accepts the code.**

### Phase 1 — Baseline

- Establish the package scripts and supported TypeScript/runtime versions.
- Run the compiler and existing tests.
- Record all failures before changing production code.
- Confirm how tests are executed in the project.

### Phase 2 — Core ECS tests (P0)

1. Create entities, delete them, recycle IDs, and verify stale IDs remain invalid.
2. Add, replace, retrieve, mutate, and remove components.
3. Move entities between archetypes and verify all retained values.
4. Test empty archetypes and entities with zero components.
5. Compare `view`, `getEntities`, `findFirst`, and `count` against the same world state.
6. Test `Aspect.all`, `Aspect.one`, `Aspect.exclude`, and aspect composition.
7. Test direct structural changes and batch edits for equivalent results.
8. Verify that storage contains no duplicates, missing rows, or stale entities after transitions.

### Phase 3 — Runtime tests (P1)

1. Test deferred operations during iteration and at flush boundaries.
2. Compare observer notifications from direct and batch operations.
3. Throw an error during system execution and verify scheduler state is recoverable.
4. Clear the world, recreate entities, and confirm singleton and manager behavior.
5. Switch scenes repeatedly and check subscriptions, system registration, and entity validity.

### Phase 4 — Framework tests (P2)

1. Test tags, groups, and relationship cleanup.
2. Test prefab spawning and independent mutable component data.
3. Test dependency injection and system ordering.
4. Test snapshot round trips, incompatible versions, and invalid snapshots.

### Phase 5 — Roguelike integration test

Build a minimal scenario containing a player and a monster with position and health components.

Verify that:

- Both entities can be queried correctly.
- Movement updates positions without corrupting storage.
- Combat updates health.
- A defeated monster can be removed safely.
- The player and other entities remain queryable after the monster is deleted.
- The same scenario works over repeated turns and after a world reset.

### Phase 6 — Randomized testing

Where practical, generate random sequences of entity creation, deletion, component addition, replacement, and removal. Compare the ECS state against a simple reference model using ordinary maps and sets.

This can expose lifecycle bugs that are difficult to find with isolated examples.

## 16. Performance policy

The framework uses archetype-based SoA storage to support efficient iteration. However, performance claims must be measured rather than assumed.

Before making optimization changes:

1. Establish correctness tests.
2. Create representative workloads.
3. Measure query throughput, archetype transitions, and allocation behavior.
4. Identify the actual bottleneck.
5. Optimize without weakening the acceptance criteria.

Avoid premature optimization that adds complexity without a demonstrated benefit.

## 17. Implementation workflow

Every implementation change must follow this sequence:

1. **Analyze:** identify the relevant requirements and current behavior.
2. **Test:** add or update tests that demonstrate the required behavior.
3. **Fix:** make the smallest production-code change that satisfies the tests.
4. **Verify:** run the relevant tests and type checker, recording exact results.
5. **Review:** inspect the diff for regressions, unrelated changes, and untested assumptions.
6. **Commit:** save each coherent, passing change in version control.

Do not combine a large architectural rewrite with unrelated bug fixes. Do not mark a requirement as complete based solely on code inspection.

## 18. Open decisions

The following decisions must be confirmed during implementation review:

- The supported entity ID range and exact index/version encoding.
- Whether adding an existing component replaces its value or throws.
- Whether deleting an invalid entity is a no-op or an error.
- The precise visibility of deferred creations and edits before commit.
- The behavior of partially failed batches and flushes.
- The notification policy for component replacement and in-place mutation.
- The guarantees, if any, about query ordering.
- Which state survives `world.clear()` and scene transitions.
- Which managers, tags, groups, relationships, and singleton values are persisted in snapshots.
- Whether snapshots are restored atomically or use another explicit failure policy.

Until these decisions are resolved, tests and documentation must not imply a stronger guarantee than the implementation provides.

19. Coding Standards and Implementation Guidelines

These standards apply to all ECS framework code, including new features, bug fixes, refactoring, tests, and documentation updates.

The goals are correctness, maintainability, predictable behavior, and consistency. Code must be understandable and testable before it is optimized.

19.1 TypeScript and Type Safety

STD-001: Use TypeScript's strict type checking. Do not weaken compiler settings to work around implementation problems.

STD-002: Avoid any. Prefer unknown with explicit type narrowing when the type is not known.

STD-003: Avoid unnecessary type assertions (as) and non-null assertions (!). When they are necessary, the reason must be clear.

STD-004: Do not use @ts-ignore to silence compiler errors. If an exception is unavoidable, use a narrowly scoped @ts-expect-error with an explanation and a test where appropriate.

STD-005: Public APIs must expose meaningful parameter and return types. Do not rely on inferred types when doing so makes an API unclear.

STD-006: Use generics to preserve component types across registries, mappers, queries, and other APIs wherever practical.

STD-007: Use runtime validation for conditions TypeScript cannot guarantee, including invalid entity IDs, component IDs, and serialized input.

19.2 Architecture and Separation of Responsibilities

STD-008: Preserve the ECS separation of entities, components, and systems.

STD-009: Components should primarily contain data. Game rules and behavior belong in systems.

STD-010: Each class and module should have a clear, focused responsibility.

STD-011: Keep entity lifecycle management, component storage, archetype management, query evaluation, and system scheduling separate unless a documented architectural reason requires otherwise.

STD-012: Avoid circular dependencies between core modules.

STD-013: Do not introduce new architectural patterns, managers, abstractions, or dependencies unless they solve a concrete problem.

STD-014: Reuse existing APIs and conventions when appropriate instead of creating overlapping ways to perform the same operation.

STD-015: Framework code must not depend on roguelike-specific rules. Game-specific behavior belongs in the game layer.

19.3 Correctness and State Management

STD-016: Maintain all invariants defined in this specification, even when an operation fails.

STD-017: Do not silently swallow exceptions or ignore invalid states. Errors must be handled deliberately and consistently.

STD-018: Validate public API inputs at appropriate boundaries.

STD-019: Avoid hidden side effects. Methods that modify entity membership, component storage, scheduling, or world state must make those effects clear.

STD-020: Keep internal indexes, caches, masks, and storage structures synchronized when underlying state changes.

STD-021: Do not expose mutable internal collections unless that exposure is intentional and documented.

STD-022: Cleanup operations must leave the framework in a valid state, including when invoked repeatedly.

STD-023: Avoid global mutable state. State belonging to a world must remain associated with the correct world instance.

19.4 Naming and Code Organization

STD-024: Follow the naming and formatting conventions already established in the repository. Do not introduce a competing style.

STD-025: Use descriptive names for classes, methods, variables, and component identifiers. Avoid cryptic abbreviations.

STD-026: Use consistent naming conventions: PascalCase for classes and types, camelCase for variables and methods, and the repository's established convention for constants and file names.

STD-027: Keep methods focused. Extract helpers when doing so makes behavior easier to understand or test, not merely to reduce line count.

STD-028: Avoid duplicated logic for entity validation, archetype transitions, and structural-change processing when a shared implementation can safely enforce consistent behavior.

STD-029: Keep public APIs as small as practical. Do not expose internal implementation details without a clear need.

19.5 Documentation

STD-030: Document public APIs whose purpose, parameters, return values, side effects, or failure behavior are not self-evident.

STD-031: Document non-obvious invariants and architectural decisions near the code they govern.

STD-032: Comments should explain why a decision or constraint exists, not merely repeat what the code does.

STD-033: Update ECS_GUIDE.md when verified public API behavior changes.

STD-034: Update ECS_SPEC.md only when an intentional requirement or design decision changes. Do not weaken requirements merely to accommodate a defect.

STD-035: Do not document behavior as supported until it has been verified through appropriate tests or other sufficient evidence.

19.6 Testing Requirements

STD-036: Every bug fix must include a regression test when practical.

STD-037: New features must include tests for normal behavior, important boundary conditions, and invalid inputs.

STD-038: Tests must verify observable behavior, not merely reproduce the current implementation.

STD-039: Tests must be deterministic and must not depend on execution order, wall-clock timing, or shared mutable state unless the test explicitly covers those conditions.

STD-040: Tests must clean up resources and state so they can run independently.

STD-041: Do not change or remove a failing test merely to make the test suite pass. First determine whether the test or implementation violates the specification.

STD-042: Do not claim that code compiles or tests pass unless the corresponding commands were actually executed and their results inspected.

19.7 Performance and Resource Use

STD-043: Prefer clear, correct implementations over speculative optimizations.

STD-044: Avoid unnecessary allocations in demonstrably hot ECS paths, but optimize based on profiling or benchmarks rather than assumptions.

STD-045: Changes to archetype storage, query caching, entity allocation, or structural-change processing must preserve all relevant correctness guarantees.

STD-046: Performance benchmarks must use representative workloads and document what is being measured.

19.8 Changes and Refactoring

STD-047: Make the smallest coherent change that satisfies the requirement.

STD-048: Do not mix unrelated refactoring with bug fixes or feature work.

STD-049: Do not rewrite working subsystems simply to make them conform to an AI-generated preferred pattern.

STD-050: Before changing a public API, identify affected callers, tests, and documentation.

STD-051: After modifying code, run the relevant tests and type checker. Run the full test suite when practical.

STD-052: Summarize changed files, design decisions, tests executed, and known limitations when completing a task.

19.9 AI-Assisted Development Rules

When an AI coding assistant works on this repository:

Read the relevant parts of ECS_SPEC.md, ECS_GUIDE.md, and the existing implementation before proposing changes.

Treat this specification as the authority for intended behavior.

Analyze existing behavior and identify the relevant requirements before editing code.

Do not assume a feature works because it is documented or because an example exists.

Do not modify unrelated files or introduce unrelated improvements.

When asked to investigate or review, do not edit files unless explicitly authorized.

When asked to implement a change, add or update tests before or alongside the implementation.

Report the actual commands executed and their results. Clearly identify tests that were not run.

Identify any ambiguity or conflict in the specification rather than silently choosing a behavior that affects public APIs or architecture.

Do not claim completion while known failing tests, unresolved regressions, or unverified requirements remain undisclosed.
---

## Definition of done

The ECS core is ready for roguelike feature development when entity identity, component storage, archetype transitions, queries, and structural changes have automated tests that pass consistently.

The scheduler, observer behavior, and world lifecycle must then be tested before relying on them for scene changes or complex gameplay.

The complete framework does not need every optional feature finished before game development begins. It does need a reliable, tested core that can be extended without repeatedly rediscovering basic correctness bugs.
