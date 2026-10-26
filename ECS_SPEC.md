# ECS Specification — Rogue1

**Status:** Audited — core, runtime, framework, and persistence requirements audited, with resolved design decisions verified against the automated regression test suite
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

Entity IDs are represented as positive safe integers using safe arithmetic encoding: `id = index * 65536 + generation`.
- Valid generation range: 1 through 65,535 (16 bits).
- Supported index range: 0 through 2^37 - 1 (137,438,953,471), keeping all possible IDs within `Number.MAX_SAFE_INTEGER` (2^53 - 1).
- Decoding is performed via arithmetic division (`index = Math.floor(id / 65536)`) and modulo (`generation = id % 65536`), avoiding 32-bit signed bitwise shift limitations.
- Slot exhaustion & retirement: When an entity at generation 65,535 is deleted/recycled, its slot is permanently retired and never reused. No stale reference can ever be resurrected.
- World reset lifecycle: `world.clear()` advances entity generations across all allocated index slots (or retires slots at generation 65,535). IDs from before `world.clear()` remain permanently invalid and are never reused by newly allocated entities after reset. In contrast, snapshot loading (`loadSnapshot`) explicitly restores the saved entity IDs, versions, and free pool.
- ID validation: `isValid(entity)` strictly validates that the identifier is a positive safe integer within allocated index bounds and matching the live generation.

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

Component ID specifications and validation rules:
- Supported component ID range: Non-negative safe integers in the 16-bit range (`0 <= id <= 65535`, where `MAX_COMPONENT_ID = 65535`). Internal engine components reserve `0..99` (`ENGINE_COMPONENT_ID_START = 0`), and user components use `100..65535` (`USER_COMPONENT_ID_START = 100`).
- Registration partition: User component registration (`registerAllComponents`) rejects component IDs in the reserved engine range (`0..99`). Internal engine component registration validates and registers IDs in the reserved range.
- Rationale: Aspect filtering and Archetype bitmasks use BigInt bit shifts (`1n << BigInt(id)`). Capping component IDs at `65535` guarantees strictly bounded BigInt mask allocations (<= 8 KB per mask) and prevents runtime `RangeError` or memory exhaustion from large integers (such as `Number.MAX_SAFE_INTEGER`), while providing ample capacity for up to 65,536 distinct component types.
- Runtime validation: Invalid component IDs (negative, fractional, non-integer, unsafe integers, numbers > `MAX_COMPONENT_ID`, NaN, Infinity, non-numbers) are rejected with an actionable error at all API boundaries (`registerComponent`, `registerAllComponents`, `addComponent`, `removeComponent`, `getComponent`, `setComponent`, `updateComponent`, `mutateComponent`, `hasComponent`, Aspect construction, Mapper instantiation, EntityEditor methods, RelationshipManager methods, and World observer/serializer APIs) before any bitwise shifts, mask construction, array indexing, or storage mutations occur.
- Uniqueness and collisions: Component IDs must be unique within a world configuration; duplicate registrations or ID collisions during registration throw clear errors.
- Absent component semantics: A valid component ID that is registered or valid but not present on an entity follows documented missing-component behavior:
  - `getComponent<T>()` and `edit.get<T>()` return `undefined`.
  - `hasComponent()` and `edit.has()` return `false`.
  - `setComponent()`, `updateComponent()`, and `mutateComponent()` return `false` without modifying storage.
  - `removeComponent()` and `edit.remove()` are safe no-ops that do not modify archetype storage, alter component masks, or produce false removal notifications.

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
- `and(...)`: combines the requirements of aspects using logical conjunction (AND) across all requirement categories and multiple one-of groups.

If an aspect contains multiple categories of requirements, the entity must satisfy all applicable categories. Conjunction of multiple `one()` aspects (e.g., `Aspect.one(A, B).and(Aspect.one(C, D))`) requires that the entity contains at least one component from each respective group `(A or B) and (C or D)`.

Empty requirement semantics:
- `Aspect.EMPTY` (and `new Aspect()`): represents an unconstrained aspect (matches all entities).
- `Aspect.all()`: 0 required components; imposes no presence constraints (matches all entities).
- `Aspect.exclude()`: 0 excluded components; imposes no exclusion constraints (matches all entities).
- `Aspect.one()`: requires at least one component from an empty set; unsatisfiable (matches 0 entities).

