// main.ts
import { AsciiRenderer } from "./Renderer";
import { InputHandler } from "./InputHandler";
import { keyEventToAction } from "./ui/Keymap";
import { Game } from "./core/Game";
import { CONFIG } from "./core/Config";



// --- BOOTSTRAP ---
const display = new AsciiRenderer({
  width: CONFIG.WIDTH,
  height: CONFIG.HEIGHT,
  tileSize: CONFIG.TILE_SIZE,
  font: CONFIG.FONT,
});

const game = new Game(display, CONFIG);

game.startNewGame();

new InputHandler((event) => {
  if (event.repeat) return;

  const action = keyEventToAction(event);
  if (!action) return;

  event.preventDefault();
  game.handleAction(action);
});
