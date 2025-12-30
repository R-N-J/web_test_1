# Rogue1 ECS Guide

Welcome to Rogue1 ECS. This is a high-performance, **Professional-grade ECS Framework** designed for building complex, data-driven games (specifically Roguelikes) with ease and speed.

---

## What is an ECS?
If you are new to game development, **ECS (Entity-Component-System)** is an architectural pattern that favors **composition over inheritance**.

1.  **Entity**: A simple ID (like `5`). It represents an object in your game (a player, a sword, a dragon). It has no data and no logic.
2.  **Component**: Pure data attached to an Entity. (e.g., `Position {x: 10, y: 10}`, `Health {hp: 100}`). Components have no logic.
3.  **System**: The "brain" of your game. A System looks for all Entities that have a specific set of Components (e.g., all things with both `Position` and `Health`) and performs logic on them.

**Why use it?**
In traditional programming, you might have a `Player` class that inherits from `Creature`. As your game grows, this "Inheritance Tree" becomes a mess. With ECS, you just mix and match components. Want a player that can fly? Just add a `Flight` component.

---

## Library vs. Framework
Rogue1 is more than just a library; it is a complete **Framework**.

*   **As a Library**: You can use the `World` and `Archetype` logic on its own, manually wiring up your loops and managers. This is great for small projects or if you want absolute control.
*   **As a Framework**: You use the `Engine` bootstrapper. It provides **Auto-Discovery**, **Dependency Injection**, **Scene Management**, and **Standardized Managers** (Assets, Storage, Events). This is the recommended way for professional game development.

---

## Core Concepts

- **World**: The "Data Container". It holds all entities and components.
- **Engine**: The "Bootstrapper". It handles initialization and discovery.
- **Scheduler**: The "Logic Orchestrator". It manages the execution order of your systems.
- **Director**: The "Strategic Authority". A special service that handles high-level game flow (Win/Loss, Level Transitions).
- **Managers**: Specialized services (e.g., `AssetManager`, `SceneManager`, `StorageManager`).
- **Aspect**: A filter used by systems to find specific entities (e.g., "Give me everything with Position").
- **Archetype**: A group of entities that share the exact same set of components, stored in a high-performance format.

---

## The Framework Architecture: A Professional Toolkit

Rogue1 ECS provides a suite of tools that work together to make coding feel "clean":

-   **Archetypes (SoA)**: Blazing fast performance for large-scale simulations.
-   **Mappers & @Inject**: Simplified coding. No more digging through the world to find data; it's injected right where you need it.
-   **Topological Sorting**: Perfect execution order. Systems run exactly when they should based on their dependencies.
-   **Event Bus with @Subscribe**: Decoupled communication. Systems can talk to each other without knowing the other exists.
-   **Deferred Operations**: Safety first. Structural changes (like deleting an entity) are queued during updates to prevent crashes.
-   **Scene Management**: Clean game flow. Transitions between menus and levels are handled automatically.
-   **Engine Discovery**: Clean configuration. Tell the Engine what systems and components you have, and it does the wiring for you.

---