Legacy compatibility:
- The `Aspect` constructor accepts `(allMask, oneMask, excludeMask)` where `oneMask` can be a single `bigint` (legacy representation) or an array of disjunctive bitmasks `readonly bigint[]`.
- The `oneMask` getter returns a bitwise OR union of all disjunctive masks in `oneMasks`. For composite aspects combining multiple independent `one()` groups, this bitwise union represents the candidate component pool but cannot express the multi-clause conjunction semantics.

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
- **QRY-005:** Strict column queries (`viewColumnsStrict`) must fail clearly if a matching archetype lacks a requested component column. Ordinary column queries (`viewColumns`) yield `undefined` for requested component columns that do not exist in a matching archetype. Empty archetypes (0 live entities) are skipped and not yielded as empty batches.
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
- **STR-006:** The queue must preserve a documented execution order. Operations are processed sequentially in FIFO order (`shift()`).
- **STR-007:** After a successful flush, all successfully applied operations are reflected in storage, queries, and relevant notifications.
- **STR-008:** Exceptions during system execution or flushing must not leave the world permanently stuck in deferred mode. If an operation throws during `World.flush()`, that operation has already been removed from the queue and its underlying storage mutation remains in effect (mutations are non-transactional); any subsequent operations that were not yet processed remain queued and can be processed on subsequent `flush()` calls without replaying completed operations.
- **STR-009:** Repeated flushes with no pending operations must be safe.

The implementation explicitly defines that operations targeting an invalid or already deleted entity are safe no-ops and are not queued, preventing stale or recycled IDs from executing against reallocated entities.

### 7.3 EntityEditor and batch changes

`EntityEditor` and the fluent creation APIs exist to group multiple component and metadata operations.

- **BAT-001:** A committed batch produces the same final component membership and values as the equivalent sequence of valid individual operations.
- **BAT-002:** A batch must not leave partially inconsistent archetype storage.
- **BAT-003:** Notifications must accurately represent the changes actually applied.
- **BAT-004:** Explicit `commit()` and automatic flushing must follow documented and consistent lifecycle rules.
- **BAT-005:** Calling `commit()` more than once must not duplicate the batch's effects. If a commit throws during an observer notification, the editor remains uncommitted; subsequent `flush()` retries take the non-structural update path to finalize values without duplicating component add/remove observer events.

ECS storage mutations are non-transactional: mutations take effect in archetype storage prior to observer callback invocation. An observer failure aborts remaining notifications and propagates to the caller without rolling back committed storage changes.

## 8. Component observers and change notifications

Observers allow framework features and game systems to react to entity or component changes.

- **OBS-001:** Adding a component and removing a component must produce the documented notifications.
- **OBS-002:** Replacing an existing component value must follow a documented notification policy.
- **OBS-003:** Batch edits and direct operations must produce equivalent notifications for equivalent effective changes.
- **OBS-004:** Notifications must not be emitted for changes that were not applied.
- **OBS-005:** Notifications must identify the correct entity and component.
- **OBS-006:** Deleting an entity must not leave stale observer or entity membership state.
- **OBS-007:** Observer exceptions abort subsequent observer callbacks and mask change notifications for that event and propagate immediately to the caller without corrupting or rolling back core storage mutations.

Component notifications and archetype/mask-change notifications are distinct concepts. The framework must document which notification types exist and which operations trigger each one.

## 9. Systems and scheduling

**Related code:** `Scheduler.ts`, `World.ts`, `TurnManager.ts`, `Decorators.ts`

### 9.1 System lifecycle

- **SYS-001:** A registered system is initialized and injected before its first execution via `injectDependencies()`. Missing required singletons or managers throw actionable bootstrap errors. `onEnable()` hook executes exactly once before the system's first update.
- **SYS-002:** Systems execute in a documented order determined by topological sort of explicit `@Before`/`@After` dependency constraints and `@Priority` weights.
- **SYS-003:** `@Before` and `@After` constraints are honored when valid and take precedence over priority weights. Optional non-existent dependency targets are ignored safely without failing topological sort.
- **SYS-004:** `@Priority` determines default ordering (lower numerical value executes earlier; default priority is 1000). Priority values must be finite numbers.
- **SYS-005:** Conflicting constraints and dependency cycles (direct, indirect, contradictory, self-referential) throw actionable circular dependency errors.
- **SYS-006:** A system is not executed twice in one scheduler pass unless explicitly configured to do so. Duplicate registration of the exact same system instance is idempotent and ignored without duplicating subscriptions or executions. Registering distinct instances of the same class is supported, with instances ordered deterministically by priority and registration order.

### 9.2 Update and exception behavior

- **SYS-007:** A scheduler update runs eligible systems from a snapshot of registered systems taken at the start of the pass (`systemsToRun = [...this.systems]`). Systems added mid-pass do not run in the active pass and execute on subsequent passes. Systems removed or cleared mid-pass are skipped immediately for the remainder of the active pass and do not run on subsequent passes.
- **SYS-008:** The scheduler reliably restores its internal state when a system throws, including deferred-operation mode and turn state. Any structural changes queued prior to the failure are flushed upon exiting deferred mode in `finally`.
- **SYS-009:** When a system throws during an update pass, subsequent systems in that pass do not execute to prevent cascading errors; the exception propagates to the caller, and the scheduler and world remain ready for subsequent updates once the error condition is resolved.
- **SYS-010:** Enabling, disabling, pausing, resuming, and resetting systems or turns must have consistent semantics. Disabling invokes `onPause()`, enabling invokes `onResume()`, and pausing `TurnManager` or `Scheduler` halts execution while preserving partially accumulated interval timers and internal state.
- **SYS-011:** Interval-based systems (`IntervalSystem`, `@Interval(period)`) advance an internal accumulator by `dt` on each update pass, execute when `accumulator >= interval` with accumulated `dt`, and reset accumulator to 0 upon execution. Partially accumulated time is preserved across disable/pause and resume cycles, and reset to 0 upon explicit `resetAccumulator()` or world clear / rebind. Interval values must be finite positive numbers (`> 0`).

