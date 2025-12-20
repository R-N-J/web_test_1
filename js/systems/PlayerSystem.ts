import { GameState } from "../core/GameState";
import { Direction } from "../core/Types";
import { getAdjacent8, findNearestValidPlacement } from "../utils/geometry";
import { createId } from "../utils/id";
import { Entity } from "../entities/Entity";
import { Item } from "../items/Item";
import { getLine } from "./visibility";

export class PlayerSystem {

  // Returns true if an action (move/attack) took place
  static tryMoveOrInteract(state: GameState, delta: Direction,
                           callbacks: {
                             onDescend: () => void;
                             onAscend: () => void;
                           }): boolean {
    if (state.player.hp <= 0) return false;

    const nx = state.player.x + delta.x;
    const ny = state.player.y + delta.y;

    const tile = state.map.get(nx, ny);
    const monster = state.monsters.find(m => m.hp > 0 && m.x === nx && m.y === ny);

    if (monster) {
      PlayerSystem.attackMonster(state, monster);
      return true;
    }

    if (tile?.type === "FLOOR" || tile?.type === "DOOR_OPEN") {
      state.player.x = nx;
      state.player.y = ny;
      PlayerSystem.handleAutoPickup(state, nx, ny);
      return true;
    }

    if (tile?.type === "DOOR_CLOSED") {
      state.events.publish({ type: 'MESSAGE_LOGGED', text: "The door is closed. Press 'o' to open it.", color: "gray" });
      return false;
    }

    if (tile?.type === "STAIRS_DOWN") {
      callbacks.onDescend();
      return true;
    }

    if (tile?.type === "STAIRS_UP") {
      callbacks.onAscend();
      return true;
    }

    return false;
  }

  static tryToggleDoor(state: GameState, mode: "OPEN" | "CLOSE"): boolean {
    const { x, y } = state.player;
    const neighbors = getAdjacent8(x, y);

    for (const n of neighbors) {
      const tile = state.map.get(n.x, n.y);
      if (!tile) continue;

      if (mode === "OPEN" && tile.type === "DOOR_CLOSED") {
        state.map.set(n.x, n.y, { ...tile, type: "DOOR_OPEN", blocksMovement: false, blocksSight: false });
        state.events.publish({ type: 'MESSAGE_LOGGED', text: "You open the door.", color: "orange" });
        return true;
      }

      if (mode === "CLOSE" && tile.type === "DOOR_OPEN") {
        const occupiedByMonster = state.monsters.some(m => m.hp > 0 && m.x === n.x && m.y === n.y);
        const occupiedByPlayer = state.player.x === n.x && state.player.y === n.y;
        if (occupiedByMonster || occupiedByPlayer) continue;

        state.map.set(n.x, n.y, { ...tile, type: "DOOR_CLOSED", blocksMovement: true, blocksSight: true });
        state.events.publish({ type: 'MESSAGE_LOGGED', text: "You close the door.", color: "orange" });
        return true;
      }
    }

    state.events.publish({
      type: 'MESSAGE_LOGGED',
      text: mode === "OPEN" ? "No closed door nearby to open." : "No open door nearby to close (or it's blocked).",
      color: "gray"
    });
    return false;
  }