## Table of Contents
- [Architecture: Archetypes and SoA](#architecture-archetypes-and-soa)
- [1. Setting Up the Engine (The Framework Way)](#1-setting-up-the-engine-the-framework-way)
  - [Defining Components](#defining-components)
  - [Configuring the Engine](#configuring-the-engine)
- [2. Setting Up the World (The Library Way)](#2-setting-up-the-world-the-library-way)
- [3. Entities and Components](#3-entities-and-components)
  - [Creating an Entity](#creating-an-entity)
  - [Adding Components](#adding-components)
  - [Component Interfaces and Type Safety](#component-interfaces-and-type-safety)
  - [Accessing and Modifying Data](#accessing-and-modifying-data)
- [4. Querying Entities (Aspects and Views)](#4-querying-entities-aspects-and-views)
- [5. Tags and Groups](#5-tags-and-groups)
- [6. Relationships](#6-relationships)
- [7. Prefabs](#7-prefabs)
- [8. Observers](#8-observers)
- [9. Systems, Scheduler, and TurnManager](#9-systems-scheduler-and-turnmanager)
  - [Different Types of Systems](#different-types-of-systems)
  - [The Scheduler (The Library Way)](#the-scheduler-the-library-way)
  - [The TurnManager (The Library Way)](#the-turnmanager-the-library-way)
- [10. The Strategic Authority: The Director](#10-the-strategic-authority-the-director)
- [11. Decorators](#11-decorators)
  - [Injecting Dependencies (@Inject)](#injecting-dependencies-inject)
- [12. Standard Services](#12-standard-services)
  - [12.1 EventBus: Decoupled Communication](#121-eventbus-decoupled-communication)
  - [12.2 AssetManager: External Data](#122-assetmanager-external-data)
  - [12.3 StorageManager: Persistence](#123-storagemanager-persistence)
  - [12.4 SceneManager: Game Flow](#124-scenemanager-game-flow)
- [13. Advanced Features](#13-advanced-features)
  - [Component Mappers](#component-mappers)
- [14. Tutorial: Building a Game from Scratch](#14-tutorial-building-a-game-from-scratch)
- [15. Performance Best Practices](#15-performance-best-practices)
- [16. Comparison with Other ECS Architectures](#16-comparison-with-other-ecs-architectures)
- [17. Drawbacks and Considerations](#17-drawbacks-and-considerations)
- [Method Cheat Sheet](#method-cheat-sheet)

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

## 1. Setting Up the Engine (The Framework Way)

The recommended way to start a Rogue1 project is using the `Engine` class. It automates the "Wiring Phase" and handles component registration, prefab discovery, and system initialization in one declarative configuration.

### Defining Components
Components are identified by unique numeric IDs. Define them in a central place like `ComponentRegistry.ts`.

```typescript
// js/core/ComponentRegistry.ts
import { ComponentId } from './ECS/Archetype';

export const Components = {
  POSITION: 0,
  HEALTH: 1,
  RENDER: 2,
  REL_OWNED_BY: 100,
} as const satisfies Record<string, ComponentId>;

export interface Position { x: number; y: number; }
export interface Health { current: number; max: number; }
```

### Configuring the Engine
You provide a configuration object to the `Engine`. It will automatically bootstrap the world and link all services.

```typescript
import { Engine } from './ECS/Engine';
import { Components } from './core/ComponentRegistry';
import { MovementSystem } from './core/systems/MovementSystem';
import { MyGameDirector } from './core/MyGameDirector';
import { MainMenuScene } from './core/scenes/MainMenuScene';

const engine = new Engine({
  components: Components,
  systems: [
    MovementSystem,
    AISystem,
    RenderSystem
  ],
  director: MyGameDirector,
  prefabs: [ /* Your prefab definitions */ ],
  assets: [
    { key: 'player_walk', url: 'assets/sfx/walk.mp3', type: 'AUDIO' }
  ]
});

// Wait for assets to load, then start the first scene
engine.whenReady().then(() => {
  engine.start(new MainMenuScene());
});
```

### Engine Discovery and Configuration
The `Engine` class uses a process called **Discovery** to automatically wire up your game. When you pass the `EngineConfiguration` object, it performs several key steps:

1.  **Schema Discovery**: Registers all component IDs from your `Components` object.
2.  **Prefab Discovery**: Loads all entity templates into the `PrefabManager`.
3.  **Asset Discovery**: Initiates parallel loading for all declared assets (JSON/Audio).
4.  **Director Discovery**: Instantiates your global game controller and adds it to the scheduler.
5.  **System Discovery**: Instantiates all logic systems and performs **Dependency Injection**.
6.  **Topological Sorting**: Automatically orders systems based on their `@Before` and `@After` decorators.

#### Tutorial: The EngineConfiguration Object
The configuration object is the "Manifest" of your game.

| Property | Type | Description |
| :--- | :--- | :--- |
| `components` | `Record<string, number>` | Your central component ID registry. |
| `systems` | `Class[]` | List of System classes (not instances). |
| `director` | `Class?` | Optional global `Director` class. |
| `prefabs` | `PrefabDefinition[]?` | Array of entity blueprints. |
| `assets` | `AssetEntry[]?` | List of external files to preload. |

**Example: A full configuration**
```typescript
const config: EngineConfiguration = {
  // 1. Data Definitions
  components: Components,

  // 2. Logic Systems
  systems: [
    MovementSystem,
    CombatSystem,
    AISystem,
    RenderSystem
  ],

  // 3. Strategic Controller
  director: MyGameDirector,

  // 4. Data Templates
  prefabs: [
    { name: 'ORC', components: { [Components.HEALTH]: { hp: 20 } } }
  ],

  // 5. External Resources
  assets: [
    { key: 'map_data', url: 'data/dungeon.json', type: 'JSON' },
    { key: 'hit_sound', url: 'sounds/hit.wav', type: 'AUDIO' }
  ]
};
```

---

## 2. Setting Up the World (The Library Way)

If you prefer to wire everything yourself, or you aren't using the full framework features, you can initialize the components manually.

```typescript
import { World } from './ECS/World';
import { Scheduler } from './ECS/Scheduler';
import { bootstrapEcs } from './ECS/ComponentRegistry';
import { Components } from './ComponentIds';
import { MainMenuScene } from './core/scenes/MainMenuScene';

// 1. Create the World (The Data Root)
const world = new World();

// 2. Create the Scheduler (The Logic Root) and link it to the World
const scheduler = new Scheduler(world);

// 3. Complete the link (The Wiring Phase)
// This initializes the SceneManager and TurnManager inside the world
world.setScheduler(scheduler);

// 4. Initialize the rest
// bootstrapEcs registers all IDs and any custom serializers
bootstrapEcs(world, Components);

// 5. Start your first scene
world.scenes?.switchTo(new MainMenuScene());
```

---

## 3. Entities and Components

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
It is a best practice to keep these interfaces in the same file as your `Components` ID definitions (e.g., `ComponentRegistry.ts`).

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

*(Note: Use the numeric IDs defined in your `ComponentRegistry.ts` for the `id` fields.)*

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
1.  **Numeric IDs:** Your JSON must use the actual numbers from `ComponentRegistry.ts`. If you change those numbers in code but don't update your database/JSON, your prefabs will break or assign data to the wrong components.
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

In Rogue1, you can manage these manually (**The Library Way**) or let the `Engine` handle them (**The Framework Way**).

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

### The Scheduler (The Library Way)
The `Scheduler` is the central coordinator for all systems. It ensures that game logic is deterministic by running systems in the exact order they were added.

**Note:** In the **Framework Way**, the `Engine` handles the `Scheduler` automatically, populating it with systems from your `EngineConfiguration`.

#### How to use it (Manual Setup)
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

### The TurnManager (The Library Way)
The `TurnManager` is the "brain" of a turn-based game loop. It coordinates between the Player's input and the World's systems, and tracks the passage of time via a `CLOCK` singleton.

**Note:** In the **Framework Way**, the `TurnManager` is a managed service available via `@Inject() turns: TurnManager` or `world.turns`.

**Why use a TurnManager?**
In a roguelike, the world only moves when you move. The `TurnManager` ensures that:
1.  **Phase Control**: Systems only run when a "turn" is actually processed.
2.  **State Management**: It knows if the game is currently waiting for Player Input or if it's the World's turn.
3.  **Pause/Resume**: It can halt the entire simulation for menus or animations.

#### How to use it (Manual Setup)
You typically use the `TurnManager` to gate your input handling and advance the world.

```typescript
import { TurnManager } from './ECS/TurnManager';

const turnManager = new TurnManager(world, scheduler);

// 1. Gate input: Only allow move if it's the player's turn and not paused
if (turnManager.isPlayerTurn) {
    if (input.keyPressed('RIGHT')) {
       player.move(1, 0);
       turnManager.nextTurn(); // Advance the world!
    }
}
```

When `nextTurn()` is called:
1.  **Increment Clock**: The `turn` count in the `CLOCK` singleton goes up.
2.  **Tick Scheduler**: It calls `scheduler.update(1.0)`, running all your logic (AI, Physics, etc.).
3.  **Reset Phase**: It returns control to the player (setting `isPlayerTurn = true`).

---

## 10. The Strategic Authority: The Director

While the `TurnManager` handles the *Tactical* loop (move by move), the **Director** handles the *Strategic* flow of the entire game.

The `Director` is a special type of system (`PassiveSystem`) that acts as the "Grand Architect". It doesn't process entities in every turn; instead, it listens for high-level events and makes big decisions.

### Responsibilities of a Director:
-   **Scene Transitions**: Deciding when to go from the Main Menu to the Dungeon.
-   **Win/Loss Conditions**: Monitoring if the player died or reached the final exit.
-   **Global State**: Managing auto-saves, high scores, and persistent progress.
-   **Initialization**: Setting up the initial world state (spawning the player, etc).

### Example: A Game Director
```typescript
import { Director } from './ECS/Director';
import { Subscribe } from './ECS/Decorators';

class MyGameDirector extends Director {
  @Subscribe("PLAYER_DIED")
  onPlayerDeath() {
    this.turns.pause(); // Stop the world
    this.scenes.switchTo(new GameOverScene());
  }

  @Subscribe("GOAL_REACHED")
  onVictory() {
    this.storage.save("victory_lap");
    this.scenes.switchTo(new VictoryScene());
  }

  // Mandatory implementation: tell the framework which scenes to use
  protected getGameOverScene() { return new GameOverScene(); }
  protected getNextLevelScene() { return new DungeonScene(); }
}
```

### How the Director and TurnManager Work Together

Think of them as two layers of a cake:

1.  **The TurnManager (Tactical)**: Handles the "Micro" loop. `Input -> Player Move -> nextTurn() -> Monsters Move -> Wait`.
2.  **The Director (Strategic)**: Handles the "Macro" loop. `Dungeon Level -> Player Wins -> Exit Reached Event -> Director switches Scene -> New Level`.

**The Full Game Loop Flow:**
1.  **Engine** starts and initializes the **Director**.
2.  **Director** starts the first **Scene** (e.g., `MainMenu`).
3.  Player clicks "Start" -> **Director** switches to `DungeonScene`.
4.  `DungeonScene.onEnter` spawns the player and monsters.
5.  **TurnManager** starts in `isPlayerTurn` mode.
6.  Player moves -> **TurnManager** calls `nextTurn()`.
7.  **Scheduler** runs all logic systems.
8.  Monster attacks player -> Player HP reaches 0 -> `PLAYER_DIED` event is published.
9.  **Director** hears the event -> Switches to `GameOverScene`.

---

## 11. Decorators

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
- **@Priority(value)**: Sets a numerical priority for the system. Systems with lower values run first (default is `1000`).
- **@Before(...systemNames)**: Ensures this system runs **before** the specified systems (by class name).
- **@After(...systemNames)**: Ensures this system runs **after** the specified systems (by class name).

### Event Bus Decorators
- **@Subscribe(eventType)**: Subscribes a system method to the World's event bus. The method will be called whenever an event of `eventType` is published.

### Dependency Injection Decorators
- **@Inject(id?)**: Automatically injects a dependency into a class property. This is a powerful feature that makes systems cleaner and easier to write.

#### Why use @Inject?
- **Decoupling**: Systems don't need to know *how* to find a manager; they just declare that they need it.
- **Boilerplate Reduction**: No more `this.world.getMapper(...)` or `this.world.scenes` calls in the constructor.
- **Type Safety**: Works perfectly with TypeScript to ensure properties are correctly typed.

#### How @Inject works
The Framework's `Scheduler` automatically scans for `@Inject` decorators when a system is added and fills the properties before the system runs.

| Type | Detection | Example |
| :--- | :--- | :--- |
| **Mapper** | If a `ComponentId` is passed to `@Inject(id)`. | `@Inject(Components.POSITION) pos!: Mapper<Position>;` |
| **Event Bus** | If the property name is `events`. | `@Inject() events!: EventBus;` |
| **Manager** | If the property name matches a manager on the `World` (e.g., `scenes`, `assets`, `storage`). | `@Inject() scenes!: SceneManager;` |

#### Example: Using @Inject
```typescript
import { Inject, All } from './ECS/Decorators';
import { Components, Position, Velocity } from './ComponentIds';

@All(Components.POSITION, Components.VELOCITY)
class MovementSystem extends IteratingSystem {
  // 1. Inject a high-performance Mapper
  @Inject(Components.POSITION)
  private posMapper!: Mapper<Position>;

  // 2. Inject the Event Bus
  @Inject()
  private events!: EventBus;

  processEntity(entity: EntityId) {
    // Use the mapper for ultra-fast access
    const pos = this.posMapper.get(entity);
    if (pos) {
       pos.x += 1;
       this.events.publish({ type: 'ENTITY_MOVED', entity });
    }
  }
}
```

### Why use Decorators?

**System Ordering and Priority:**
```typescript
import { Priority, Before, After } from './ECS/Decorators';

@Priority(10)
class EarlySystem extends IteratingSystem { /* Runs early due to low priority value */ }

@After('EarlySystem')
@Before('PhysicsSystem')
class LogicSystem extends IteratingSystem { /* Runs after EarlySystem but before PhysicsSystem */ }

@Priority(2000)
class LateSystem extends IteratingSystem { /* Runs late due to high priority value */ }
```

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

## 12. Standard Services

Rogue1 ECS includes a suite of standardized services (Managers) that handle common game engine tasks. These services are available both as part of the `Engine` framework (via `@Inject`) and as standalone managers on the `World` object.

| Service | Responsibility | Framework Injection | Library Access |
| :--- | :--- | :--- | :--- |
| **EventBus** | Decoupled communication. | `@Inject() events` | `world.events` |
| **AssetManager** | Loading external data/audio. | `@Inject() assets` | `world.assets` |
| **StorageManager**| Persistence (Save/Load). | `@Inject() storage` | `world.storage` |
| **SceneManager** | Game flow and transitions. | `@Inject() scenes` | `world.scenes` |
| **TurnManager** | Turn-based loop control. | `@Inject() turns` | `world.turns` |

---

### 12.1 EventBus: Decoupled Communication
The Rogue1 ECS includes a built-in `EventBus` plugged directly into the `World`. This allows for decoupled communication between systems and other parts of the game engine.

#### Using the Event Bus
You can access the event bus via `world.events`.

```typescript
// Publishing an event
world.events.publish({ type: 'SCREEN_SHAKE', intensity: 5 });

// Manual subscription
const handler = (ev) => console.log("Shake!", ev.intensity);
world.events.subscribe('SCREEN_SHAKE', handler);
```

#### The @Subscribe Decorator
The most powerful way to use the Event Bus is via the `@Subscribe` decorator in your Systems. When you add a system to the `Scheduler`, it is **automatically registered** to the event bus.

```typescript
import { BaseSystem } from './ECS/System';
import { Subscribe } from './ECS/Decorators';

class AudioSystem extends BaseSystem {
  @Subscribe('MONSTER_DEATH')
  onMonsterDeath(event: { type: string, enemyId: EntityId }) {
    this.playSfx('death_squish');
  }
}
```

#### Event Bus Implementation Details

| Feature | Description |
| :--- | :--- |
| **Decoupled** | Systems don't need to know about each other; they only need to know about event types. |
| **Auto-Registration** | The `Scheduler` automatically calls `world.events.register(system)` when a system is added. |
| **Decorator Support** | Use `@Subscribe('EVENT_TYPE')` on any system method. |
| **Cancellation** | If an event has a `cancelled` property, handlers can set it to `true` to stop the event from reaching further subscribers. |
| **Synchronous** | Events are processed immediately when `publish()` is called. |

#### Event Bus Examples

##### 1. Communication between Systems
```typescript
class CombatSystem extends BaseSystem {
  onAttack(attacker: EntityId, target: EntityId) {
    // ... logic ...
    this.world.events.publish({ type: 'ENTITY_DAMAGED', entity: target, amount: 10 });
  }
}

class UiSystem extends BaseSystem {
  @Subscribe('ENTITY_DAMAGED')
  onDamage(ev: { entity: EntityId, amount: number }) {
    this.showFloatingText(ev.entity, `-${ev.amount}`, "red");
  }
}
```

##### 2. Cancelling Events
```typescript
class ProtectionSystem extends BaseSystem {
  @Subscribe('ENTITY_DAMAGED')
  onDamage(ev: { entity: EntityId, amount: number, cancelled?: boolean }) {
    if (this.hasShield(ev.entity)) {
      ev.cancelled = true; // Stop the damage event!
      this.playSfx('shield_clink');
    }
  }
}
```

---

### 12.2 AssetManager: External Data
The `AssetManager` handles the asynchronous loading and caching of external resources like JSON data (e.g., monster stats, map layouts) and Audio files.

*   **Why use it?** It ensures that your game doesn't start until all required data is loaded, preventing "missing resource" crashes.
*   **Discovery**: Assets declared in the `EngineConfiguration` are loaded automatically during engine startup.

#### Examples

**Loading via Configuration (Framework Mode)**
```typescript
const engine = new Engine({
  // ...
  assets: [
    { key: 'monster_db', url: 'data/monsters.json', type: 'JSON' },
    { key: 'hit_sfx', url: 'audio/hit.mp3', type: 'AUDIO' }
  ]
});

// Wait for loading to finish
engine.whenReady().then(() => engine.start(new MyScene()));
```

**Using Assets in a System**
```typescript
class SpawnerSystem extends BaseSystem {
  @Inject() assets!: AssetManager;

  spawnMonster(typeId: string) {
    const db = this.assets.get<Record<string, MonsterStats>>('monster_db');
    const stats = db[typeId];
    // ...
  }
}
```

---

### 12.3 StorageManager: Persistence
The `StorageManager` provides a high-level API for saving and loading the entire `World` state (including all entities, components, tags, and groups) to the browser's `localStorage`.

*   **Why use it?** To implement save slots, auto-saves, and persistent progress.
*   **Safety**: It includes automatic quota checks and warns you if your save file is approaching browser limits.

#### Examples

**Saving the Game**
```typescript
class GameDirector extends Director {
  @Subscribe("SAVE_GAME")
  onSaveRequested() {
    this.storage.save("slot_1");
    this.events.publish({ type: 'MESSAGE', text: "Game Saved!" });
  }
}
```

**Loading a Saved State**
```typescript
if (world.storage.exists("slot_1")) {
    world.storage.load("slot_1");
}
```

**Metadata and Save Slots**
You can list available saves and their metadata (timestamp, name) to build a Save/Load menu.
```typescript
const saves = world.storage.listSaves();
saves.forEach(save => {
    console.log(`Save: ${save.name}, Date: ${new Date(save.timestamp).toLocaleString()}`);
});
```

---

### 12.4 SceneManager: Game Flow
A **Scene** represents a distinct state of your game (e.g., Main Menu, Options, Dungeon Level 1, Game Over). Scenes allow you to organize your logic and data by lifecycle.

#### What is a Scene?
In Rogue1, a Scene is a class or object that implements the `Scene` interface. It defines how to set up the `World` and `Scheduler` when that state becomes active.

```typescript
export interface Scene {
  /** A unique identifier for the scene, useful for logging and debugging. */
  readonly name: string;

  /**
   * Executed by the SceneManager when this scene becomes active.
   * Setup your systems and initial entities here.
   */
  onEnter(world: World): void;

  /**
   * Executed by the SceneManager before the world is cleared and
   * the next scene is loaded. Clean up or save state here.
   */
  onExit(world: World): void;
}
```

### When to use Scenes?
Use Scenes to separate distinct logical phases of your game:
- **MainMenuScene**: Sets up UI systems, background music, and handles "New Game" logic.
- **DungeonScene**: Sets up physics, AI, rendering, and generates procedural levels.
- **GameOverScene**: Displays final scores and waits for player input to restart.

### How to use Scenes
The `SceneManager` (accessible via `world.scenes`) handles the transitions between scenes.

```typescript
// Initializing and switching to the first scene
world.scenes?.switchTo(new MainMenuScene());
```

When `switchTo(nextScene)` is called:
1.  **onExit**: The current scene's `onExit` method is called.
2.  **world.clear()**: The World is completely reset. All entities, tags, and groups are deleted.
3.  **onEnter**: The new scene's `onEnter` method is called.

### Tutorial: Implementing Scenes

#### 1. Generic Scenes (Environment Types)
You can create generic scene classes that change behavior based on input parameters.
```typescript
class DungeonScene implements Scene {
  constructor(private theme: 'ICE' | 'FIRE') {}
  readonly name = `Dungeon (${this.theme})`;

  onEnter(world: World) {
    // 1. Add Core Systems
    world.scheduler.add(new MovementSystem(world));

    // 2. Add Theme-specific Systems
    if (this.theme === 'ICE') {
      world.scheduler.add(new SlipperyFloorSystem(world));
    }

    // 3. Generate the level
    DungeonGenerator.generate(world, this.theme);
  }

  onExit(world: World) {
    console.log("Leaving the dungeon...");
  }
}
```

#### 2. Unique Levels and Bosses
For special levels, you can create dedicated scene implementations.
```typescript
class BossScene implements Scene {
  readonly name = "Dragon's Lair";
  onEnter(world: World) {
    // Spawn the boss prefab
    world.prefabs.spawn("BOSS_DRAGON");
    // Change the music
    AudioManager.playBgm("boss_theme");
  }
  onExit(world: World) {}
}
```

#### 3. Game Modes
Scenes can also represent different game modes or rulesets.
```typescript
class HardcoreModeScene extends DungeonScene {
  onEnter(world: World) {
    super.onEnter(world);
    world.scheduler.add(new PermadeathSystem(world));
  }
}
```

### Directory Structure
To keep your project clean, it is recommended to separate the engine-level `Scene` definitions from your actual game implementation.

```text
 ├── js/ECS/             <-- The Engine
 │    ├── Scene.ts       <-- The Interface (The Contract)
 │    └── SceneManager.ts <-- The Logic
 └── js/core/            <-- Your Game Logic
      └── scenes/
           ├── DungeonScene.ts <-- Implementation
           └── MenuScene.ts    <-- Implementation
```

### Scene Transitions: Pro Patterns

Transitions are typically handled using one of two patterns:

#### 1. The Portal/Trigger Pattern (System-driven)
Used when an in-game event (like a player stepping on a stair) triggers a change.

```typescript
@All(Components.POSITION, Components.STAIRS)
class StairsSystem extends IteratingSystem {
  processEntity(stairs: EntityId) {
    const player = this.world.tags.getEntity("player");
    if (this.isAtSamePosition(stairs, player)) {
       // Trigger the switch
       const stairsData = this.world.getComponent<Stairs>(stairs, Components.STAIRS);
       this.world.scenes?.switchTo(new DungeonScene(stairsData.destLevel));
    }
  }
}
```

#### 2. The Game Director Pattern (Data-driven)
A central "Director" system monitors the `World` state and triggers transitions when certain conditions are met.

```typescript
class GameDirector extends BaseSystem {
  update(dt: number) {
    const stats = this.world.getSingleton<GameProgress>(InternalComponents.PROGRESS);

    if (stats.bossDefeated) {
      this.world.scenes?.switchTo(new VictoryScene());
    }

    if (stats.playerHp <= 0) {
      this.world.scenes?.switchTo(new GameOverScene());
    }
  }
}
```

### Using the Progress Singleton
The `PROGRESS` singleton (see `InternalComponents.ts`) is the recommended place to store cross-turn metadata, such as current level number or game seeds.

Since `world.clear()` is called during scene transitions, if you need to persist data *between* scenes (e.g., player XP or inventory), you should:
1.  Capture the data in `onExit`.
2.  Pass it to the constructor of the next scene.
3.  Re-apply it to the world in `onEnter`.

```typescript
class DungeonScene implements Scene {
  onExit(world: World) {
    // Save important progress to a global object or local storage
    const xp = world.getSingleton<PlayerStats>(Components.STATS).xp;
    GameState.lastXp = xp;
  }

  onEnter(world: World) {
    // Restore progress to the new world state
    world.setSingleton(Components.STATS, { xp: GameState.lastXp });
  }
}
```

---

## 13. Advanced Features

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

### Batch Editing and Fluent API
When adding/removing many components at once, use `edit()` to avoid multiple archetype transitions. For creating new entities, `buildEntity()` provides a clean, fluent API.

Both `edit()` and `buildEntity()` use an `EntityEditor` to bundle changes. In the latest version, calling `.commit()` is **optional**—the `World` will automatically commit any active editors at the end of the current update (via `world.flush()`).

#### Using world.edit()
Use this for existing entities to bundle multiple changes:
```typescript
world.edit(entity)
  .add(Components.POSITION, { x: 0, y: 0 })
  .remove(Components.HEALTH);
  // .commit() is optional here
```

#### Using world.buildEntity()
This is the preferred way to spawn and configure new entities in one go:
```typescript
const player = world.buildEntity()
  .add(Components.POSITION, { x: 10, y: 10 })
  .add(Components.PLAYER_TAG, {})
  .tag("hero")
  .group("friendly")
  .commit(); // commit() returns the EntityId
```

#### Why call .commit() manually?
While the engine will "auto-flush" changes if you forget, calling `.commit()` manually provides several benefits:
1. **Immediate EntityId**: `.commit()` returns the `EntityId` of the created/edited entity.
2. **Immediate Effect**: Structural changes (archetype moves) are applied instantly. If you need to query for the entity or access its data via `world.getComponent` later in the *same* system update, you must commit.
3. **Clarity**: It explicitly marks the end of the builder chain.

### Component Mappers
For ultra-high-performance access to components, especially in tight loops or frequently updated logic, use `Mapper`. Mappers provide a direct way to access component data for a specific type, bypassing some of the internal lookup overhead of `world.getComponent`.

```typescript
// 1. Get a mapper (cached by the world)
const posMapper = world.getMapper<Position>(Components.POSITION);

// 2. Use it for fast access
if (posMapper.has(entity)) {
  const pos = posMapper.get(entity);
  posMapper.set(entity, { x: pos.x + 1, y: pos.y });
}

// 3. Support for update/mutate
posMapper.mutate(entity, p => p.x += 1);
```

Mappers are particularly useful when you have a system that doesn't use `viewColumns` but still needs to access a specific component frequently across many different entities.

---

## 14. Tutorial: Building a Game from Scratch

This tutorial will walk you through building a simple "framework-driven" game using Rogue1.

### Step 1: Define Your Data Schema
Create a `ComponentRegistry.ts` to hold your IDs and interfaces.

```typescript
export const Components = {
  POSITION: 0,
  HEALTH: 1,
  PLAYER_TAG: 2,
  REL_TARGETS: 100
} as const satisfies Record<string, ComponentId>;

export interface Position { x: number; y: number; }
export interface Health { hp: number; max: number; }
```

### Step 2: Create a System with Dependency Injection
Write a system that uses the injected mapper and events.

```typescript
@All(Components.POSITION, Components.HEALTH)
class HealthSystem extends IteratingSystem {
  @Inject(Components.HEALTH)
  private health!: Mapper<Health>;

  @Inject()
  private events!: EventBus;

  processEntity(entity: EntityId) {
    const hp = this.health.get(entity);
    if (hp && hp.hp <= 0) {
      this.events.publish({ type: 'ENTITY_DIED', entity });
      this.world.deleteEntity(entity);
    }
  }
}
```

### Step 3: Define Your Game Director
The Director will handle high-level logic like scene switches.

```typescript
class MyDirector extends Director {
  @Subscribe('ENTITY_DIED')
  onEntityDeath(event: { entity: EntityId }) {
    if (this.world.hasComponent(event.entity, Components.PLAYER_TAG)) {
       this.changeScene(new GameOverScene());
    }
  }

  protected getGameOverScene() { return new GameOverScene(); }
  protected getNextLevelScene() { return new DungeonScene(); }
}
```

### Step 4: Configure and Start the Engine
Link everything together in your main entry point.

```typescript
const engine = new Engine({
  components: Components,
  systems: [HealthSystem, MovementSystem, AISystem],
  director: MyDirector
});

engine.whenReady().then(() => {
  engine.start(new DungeonScene());
});
```

### Step 5: Handling the Game Loop
In your rendering loop, call `engine.update(dt)`. For turn-based movement, the `TurnManager` handles the calls to `scheduler.update()`.

---

## 15. Performance Best Practices

1. **Avoid `getComponent` inside hot loops**: If you are in a custom system, use `viewColumns` or `requireColumn` to access raw data arrays.
2. **Reuse Aspects**: Don't create `new Aspect(...)` every frame. Store them as static members or constants. Decorators do this automatically for you.
3. **Prefer `mutateComponent`**: If you only change a property (like `pos.x++`), `mutateComponent` is faster than `setComponent` as it avoids some change-detection overhead.
4. **Use Tags**: Use simple components (without data) as "Tags" to filter entities quickly.

---

## 16. Comparison with Other ECS Architectures

If you are coming from other ECS libraries (like `bitecs`, `miniplex`, or `gecs`), here is how Rogue1 compares and what it tries to do differently:

### Library vs. Framework Philosophy
Most JavaScript ECS solutions are **Libraries**. They provide a `World` and a way to query entities, but leave the "wiring" (asset loading, scene management, storage, game loop) entirely to you.
Rogue1 is a **Framework**. It provides the `Engine` bootstrapper, integrated `Standard Services`, and the `Director` authority. It doesn't just give you a tool; it gives you a skeleton to build a professional game upon.

| Feature | Typical JS ECS Library | Rogue1 ECS Framework |
| :--- | :--- | :--- |
| **Bootstrapping** | Manual (You create the loop) | Automated (Engine Discovery) |
| **Dependencies** | Manual passing (constructors) | @Inject (Dependency Injection) |
| **Assets/Scenes** | User-implemented | Standardized Managers |
| **Communication**| Manual/Custom | Built-in Event Bus |
| **Ordering** | Order of addition | Topological Sorting (@Before/@After) |

### Archetype-Based (SoA) vs. Entity-Centric (AoS)
While simple libraries (like `tiny-ecs`) use an "Entity-centric" approach where components are objects attached to an entity ID, Rogue1 uses an **Archetype-based SoA** model.
- **Cache Locality**: Similar to `bitecs` or `hecs` (Rust), data is stored in parallel arrays.
- **Iteration Speed**: Systems only "see" entities that match their exact component signature, eliminating the need to branch or check for nulls during high-speed loops.

### Balancing Performance and Ergonomics
- **The "High Perf" Extreme (`bitecs`)**: Uses `TypedArrays` (Float32Array) for everything. Extremely fast, but you can't easily store strings, nested objects, or complex state.
- **The "Ergonomic" Extreme (`miniplex`)**: Uses plain objects and standard arrays. Very friendly and flexible, but can struggle with performance at very high entity counts (10k+).
- **The Rogue1 Middle Ground**: We use the **Archetype SoA** pattern for structural speed, but allow **arbitrary JavaScript objects** as component data. This provides a massive performance boost over object-centric libraries while keeping the developer experience intuitive.

### Declarative Design & Dependency Injection
Rogue1's use of **Decorators** (@All, @Inject, @Subscribe) moves logic configuration out of the constructor and into the class definition. This approach is rare in JS but common in industry-leading frameworks:
- **Bevy (Rust)**: Rogue1's declarative systems are similar to Bevy's function-signature based systems.
- **Entitas (C#)**: The use of decorators for "Interests" (Aspects) mirrors Entitas's code-generation or attribute-based approach.
- **ECSY (JS)**: Uses static `queries`, which Rogue1 implements via the more modern decorator syntax.

### "Batteries Included" for Games
Many libraries are minimalist. Rogue1 includes specialized game logic managers out of the box:
- **Relationship Integrity**: The `RelationshipManager` (like `flex-ecs` or `hecs`) automatically cleans up stale links.
- **Turn-Based First**: The `TurnManager` provides a structured way to handle complex turn-based logic (Player -> AI -> World) that is often missing from real-time focused engines.
- **Persistence**: Built-in `StorageManager` with automatic versioning and quota safety.

### Single-Threaded by Design
Rogue1 is intentionally single-threaded. While some frameworks (like `nano-ecs`) explore Web Workers, we focus on the **Sequential Determinism** required for turn-based roguelikes. The efficiency of our Archetype/SoA implementation provides more than enough performance for modern web-based roguelikes without the complexity of thread synchronization.

---

## 17. Drawbacks and Considerations

While the Rogue1 ECS is powerful and optimized, there are trade-offs and "gotchas" that you should be aware of to avoid performance pitfalls and bugs.

### 1. Structural Changes are Expensive
Every time you call `addComponent`, `removeComponent`, or `deleteEntity`, the entity must be moved from one Archetype to another.
- **Why?** Data is moved from one set of SoA columns to another.
- **The Negative**: Doing this many times in a single frame for the same entity can be slow.
- **What to watch out for**: Avoid toggling components frequently (e.g., adding/removing a `VISIBLE` tag every frame). Use a boolean inside a component instead, or use **Batch Editing** via `world.edit(entity)`.

### 2. Manual Component ID Management
The system relies on unique numeric IDs for components (e.g., `0`, `1`, `100`).
- **The Negative**: If you accidentally assign the same ID to two different components, the ECS will treat them as the same, leading to "impossible" bugs.
- **What to watch out for**: Always define IDs in a central place like `ComponentRegistry.ts` and use the `as const satisfies Record<string, ComponentId>` pattern to catch duplicates at compile time.

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

### Engine & Framework
| Method | Description |
| :--- | :--- |
| `new Engine(config)` | Creates and bootstraps the framework. |
| `engine.whenReady()` | Returns a promise that resolves when assets are loaded. |
| `engine.start(initialScene)`| Starts the first scene. |
| `engine.update(dt)` | Ticks the scheduler. |
| `director.changeScene(s)` | Standardized scene transition with optional save. |

### World (Data)
| Method | Description |
| :--- | :--- |
| `world.createEntity()` | Returns a new `EntityId`. |
| `world.deleteEntity(e)` | Deletes an entity and recycles its ID. |
| `world.isValid(e)` | Checks if an entity is active and not recycled. |
| `world.buildEntity()` | Fluent API to create a new entity (commit() optional). |
| `world.edit(entity)` | Starts a batch edit for an entity (commit() optional). |
| `world.addComponent(e, id, val)` | Adds a component to an entity. |
| `world.hasComponent(e, id)` | Checks if an entity has a specific component. |
| `world.getComponent<T>(e, id)` | Retrieves component data with type T. |
| `world.setComponent<T>(e, id, v)` | Overwrites component data. |
| `world.updateComponent<T>(e, i, cb)`| Updates via callback (reassigns). |
| `world.mutateComponent<T>(e, i, cb)`| Updates via callback (in-place). |
| `world.getSingleton<T>(id)` | Retrieves a global singleton. |
| `world.setSingleton<T>(id, v)` | Sets a global singleton. |
| `world.saveSnapshot()` | Serializes the entire world state. |
| `world.loadSnapshot(data)` | Restores the world state. |
| `world.clear()` | Resets the world, deleting all entities. |

### Component Mappers (High Performance)
| Method | Description |
| :--- | :--- |
| `world.getMapper<T>(id)` | Returns a high-performance Component Mapper. |
| `mapper.get(entity)` | Fast retrieve. |
| `mapper.set(entity, value)` | Fast non-structural write. |
| `mapper.has(entity)` | Fast check. |
| `mapper.update(entity, cb)` | Fast callback update (reassign). |
| `mapper.mutate(entity, cb)` | Fast callback mutation (in-place). |

### Systems & Logic
| Method | Description |
| :--- | :--- |
| `scheduler.add(system)` | Registers a system (handles injection/sorting). |
| `turnManager.nextTurn()` | Advances the game by one turn. |
| `turnManager.isPlayerTurn` | Boolean: Is it the player's turn to act? |
| `turnManager.pause() / resume()`| Halts or resumes all systems. |
| `turnManager.reset()` | Resets the turn clock to zero. |
| `system.update(dt)` | Executes the system logic. |

### Decorators
| Method | Description |
| :--- | :--- |
| `@Inject(id?)` | Injects a Mapper, EventBus, or Manager. |
| `@Subscribe(type)` | Auto-subscribes a method to an event. |
| `@All` / `@And` | Entity must have ALL of these components. |
| `@One` / `@AnyOf` | Entity must have AT LEAST ONE. |
| `@Exclude` / `@NoneOf` | Entity must NOT have these. |
| `@Match(aspect)` | Merges an existing Aspect. |
| `@Priority(v)` | Sets system execution priority. |
| `@Before('Name')` | Ensures system runs before 'Name'. |
| `@After('Name')` | Ensures system runs after 'Name'. |

### Managers (World Properties)
| Method | Description |
| :--- | :--- |
| `world.events.publish(ev)` | Dispatches an event. |
| `world.events.subscribe(t, cb)`| Manually subscribe to an event. |
| `world.tags.getEntity(tag)` | Finds an entity by its unique tag. |
| `world.groups.getEntities(g)`| Returns all entities in a group. |
| `world.prefabs.spawn(name)` | Creates an entity from a template. |
| `world.relationships.add(s,r,t)`| Links two entities. |
| `world.scenes.switchTo(scene)` | Teardowns current scene and enters the next. |
| `world.turns.nextTurn()` | Advances the tactical game loop. |
| `world.assets.get<T>(key)` | Retrieves a loaded asset from cache. |
| `world.assets.loadJson(k, u)` | Loads a JSON asset. |
| `world.assets.loadAudio(k, u)` | Loads an Audio asset. |
| `world.storage.save(name)` | Persists world state to local storage. |
| `world.storage.load(name)` | Restores world state from local storage. |
| `world.storage.exists(name)` | Checks if a save exists. |
| `world.storage.listSaves()` | Returns all available save metadata. |