### 9.3 Turn-based gameplay

The framework must support a game loop in which player actions and creature turns can be coordinated without requiring a real-time frame to equal a game turn.

The ECS does not dictate the roguelike's speed or energy rules. A game-specific turn system may implement energy accumulation, creature speed, action costs, and player input.

The framework's `Scheduler` and `TurnManager` must have clearly separated responsibilities, so pausing a turn does not accidentally leave structural changes or scheduler state in an inconsistent condition.

## 10. World lifecycle and internal state

**Related code:** `World.ts`, `InternalComponents.ts`, `SceneManager` implementation

- **WLD-001:** A newly initialized world has valid internal managers and required internal state.
- **WLD-002:** `world.clear()` removes the intended game state without leaving stale entity IDs, component data, query results, tags, groups, relationships, or pending operations.
- **WLD-003:** Internal singleton entities and required singleton values are recreated or deliberately preserved according to a documented policy.
- **WLD-004:** Managers, event subscriptions, and scheduler references remain valid after a clear or scene transition, or are explicitly rebuilt. When `world.clear()` is called, world-scoped ephemeral observers and event handlers are cleared, while persistent active systems registered with the `Scheduler` are automatically rebound via `scheduler.rebind()` (restoring `@Subscribe` event listeners and system mask/component observers via `system.rebind()`).
- **WLD-005:** Clearing a world and then creating, querying, and deleting entities must work normally.
- **WLD-006:** Repeated clear and reinitialization cycles must not accumulate duplicate systems, subscriptions, or manager state. EventBus and ComponentManager registrations are idempotent and re-registered handlers execute exactly once per event.

A scene transition must define which data belongs to the outgoing scene, which data survives, and which objects are reinitialized. The lifecycle must not depend on an undocumented assumption that clearing entities also resets every other subsystem.

- **SCN-001:** `SceneManager.switchTo(nextScene)` validates that `nextScene` provides `name` (non-empty string), `onEnter` (function), and `onExit` (function) or resolves a registered scene name, throwing actionable errors early before teardown or reset on invalid input.
- **SCN-002:** Scene transition executes lifecycle hooks in strict order: `currentScene.onExit(world)` -> `world.clear()` -> `currentScene = nextScene` -> `nextScene.onEnter(world)`. On initial switch, `onExit` is omitted.
- **SCN-003:** When `onExit` throws, the manager propagates the exception, retains the previous `currentScene` reference, and does not proceed to its own `world.clear()` or switch to the target. Any callback side effects that occurred before the exception are not rolled back. When `onEnter` throws, the world has already been cleared, `currentScene` is assigned to the target scene, and the error propagates, leaving the manager ready for subsequent fallback transitions.
- **SCN-004:** `SceneManager.register(scene)`, `registerAll(scenes)`, `unregister(name)`, `get(name)`, `has(name)`, and `clear()` provide scene template registry management, allowing named transitions via `switchTo(name)`.
- **SCN-005:** All pre-switch entity IDs are invalidated upon scene transition via generation advancement; persistent scheduler systems are automatically rebound; and registered prefabs and custom relationships persist across scene transitions.

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
- **REL-001:** `RelationshipManager.registerRelation(componentId)` explicitly designates a component ID as a relationship type so reverse indexes can be accurately maintained and reconstructed.
- **REL-002:** `registerEcsSerializers(world, userComponents)` (or `bootstrapEcs`) automatically registers entries in the supplied component mapping whose names begin with `"REL_"` (such as `REL_MEMBER_OF`, `REL_TARGETS`) for relationship tracking (`world.relationships.registerRelation(id)`) and configures them with `RelationshipSetSerializer`. This built-in convention supports both scalar `EntityId` numbers (1-to-1 relationships) and `Set<EntityId>` collections (1-to-Many relationships).
- **REL-003:** Custom relationship component IDs whose mapping names do not begin with `"REL_"` must be registered explicitly through `world.relationships.registerRelation(id)` before `world.loadSnapshot()` or `RelationshipManager.rebuild()` restores state in a fresh world instance, and require an appropriate serializer (e.g. `RelationshipSetSerializer` or a custom `ComponentSerializer`) registered via `world.registerComponentSerializer(id, serializer)` when their values need non-JSON serialization.
- **REL-004:** Reverse index reconstruction and entity deletion cleanup strictly target registered relationship component IDs. Ordinary numeric and `Set`-valued components are not relationships unless explicitly registered as such, preventing accidental corruption or deletion of unrelated entity component data.
- **REL-005:** Relationship reverse index synchronization: All supported component mutation pathways (`addComponent`, `setComponent`, `updateComponent`, `mutateComponent`, `removeComponent`, `EntityEditor` batch edits, deferred structural flushes, and entity duplication) automatically reconcile the reverse relationship index (`targetToSubjects`) for registered relationship component IDs. `getTargets()` and public read APIs return relationship target Sets as runtime-enforced read-only views; direct mutations (`add`, `delete`, `clear`) on the view throw runtime errors while the view reflects live updates made through supported APIs to that underlying Set instance. If a relationship component is completely replaced (e.g. via `setComponent` with a new Set or an exclusive 1-to-1 relationship), previous read-only views continue to reference the detached old Set, while new queries return views over the newly assigned component. Relationship modifications must be performed through `RelationshipManager` methods (`add`, `remove`, `clearRelations`) or supported `World` mutation APIs. Sets supplied by callers are cloned to isolate storage from external alias mutations. Non-relationship components (ordinary numeric and `Set`-valued components) remain mutable and completely ignored by relationship indexing.

