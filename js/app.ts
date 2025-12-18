// main.ts
import { AsciiRenderer } from "./ui/AsciiRenderer";
import { InputHandler } from "./ui/InputHandler";
import { keyEventToAction } from "./ui/Keymap";
import { Game } from "./core/Game";
import { CONFIG } from "./core/Config";



// --- BOOTSTRAP ---
const display = new AsciiRenderer({
  width: CONFIG.WIDTH,
  height: CONFIG.HEIGHT,
  tileSize: CONFIG.TILE_SIZE,
  font: CONFIG.FONT,
  smoothMap: CONFIG.SMOOTH_MAP,
});

const game = new Game(display, CONFIG);

game.startNewGame();

new InputHandler((event) => {
  if (event.repeat) return;

  if (game.handleUiKey(event)) {
    event.preventDefault();
    game.render(); // ensure selection highlight updates immediately
    return;
  }

  const action = keyEventToAction(event);
  if (!action) return;

  event.preventDefault();
  void game.handleAction(action);
});
