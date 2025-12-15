import { MessageLog } from "./MessageLog";

export const CONFIG = {
  WIDTH: 60,
  HEIGHT: 40,
  FOV_RADIUS: 10,

  TILE_SIZE: 20,
  FONT: "Courier New, monospace",

  STATUS_ROWS: 1,
  LOG_ROWS: MessageLog.DISPLAY_LINES,

  get UI_ROWS(): number {
    return this.LOG_ROWS + this.STATUS_ROWS;
  },

  get MAP_HEIGHT(): number {
    return this.HEIGHT - this.UI_ROWS;
  },
} as const;