## 12. Prefabs, assets, and dependency injection

These features belong to the framework layer.

### 12.1 Prefabs

- A prefab defines a reusable entity template and its initial component data.
- Spawning a prefab creates a new entity with the configured components.
- Spawning multiple instances must not accidentally share mutable component objects when independent instances are expected.
- Invalid prefab definitions must produce actionable errors.
- **PFB-001:** `PrefabManager.register(name, definition)` validates prefab names, component IDs, relationship IDs/target tags, and group metadata, storing an isolated clone of the definition to protect template storage from caller mutations.
- **PFB-002:** `PrefabManager.spawn(name, overrides)` instantiates an entity, clones all component values using registered serializers or deep cloning, applies component overrides, assigns groups, and resolves targetTag relationships.
- **PFB-003:** Spawning multiple instances from the same prefab produces completely independent mutable component instances with no shared object references.
- **PFB-004:** `PrefabManager.spawnWithTag(name, tag, overrides)` creates the entity and registers the tag. If tag registration fails (e.g., tag collision), the newly created entity is cleaned up immediately to ensure failure atomicity without leaking orphaned entities.
- **PFB-005:** Relationship resolution via `targetTag` resolves the target entity if present and valid in the world, or safely omits the link without throwing if the target tag does not exist.
- **PFB-006:** Prefab templates remain registered across `World.clear()`, allowing immediate re-spawning into the reset world. `PrefabManager.clear()` explicitly removes all templates.

### 12.2 Assets

Asset loading must expose a clear success/failure result. A failed asset load must not be silently treated as a valid loaded asset.

Asset loading and caching must not undermine world initialization or leave the engine permanently in a partially initialized state.

### 12.3 Dependency injection and decorators

- Injected mappers, managers, event buses, and singleton values must refer to the intended world.
- Required dependencies must be available before a system executes.
- Invalid component IDs, unresolved dependencies, and invalid decorator configurations must produce clear errors.
- Decorators that filter systems must agree with the corresponding `Aspect`, group, or tag semantics.

### 12.4 EventBus and decoupled communication

- **EVT-001:** `EventBus.subscribe(type, handler)` validates that `type` is a non-empty string and `handler` is a function; duplicate subscriptions with the same handler function reference are idempotent and register once.
- **EVT-002:** `EventBus.publish(event)` validates that `event` is an object with a non-empty string `type` property; dispatches to a snapshot of registered handlers, ensuring handlers subscribed during dispatch do not execute for the in-flight event while handlers unsubscribed or cleared mid-dispatch are skipped immediately; setting `event.cancelled = true` halts subsequent listeners.
- **EVT-003:** Exceptions thrown within an event handler propagate immediately to the caller of `publish()`, halting remaining handlers for that dispatch while leaving the `EventBus` in a valid, uncorrupted state for subsequent operations.
- **EVT-004:** `@Subscribe(eventType)` validates that `eventType` is a non-empty string; system instances added to `Scheduler` are automatically registered to the world's `EventBus`, unregistered upon system removal or scheduler clearing, and support multiple distinct system instances without cross-instance collision.
- **EVT-005:** `World.clear()` wipes ephemeral event handlers while persistent scheduler systems have their `@Subscribe` event listeners automatically rebound via `scheduler.rebind()`, receiving exactly one delivery per published event across repeated world reset and scene transition cycles.

## 13. Snapshots and persistence

**Related code:** `World.ts`, component serialization and storage support

