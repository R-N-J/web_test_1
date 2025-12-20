import { COLOR } from "../core/Colors";

/**
 * Options for configuring the AsciiRenderer.
 */
export interface RendererOptions {
  /** The font stack used for rendering. Must be a monospace font for standard grid alignment. */
  font?: string;
  /** Height of the rendering grid in character cells. */
  height: number;
  /** The DOM element where the canvas will be appended. Defaults to document.body. */
  parent?: HTMLElement;
  /**
   * If true, text is rendered with proportional spacing (normal kerning) within its cell.
   * If false, text is strictly centered, creating a chunky fixed-grid aesthetic.
   */
  smoothMap?: boolean;
  /** Size of a single square tile in logical pixels. */
  tileSize: number;
  /** Width of the rendering grid in character cells. */
  width: number;
}

/**
 * A hardware-accelerated 2D grid renderer using HTML5 Canvas.
 *
 * This class handles the conversion from a logical grid (cells) to physical pixels,
 * accounting for High-DPI (Retina) displays to ensure text remains crisp.
 */
export class AsciiRenderer {
  private readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly options: RendererOptions;

  constructor(options: RendererOptions) {
    this.options = {
      font: "monospace", // Fallback
      parent: document.body,
      ...options,
    };

    this.canvas = document.createElement("canvas");
    this.options.parent!.appendChild(this.canvas);

    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Could not get 2D context");
    this.ctx = context;

    this.resize();
  }

  /**
   * Internal method to synchronize canvas dimensions with the browser's Device Pixel Ratio (DPR).
   * Prevents blurriness on high-resolution screens by scaling the internal drawing buffer.
   */
  private resize() {
    const { width, height, tileSize } = this.options;
    const dpr = window.devicePixelRatio || 1;

    // 1. Set the visual size (CSS pixels)
    this.canvas.style.width = `${width * tileSize}px`;
    this.canvas.style.height = `${height * tileSize}px`;

    // 2. Set the internal resolution (Physical pixels)
    this.canvas.width = width * tileSize * dpr;
    this.canvas.height = height * tileSize * dpr;

    // 3. Scale the context drawing operations
    this.ctx.scale(dpr, dpr);

    // 4. Configure text rendering
    this.ctx.font = `${tileSize}px ${this.options.font}`;
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "center";
  }

  /**
   * Draws a single character at the specified grid coordinates.
   *
   * @param x - Grid X-coordinate (column).
   * @param y - Grid Y-coordinate (row).
   * @param char - The character glyph to render.
   * @param fg - Foreground color (CSS color string).
   * @param bg - Background color. Pass `null` to leave the background transparent (layering).
   */
  //public draw(x: number, y: number, char: string, fg: string, bg: string = COLOR.BLACK) {
  public draw(x: number, y: number, char: string, fg: string, bg: string | null = COLOR.BLACK) {
    // Bounds check (optional, but good for safety)
    if (x < 0 || x >= this.options.width || y < 0 || y >= this.options.height) return;

    const ts = this.options.tileSize;
    const px = x * ts;
    const py = y * ts;

    // 1. Draw Background
    if (bg !== null) {
      this.ctx.fillStyle = bg;
      this.ctx.fillRect(px, py, ts, ts);
    }

    // 2. Ensure consistent text state for every glyph
    this.ctx.font = `${ts}px ${this.options.font}`;
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = fg;

    // 3. Draw Character
    // x is pixels from left, y is pixels from top.
    if (this.options.smoothMap) {
      // SMOOTH MODE: Normal kerning, left-aligned in the tile
      this.ctx.textAlign = "left";
      this.ctx.fillText(char, px, py + (ts / 2));
    } else {
      // CLASSIC MODE: Force center alignment (fixed-grid look)
      this.ctx.textAlign = "center";
      this.ctx.fillText(char, px + (ts / 2), py + (ts / 2));
    }
  }

