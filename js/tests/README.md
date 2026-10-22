# ECS Tests

This directory contains unit tests for the ECS (Entity Component System) core.

## Structure

- `Aspect.test.ts`: Tests for bitmask filtering and aspect matching.
- `EntityManager.test.ts`: Tests for entity creation, versioning, and recycling.
- `World.test.ts`: High-level tests for the World API, component management, and views.
- `RPG.test.ts`: Advanced RPG scenario tests including fluent builders, SoA iteration, mappers, and relationships.
- `Prefabs.test.ts`: Tests for the PrefabManager (registration, spawning, overrides).
- `TurnManager.test.ts`: Tests for turn-based game logic and clock management.
- `Systems.test.ts`: Tests for System decorators (@All, @Inject, @After) and the Scheduler.
- `SceneManager.test.ts`: Tests for scene transitions and world clearing.
- `index.ts`: Main entry point that runs all tests.

## Running Tests

The tests are designed to be run using `jiti` or any modern TypeScript-capable runner.

### Using NPM
A test script has been added to `package.json`. You can run:

```bash
npm test
```

### Manual Execution (using jiti)
If you have `jiti` installed globally or in your node_modules:

```bash
./node_modules/.bin/jiti js/tests/index.ts
```

### Note on Environment
These tests require a Node.js runtime (v16+) to be available in your system's PATH.

If `npm` or `node` is not working (e.g., "command not found"), follow these steps:

#### 1. Check Installation
Run `node -v` and `npm -v` in your terminal. If they fail:
- **Windows**: Download the installer from [nodejs.org](https://nodejs.org/).
- **macOS/Linux**: It is recommended to use a version manager like `nvm` (Node Version Manager) or `fnm`.
  - For `nvm`: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`
  - Then: `nvm install --lts`

#### 2. Configure PATH
If you have installed Node but it's still not found, you may need to add it to your PATH environment variable.
- In WebStorm: Go to `Settings > Languages & Frameworks > Node.js`. Ensure the "Node interpreter" path is correctly pointing to your `node` executable.

#### 3. Install Dependencies
Once Node/npm is working, run this in the project root to ensure all test runners are available:
```bash
npm install
```
