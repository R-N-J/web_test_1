import type { GameState } from "../core/GameState";
import type { AsciiRenderer } from "../Renderer";
import { calculateFOV } from "../Visibility";

export function renderGame(state: GameState, display: AsciiRenderer): void {
  calculateFOV(state.map, state.player.x, state.player.y, state.fovRadius);

  display.clear();

  // Draw map (only within map height; UI lives below)
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const tile = state.map.get(x, y);
      if (!tile || !tile.isExplored) continue;

      let char = " ";
      let fg = "#333";
      let bg = "#111";

      if (tile.type === "WALL") char = "#";
      if (tile.type === "FLOOR") char = ".";
      if (tile.type === "STAIRS_DOWN") char = ">";
      if (tile.type === "DOOR_CLOSED") char = "+";
      if (tile.type === "DOOR_OPEN") char = "-";

      if (tile.isVisible) {
        bg = "#000";
        fg = tile.type === "WALL" ? "#ccc" : "#fff";
        if (tile.type === "DOOR_CLOSED" || tile.type === "DOOR_OPEN") fg = "brown";
        if (tile.type === "STAIRS_DOWN") fg = "yellow";
      }

      display.draw(x, y, char, fg, bg);
    }
  }

  // Items
  for (const item of state.itemsOnMap) {
    if (state.map.get(item.x, item.y)?.isVisible) {
      display.draw(item.x, item.y, item.symbol, item.color);
    }
  }

  // Monsters
  for (const m of state.monsters) {
    if (m.hp > 0 && state.map.get(m.x, m.y)?.isVisible) {
      display.draw(m.x, m.y, m.symbol, m.color);
    }
  }

  // Player
  display.draw(state.player.x, state.player.y, state.player.symbol, state.player.color);

  // UI (log + status)
  const statusRow = state.height - 1;
  const logStartRow = statusRow - state.log.DISPLAY_LINES;

  const messages = state.log.getDisplayMessages();
  messages.forEach((msg, i) => {
    display.drawTextLine(0, logStartRow + i, msg.text, msg.color, "black");
  });

  display.drawTextLine(
    0,
    statusRow,
    `L${state.currentLevel} | HP: ${state.player.hp}/${state.player.maxHp} | ATK: ${state.player.damage} | DEF: ${state.player.defense} | INV: ${state.inventory.items.length}`,
    "white",
    "black"
  );
}
