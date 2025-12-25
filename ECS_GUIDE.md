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
Component data is defined using standard TypeScript `interface` or `type`. These interfaces should be used with the generic ECS methods to ensure type safety and IDE autocompletion.

```typescript
// Define the shape of your data
export interface Position { x: number; y: number; }
export interface Velocity { dx: number; dy: number; }

// Use the interface with world methods
const pos = world.getComponent<Position>(entity, Components.POSITION);
if (pos) {
  console.log(pos.x, pos.y);
}

// Update with type safety
world.updateComponent<Position>(entity, Components.POSITION, (p) => {
  p.x += 1;
  return p;
});
```
It is a best practice to keep these interfaces in the same file as your `Components` ID definitions (e.g., `ComponentIds.ts`).

### Accessing and Modifying Data
- **getComponent**: Get a reference to component data.
- **setComponent**: Overwrite component data.
- **updateComponent**: Update data using a callback (useful for nested objects).
- **mutateComponent**: For in-place modifications when you don't need to replace the object.

```typescript
const pos = world.getComponent<Position>(player, Components.POSITION);

world.updateComponent<Position>(player, Components.POSITION, (p) => {
  p.x += 1;
  return p;
});
```

### Removing Components and Deleting Entities
```typescript
world.removeComponent(player, Components.HEALTH);
world.deleteEntity(player);
```

---

## 3. Tags and Groups

Managing specific entities or collections of entities is handled by the `TagManager` and `GroupManager`.

### Tags (Unique 1-to-1)
Tags are unique strings assigned to a single entity. They are perfect for "Singletons" that are actual entities (like the `PLAYER`).

```typescript
// Assign a tag
world.tags.register('PLAYER', playerEntity);

// Retrieve an entity by tag
const player = world.tags.getEntity('PLAYER');
```

### Groups (1-to-Many)
Groups allow you to categorize multiple entities under a single label.

```typescript
// Add entities to a group
world.groups.add('ENEMIES', orcEntity);
world.groups.add('ENEMIES', goblinEntity);

// Iterate over a group
for (const entity of world.groups.getEntities('ENEMIES', world)) {
  // Logic for all enemies
}
```

---

## 4. Prefabs

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

---

## 5. Querying Entities (Aspects and Views)

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

## 6. Relationships

Relationships allow entities to reference other entities (e.g., "A is owned by B", "C is targeting D").

### When to use Relationships
- **Hierarchies**: Items in an inventory, equipment.
- **AI Targeting**: A monster targeting the player.
- **Social**: Friendly vs Hostile factions.

### Setting up Relationships
Relationships use specific Component IDs but are managed via `world.relationships`.

```typescript
// Define a relationship ID
const REL_TARGETS = 101;

// Add a relationship (Subject -> Relation -> Target)
world.relationships.add(monster, REL_TARGETS, player);

// Check targets
const target = world.relationships.getTargets(monster, REL_TARGETS); // Returns a Set<EntityId> or number
```

### Automatic Cleanup
A key benefit of the `RelationshipManager` is that it automatically cleans up stale references when an entity is deleted, preventing "ghost" references.

---

## 7. Observers

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

## 8. Systems, Scheduler, and TurnManager

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

---

## 9. Advanced Features

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

## 10. The ECS Engine Flow

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

## 11. Performance Best Practices

1. **Avoid `getComponent` inside hot loops**: If you are in a custom system, use `viewColumns` or `requireColumn` to access raw data arrays.
2. **Reuse Aspects**: Don't create `new Aspect(...)` every frame. Store them as static members or constants.
3. **Prefer `mutateComponent`**: If you only change a property (like `pos.x++`), `mutateComponent` is faster than `setComponent` as it avoids some change-detection overhead.
4. **Use Tags**: Use simple components (without data) as "Tags" to filter entities quickly.

---

## 12. Comparison with Other ECS Architectures

If you are coming from other ECS libraries (like `bitecs`, `gecs`, or `tiny-ecs`), here is how Rogue1 compares and what it tries to do differently:

### Archetype-Based (SoA) vs. Entity-Centric (AoS)
Most simple ECS implementations store components as objects attached to an entity (Array of Structures). While easy to implement, this is slow for large-scale iteration.
Rogue1 uses **Archetypes** and **Struct-of-Arrays (SoA)** storage.
- **The Advantage**: Entities with the exact same component composition are stored together. When a system iterates over them, it accesses contiguous arrays of data. This is significantly more cache-friendly and faster for the JS engine to optimize than jumping between different objects in memory.

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

### Deterministic State and Snapshots
By requiring component registration (`bootstrapEcs`), Rogue1 ensures that the internal memory layout (Archetypes) is deterministic. This makes the built-in `saveSnapshot` and `loadSnapshot` features incredibly robust, allowing you to implement save/load systems with just a few lines of code.

---

## Method Cheat Sheet

| Method | Description |
| :--- | :--- |
| `world.createEntity()` | Returns a new `EntityId`. |
| `world.addComponent(e, id, val)` | Adds a component to an entity. |
| `world.getComponent<T>(e, id)` | Retrieves component data with type T. |
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
| `system.update(dt)` | Executes the system logic. |
