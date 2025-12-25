# Rogue1 ECS Guide

Welcome to the Rogue1 ECS (Entity-Component-System). This is a high-performance, archetype-based ECS designed for efficiency and ease of use.

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

## 3. Tags and Groups

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

## 4. Tags vs. Groups vs. Relationships

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

## 5. Prefabs

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

## 6. Querying Entities (Aspects and Views)

To find entities with specific components, use `Aspect`.

### Creating an Aspect
```typescript
import { Aspect } from './ECS/Aspect';

// Entities with BOTH Position AND Health
const fighterAspect = Aspect.all(Components.POSITION, Components.HEALTH);

// Entities with Position but NOT Health
const ghostAspect = Aspect.all(Components.POSITION).butNot(Components.HEALTH);

// Entities with EITHER Render OR Position
const visibleAspect = Aspect.one(Components.RENDER, Components.POSITION);
```

### Using Views
A `view` is the most common way to iterate over entities matching an aspect.
```typescript
for (const entity of world.view(fighterAspect)) {
  const pos = world.getComponent(entity, Components.POSITION);
  // ...
}
```

---

## 7. Relationships

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
world.relationships.clear(monster, REL_TARGETS);
```

### Automatic Cleanup and Integrity
A major advantage of using the `RelationshipManager` is **automatic referential integrity**. When an entity is deleted via `world.deleteEntity(id)`:
1. All relationships where that entity was the **subject** are removed.
2. All relationships where that entity was the **target** are also removed from any other entities that were pointing to it.

This prevents "Ghost ID" bugs where a system tries to process a target entity that no longer exists in the world.

---

## 8. Observers

Observers allow you to react to changes in the ECS state, such as when components are added or removed, or when an entity's composition changes.

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
Mask observers are triggered whenever an entity's component composition changes (any component added or removed).

```typescript
world.subscribeOnMaskChange((entity, oldMask, newMask) => {
  console.log(`Entity ${entity} changed from ${oldMask} to ${newMask}`);
});
```

---

## 9. Systems, Scheduler, and TurnManager

Systems encapsulate logic. The `Scheduler` manages their execution, and the `TurnManager` controls the high-level game loop.

### Systems
The `IteratingSystem` is the most common base class.

```typescript
import { IteratingSystem } from './ECS/System';

class MovementSystem extends IteratingSystem {
  constructor(world: World) {
    super(world, Aspect.all(Components.POSITION));
  }

  processEntity(entity: EntityId, dt: number) {
    const pos = this.getComponent<Position>(entity, Components.POSITION);
    pos.x += 1;
  }
}
```

### The Scheduler
The `Scheduler` maintains a list of systems and updates them in order.

```typescript
import { Scheduler } from './ECS/Scheduler';

const scheduler = new Scheduler();
scheduler.add(new MovementSystem(world));
scheduler.add(new RenderSystem(world));

// In your game loop:
scheduler.update(dt);
```

### The TurnManager
For turn-based games, use the `TurnManager` to coordinate between player actions and world updates.

```typescript
import { TurnManager } from './ECS/TurnManager';

const turnManager = new TurnManager(world, scheduler);

// When the player performs an action:
turnManager.nextTurn();
// This increments the turn clock and ticks the scheduler once.
```

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

## 11. Advanced Features

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

## 12. The ECS Engine Flow

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
| `turnManager.nextTurn()` | Advances the game by one turn. |
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