Snapshots are a framework feature and must be validated separately from basic entity operations.

- **SAV-001:** A snapshot contains the state that the persistence contract declares saveable.
- **SAV-002:** Loading a valid snapshot reconstructs equivalent live entities, component membership, and component values.
- **SAV-003:** Snapshot versions are checked and incompatible formats are rejected or migrated according to a documented policy (`ECS_SNAPSHOT_VERSION = 2`).
- **SAV-004:** Malformed snapshots detected during preflight produce clear errors before live world state is mutated.
- **SAV-005:** Pre-commit failure atomicity: `World.loadSnapshot()` validates snapshot schema, bounds, entity validity and uniqueness, tags, groups, and registered relationship target references, and pre-deserializes all component columns before invoking `resetForLoad()`. If any schema validation check, relationship validation, or component deserializer throws during this preflight phase, restoration aborts immediately, leaving the existing live world completely intact and unmodified. Once preflight validation succeeds, the world state is cleared and the pre-validated snapshot data is committed.
- **SAV-006:** Entity IDs, internal entities, relationships, tags, groups, and singleton state must follow explicit persistence rules. Entries in the supplied component mapping whose names begin with `"REL_"` are automatically registered for relationship tracking and snapshot serialization (`RelationshipSetSerializer`, supporting both scalar `EntityId` and `Set<EntityId>`). Custom relationship component IDs whose mapping names do not begin with `"REL_"` must be registered explicitly through `world.relationships.registerRelation(id)` and configured with appropriate serializers prior to snapshot restoration to allow safe reverse-index rebuilding.
- **SAV-007:** Components containing `Map`, `Set`, or other non-JSON-native data require appropriate serializers or documented restrictions. Default serialization and deserialization deep-clone component values to guarantee memory isolation between snapshot data and live ECS storage; custom component serializers must produce appropriately isolated values if they need the same memory-isolation guarantees. Ordinary numeric and `Set`-valued components are not relationships unless explicitly registered as such.

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

## 16. Performance policy and verified benchmarks

The framework uses archetype-based SoA storage to support efficient iteration. Performance claims are backed by repeatable benchmarks executed via `npm run bench` (`js/benchmarks/index.ts`) using high-resolution timing (`performance.now()`) with multiple warmup passes, multiple timed sample runs reporting median durations, and explicit separation of setup from timed workloads.

### 16.1 Verified benchmark results

Workload measurements on representative hardware (median of 5 runs):

1. **Entity Lifecycle & Recycling:**
   - Entity Allocation (separated setup): ~157M–213M entities/s (4.7–6.4 ns/entity).
   - Entity Deletion & ID Recycling: ~12.6M–19.0M ops/s (52.6–79.1 ns/op).
2. **Component Transitions & Mutations:**
   - Structural Additions (`transmute` across 3 archetypes): ~1.27M transmutes/s (787.1 ns/transmute).
   - Non-structural In-Place Mutation (`mutateComponent`): ~20.70M mutations/s (48.3 ns/mutation).
   - Batch Edits via `EntityEditor` (3 additions in a single structural move): ~537k entities/s (1.86 µs/entity).
3. **Query Execution & Iteration:**
   - Meta-queries (`count()` across 20,000 entities in mixed archetypes): ~4.23M queries/s (236.3 ns/query).
   - Snapshot queries (`getEntities()` across matching entities): ~88k–163k snapshots/s (6.1–11.2 µs/snapshot).
   - Query Generator Streaming (`view()`): ~52.1M entities/s (19.2 ns/entity).
   - Column queries (`viewColumns()` SoA direct array processing): ~641M entities/s (1.6 ns/entity).
4. **Relationships & Reverse-Index Maintenance:**
   - 1-to-1 Relationship Creation: ~1.07M–1.15M relations/s (870–935 ns/relation).
   - Reverse queries via index (`getRelated()` on sparse targets, 5 of 20,005 relationship rows across 20,007 entities): ~5.21M queries/s (192.1 ns/query), providing O(1) target bucket index lookup and O(k) iteration over matching subjects, compared to ~37.0k queries/s (27.0 µs/query) for linear table scan baseline across all 20,005 relationship rows.
   - Reverse count queries via index (`countRelated()` on sparse targets): ~10.10M queries/s (99.0 ns/query), compared to ~37.3k queries/s (26.8 µs/query) for linear table scan baseline across all 20,005 relationship rows.
   - Dense reverse queries (10,000 subjects): ~4.23k `getRelated` queries/s (236.7 µs/query) and ~9.46k `countRelated` queries/s (105.7 µs/query).
   - Deletion Cleanup (automatic cleanup of all incoming and outgoing relations): ~766k deletions/s (1.30 µs/deletion).
5. **Scheduler & Systems:**
   - Multi-system update pass across 10,000 entities: ~1.23k passes/s (811.8 µs/pass).
   - Deferred queue flushing (`flush()` across 10,000 queued additions): ~2.67M flushes/s (374.2 ns/flush).