  static async fireArrow(state: GameState, render: () => void): Promise<boolean> {
    // Find the closest visible monster
    const visibleMonsters = state.monsters.filter(m => m.hp > 0 && state.map.get(m.x, m.y)?.isVisible);
    if (visibleMonsters.length === 0) {
      state.events.publish({ type: 'MESSAGE_LOGGED', text: "No visible target to shoot.", color: "gray" });
      return false;
    }

    visibleMonsters.sort((a, b) => {
      const da = (a.x - state.player.x) ** 2 + (a.y - state.player.y) ** 2;
      const db = (b.x - state.player.x) ** 2 + (b.y - state.player.y) ** 2;
      return da - db;
    });

    const target = visibleMonsters[0];
    const line = getLine(state.player.x, state.player.y, target.x, target.y);
    const path = line.slice(1); // Skip player tile

    // Animation Logic
    const arrowCharForDelta = (dx: number, dy: number): string => {
      const ndx = Math.sign(dx);
      const ndy = Math.sign(dy);
      if (ndx === 1 && ndy === 0) return "→";
      if (ndx === -1 && ndy === 0) return "←";
      if (ndx === 0 && ndy === 1) return "↓";
      if (ndx === 0 && ndy === -1) return "↑";
      if (ndx === 1 && ndy === 1) return "↘";
      if (ndx === 1 && ndy === -1) return "↗";
      if (ndx === -1 && ndy === 1) return "↙";
      if (ndx === -1 && ndy === -1) return "↖";
      return "•";
    };

    let prev = { x: state.player.x, y: state.player.y };
    for (const step of path) {
      const tile = state.map.get(step.x, step.y);
      if (!tile) break;

      const dx = step.x - prev.x;
      const dy = step.y - prev.y;

      state.projectiles = [{ x: step.x, y: step.y, char: arrowCharForDelta(dx, dy), color: "white" }];
      render(); // Force a frame

      await new Promise<void>(resolve => window.setTimeout(resolve, 60));

      if (tile.blocksMovement || tile.blocksSight) break; // Wall hit

      if (step.x === target.x && step.y === target.y) {
        target.hp -= 3;
        state.events.publish({ type: 'MESSAGE_LOGGED', text: "The arrow hits!", color: "yellow" });
        if (target.hp <= 0) {
          state.events.publish({ type: 'MESSAGE_LOGGED', text: "Target is slain!", color: "red" });
          PlayerSystem.dropCorpse(state, target);
        }
        break;
      }
      prev = step;
    }

    state.projectiles = []; // Cleanup
    render();
    return true;
  }

  private static attackMonster(state: GameState, monster: Entity) {
    monster.hp -= state.player.damage;
    state.events.publish({ type: 'MESSAGE_LOGGED', text: `Hero attacks ${monster.name} for ${state.player.damage} damage!`, color: "yellow" });
    if (monster.hp <= 0) {
      state.events.publish({ type: 'MESSAGE_LOGGED', text: `${monster.name} is defeated!`, color: "red" });
      PlayerSystem.dropCorpse(state, monster);
    }
  }

  private static dropCorpse(state: GameState, monster: Entity): void {
    const chance = monster.corpseDropChance ?? 0;
    if (chance <= 0 || Math.random() > chance) return;

    const placement = findNearestValidPlacement(monster.x, monster.y, (x, y) => {
      const tile = state.map.get(x, y);
      if (!tile || tile.type === "WALL") return false;
      if (tile.type === "STAIRS_UP" || tile.type === "STAIRS_DOWN") return false;
      return true;
    });

    const corpse: Item = {
      id: createId('corpse'),
      x: placement.x,
      y: placement.y,
      symbol: "%",
      color: "#aa8866",
      name: `${monster.name} corpse`,
      slot: "none",
      attackBonus: 0,
      defenseBonus: 0,
      healAmount: 0,
    };

    state.itemsOnMap.push(corpse);
    state.events.publish({ type: 'MESSAGE_LOGGED', text: `The ${monster.name} drops its corpse.`, color: "gray" });
  }

  private static handleAutoPickup(state: GameState, x: number, y: number) {
    if (!state.autoPickup) return;

    const itemIndex = state.itemsOnMap.findIndex(it => it.x === x && it.y === y);
    if (itemIndex >= 0) {
      const item = state.itemsOnMap[itemIndex];
      if (item.slot !== "none") {
        const countBefore = state.inventory.items.length;
        state.inventory.addItem(item);
        if (state.inventory.items.length > countBefore) {
          state.itemsOnMap.splice(itemIndex, 1);
        }
      }
    }
  }
}
