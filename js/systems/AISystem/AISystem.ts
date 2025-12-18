import type { GameState } from "../../core/GameState";
import { tryMoveEntity } from "../../entities/Entity";
import { findPath } from "../pathfinding";

export function runMonsterTurn(state: GameState): void {
  for (const monster of state.monsters) {
    if (monster.hp <= 0 || state.player.hp <= 0) continue;

    const dxToPlayer = state.player.x - monster.x;
    const dyToPlayer = state.player.y - monster.y;
    const distSq = dxToPlayer ** 2 + dyToPlayer ** 2;

    // Attack if adjacent (simple rule)
    if (distSq <= 2) {
      const damageTaken = Math.max(0, monster.damage - state.player.defense);
      state.player.hp = Math.max(0, state.player.hp - damageTaken);
      state.log.addMessage(`${monster.name} attacks for ${damageTaken} damage!`, "red");
      continue;
    }

    // If visible, pathfind toward player
    if (state.map.get(monster.x, monster.y)?.isVisible) {
      const path = findPath(
        state.map,
        { x: monster.x, y: monster.y },
        { x: state.player.x, y: state.player.y }
      );

      if (path && path.length > 0) {
        const nextStep = path[0];
        // Pass the whole state as the context
        tryMoveEntity(monster, state, nextStep.x - monster.x, nextStep.y - monster.y);
      } else {
        state.log.addMessage(`${monster.name} seems confused.`, "gray");
      }

      continue;
    }

    // Otherwise wander
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 },
    ];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    // Pass the whole state as the context
    tryMoveEntity(monster, state, d.x, d.y);
  }

  state.monsters = state.monsters.filter(m => m.hp > 0);
}
