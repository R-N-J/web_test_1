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
   */
  public draw(x: number, y: number, char: string, fg: string, bg: string = "#000") {
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

    // 2. Draw Character
    // Note: We offset by ts/2 because textAlign is "center" and baseline is "middle"
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

    // 2. Draw the text (using the standard drawChar logic, but simpler)
    this.ctx.font = `${ts}px ${this.options.font}`;
    this.ctx.textAlign = "left"; // Align log text to the left
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = fg;

    // We add a slight offset (ts / 2) to center the text vertically within the tile height
    this.ctx.fillText(text, x * ts, y * ts + (ts / 2));

    // Reset textAlign for single char drawing if needed later (usually not necessary)
    this.ctx.textAlign = "center";
  }

}