6. **EventBus Dispatch:**
   - Dispatch across 10 to 1,000 subscribers: ~113M–139M handler deliveries/s (7.2–8.8 ns/delivery).
7. **Prefab Spawning:**
   - Template instantiation with deep component cloning and group setup: ~145k spawns/s (6.90 µs/spawn).
8. **Snapshot Persistence:**
   - Snapshot Serialization (`saveSnapshot()` for 5,000 entities with tags/groups/relations): ~120 saves/s (8.31 ms/save).
   - Snapshot Restoration (`loadSnapshot()` with two-phase pre-validation): ~88 loads/s (11.40 ms/load).

### 16.2 Optimization principles

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

## 18. Resolved design decisions

The following decisions have been audited, resolved, and verified against automated regression suites:

- **Entity ID range and encoding:** Resolved: 16-bit generation (1..65,535), 37-bit index (0..2^37 - 1), arithmetic encoding `id = index * 65536 + generation`, permanent slot retirement at generation 65,535 (`ENT-011`).
- **Adding existing component:** Resolved: Replaces the stored value in place non-structurally without throwing, altering component membership, or firing component add observers (`CMP-007`, `CMP-008`).
- **Deleting invalid or already deleted entity:** Resolved: Safe no-op, returns immediately without modifying state or throwing (`ENT-010`).
- **Deferred mutation visibility:** Resolved: Deferred operations are queued in FIFO order in `deferredQueue` and applied at `world.flush()`; pre-flush queries reflect the unmutated world state (`STR-004`–`STR-007`).
- **Partially failed batches and flushes:** Resolved: Non-transactional; storage mutations precede observer emissions and are retained without rollback; observer exceptions abort subsequent callbacks for that change and propagate; throwing operations are shifted from the queue to prevent replay, while unprocessed operations remain queued for subsequent flushes (`STR-008`, `BAT-005`, `OBS-007`).
- **Component replacement and mutation notifications:** Resolved: In-place mutations (`mutateComponent`) and non-structural component value replacements (`setComponent`, `addComponent` on existing component) update column data directly and do not emit `onAdd`/`onRemove` observer events; structural additions and removals emit respective component and mask observers (`OBS-001`–`OBS-004`).
- **Query ordering guarantees:** Resolved: No ordering guarantees are provided across `view()`, `getEntities()`, or `viewColumns()`; entity row order within archetypes is unspecified and swap-and-pop moves entities freely (`ARC-011`, `QRY-001`).
- **State survival across `world.clear()` and scene transitions:** Resolved: Ephemeral entities, components, tags, groups, relationships, query caches, deferred queue, active editors, and ephemeral event/observer listeners are cleared; registered component IDs, singleton entities (recreated with fresh ID), persistent Scheduler systems (automatically rebound with `@Subscribe` listeners and mask observers restored), registered Prefab templates, registered Scene definitions, and registered Relationship IDs persist (`WLD-002`–`WLD-004`, `SCN-001`–`SCN-005`).
- **Snapshot persistence boundaries:** Resolved: Entity IDs, entity versions, free entities pool, component SoA columns, singletons (tagged `__world_singletons__`), unique tags, multi-group memberships, and registered relationship components are persisted; ephemeral observers, scheduler systems, and prefab templates remain in memory and are not stored in snapshot data (`SAV-001`–`SAV-007`).
- **Snapshot restoration failure policy:** Resolved: Two-phase restoration provides preflight failure atomicity; schema validation, relationship integrity checks, and column deserialization must succeed before live world state is cleared or mutated; preflight failures leave the previous world completely intact (`SAV-003`–`SAV-005`).

## 19. Coding standards and implementation guidelines

These standards apply to ECS framework code, tests, build and tooling configuration, and documentation changes. Their purpose is to preserve correctness, maintainability, predictable behavior, and consistency with the existing repository.

**Status:** These are development requirements. They do not claim that the current implementation already complies. Compliance must be evaluated from the code, configuration, and verification results.

### 19.1 Authority and resolving conflicts

Use the following order when deciding intended behavior:

1. Explicit requirements in this specification, including formally accepted amendments.
2. Verified public API contracts and automated tests that are consistent with those requirements.
3. Established repository conventions and configuration.
4. `ECS_GUIDE.md`, but only where its descriptions have been verified.
5. General coding preferences, outside examples, and AI-generated suggestions.

The specification defines intended behavior; tests and code provide evidence of actual behavior. Neither an existing test nor existing code automatically overrides a requirement if it appears inconsistent with the intended contract.

If the implementation, tests, guide, or repository conventions conflict, identify the specific conflict and explain its impact. Do not silently change public behavior, weaken a requirement to accommodate a defect, or introduce a new architectural direction. Propose the smallest reasonable resolution. If the conflict affects intended behavior or a public API and cannot be resolved from documented decisions, leave it as an explicit open decision for the project owner.

