import { MessageLog } from "./MessageLog";

export const CONFIG = {
  WIDTH: 60,
  HEIGHT: 40,
  FOV_RADIUS: 10,

  TILE_SIZE: 20,
  //FONT: "Courier New, monospace",
  FONT: "DejaVu Sans Mono, monospace",
  //FONT: "Verdana, sans-serif", // Proportional font
  //for the arrow animation, use Unicode coverage like "DejaVu Sans Mono"
  //ASCII fallback: ^ v < > and diagonals / \ (always supported)
  //could use an ASCII-only mode fallback automatically when the font can’t render diagonals.

  STATUS_ROWS: 1,
  LOG_ROWS: MessageLog.DISPLAY_LINES,
  SMOOTH_MAP: false, // Set to true for normal spacing, false for chunky fixed-grid

  get UI_ROWS(): number {
    return this.LOG_ROWS + this.STATUS_ROWS;
  },

  get MAP_HEIGHT(): number {
    return this.HEIGHT - this.UI_ROWS;
  },
} as const;


