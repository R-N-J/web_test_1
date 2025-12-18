export interface RendererOptions {
  width: number;      // Width of grid in CHARACTERS (e.g., 80)
  height: number;     // Height of grid in CHARACTERS (e.g., 40)
  tileSize: number;   // Size of one tile in PIXELS (e.g., 20)
  parent?: HTMLElement; // Where to attach the canvas
  font?: string;      // Font family (must be monospace)
}

export class AsciiRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: RendererOptions;

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
   * Handles High-DPI scaling for crisp text on Retina screens
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
   * Draws a single character at grid coordinates
   * If bg is null, background is not painted (allows overlay)
   */
  //public draw(x: number, y: number, char: string, fg: string, bg: string = "#000") {
  public draw(x: number, y: number, char: string, fg: string, bg: string | null = "#000") {
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
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    // 3. Draw Character
    this.ctx.fillStyle = fg;
    this.ctx.fillText(char, px + (ts / 2), py + (ts / 2));
  }

  /**
   * Draws a full-width status bar row (left-aligned text)
   */
  public drawStatusBar(y: number, text: string, fg: string = "#fff", bg: string = "#000") {
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
   * Clears the entire screen
   */
  public clear() {
    const { width, height, tileSize } = this.options;
    this.ctx.clearRect(0, 0, width * tileSize, height * tileSize);

    // Optional: Fill with default background color immediately
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, width * tileSize, height * tileSize);
  }


  /**
   * Draws a full string starting at grid coordinates (x, y), clearing the rest of the line.
   */
  public drawTextLine(x: number, y: number, text: string, fg: string, bg: string = "#000") {
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

  public drawString(x: number, y: number, text: string, fg: string, bg: string | null = "#000"): void {
    for (let i = 0; i < text.length; i++) {
      this.draw(x + i, y, text[i], fg, bg);
    }
  }

  public drawBox(x: number, y: number, w: number, h: number, fg: string, bg: string = "#000"): void {
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
   * Draws a smooth string (proportional spacing) with a background rectangle.
   * x, y are still grid coordinates for placement, but text renders normally.
   */
  public drawSmoothString(x: number, y: number, text: string, fg: string, bg: string | null = "#000"): void {
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
   * Draws a box using actual lines/rectangles instead of ASCII characters
   * for a smoother "window" look.
   */
  public drawSmoothBox(x: number, y: number, w: number, h: number, fg: string, bg: string = "#000"): void {
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