### 19.2 TypeScript and type safety

- **STD-001:** Preserve the repository's strict TypeScript checking. The current `tsconfig.json` sets `strict: true`; do not weaken it to bypass implementation problems.
- **STD-002:** Avoid `any` when a specific type or `unknown` with explicit narrowing is appropriate.
- **STD-003:** Avoid unnecessary type assertions (`as`) and non-null assertions (`!`). When one is required, keep it narrow and make the assumption clear.
- **STD-004:** Do not use `@ts-ignore` to silence errors. If an exception is genuinely necessary, use a narrowly scoped `@ts-expect-error` with an explanation; add a test when practical.
- **STD-005:** Give public APIs meaningful parameter and return types. Explicit annotations are especially valuable where they clarify an exported contract or prevent accidental API changes.
- **STD-006:** Use generics to preserve component types across registries, mappers, queries, and related APIs where practical.
- **STD-007:** Validate at runtime what TypeScript cannot guarantee, including untrusted serialized input and invalid entity or component identifiers.

### 19.3 Architecture and separation of responsibilities

- **STD-008:** Preserve the separation between entities, data-oriented components, and systems that implement behavior.
- **STD-009:** Components should primarily contain data. Game rules belong in game systems, not in ECS storage infrastructure.
- **STD-010:** Keep each class and module focused on a clear responsibility.
- **STD-011:** Keep entity lifecycle management, component storage, archetype management, query evaluation, and scheduling separated unless an intentional, documented design decision justifies coupling.
- **STD-012:** Avoid circular dependencies between core modules.
- **STD-013:** Do not introduce new patterns, managers, abstractions, or dependencies without a concrete requirement or demonstrated benefit.
- **STD-014:** Prefer existing APIs and established conventions over overlapping ways to perform the same operation.
- **STD-015:** Keep game-specific behavior out of the generic framework.

### 19.4 Correctness and state management

- **STD-016:** Preserve the invariants in this specification across successful operations and failure paths.
- **STD-017:** Do not silently swallow errors that indicate invalid usage or potentially corrupted state. Recovery and propagation behavior must be deliberate.
- **STD-018:** Validate public API inputs at suitable boundaries without adding redundant checks to every internal helper.
- **STD-019:** Make side effects clear, especially changes to entity lifecycle, component membership, storage, scheduling, and world state.
- **STD-020:** Keep indexes, caches, masks, queries, and storage synchronized when their underlying state changes.
- **STD-021:** Do not expose mutable internal collections unless the exposure is intentional and documented.
- **STD-022:** Cleanup and reset operations must leave the framework valid, including when invoked repeatedly or when an error occurs.
- **STD-023:** Avoid global mutable state. State belonging to a world must remain associated with that world instance.
- **STD-024:** Preserve the documented distinction between replacing component values and mutating component data in place. Do not impose immutability as a blanket rule; follow the component reference and notification contract.

### 19.5 Naming, formatting, and organization

- **STD-025:** Follow the repository's existing naming and formatting conventions. Do not introduce a competing style in new or edited files.
- **STD-026:** Use descriptive names for classes, types, methods, variables, and component identifiers. Prefer PascalCase for classes and types and camelCase for methods and variables; follow established repository conventions for constants and files.
- **STD-027:** Keep methods focused. Extract helpers when that makes behavior clearer, easier to test, or less duplicated—not simply to meet a line-count target.
- **STD-028:** Avoid duplicated implementations of sensitive logic such as entity validation, archetype transitions, and structural-change processing when sharing the implementation would improve consistency without creating harmful coupling.
- **STD-029:** Keep public APIs as small as practical. Do not expose internal details without a clear use case.
- **STD-030:** Preserve repository formatting conventions encoded in `.editorconfig` (UTF-8, LF line endings, two-space indentation, final newline, and no trailing whitespace) unless the configuration is intentionally changed.

### 19.6 Documentation

- **STD-031:** Document public APIs when their purpose, parameters, return values, side effects, or failure behavior are not self-evident.
- **STD-032:** Comments should explain why a decision or constraint exists rather than restating what the code visibly does.
- **STD-033:** Record non-obvious invariants and architectural decisions near the code they govern.
- **STD-034:** Update `ECS_GUIDE.md` when verified public API behavior or recommended usage changes.
- **STD-035:** Update `ECS_SPEC.md` only when an intended requirement or design decision changes. Do not weaken a requirement merely to make it match a defect.
- **STD-036:** Do not describe behavior as supported or guaranteed until it has been verified by appropriate tests or other sufficient evidence. Mark unverified behavior and open decisions explicitly.

### 19.7 Testing and verification