  /**
   * Draws a full-width status bar row (left-aligned text)
   */
  public drawStatusBar(y: number, text: string, fg: string = COLOR.WHITE, bg: string = COLOR.BLACK) {
    if (y < 0 || y >= this.options.height) return;

    const ts = this.options.tileSize;
    const px = 0;
    const py = y * ts;

    // Paint the whole row background
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(px, py, this.options.width * ts, ts);

    // Draw left-aligned text with a small padding
    const prevAlign = this.ctx.textAlign;
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = fg;
    this.ctx.fillText(text, px + 4, py + (ts / 2));
    this.ctx.textAlign = prevAlign;
  }



  /**
   * Clears the entire canvas and resets the coordinate transform.
   * Resets the viewport to (0,0) before clearing to ensure total coverage.
   */
  public clear() {
    const { width, height, tileSize } = this.options;
    // Reset transform before clearing
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dpr = window.devicePixelRatio || 1;
    this.ctx.scale(dpr, dpr);

    this.ctx.clearRect(0, 0, width * tileSize, height * tileSize);


    // Optional: Fill with default background color immediately
    this.ctx.fillStyle = COLOR.BLACK;
    this.ctx.fillRect(0, 0, width * tileSize, height * tileSize);
  }

  /**
   * Shifts the entire rendering context by a specific pixel amount.
   * Useful for global juice effects like screen shake.
   *
   * @param x - Horizontal offset in pixels.
   * @param y - Vertical offset in pixels.
   */
  public setOffset(x: number, y: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
  }

  /**
   * Draws a full string starting at grid coordinates (x, y), clearing the rest of the line.
   */
  public drawTextLine(x: number, y: number, text: string, fg: string, bg: string = COLOR.BLACK) {
    const ts = this.options.tileSize;

    // 1. Clear the entire horizontal line for a clean background
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(x * ts, y * ts, this.options.width * ts, ts);

    // 2. Draw the text
    this.ctx.font = `${ts}px ${this.options.font}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = fg;

    this.ctx.fillText(text, x * ts, y * ts + (ts / 2));

    // 3. Restore to the standard glyph state (so future calls look identical)
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.font = `${ts}px ${this.options.font}`;
  }

  public drawString(x: number, y: number, text: string, fg: string, bg: string | null = COLOR.BLACK): void {
    for (let i = 0; i < text.length; i++) {
      this.draw(x + i, y, text[i], fg, bg);
    }
  }

  public drawBox(x: number, y: number, w: number, h: number, fg: string, bg: string = COLOR.BLACK): void {
    if (w < 2 || h < 2) return;

    // Fill background
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        this.draw(x + xx, y + yy, " ", fg, bg);
      }
    }

    // Border (ASCII box)
    const top = "+" + "-".repeat(w - 2) + "+";
    const mid = "|" + " ".repeat(w - 2) + "|";
    const bot = "+" + "-".repeat(w - 2) + "+";

    this.drawString(x, y, top, fg, bg);
    for (let i = 1; i < h - 1; i++) this.drawString(x, y + i, mid, fg, bg);
    this.drawString(x, y + h - 1, bot, fg, bg);
  }



  /**
   * Draws a string using proportional font spacing regardless of the `smoothMap` setting.
   * Best used for UI elements, labels, and modal windows.
   */
  public drawSmoothString(x: number, y: number, text: string, fg: string, bg: string | null = COLOR.BLACK): void {
    const ts = this.options.tileSize;
    const px = x * ts;
    const py = y * ts;

    this.ctx.font = `${ts}px ${this.options.font}`;
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "left";

    if (bg !== null) {
      const metrics = this.ctx.measureText(text);
      this.ctx.fillStyle = bg;
      // Draw background slightly wider than text for safety
      this.ctx.fillRect(px, py, metrics.width + 2, ts);
    }

    this.ctx.fillStyle = fg;
    this.ctx.fillText(text, px, py + (ts / 2));
  }

  /**
   * Draws an outlined box using geometric primitives instead of ASCII characters.
   * Provides a "modern" UI look compared to standard ASCII border characters.
   */
  public drawSmoothBox(x: number, y: number, w: number, h: number, fg: string, bg: string = COLOR.BLACK): void {
    const ts = this.options.tileSize;
    const px = x * ts;
    const py = y * ts;
    const pw = w * ts;
    const ph = h * ts;

    this.ctx.fillStyle = bg;
    this.ctx.fillRect(px, py, pw, ph);

    this.ctx.strokeStyle = fg;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  }
}
