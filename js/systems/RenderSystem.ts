import type { GameState } from "../core/GameState";
import type { AsciiRenderer } from "../ui/AsciiRenderer";
import { COLOR, UI_COLORS } from "../core/Colors";
import { calculateFOV } from "./visibility";


export function renderGame(state: GameState, display: AsciiRenderer): void {
  calculateFOV(state.map, state.player.x, state.player.y, state.fovRadius);

  display.clear();

  // Apply screen shake
  display.setOffset(state.screenShake.x, state.screenShake.y);

  // 1. Map Tiles (Floor & Walls)
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const tile = state.map.get(x, y);
      if (!tile || !tile.isExplored) continue;

      let char = " ";
      let fg: string = COLOR.DARK_GRAY;
      let bg: string = COLOR.VERY_DARK_GRAY;

      // Draw standard tiles
      if (tile.type === "WALL") char = "#";
      if (tile.type === "FLOOR") char = ".";

      // Feature tiles (Stairs/Doors) - we draw them here so items can overlap them
      if (tile.type === "STAIRS_DOWN") char = ">";
      if (tile.type === "STAIRS_UP") char = "<";
      if (tile.type === "DOOR_CLOSED") char = "+";
      if (tile.type === "DOOR_OPEN") char = "-";

      if (tile.isVisible) {
        bg = COLOR.BLACK;
        fg = tile.type === "WALL" ? COLOR.SILVER : COLOR.WHITE;
        if (tile.type === "DOOR_CLOSED" || tile.type === "DOOR_OPEN") fg = COLOR.LEATHER;
        if (tile.type === "STAIRS_DOWN" || tile.type === "STAIRS_UP") fg = COLOR.GOLD;
      }

      display.draw(x, y, char, fg, bg);
    }
  }

  // 2. Items & Corpses (Static objects on floor)
  for (const item of state.itemsOnMap) {
    if (state.map.get(item.x, item.y)?.isVisible) {
      display.draw(item.x, item.y, item.symbol, item.color);
    }
  }

  // 3. Monsters (Active entities)
  for (const m of state.monsters) {
    if (m.hp > 0 && state.map.get(m.x, m.y)?.isVisible) {
      display.draw(m.x, m.y, m.symbol, m.color);
    }
  }

  // 4. Projectiles (Visual effects)
  for (const p of state.projectiles) {
    display.draw(p.x, p.y, p.char, p.color, null);
  }

  // 5. Player (Top of the world)
  display.draw(state.player.x, state.player.y, state.player.symbol, state.player.color);

  // 6. UI Bars (Screen Space)
  const statusRow = state.height - 1;
  const logStartRow = statusRow - state.log.DISPLAY_LINES;

  const messages = state.log.getDisplayMessages();
  messages.forEach((msg, i) => {
    display.drawTextLine(0, logStartRow + i, msg.text, msg.color, COLOR.BLACK);
  });

  display.drawTextLine(
    0,
    statusRow,
    `L${state.currentLevel} | HP: ${state.player.hp}/${state.player.maxHp} | ATK: ${state.player.damage} | DEF: ${state.player.defense} | INV: ${state.inventory.items.length}`,
    UI_COLORS.DEFAULT_TEXT,
    UI_COLORS.BACKGROUND
  );

  // 7. Overlays (Modal menus)
  for (const overlay of state.uiStack) {
    overlay.render(state, display);
  }

  // Decay screen shake for next frame
  if (state.screenShake.x !== 0 || state.screenShake.y !== 0) {
    state.screenShake.x = -state.screenShake.x * 0.7; // Flip and shrink
    state.screenShake.y = -state.screenShake.y * 0.7;

    if (Math.abs(state.screenShake.x) < 0.5) state.screenShake.x = 0;
    if (Math.abs(state.screenShake.y) < 0.5) state.screenShake.y = 0;

    requestAnimationFrame(() => renderGame(state, display));
  }
}
