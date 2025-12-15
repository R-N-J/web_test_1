import type { GameState } from "../core/GameState";
import { tryMoveEntity } from "../Entity";
import { findPath } from "../Pathfinding";

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
      const path = findPath(state.map, monster.x, monster.y, state.player.x, state.player.y);
      if (path && path.length > 0) {
        const next = path[0];
        tryMoveEntity(monster, state.map, next.x - monster.x, next.y - monster.y);
      }
      continue;
    }

    // Otherwise wander
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 },
    ];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    tryMoveEntity(monster, state.map, d.x, d.y);
  }

  state.monsters = state.monsters.filter(m => m.hp > 0);
}
