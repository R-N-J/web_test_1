# Rogue1 ECS — Junie Instructions

## 1. Authoritative Documents

- Read `ECS_SPEC.md` before making ECS implementation changes.
- `ECS_SPEC.md` defines intended ECS behavior.
- `ECS_GUIDE.md` documents usage and must reflect verified behavior.
- Follow the Coding Standards in Section 19 of `ECS_SPEC.md`.
- If source code, tests, documentation, and the specification conflict, report the conflict rather than silently choosing a behavior.
- Do not weaken a specification requirement merely to accommodate a bug.

## 2. Development Priorities

1. Establish a working, repeatable test and verification baseline.
2. Test entity lifecycle, components, archetypes, and queries.
3. Fix core correctness defects.
4. Test deferred operations, observers, scheduling, and world lifecycle.
5. Test framework features such as relationships, prefabs, and persistence.
6. Update documentation to reflect verified behavior.

Correctness comes before optimization and new features.

## 3. Change Policy

- Inspect existing code and tests before making changes.
- Do not rewrite the ECS or introduce features unless explicitly requested.
- Make small, focused changes that address one coherent problem.
- Add regression tests for bug fixes whenever practical.
- Do not remove or weaken tests just to make them pass.
- Do not change public API behavior silently.
- Preserve intentional component mutation and the existing architecture unless a requirement justifies a change.
- Do not install, upgrade, or remove dependencies without approval.
- Keep unrelated changes separate.

## 4. Verification

Use the existing project scripts where appropriate:

- `npm test`
- `npm run lint`
- `npm run build`

The project uses strict TypeScript checking. Run `npx tsc --noEmit` as a separate check when dependencies are available.

Never claim that a check passed unless it was actually executed and its result inspected. Report checks that were not run and explain any verification limitations.

When a command fails, distinguish production defects, test failures, lint violations, and configuration problems.

## 5. Documentation

- Keep `ECS_SPEC.md` focused on intended behavior and requirements.
- Update `ECS_GUIDE.md` after public API behavior has been verified.
- Do not document a feature as working merely because an example exists.
- Keep unresolved decisions and unverified behavior explicit.
- Do not change a specification requirement merely to accommodate an implementation defect.

## 6. Required Completion Report

For every implementation task, report:

1. What changed and why.
2. Which specification requirements were addressed.
3. Which files changed.
4. Which tests and checks were executed, including actual results.
5. Known failures, limitations, and remaining work.
6. Any public API, architectural, persistence, or compatibility implications.

Do not claim that a requirement is satisfied unless the evidence supports that conclusion.
