import type { GameState } from "../core/GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import { calculateFOV } from "./visibility";

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
      if (tile.type === "STAIRS_UP") char = "<";
      if (tile.type === "DOOR_CLOSED") char = "+";
      if (tile.type === "DOOR_OPEN") char = "-";

      if (tile.isVisible) {
        bg = "#000";
        fg = tile.type === "WALL" ? "#ccc" : "#fff";
        if (tile.type === "DOOR_CLOSED" || tile.type === "DOOR_OPEN") fg = "brown";
        if (tile.type === "STAIRS_DOWN" || tile.type === "STAIRS_UP") fg = "yellow";
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

  // Projectiles (overlay, no background)
  for (const p of state.projectiles) {
    display.draw(p.x, p.y, p.char, p.color, null);
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

  // ---- Modal UI overlay ----
  if (state.ui.kind === "PICKLIST") {
    const title = state.ui.title;

    const padding = 1;
    const lines = state.ui.entries.length;
    const contentW = Math.max(
      title.length,
      ...state.ui.entries.map(e => e.text.length)
    );

    const w = Math.min(state.width - 2, contentW + padding * 2 + 2); // +2 for borders
    const h = Math.min(state.mapHeight - 2, lines + 3); // title row + border rows

    const x0 = Math.floor((state.width - w) / 2);
    const y0 = Math.floor((state.mapHeight - h) / 2);

    const frameFg = "#ddd";
    const frameBg = "#000";
    const normalFg = "#fff";
    const normalBg = "#000";
    const hiliteFg = "#000"; // reverse video
    const hiliteBg = "#fff";

    display.drawBox(x0, y0, w, h, frameFg, frameBg);

    // Title
    const titleText = ` ${title} `;
    display.drawString(x0 + 2, y0, titleText.slice(0, Math.max(0, w - 4)), frameFg, frameBg);

    // Entries
    const maxRows = h - 2; // inside border
    for (let i = 0; i < Math.min(lines, maxRows); i++) {
      const entry = state.ui.entries[i];
      const rowY = y0 + 1 + i;

      const isSelected = i === state.ui.selected;
      const fg = isSelected ? hiliteFg : normalFg;
      const bg = isSelected ? hiliteBg : normalBg;

      const line = entry.text.padEnd(w - 2, " ").slice(0, w - 2);
      display.drawString(x0 + 1, rowY, line, fg, bg);
    }
  }

}