- **STD-037:** Every bug fix should include a regression test when practical.
- **STD-038:** New features must include tests for normal behavior, important boundaries, and invalid inputs.
- **STD-039:** Tests should verify observable contracts and invariants, not merely duplicate the implementation's current logic.
- **STD-040:** Tests must be deterministic and independently runnable, except when a test explicitly exercises timing, ordering, or interactions between tests.
- **STD-041:** Tests must clean up resources and state so they do not unintentionally affect other tests.
- **STD-042:** Do not delete or weaken a failing test merely to obtain a green suite. First determine whether the test or implementation conflicts with the specification and document the reasoning.
- **STD-043:** Do not claim that code compiles, lint passes, a build succeeds, or tests pass unless the corresponding command was actually run and its results inspected.
- **STD-044:** When verification cannot be run, state what was not run and why. Distinguish static review from executed tests.
- **STD-045:** Use the repository's existing verification commands where available. At present, `package.json` defines `test`, `lint`, and `build` scripts; use the appropriate scripts rather than inventing parallel workflows without a reason.

### 19.8 Performance and resource use

- **STD-046:** Prefer a clear, correct implementation over speculative optimization.
- **STD-047:** Avoid unnecessary allocations in demonstrated hot paths, but base performance changes on profiling or representative benchmarks where practical.
- **STD-048:** Changes to archetype storage, query caching, entity allocation, and structural-change processing must preserve their correctness guarantees.
- **STD-049:** Benchmarks must describe their workload and what is measured. A performance claim must be supported by evidence rather than inferred from an API's name or design.

### 19.9 Changes and refactoring

- **STD-050:** Make the smallest coherent change that satisfies the requirement.
- **STD-051:** Keep unrelated refactoring separate from bug fixes and feature work.
- **STD-052:** Do not rewrite a subsystem solely to conform to a preferred pattern when a smaller change preserves the required behavior.
- **STD-053:** Before changing a public API, identify affected callers, tests, documentation, and compatibility implications.
- **STD-054:** After code changes, run the relevant tests and checks; run the full test suite and broader checks when practical. Review the final diff for unrelated changes and untested assumptions.
- **STD-055:** When completing a task, summarize the changed files, design decisions, verification actually performed, and known limitations.

### 19.10 AI-assisted development

When an AI coding assistant works in this repository:

1. Read the relevant parts of `ECS_SPEC.md`, `ECS_GUIDE.md`, source code, tests, and configuration before proposing changes.
2. Identify the applicable requirements and current evidence before editing.
3. Do not assume a feature works because it is documented, appears in an example, or resembles a feature in another ECS.
4. Do not modify unrelated files or include unrequested improvements.
5. For an investigation or review-only request, do not edit files unless implementation is explicitly authorized.
6. Add or update tests before or alongside implementation changes, choosing the smallest test that demonstrates the required behavior.
7. Report the actual commands executed and their results; identify skipped checks explicitly.
8. Flag ambiguity or conflict rather than silently choosing behavior that affects public contracts or architecture.
9. Do not claim completion while known failures, unresolved regressions, or important unverified requirements remain undisclosed.
10. Keep proposed changes reviewable. Explain trade-offs when a change materially affects architecture, performance, compatibility, or public behavior.

### 19.11 Automated enforcement and current baseline

Standards should be automated where a reliable tool can enforce them, but the existence of a tool or configuration file is not proof that every standard is satisfied.

The current repository configuration establishes the following baseline:

- **Type checking:** `tsconfig.json` enables `strict: true`.
- **Linting:** `package.json` exposes an `npm run lint` script using ESLint. The current `eslint.config.mts` uses ESLint recommended rules and the recommended TypeScript ESLint configuration, plus JSON, Markdown, and CSS checks.
- **Formatting:** `.editorconfig` specifies UTF-8, LF line endings, two-space indentation, a final newline, and trimmed trailing whitespace. A dedicated formatter configuration was not identified during this review.
- **Tests:** `package.json` exposes `npm test`, which runs `jiti js/tests/index.ts`.
- **Build:** `package.json` exposes `npm run build`.

These are configuration observations, not results of running the commands. This documentation update does not assert that linting, type checking, tests, or the build currently pass. Compiler checking is not listed as a dedicated `package.json` script; a separate repeatable type-check command may be considered after confirming the intended compiler invocation and resolving any existing errors.

Do not add strict rules such as maximum method length, mandatory immutability, or blanket bans on type assertions without a demonstrated need and an agreed configuration. Standards should guide sound engineering, not generate mechanical edits that reduce clarity or conflict with the existing architecture.

---

## Definition of done

The ECS core is ready for roguelike feature development when entity identity, component storage, archetype transitions, queries, and structural changes have automated tests that pass consistently.

The scheduler, observer behavior, and world lifecycle must then be tested before relying on them for scene changes or complex gameplay.

The complete framework does not need every optional feature finished before game development begins. It does need a reliable, tested core that can be extended without repeatedly rediscovering basic correctness bugs.
