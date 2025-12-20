import { COLOR } from "../../core/Colors";
import type { UiOverlay, GameState } from "../../core/GameState";
import type { AsciiRenderer } from "../AsciiRenderer";

type RenderLine = { text: string; color: string };

export class MessageLogOverlay implements UiOverlay {
  public readonly kind = "MESSAGE_LOG";

  // index of the first visible line in history (0 = oldest)
  private top = 0;

  // updated during render; used for PageUp/PageDown
  private lastPageSize = 10;

  private searchQuery = "";
  private isSearching = false;

  constructor(private readonly title: string = "Message Log") {}

  public render(state: GameState, display: AsciiRenderer): void {
    // 1. Calculate window dimensions (using grid units for consistent layout)
    const w = Math.min(state.width - 4, Math.max(30, state.width - 10));
    const h = Math.min(state.mapHeight - 2, Math.max(8, state.mapHeight - 4));

    const x0 = Math.floor((state.width - w) / 2);
    const y0 = Math.floor((state.mapHeight - h) / 2);

    // 2. Draw the smooth vector frame and background
    display.drawSmoothBox(x0, y0, w, h, COLOR.LIGHT_GRAY, COLOR.BLACK);

    // 3. Draw the smooth Title
    display.drawSmoothString(x0 + 1, y0, ` ${this.title} `, COLOR.LIGHT_GRAY, COLOR.BLACK);

    if (this.isSearching) {
      const searchLabel = ` Search: ${this.searchQuery}_ `;
      display.drawSmoothString(x0 + 1, y0 + 1, searchLabel, COLOR.YELLOW, COLOR.DARK_GRAY);
    }


    // 4. Wrapping and Scroll Logic
    const contentWidth = w - 2;
    const pageSize = this.isSearching ? Math.max(1, h - 3) : Math.max(1, h - 2);
    this.lastPageSize = pageSize;

    const lines = this.buildWrappedLines(state, contentWidth);

    const maxTop = Math.max(0, lines.length - pageSize);
    this.top = Math.max(0, Math.min(this.top, maxTop));

    const start = this.top;
    const end = Math.min(lines.length, start + pageSize);

    // 5. Draw the wrapped rendered lines using smooth text
    const contentOffsetY = this.isSearching ? 2 : 1;
    for (let row = 0; row < pageSize; row++) {
      const idx = start + row;
      const rowY = y0 + contentOffsetY + row;

      if (idx >= lines.length) break;

      const line = lines[idx];
      // Draw the string normally (browser handles kerning/spacing)
      display.drawSmoothString(x0 + 1, rowY, line.text, line.color ?? COLOR.WHITE, COLOR.BLACK);
    }

    // 6. Footer hint and position indicator
    const hint = this.isSearching
      ? " Esc=Exit Search  Backspace=Delete "
      : " Esc=Close  /=Search  ↑↓=Scroll ";
    display.drawSmoothString(x0 + 1, y0 + h - 1, hint, COLOR.GRAY, COLOR.BLACK);

    if (lines.length > pageSize) {
      const pos = `${start + 1}-${end}/${lines.length}`;
      // Right-aligned position indicator
      display.drawSmoothString(x0 + w - 1 - (pos.length * 0.6), y0 + h - 1, pos, COLOR.GRAY, COLOR.BLACK);
    }
  }

  public onKeyDown(state: GameState, event: KeyboardEvent): boolean {
    const linesCount = this.buildWrappedLines(state, 10).length; // Rough estimate for paging

    // Compute “page size” similarly to render (best-effort; render will clamp precisely)
    const approxH = Math.min(state.mapHeight - 2, Math.max(6, state.mapHeight - 4));
    const pageSize = this.isSearching ? Math.max(1, approxH - 3) : Math.max(1, approxH - 2);

    const maxTop = Math.max(0, linesCount - pageSize);

    if (this.isSearching) {
      if (event.key === "Escape") {
        this.isSearching = false;
        this.searchQuery = "";
        this.top = 0;
        return true;
      }
      if (event.key === "Backspace") {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.top = 0;
        return true;
      }
      if (event.key === "Enter") {
        this.isSearching = false;
        return true;
      }
      if (event.key.length === 1) {
        this.searchQuery += event.key;
        this.top = 0;
        return true;
      }
      return true; // Consume other keys in search mode
    }

    switch (event.key) {
      case "/":
        this.isSearching = true;
        this.searchQuery = "";
        this.top = 0;
        return true;

      case "Escape":
        state.uiStack.pop();
        return true;

      case "ArrowUp":
        this.top = Math.max(0, this.top - 1);
        return true;

      case "ArrowDown":
        this.top = Math.min(maxTop, this.top + 1);
        return true;

      case "PageUp":
        this.top = Math.max(0, this.top - pageSize);
        return true;

      case "PageDown":
        this.top = Math.min(maxTop, this.top + pageSize);
        return true;

      case "Home":
        this.top = 0;
        return true;

      case "End":
        this.top = maxTop;
        return true;

      default:
        return true; // modal: consume keys while open
    }
  }

  private wrapTextPreserveNewlines(text: string, width: number): string[] {
    if (width <= 0) return [""];

    // Split on intentional line breaks, preserving empty lines.
    const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
    const lines: string[] = [];

    for (const rawPara of paragraphs) {
      // Preserve an intentionally blank line
      if (rawPara.trim().length === 0) {
        lines.push("");
        continue;
      }

      // Collapse runs of spaces/tabs inside a paragraph, but keep the paragraph boundary.
      let remaining = rawPara.replace(/[ \t]+/g, " ").trim();

      while (remaining.length > width) {
        const slice = remaining.slice(0, width + 1);
        const breakAt = slice.lastIndexOf(" ");

        if (breakAt <= 0) {
          // hard-break a long word
          lines.push(remaining.slice(0, width));
          remaining = remaining.slice(width).trimStart();
        } else {
          lines.push(remaining.slice(0, breakAt));
          remaining = remaining.slice(breakAt + 1);
        }
      }

      if (remaining.length > 0) lines.push(remaining);
    }

    return lines;
  }

  private buildWrappedLines(state: GameState, contentWidth: number): RenderLine[] {
    const history = state.log.getFilteredHistory(this.searchQuery); // oldest -> newest
    const out: RenderLine[] = [];

    for (const msg of history) {
      const color = msg.color ?? COLOR.WHITE;
      const wrapped = this.wrapTextPreserveNewlines(msg.text, contentWidth);
      for (const line of wrapped) out.push({ text: line, color });
    }

    return out;
  }
}
