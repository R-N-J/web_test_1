import type { UiOverlay, GameState } from "../../core/GameState";
import type { AsciiRenderer } from "../AsciiRenderer";

export class GameOverOverlay implements UiOverlay {
  public readonly kind = "GAME_OVER";

  public render(state: GameState, display: AsciiRenderer): void {
    const w = 30;
    const h = 8;
    const x0 = Math.floor((state.width - w) / 2);
    const y0 = Math.floor((state.mapHeight - h) / 2);

    display.drawSmoothBox(x0, y0, w, h, "red", "#000");
    display.drawSmoothString(x0 + 7, y0 + 2, " YOU HAVE DIED ", "red", "#000");
    display.drawSmoothString(x0 + 4, y0 + 4, "The dungeon claims another soul.", "#888", "#000");
    display.drawSmoothString(x0 + 5, y0 + 6, " Press Space to Restart ", "#fff", "#222");
  }

  public onKeyDown(state: GameState, event: KeyboardEvent): boolean {
    if (event.key === " " || event.key === "Enter") {
      // We can't easily call startNewGame from here without circular deps or passing refs,
      // so we'll just reload the page for a clean restart of the app.
      window.location.reload();
      return true;
    }
    return true; // Consume all keys
  }
}
