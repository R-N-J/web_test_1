# Rogue1 ECS Guide

Welcome to the Rogue1 ECS (Entity-Component-System). This is a high-performance, archetype-based ECS designed for efficiency and ease of use.

## Table of Contents
- [Core Concepts](#core-concepts)
- [Architecture: Archetypes and SoA](#architecture-archetypes-and-soa)
  - [What are Archetypes?](#what-are-archetypes)
  - [Struct-of-Arrays (SoA) in JavaScript](#struct-of-arrays-soa-in-javascript)
- [1. Setting Up the World](#1-setting-up-the-world)
  - [Defining Components](#defining-components)
  - [Initializing the World](#initializing-the-world)
- [2. Entities and Components](#2-entities-and-components)
  - [Creating an Entity](#creating-an-entity)
  - [Adding Components](#adding-components)
  - [Component Interfaces and Type Safety](#component-interfaces-and-type-safety)
  - [Accessing and Modifying Data](#accessing-and-modifying-data)
  - [Removing Components and Deleting Entities](#removing-components-and-deleting-entities)
- [3. Querying Entities (Aspects and Views)](#3-querying-entities-aspects-and-views)
  - [Why Query?](#why-query)
  - [Aspects: The Filters](#aspects-the-filters)
  - [Using Views](#using-views)
  - [High-Performance Queries: viewColumns](#high-performance-queries-viewcolumns)
  - [Single Entity Matching](#single-entity-matching)
  - [Querying by Tag or Group](#querying-by-tag-or-group)
  - [Why use these methods? (The QueryManager)](#why-use-these-methods-the-querymanager)
- [4. Tags and Groups](#4-tags-and-groups)
  - [Tags (Unique 1-to-1)](#tags-unique-1-to-1)
  - [Groups (1-to-Many)](#groups-1-to-many)
- [5. Relationships](#5-relationships)
  - [Why use Relationships?](#why-use-relationships)
  - [1-to-1 Relationships (Exclusive)](#1-to-1-relationships-exclusive)
  - [1-to-Many Relationships (Non-Exclusive)](#1-to-many-relationships-non-exclusive)
  - [Symmetric Relationships](#symmetric-relationships)
  - [Retrieving Targets](#retrieving-targets)
  - [Removing Relationships](#removing-relationships)
  - [Automatic Cleanup and Integrity](#automatic-cleanup-and-integrity)
- [6. Tags vs. Groups vs. Relationships](#6-tags-vs-groups-vs-relationships)
  - [When to use what?](#when-to-use-what)
- [7. Prefabs](#7-prefabs)
  - [Defining a Prefab](#defining-a-prefab)
  - [Spawning a Prefab](#spawning-a-prefab)
  - [Loading Prefabs Externally](#loading-prefabs-externally)
- [8. Observers](#8-observers)
  - [Why use Observers?](#why-use-observers)
  - [Component Observers](#component-observers)
  - [Mask Observers](#mask-observers)
  - [Managers vs. Systems in Observers](#managers-vs-systems-in-observers)
  - [Interaction Examples](#interaction-examples)
- [9. Systems, Scheduler, and TurnManager](#9-systems-scheduler-and-turnmanager)
  - [Different Types of Systems](#different-types-of-systems)
  - [The Scheduler](#the-scheduler)
  - [The TurnManager](#the-turnmanager)
  - [Putting It All Together: The Best Way](#putting-it-all-together-the-best-way)
- [10. Decorators](#10-decorators)
  - [Aspect Decorators](#aspect-decorators)
  - [Filtering Decorators](#filtering-decorators)
  - [Execution Decorators](#execution-decorators)
  - [Why use Decorators?](#why-use-decorators)
- [11. The ECS Engine Flow](#11-the-ecs-engine-flow)
- [12. Advanced Features](#12-advanced-features)
  - [Singletons](#singletons)
  - [Snapshots (Saving/Loading)](#snapshots-savingloading)
  - [Batch Editing](#batch-editing)
- [13. Performance Best Practices](#13-performance-best-practices)
- [14. Comparison with Other ECS Architectures](#14-comparison-with-other-ecs-architectures)
- [15. Drawbacks and Considerations](#15-drawbacks-and-considerations)
- [Method Cheat Sheet](#method-cheat-sheet)

---

## Core Concepts

- **World**: The container for all entities, components, and systems.
- **Entity**: A unique ID representing a "thing" in your game.
- **Component**: Pure data attached to an entity (e.g., Position, Health).
- **System**: Logic that processes entities with specific component combinations.
- **Aspect**: A filter used to query entities (e.g., "all entities with Position and Health").
- **Archetype**: A group of entities that share the exact same set of components, stored in a Struct-of-Arrays (SoA) format for performance.

---

## Architecture: Archetypes and SoA

Rogue1 ECS uses an **Archetype-based** architecture with **Struct-of-Arrays (SoA)** storage. This is a departure from "Entity-centric" ECS libraries which often store components as objects attached to an entity.

### What are Archetypes?
An Archetype is a collection of entities that share the **exact same set of components**.
- If Entity A has `[Position, Health]` and Entity B has `[Position, Health]`, they belong to the same Archetype.
- If Entity C has `[Position, Health, Render]`, it belongs to a different Archetype.

**The Advantage**:
1. **Blazing Fast Iteration**: When a system processes entities, it doesn't have to check every entity in the world. It only looks at the specific Archetypes that match its `Aspect`.
2. **Deterministic Layout**: Because all entities in an Archetype have the same components, we can store their data in a predictable way.

### Struct-of-Arrays (SoA) in JavaScript
In most JS programs, we use **Array-of-Structures (AoS)**:
```javascript
// AoS: One array of many objects
const entities = [
  { x: 1, y: 1, hp: 10 },
  { x: 2, y: 2, hp: 20 }
];
```

In Rogue1, we use **SoA** inside each Archetype. Every component type gets its own dedicated array (a "column"):
```javascript
// SoA: Parallel arrays for each piece of data
const arch_Pos_Health = {
  entities: [1, 2],
  columns: {
    POSITION: [{x: 1, y: 1}, {x: 2, y: 2}],
    HEALTH:   [{current: 10, max: 10}, {current: 20, max: 20}]
  }
};
```

**Why is SoA better for JavaScript?**
- **Memory Locality**: Accessing `positions[i]` and then `positions[i+1]` is very fast because they are likely adjacent in memory.
- **V8 Optimization**: Modern JS engines (like V8 in Chrome/Node) can optimize loops over simple arrays much better than loops over an array of mixed, complex objects.
- **Cache Friendly**: When the CPU fetches data from memory, it fetches "lines". With SoA, one fetch might bring in the data for several entities at once, reducing "cache misses".

---

## 1. Setting Up the World

The first step is to create a `World` instance and register your components. It is crucial to register all components before creating entities to ensure performance and consistency.

### Defining Components
Components are identified by unique numeric IDs. It is best to define them in a central place like `ComponentIds.ts`. Use a constant object and TypeScript's `as const satisfies Record<string, ComponentId>` to ensure type safety.

```typescript
// js/ECS/ComponentIds.ts
export const Components = {
  // Core
  POSITION: 0,
  HEALTH: 1,
  RENDER: 2,

  // Relationships
  REL_OWNED_BY: 100,
} as const satisfies Record<string, ComponentId>;

export interface Position { x: number; y: number; }
export interface Health { current: number; max: number; }
```

### Initializing the World
Always use a bootstrap function to initialize your world. This ensures that all components and serializers are registered in the correct order.

```typescript
import { World } from './ECS/World';
import { bootstrapEcs } from './ECS/ComponentIds';

const world = new World();

// bootstrapEcs registers all IDs and any custom serializers
bootstrapEcs(world);
```

---

## 2. Entities and Components

### Creating an Entity
Entities are just numeric IDs.
```typescript
const player = world.createEntity();
```

### Adding Components
```typescript
world.addComponent(player, Components.POSITION, { x: 10, y: 10 });
world.addComponent(player, Components.HEALTH, { current: 100, max: 100 });
```

### Component Interfaces and Type Safety
Component data is defined using standard TypeScript `interface` or `type`.

**The data IS the interface**: In this ECS, components are not classes with logic. They are "Plain Old JavaScript Objects" (POJOs) whose structure is defined by your interface. The interface acts as the single source of truth for what data exists for a component.

These interfaces should be used with the generic ECS methods (`getComponent<T>`, etc.) to ensure type safety and IDE autocompletion.

```typescript
// Define the shape of your data
export interface Position { x: number; y: number; }
export interface Velocity { dx: number; dy: number; }

// Use the interface with world methods
const pos = world.getComponent<Position>(entity, Components.POSITION);
if (pos) {
  // TypeScript knows 'pos' has 'x' and 'y'
  console.log(pos.x, pos.y);
}
```
It is a best practice to keep these interfaces in the same file as your `Components` ID definitions (e.g., `ComponentIds.ts`).

### Accessing and Modifying Data
There are four primary ways to interact with component data. Understanding the difference between them is crucial for performance and preventing bugs.

- **getComponent<T>**: Returns a **reference** to the component data.
- **setComponent<T>**: **Replaces** the existing component data with a new object/value.
- **updateComponent<T>**: Uses a callback to **replace** the component data. It reads the current value, lets you compute a new one, and then performs a `set`.
- **mutateComponent<T>**: Provides the existing object for **in-place modification**. It does NOT replace the object reference in the storage.

#### The Difference: Reassignment vs. Mutation

| Method | Reassigns Array Slot? | Best Use Case |
| :--- | :--- | :--- |
| `setComponent` | **Yes** | Replacing a value entirely (e.g., `hp = 100`). |
| `updateComponent` | **Yes** | Immutability patterns or simple math (e.g., `hp = current - 5`). |
| `mutateComponent` | **No** | Modifying properties of an object (e.g., `pos.x += 1`). |

**Why `mutateComponent` is not an "Update" or "Set":**
In a `set` or `update`, the internal storage (the array slot in the Archetype column) is assigned a new reference. In a `mutate`, the reference in the array slot stays exactly the same; you are just reaching "inside" the existing object and changing its properties.

**Examples:**

```typescript
// 1. setComponent: Overwrite completely
// The old {x, y} object is discarded; a new one is stored in the column.
world.setComponent<Position>(player, Components.POSITION, { x: 5, y: 5 });

// 2. updateComponent: Read -> Transform -> Overwrite
// Useful when you need the current value to determine the next one.
world.updateComponent<Health>(player, Components.HEALTH, (h) => {
  return { ...h, current: h.current - 10 }; // returns a NEW object to be stored
});

// 3. mutateComponent: In-place change
// The object reference in the World remains the same.
// No new object is created, making it the most memory-efficient for frequent updates.
world.mutateComponent<Position>(player, Components.POSITION, (p) => {
  p.x += 1; // Direct modification of the existing object
});
```

### Removing Components and Deleting Entities
```typescript
world.removeComponent(player, Components.HEALTH);
world.deleteEntity(player);
```

---

## 3. Querying Entities (Aspects and Views)

Querying is the process of finding entities that match specific criteria. In Rogue1, this is primarily done using **Aspects** to define filters and **Views** to iterate over the results efficiently.

### Why Query?
In an ECS, you rarely want to iterate over *all* entities. Instead, systems usually focus on entities that have a specific set of components. For example:
- A `MovementSystem` only cares about entities with `POSITION` and `VELOCITY`.
- A `RenderSystem` only cares about entities with `POSITION` and `RENDER`.
- A `PoisonSystem` might care about entities with `HEALTH` and a `POISONED` tag.

Querying allows the ECS to provide you with exactly the entities you need, pre-filtered for performance.

### Aspects: The Filters
An `Aspect` defines the requirements for an entity to be included in a query. It uses bitwise masks under the hood for near-instant matching against Archetypes.

#### Factory Methods
| Method | Description |
| :--- | :--- |
| `Aspect.all(...ids)` | Matches entities that have **ALL** of the specified components. |
| `Aspect.one(...ids)` | Matches entities that have **AT LEAST ONE** of the specified components. |
| `Aspect.exclude(...ids)`| Matches entities that have **NONE** of the specified components. |

#### Composing Complex Queries
You can chain methods to create complex requirements:

```typescript
import { Aspect } from './ECS/Aspect';

// Entities that have POSITION and HEALTH, but are NOT DEAD
const aliveFighters = Aspect.all(Components.POSITION, Components.HEALTH)
                            .butNot(Components.DEAD);

// Entities that have either FIRE_RESIST or WATER_RESIST
const resistant = Aspect.one(Components.FIRE_RESIST, Components.WATER_RESIST);

// Combining requirements from another Aspect
const combined = aliveFighters.and(resistant);
```

### Using Views
A `view` is the most common way to iterate over entities matching an aspect.

```typescript
for (const entity of world.view(aliveFighters)) {
  const pos = world.getComponent<Position>(entity, Components.POSITION);
  // ...
}
```

### High-Performance Queries: `viewColumns`
If you are iterating over many entities and need to access multiple components, `world.view(aspect)` can have overhead because it involves looking up component data for each entity individually.

For performance-critical loops (like physics or rendering), use `viewColumns`. It yields the raw data arrays (columns) from each matching Archetype, allowing you to iterate over them directly. This is much faster because it leverages **SoA (Struct-of-Arrays)** cache locality.

```typescript
const aspect = Aspect.all(Components.POSITION, Components.VELOCITY);

// Iterating via columns (Fastest)
// Use destructuring to get entities and the requested columns in order
for (const { entities, columns: [posCol, velCol] } of world.viewColumns(aspect, Components.POSITION, Components.VELOCITY)) {
  const count = entities.length;
  for (let i = 0; i < count; i++) {
    const pos = posCol[i] as Position;
    const vel = velCol[i] as Velocity;

    pos.x += vel.dx;
    pos.y += vel.dy;
  }
}
```

- **`viewColumns(aspect, ...ids)`**: Returns an iterator. It skips any Archetype that happens to be missing a requested column (though this shouldn't happen if using `Aspect.all`).
- **`viewColumnsStrict(aspect, ...ids)`**: Similar to `viewColumns` but throws an error if a requested column is missing. Use this when your `Aspect.all()` requirements guarantee the columns exist.

### Single Entity Matching
Sometimes you have a specific `EntityId` and want to check if it matches an `Aspect`:

```typescript
if (world.matches(someEntity, Aspect.all(Components.BURNING))) {
    // Apply fire damage logic
}
```

### Querying by Tag or Group
While Aspects are for component-based queries, you can also query via the `TagManager` and `GroupManager` wrappers on the `World`. These are often faster than Aspects if you only need to find a single unique entity or a pre-defined set.

```typescript
// Find a unique entity by tag
for (const player of world.viewTag('PLAYER')) {
    // Guaranteed to run at most once
}

// Iterate over a pre-categorized group
for (const enemy of world.viewGroup('ENEMIES')) {
    // Process only entities explicitly added to the 'ENEMIES' group
}
```

### Why use these methods? (The QueryManager)
The `World` query methods use an internal `QueryManager` which provides several critical benefits:

1.  **Result Caching**: The first time you use an `Aspect`, the engine scans all Archetypes. The results are cached. Subsequent queries using the same `Aspect` (or a System using it) are near-instant.
2.  **Automatic Reactivity**: When an entity gains or loses components and moves to a new Archetype, the `QueryManager` automatically updates all active cached queries. You never have to worry about "stale" results.
3.  **Low Overhead**: By using bitwise masks for matching, the cost of checking if an Archetype fits a query is extremely low, regardless of how many entities are in the world.

---

## 4. Tags and Groups

Managing specific entities or collections of entities is handled by the `TagManager` and `GroupManager`. These are lightweight systems that sit outside the main component-based Archetype system, providing fast lookups and organization.

### Tags (Unique 1-to-1)
Tags are unique strings assigned to a single entity. They are perfect for "Singletons" that are actual entities (like the `PLAYER`) or global manager entities. An entity can only have one tag at a time, and a tag can only point to one entity.

#### Common Operations
```typescript
// 1. Assign a tag (throws if tag is already used)
world.tags.register('PLAYER', playerEntity);

// 2. Retrieve an entity by tag
const player = world.tags.getEntity('PLAYER'); // EntityId | undefined

// 3. Check if a tag exists
if (world.tags.has('BOSS_REGEN_NODE')) {
  // Entity exists
}

// 4. Reverse lookup: What tag does this entity have?
const tag = world.tags.getTag(playerEntity); // string | undefined

// 5. Remove a tag (by entity)
world.tags.unregister(playerEntity);
```

### Groups (1-to-Many)
Groups allow you to categorize multiple entities under a single label. They are ideal for sets of entities that you need to iterate over frequently or check membership for (e.g., "all enemies", "all projectiles").

#### Common Operations
```typescript
// 1. Add entities to a group
world.groups.add('ENEMIES', orcEntity);
world.groups.add('ENEMIES', goblinEntity);

// 2. Check membership
if (world.groups.has('ENEMIES', someEntity)) {
  console.log("This entity is an enemy!");
}

// 3. Get group size
const enemyCount = world.groups.count('ENEMIES');

// 4. Iterate over a group
// getEntities returns an array. Passing 'world' filters out deleted entities automatically.
for (const entity of world.groups.getEntities('ENEMIES', world)) {
  // Logic for all enemies
}

// 5. Remove an entity from a specific group
world.groups.removeFromGroup('ENEMIES', orcEntity);
```

---

## 5. Relationships

Relationships allow entities to reference other entities (e.g., "A is owned by B", "C is targeting D"). They are built on top of the Component system but provide a specialized API for managing entity-to-entity links.

### Why use Relationships?
- **Hierarchies**: Items in an inventory (`REL_OWNED_BY`), equipment.
- **AI Targeting**: A monster targeting the player (`REL_TARGETING`).
- **Social**: Friendly vs Hostile factions (`REL_MEMBER_OF`).
- **World State**: A lever controlling a door (`REL_CONTROLS`).

### 1-to-1 Relationships (Exclusive)
By default, adding a relationship is "exclusive". If you add a new target, it replaces the old one. This is perfect for relationships where an entity can only have one target at a time.

```typescript
const REL_TARGETS = 101;

// monster -> REL_TARGETS -> player
world.relationships.add(monster, REL_TARGETS, player);

// If the monster changes targets, the old one is replaced automatically
world.relationships.add(monster, REL_TARGETS, anotherEntity);
```

### 1-to-Many Relationships (Non-Exclusive)
If you pass `false` for the `exclusive` parameter, the relationship becomes a collection (stored internally as a `Set`).

```typescript
const REL_MEMBER_OF = 102;

// An entity can belong to multiple factions
world.relationships.add(player, REL_MEMBER_OF, factionA, false);
world.relationships.add(player, REL_MEMBER_OF, factionB, false);
```

### Symmetric Relationships
Useful for bidirectional links where both entities should point to each other.

```typescript
world.relationships.addSymmetric(portalA, portalB, REL_LINKED_TO);
// Now portalA links to portalB AND portalB links to portalA.
```

### Retrieving Targets
There are several ways to retrieve the targets of a relationship:

```typescript
// 1. Get raw value (EntityId | Set<EntityId> | undefined)
const target = world.relationships.getTargets(monster, REL_TARGETS);

// 2. Get always as an array (Recommended for loops)
const factions = world.relationships.getTargetsArray(player, REL_MEMBER_OF);
factions.forEach(f => console.log("Member of:", f));

// 3. Reverse lookup: Who is targeting this entity?
// Returns an IterableIterator<EntityId>
const hunters = world.relationships.getRelated(REL_TARGETS, player);
for (const hunter of hunters) {
  console.log(`${hunter} is hunting the player!`);
}

// 4. Count relations: How many entities target this one?
const hunterCount = world.relationships.countRelated(REL_TARGETS, player);
```

### Removing Relationships
You can remove a specific target from a collection, or clear all targets for a relationship at once.

```typescript
// Remove a specific link (from a 1-to-Many set)
world.relationships.remove(player, REL_MEMBER_OF, factionA);

// Clear ALL targets for a relationship (works for both 1-to-1 and 1-to-Many)
world.relationships.clearRelations(monster, REL_TARGETS);

// Reset the entire internal relationship index (usually handled by world.clear())
world.relationships.clear();
```

### Automatic Cleanup and Integrity
A major advantage of using the `RelationshipManager` is **automatic referential integrity**. When an entity is deleted via `world.deleteEntity(id)`:
1. All relationships where that entity was the **subject** are removed.
2. All relationships where that entity was the **target** are also removed from any other entities that were pointing to it.

This prevents "Ghost ID" bugs where a system tries to process a target entity that no longer exists in the world.

---

## 6. Tags vs. Groups vs. Relationships

While they might seem similar at first glance, each serves a specific purpose. Choosing the right one is key to performance and code clarity.

| Feature | Tags | Groups | Relationships |
| :--- | :--- | :--- | :--- |
| **Cardinality** | 1-to-1 (Unique) | 1-to-Many | 1-to-1 or 1-to-Many |
| **Storage** | External Map | External Map | **Inside Components** |
| **Archetype Impact** | None | None | **Yes** (Structural) |
| **Referential Integrity** | No | No | **Yes** (Automatic Cleanup) |
| **Reverse Lookup** | O(1) | O(1) | O(N) (Iterates Archetypes) |
| **Best For** | Singletons | Bulk Categorization | Entity-to-Entity links |

### When to use what?

#### Use Tags when...
...you have a unique entity that exists globally and you need to find it instantly from anywhere in the codebase.
*   **Examples**: `PLAYER`, `MAIN_CAMERA`, `LEVEL_EXIT`.

#### Use Groups when...
...you need to label sets of entities for quick iteration or simple membership checks, and these labels don't represent a direct link to another specific entity.
*   **Examples**: `ENEMIES`, `ITEMS_ON_GROUND`, `RENDER_LAYER_1`.

#### Use Relationships when...
...you need one entity to "point" to another specific entity, and you want the ECS to handle the "Ghost ID" problem (automatic cleanup if the target is deleted).
*   **Examples**: `EQUIPPED_BY`, `TARGETING`, `PART_OF_FACTION`.
*   *Note: Because Relationships are stored as components, they also allow you to query for entities "having a relationship" using Aspects/Views, which you cannot do with Tags or Groups.*

---

## 7. Prefabs

Prefabs are templates used to spawn complex entities with predefined components and relationships.

### Defining a Prefab
Prefabs are defined as objects containing component IDs and their initial values.

```typescript
const ORC_PREFAB = {
  name: 'Orc',
  components: [
    { id: Components.POSITION, value: { x: 0, y: 0 } },
    { id: Components.HEALTH, value: { current: 20, max: 20 } },
    { id: Components.RENDER, value: { char: 'O', color: 'green' } }
  ]
};

world.prefabs.register('orc', ORC_PREFAB);
```

### Spawning a Prefab
```typescript
// Spawn with default values
const orc = world.prefabs.spawn('orc');

// Spawn with overrides
const spawnedOrc = world.prefabs.spawn('orc', new Map([
  [Components.POSITION, { x: 5, y: 5 }]
]));
```

### Loading Prefabs Externally

To define prefabs externally (like in a JSON file or a database) and load them into your ECS, you would follow these steps:

#### 1. Create a JSON Definition File
Since your `PrefabDefinition` interface (found in `PrefabManager.ts`) uses standard types, you can represent your prefabs in a JSON file.

Create a file like `js/entities/prefabs.json`:

```json
[
  {
    "name": "orc_warrior",
    "components": [
      { "id": 0, "value": { "x": 0, "y": 0 } },
      { "id": 2, "value": { "current": 30, "max": 30 } },
      { "id": 1, "value": { "char": "O", "color": "#ff0000" } }
    ],
    "relationships": [
      { "id": 100, "targetTag": "ORC_FACTION" }
    ]
  },
  {
    "name": "health_potion",
    "components": [
      { "id": 1, "value": { "char": "!", "color": "#ff00ff" } },
      { "id": 5, "value": { "healAmount": 10 } }
    ]
  }
]
```

*(Note: Use the numeric IDs defined in your `ComponentIds.ts` for the `id` fields.)*

#### 2. Create a Loading Utility
In your `js/entities/` folder (or wherever you manage content), create a loader that fetches this data and registers it with the `World`.

```typescript
// js/entities/PrefabLoader.ts
import { World } from "../ECS/World";
import { PrefabDefinition } from "../ECS/PrefabManager";

export async function loadExternalPrefabs(world: World, url: string) {
  try {
    const response = await fetch(url);
    const data: PrefabDefinition[] = await response.json();

    // Use the built-in registerAll method from PrefabManager
    world.prefabs.registerAll(data);

    console.log(`Loaded ${data.length} prefabs from ${url}`);
  } catch (error) {
    console.error("Failed to load prefabs:", error);
  }
}
```

#### 3. Initialize in your Main Program
When you start your game, call your loader after the `World` is bootstrapped (wherever you initialize your ECS).

```typescript
// ... in your main entry point (e.g., app.ts) ...
const world = new World();
bootstrapEcs(world);

// Load prefabs from your "database" (JSON endpoint)
await loadExternalPrefabs(world, "./js/entities/prefabs.json");

// Now you can spawn them by name
const orc = world.prefabs.spawn("orc_warrior");
```

### Key Considerations:
1.  **Numeric IDs:** Your JSON must use the actual numbers from `ComponentIds.ts`. If you change those numbers in code but don't update your database/JSON, your prefabs will break or assign data to the wrong components.
2.  **Complex Data:** If your component values contain non-JSON types (like `Set` or `Map`), you must ensure you have registered `ComponentSerializers` in your `World` so the `PrefabManager` (which uses the `EntityEditor`) handles the data correctly.
3.  **Relationships:** The `targetTag` in the JSON relies on an entity with that tag already existing in the `World` (via `world.tags.register`) at the moment you call `spawn()`.

---

## 8. Observers

Observers allow you to react to changes in the ECS state, such as when components are added or removed, or when an entity's composition changes. They are essential for bridging the gap between state changes and side effects (like UI or audio) or for maintaining data integrity in external managers.

### Why use Observers?

While **Systems** are great for logic that runs every frame or turn on a group of entities, **Observers** are best for:
- **Reactive Side Effects**: Logging a message when an entity is stunned, playing a sound when an item is dropped, or triggering a particle effect when a shield breaks.
- **Data Synchronization**: Automatically adding an entity to a `GroupManager` when it gains a specific component, or unregistering a `Tag` when an entity is destroyed.
- **Immediate Response**: Logic that must happen exactly when a component is attached, rather than waiting for the next system update.

### Component Observers
You can subscribe to be notified when a specific component is added to or removed from any entity.

```typescript
// Define the observer callback
const onHealthAdded = (entity: EntityId, componentId: ComponentId) => {
  console.log(`Entity ${entity} gained Health component!`);
};

// Subscribe
world.subscribeOnAdd(Components.HEALTH, onHealthAdded);
world.subscribeOnRemove(Components.HEALTH, (entity, id) => {
  console.log(`Entity ${entity} lost Health component!`);
});

// Unsubscribe when no longer needed
world.unsubscribeOnAdd(Components.HEALTH, onHealthAdded);
```

### Mask Observers
Mask observers are triggered whenever an entity's component composition changes (any component added or removed). The internal ECS `QueryManager` uses these to keep system entity lists up to date.

```typescript
world.subscribeOnMaskChange((entity, oldMask, newMask) => {
  console.log(`Entity ${entity} changed from ${oldMask} to ${newMask}`);
});
```

### Managers vs. Systems in Observers

A common question is whether an observer should call a **System** or a **Manager**.

- **Call Managers**: This is the preferred approach. Managers (like `MessageLog`, `TagManager`, or `RelationshipManager`) provide immediate utility functions to update global state or UI.
- **Avoid calling Systems**: Systems are designed to be driven by the `Scheduler`. Calling `system.update()` or `system.process()` from an observer can break the intended execution order and cause unpredictable side effects. If you need a system to react to a change, have the observer update a component or a manager that the system then inspects during its normal update cycle.

### Interaction Examples

#### Interacting with MessageLog
```typescript
world.subscribeOnAdd(Components.STUNNED, (entity) => {
    const name = world.getComponent<Name>(entity, Components.NAME)?.value || "Someone";
    messageLog.addMessage(`${name} is stunned!`, COLOR.YELLOW);
});
```

#### Interacting with TagManager or GroupManager
```typescript
// Automatically group all entities that can be targeted
world.subscribeOnAdd(Components.TARGETABLE, (entity) => {
    groupManager.add("targets", entity);
});

world.subscribeOnRemove(Components.TARGETABLE, (entity) => {
    groupManager.removeFromGroup("targets", entity);
});
```

#### Interacting with RelationshipManager
```typescript
// When an 'Owned' component is removed, ensure the relationship is also cleaned up
world.subscribeOnRemove(Components.REL_OWNED_BY, (entity) => {
    world.relationships.clearRelations(entity, Components.REL_OWNED_BY);
});
```

---

## 9. Systems, Scheduler, and TurnManager

Systems encapsulate logic. The `Scheduler` manages their execution, and the `TurnManager` controls the high-level game loop.

### Different Types of Systems
Rogue1 provides several specialized system base classes to handle different logic patterns efficiently.

| System Type | Purpose | Best Use Case |
| :--- | :--- | :--- |
| `IteratingSystem` | Processes every entity matching an `Aspect`. | Movement, Combat, AI, Physics. |
| `IntervalSystem` | Processes entities every N-th update/turn. | Stamina regen, Hunger, Poison damage. |
| `SortedIteratingSystem` | Processes entities in a specific sorted order. | Rendering order (Z-index), Initiative order. |
| `PassiveSystem` | Logic that is not automatically run on entities. | Renderers, Input handling, Event managers. |

#### Why use which?
- **Choose `IteratingSystem`** for standard logic that should happen for everyone, every turn.
- **Choose `IntervalSystem`** to save performance or model logic that shouldn't happen too fast (e.g., ticking down a "Hungry" status).
- **Choose `SortedIteratingSystem`** when the *order* of entities matters. For example, in a tactical game, you might sort by an "Initiative" component.
- **Choose `PassiveSystem`** when you want the structure of a system (Aspects, world access) but you want to trigger the logic yourself (e.g., calling `render()` from a requestAnimationFrame loop).

#### Examples

**IteratingSystem (Movement)**
```typescript
class MovementSystem extends IteratingSystem {
  constructor(world: World) {
    super(world, Aspect.all(Components.POSITION, Components.VELOCITY));
  }

  processEntity(entity: EntityId, dt: number) {
    const pos = this.getComponent<Position>(entity, Components.POSITION);
    const vel = this.getComponent<Velocity>(entity, Components.VELOCITY);

    pos.x += vel.dx;
    pos.y += vel.dy;
  }
}
```

**IntervalSystem (Stamina Regen)**
```typescript
class StaminaRegenSystem extends IntervalSystem {
  constructor(world: World) {
    // Run every 5 turns
    super(world, Aspect.all(Components.STAMINA), 5);
  }

  processEntity(entity: EntityId, dt: number) {
    this.mutateComponent<Stamina>(entity, Components.STAMINA, (s) => {
      s.current = Math.min(s.max, s.current + 1);
    });
  }
}
```

### The Scheduler
The `Scheduler` is the central coordinator for all systems. It ensures that game logic is deterministic by running systems in the exact order they were added.

#### How to use it
You typically create one `Scheduler` at game start, add your systems to it, and then call its `update()` method in your game loop.

```typescript
import { Scheduler } from './ECS/Scheduler';

const scheduler = new Scheduler();

// Order matters!
scheduler.add(new AISystem(world));        // 1. Monsters decide what to do
scheduler.add(new MovementSystem(world));  // 2. Everyone moves
scheduler.add(new CollisionSystem(world)); // 3. Resolve position conflicts
scheduler.add(new RenderSystem(world));    // 4. Draw the result

// Inside your main loop:
scheduler.update(1.0);
```

**Key Methods:**
- `add(system)`: Adds a system to the end of the execution chain.
- `get(SystemClass)`: Returns the instance of a system. Useful if `CombatSystem` needs to trigger something in `ParticleSystem`.
- `setEnabled(SystemClass, boolean)`: Pauses or resumes a specific system.
- `clear()`: Removes all systems and calls their `cleanup()` hooks (crucial for level transitions).

### The TurnManager
The `TurnManager` is the "brain" of a turn-based game. It coordinates between the Player's input and the World's systems, and tracks the passage of time via a `CLOCK` singleton.

#### How to use it
Instead of calling `scheduler.update()` directly, you use the `TurnManager` to advance the game state.

```typescript
import { TurnManager } from './ECS/TurnManager';

const turnManager = new TurnManager(world, scheduler);

// 1. Check if it's the player's turn to act
if (turnManager.isPlayerTurn) {
    handlePlayerInput();
}

// 2. Once the player performs an action (e.g., moves):
function onPlayerAction() {
    turnManager.nextTurn();
}
```

When `nextTurn()` is called:
1. It increments the `turn` count in the `CLOCK` singleton.
2. It calls `scheduler.update(1.0)`, triggering all registered systems.
3. It resets the state to wait for the next player action.

### Putting It All Together: The Best Way
The combination of Systems, the Scheduler, and the TurnManager provides a powerful, clean architecture for roguelikes.

**The Recommended Flow:**
1.  **State is Data**: All game state (Player HP, Monster positions, Turn count) lives in **Components**.
2.  **Logic is in Systems**: No logic lives on the entity objects. The `MovementSystem` handles all movement.
3.  **Scheduler guarantees Order**: You never have to worry about a monster attacking a player *after* the player has already moved away, because you control the sequence in the `Scheduler`.
4.  **TurnManager handles Timing**: It acts as the gatekeeper, ensuring that the `AISystem` and `MovementSystem` only run when a turn actually passes.

**Example of the complete cycle:**
```typescript
// 1. Player presses 'Right'
const moved = PlayerSystem.tryMove(player, { x: 1, y: 0 });

// 2. If the move was valid, advance the world
if (moved) {
    turnManager.nextTurn();
}

// 3. Inside nextTurn(), the Scheduler runs:
//    - AISystem: Monster detects player is nearby, sets its Velocity.
//    - MovementSystem: Moves the monster toward the player.
//    - StaminaSystem: Ticks down because an action was taken.
//    - VisibilitySystem: Updates the player's FOV for the new position.

// 4. The RenderSystem (triggered after update) draws the updated world.
```

This approach is considered "The Best Way" because it ensures **Predictability**, **Performance** (via SoA archetypes), and **Ease of Debugging** (you always know which system modified which data and when).

---

## 10. Decorators

Decorators provide a declarative way to define a system's requirements and behavior. They make the code cleaner by moving configuration out of the constructor and onto the class itself.

### Aspect Decorators
Instead of passing an `Aspect` to the `super()` call, you can use these decorators to define the system's filter.

- **@All(...componentIds)** (or **@And**): The entity must have ALL of these components.
- **@One(...componentIds)** (or **@AnyOf**): The entity must have AT LEAST ONE of these components.
- **@Exclude(...componentIds)** (or **@NoneOf**, **@ButNot**): The entity must NOT have ANY of these components.
- **@Match(aspect)**: Merges an existing `Aspect` object into the system's requirements. Useful for reusing shared queries across multiple systems.

### Filtering Decorators
- **@Group(name)**: Restricts the system to entities in a specific `Group`.
- **@Tag(name)**: Restricts the system to a single entity with a specific `Tag`.

### Execution Decorators
- **@Interval(period)**: Only used with `IntervalSystem`. Defines how many "ticks" (turns) occur between executions.

### Examples

**Standard System with Aliases:**
```typescript
import { All, ButNot, Interval } from './ECS/Decorators';
import { Components, Position, Health } from './ComponentIds';

@All(Components.POSITION, Components.HEALTH)
@ButNot(Components.REL_OWNED_BY)
@Interval(5) // Run every 5 turns
class RegenSystem extends IntervalSystem {
  processEntity(entity: EntityId, dt: number) {
    this.updateComponent<Health>(entity, Components.HEALTH, (h) => {
      h.current = Math.min(h.max, h.current + 1);
      return h;
    });
  }
}
```

**Reusing Aspects with @Match:**
```typescript
const FIGHTER_ASPECT = Aspect.all(Components.POSITION, Components.HEALTH);

@Match(FIGHTER_ASPECT)
@And(Components.STAMINA)
class StaminaRegenSystem extends IteratingSystem {
    // This system will process entities with POSITION, HEALTH, AND STAMINA
}
```

### Why use Decorators?
1. **Readability**: You can see exactly what a system does at a glance without digging into the constructor.
2. **Boilerplate Reduction**: Avoids repeated `Aspect.all(...)` calls and `super(world, aspect)` boilerplate.
3. **Declarative Style**: Focuses on *what* the system needs rather than *how* it gets it.

### Adoption in Rogue1
While the Rogue1 ECS core fully supports and encourages the use of decorators, you may notice some "legacy" systems in the codebase (like `RenderSystem` or `PlayerSystem`) that do not yet use the ECS classes. As the game transitions to a full ECS architecture, all new systems extending `IteratingSystem`, `IntervalSystem`, or `SortedIteratingSystem` should use these decorators as their primary configuration method.

The base `IteratingSystem` class is designed to automatically detect these decorators on its subclasses, so no manual `super()` configuration is required when they are present.

### Comparison with Other ECS
While many JavaScript ECS libraries use imperative setup (passing filters to constructors), Rogue1's decorator approach is similar to:
- **Bevy (Rust)**: Uses a declarative system definition based on function signatures.
- **ECSY (JS)**: Uses static `queries` properties, which decorators essentially implement under the hood.
- **Entitas (C#)**: Uses code generation or attributes to define system interests.

Decorators bring a modern, type-safe, and highly readable syntax to Rogue1 that is often found in more mature ECS frameworks in other ecosystems.

---

## 11. The ECS Engine Flow

Understanding the flow of data and execution is key to using the ECS effectively.

1.  **Initialization**: Components are registered, World is created, and Systems are added to the Scheduler.
2.  **Input/Action**: The player provides input (e.g., pressing a key).
3.  **Turn Transition**: `turnManager.nextTurn()` is called.
    -   Turn counter is incremented in the `CLOCK` singleton.
    -   `scheduler.update(1.0)` is triggered.
4.  **System Execution**: The Scheduler runs systems in the order they were added.
    -   Systems query the World for entities matching their `Aspect`.
    -   `processEntity` is called for each match, modifying component data.
5.  **Reactivity**: If components are added/removed, entities move between `Archetypes` automatically.
6.  **Rendering**: A dedicated RenderSystem (often a `PassiveSystem` or last in the Scheduler) draws the current state of the World.

---

## 12. Advanced Features

### Singletons
Useful for global data (e.g., Game Settings, Input State).

```typescript
world.setSingleton(Components.CLOCK, { turn: 0 });
const clock = world.getSingleton<Clock>(Components.CLOCK);
```

### Snapshots (Saving/Loading)
The World can be serialized to a JSON-compatible object.

```typescript
const saveGame = world.saveSnapshot();
// ... later ...
world.loadSnapshot(saveGame);
```
*Note: Make sure to register Serializers if you use complex types like `Set` or `Map` in components.*

### Batch Editing
When adding/removing many components at once, use `edit()` to avoid multiple archetype transitions.

```typescript
world.edit(entity)
  .add(Components.POSITION, { x: 0, y: 0 })
  .remove(Components.HEALTH)
  .apply();
```

---

## 13. Performance Best Practices

1. **Avoid `getComponent` inside hot loops**: If you are in a custom system, use `viewColumns` or `requireColumn` to access raw data arrays.
2. **Reuse Aspects**: Don't create `new Aspect(...)` every frame. Store them as static members or constants. Decorators do this automatically for you.
3. **Prefer `mutateComponent`**: If you only change a property (like `pos.x++`), `mutateComponent` is faster than `setComponent` as it avoids some change-detection overhead.
4. **Use Tags**: Use simple components (without data) as "Tags" to filter entities quickly.

---

## 14. Comparison with Other ECS Architectures

If you are coming from other ECS libraries (like `bitecs`, `gecs`, or `tiny-ecs`), here is how Rogue1 compares and what it tries to do differently:

### Archetype-Based (SoA) vs. Entity-Centric (AoS)
While many simple ECS implementations use an "Entity-centric" or "Array-of-Structures" (AoS) approach, Rogue1 uses an **Archetype-based SoA** model. This provides significant performance benefits for large-scale simulations by ensuring cache locality and enabling engine-level optimizations. See the [Architecture](#architecture-archetypes-and-soa) section for a deep dive into how this works.

### "Batteries Included" for Games
Many JS ECS libraries are minimalist "engines" that only provide the core loop. Rogue1 is designed to be a complete toolkit for game development:
- **Built-in Managers**: Features like `Tags`, `Groups`, `Prefabs`, and `Relationships` are built into the core, not added as afterthoughts.
- **Relationship Integrity**: The `RelationshipManager` automatically cleans up stale entity references when an entity is deleted, solving a common source of "ghost" bugs in ECS.
- **Turn-Based First**: With the `TurnManager` and `Scheduler`, it provides a structured way to handle complex turn-based logic (Player -> AI -> World) out of the box.

### Balancing Performance and Ease of Use
Some high-performance ECS libraries (like `bitecs`) require you to use `TypedArrays` (Float32Array, etc.) for all data. While extremely fast, this makes it difficult to store strings, nested objects, or complex state.
Rogue1 strikes a middle ground:
- It uses the **Archetype SoA** pattern for structural speed.
- It allows **arbitrary JavaScript objects** as component data.
This gives you a significant performance boost over object-centric ECS while keeping the developer experience friendly and intuitive.

### Single-Threaded by Design
Rogue1 is intentionally single-threaded. While some ECS frameworks explore multithreading (using Web Workers in JS), we have decided against it for this project:
- **Turn-Based Nature**: Our primary focus is supporting turn-based games. In these scenarios, game logic is typically sequential, and the need for massive parallelism is significantly lower than in real-time simulations.
- **Efficiency of Archetypes/SoA**: The Archetype/SoA architecture is already highly optimized for standard roguelike entity counts. The performance is more than sufficient for our needs without the added complexity of threads.
- **Synchronization Overhead**: The overhead of managing thread synchronization and data consistency often outweighs the performance gains in most web-based game scenarios, especially when dealing with complex object-based components.

### Deterministic State and Snapshots
By requiring component registration (`bootstrapEcs`), Rogue1 ensures that the internal memory layout (Archetypes) is deterministic. This makes the built-in `saveSnapshot` and `loadSnapshot` features incredibly robust, allowing you to implement save/load systems with just a few lines of code.

### Declarative System Design (Decorators)
While many ECS libraries require imperative setup (passing filters to constructors), Rogue1 leverages TypeScript decorators to allow for a declarative system design. This is common in more advanced ECS frameworks (like Bevy or Entitas) and makes the code more maintainable and easier to reason about compared to libraries that rely solely on constructor parameters.

---

## 15. Drawbacks and Considerations

While the Rogue1 ECS is powerful and optimized, there are trade-offs and "gotchas" that you should be aware of to avoid performance pitfalls and bugs.

### 1. Structural Changes are Expensive
Every time you call `addComponent`, `removeComponent`, or `deleteEntity`, the entity must be moved from one Archetype to another.
- **Why?** Data is moved from one set of SoA columns to another.
- **The Negative**: Doing this many times in a single frame for the same entity can be slow.
- **What to watch out for**: Avoid toggling components frequently (e.g., adding/removing a `VISIBLE` tag every frame). Use a boolean inside a component instead, or use **Batch Editing** via `world.edit(entity)`.

### 2. Manual Component ID Management
The system relies on unique numeric IDs for components (e.g., `0`, `1`, `100`).
- **The Negative**: If you accidentally assign the same ID to two different components, the ECS will treat them as the same, leading to "impossible" bugs.
- **What to watch out for**: Always define IDs in a central place like `ComponentIds.ts` and use the `as const satisfies Record<string, ComponentId>` pattern to catch duplicates at compile time.

### 3. Archetype fragmentation
If your entities have highly varied combinations of components, you will end up with many Archetypes, each containing only a few entities.
- **The Negative**: While query performance remains decent, you lose some of the benefits of SoA (cache locality) if arrays are very short.
- **What to watch out for**: Avoid creating "snowflake" entities with unique one-off component combinations if possible.

### 4. Component Registration is Mandatory
You **must** register all components via `world.registerComponent` (or `bootstrapEcs`) before creating any entities.
- **The Negative**: Forgetting to register a component can lead to non-deterministic Archetype IDs, which will break Save/Load functionality.
- **What to watch out for**: Always use a central bootstrap function.

### 5. Memory vs. Performance Trade-off
The SoA approach prioritizes iteration speed over memory minimalism.
- **The Negative**: Empty slots in Archetype columns (from deleted entities) are eventually reused, but the internal arrays only grow, they never shrink unless the world is cleared.
- **What to watch out for**: If you spawn and delete millions of entities with unique Archetypes, memory usage could grow. For most roguelikes, this is not an issue.

### 6. Relationships have Overhead
While the `RelationshipManager` solves the "Ghost ID" problem, it maintains an internal reverse index to do so.
- **The Negative**: Adding or removing relationships is slightly slower than adding a standard component because of this indexing.
- **What to watch out for**: Use Relationships for meaningful entity-to-entity links (ownership, targeting), but don't use them for simple flags that don't need referential integrity.

---

## Method Cheat Sheet

| Method | Description |
| :--- | :--- |
| `world.createEntity()` | Returns a new `EntityId`. |
| `world.addComponent(e, id, val)` | Adds a component to an entity. |
| `world.getComponent<T>(e, id)` | Retrieves component data with type T. |
| `world.setComponent<T>(e, id, v)` | Overwrites component data. |
| `world.updateComponent<T>(e, i, cb)`| Updates via callback (reassigns). |
| `world.mutateComponent<T>(e, i, cb)`| Updates via callback (in-place). |
| `world.subscribeOnAdd(id, cb)` | React to component addition. |
| `world.subscribeOnRemove(id, cb)` | React to component removal. |
| `world.subscribeOnMaskChange(cb)` | React to any component change on an entity. |
| `world.view(aspect)` | Returns an iterator for entities matching an aspect. |
| `world.tags.getEntity(tag)` | Finds an entity by its unique tag. |
| `world.groups.getEntities(group)` | Returns all entities in a group. |
| `world.prefabs.spawn(name)` | Creates an entity from a template. |
| `world.relationships.add(s, r, t)` | Links two entities with a relationship. |
| `world.relationships.clearRelations(s, r)`| Removes all targets for relationship `r` on `s`. |
| `world.relationships.clear()`| Resets the internal relationship index. |
| `world.clear()` | Resets the entire world, deleting all entities. |
| `turnManager.nextTurn()` | Advances the game by one turn. |
| `turnManager.isPlayerTurn` | Boolean: Is it the player's turn to act? |
| `scheduler.add(system)` | Registers a system for execution. |
| `world.saveSnapshot()` | Serializes the entire world state. |
| `Aspect.all(...ids)` | Creates a filter for "all of these". |
| `@All` / `@And` | Decorator: Entity must have ALL of these. |
| `@One` / `@AnyOf` | Decorator: Entity must have AT LEAST ONE. |
| `@Exclude` / `@NoneOf` | Decorator: Entity must have NONE of these. |
| `@Match(aspect)` | Decorator: Merges an existing Aspect. |
| `@Group(name)` | Decorator: Limits system to a Group. |
| `@Tag(name)` | Decorator: Limits system to a specific Tagged entity. |
| `@Interval(n)` | Decorator: System execution period (turns). |
| `system.update(dt)` | Executes the system logic. |
