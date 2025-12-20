import type { GameState, UiOverlay } from "../../core/GameState";
import type { AsciiRenderer } from "../AsciiRenderer";
import { UI_COLORS } from "../../core/Colors";

export type PickListEntry<T> = {
  label: string; // "a".."z"
  text: string;  // what gets displayed in the list
  value: T;      // payload (e.g. inventory index)
};

export class PickListOverlay<T> implements UiOverlay {
  public readonly kind = "PICKLIST";

  private selected = 0;

  // Scroll state
  private scrollOffset = 0;
  private lastPageSize = 10; // updated during render (how many rows are visible)

  constructor(
    private readonly title: string,
    private readonly entries: Array<PickListEntry<T>>,
    private readonly onConfirm: (state: GameState, value: T) => void,
    private readonly onCancel: (state: GameState) => void
  ) {}

  private clampSelected(): void {
    if (this.entries.length === 0) {
      this.selected = 0;
      this.scrollOffset = 0;
      return;
    }
    this.selected = Math.max(0, Math.min(this.selected, this.entries.length - 1));
  }

  private ensureSelectedVisible(pageSize: number): void {
    const maxOffset = Math.max(0, this.entries.length - pageSize);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));

    if (this.selected < this.scrollOffset) {
      this.scrollOffset = this.selected;
    } else if (this.selected >= this.scrollOffset + pageSize) {
      this.scrollOffset = this.selected - pageSize + 1;
    }

    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
  }

  public render(state: GameState, display: AsciiRenderer): void {
    const padding = 1;
    const lines = this.entries.length;

    // Calculate width based on content, but keep it within grid units for positioning
    const contentW = Math.max(
      this.title.length,
      ...this.entries.map(e => e.text.length),
      10
    );

    const w = Math.min(state.width - 2, contentW + padding * 2 + 2);
    const desiredH = Math.min(state.mapHeight - 2, lines + 3);
    const h = Math.max(4, desiredH);

    const x0 = Math.floor((state.width - w) / 2);
    const y0 = Math.floor((state.mapHeight - h) / 2);

    // 1. Draw the smooth window frame and background
    display.drawSmoothBox(x0, y0, w, h, UI_COLORS.WINDOW_BORDER, UI_COLORS.WINDOW_BG);

    // 2. Draw the Smooth Title (centered in the top border or left-aligned)
    display.drawSmoothString(x0 + 1, y0, ` ${this.title} `, UI_COLORS.WINDOW_BORDER, UI_COLORS.WINDOW_BG);

    // 3. Scroll Logic
    const pageSize = Math.max(1, h - 2);
    this.lastPageSize = pageSize;

    this.clampSelected();
    this.ensureSelectedVisible(pageSize);

    const start = this.scrollOffset;
    const end = Math.min(this.entries.length, start + pageSize);

    // 4. Draw Entries using smooth text
    for (let row = 0; row < pageSize; row++) {
      const idx = start + row;
      const rowY = y0 + 1 + row;

      if (idx >= end) break;

      const entry = this.entries[idx];
      const isSelected = idx === this.selected;

      // Reverse video for selection
      const fg = isSelected ? UI_COLORS.SELECTION_FG : UI_COLORS.DEFAULT_TEXT;
      const bg = isSelected ? UI_COLORS.SELECTION_BG : UI_COLORS.WINDOW_BG;

      // We use a full-width background for the selection bar
      const text = entry.text.padEnd(w - 2, " ");
      display.drawSmoothString(x0 + 1, rowY, text, fg, bg);
    }

    // 5. Footer/Scroll indicator
    if (this.entries.length > pageSize) {
      const hint = `${start + 1}-${end}/${this.entries.length}`;
      display.drawSmoothString(x0 + w - 1 - (hint.length * 0.6), y0 + h - 1, hint, UI_COLORS.MUTED_TEXT, UI_COLORS.WINDOW_BG);
    }
  }

  public onKeyDown(state: GameState, event: KeyboardEvent): boolean {
    if (this.entries.length === 0) {
      this.onCancel(state);
      return true;
    }

    const key = event.key;
    const code = event.code;

    if (key === "Escape") {
      this.onCancel(state);
      return true;
    }

    // Up / Numpad 8
    if (key === "ArrowUp" || code === "Numpad8") {
      this.selected = (this.selected - 1 + this.entries.length) % this.entries.length;
      return true;
    }

    // Down / Numpad 2
    if (key === "ArrowDown" || code === "Numpad2") {
      this.selected = (this.selected + 1) % this.entries.length;
      return true;
    }

    // Home / Numpad 7
    if (key === "Home" || code === "Numpad7") {
      this.selected = 0;
      return true;
    }


    // End / Numpad 1
    if (key === "End" || code === "Numpad1") {
      this.selected = this.entries.length - 1;
      return true;
    }


    // PageUp / Numpad 9 (move by visible page size)
    if (key === "PageUp" || code === "Numpad9") {
      this.selected = Math.max(0, this.selected - Math.max(1, this.lastPageSize));
      return true;
    }

    // PageDown / Numpad 3 (move by visible page size)
    if (key === "PageDown" || code === "Numpad3") {
      this.selected = Math.min(this.entries.length - 1, this.selected + Math.max(1, this.lastPageSize));
      return true;
    }

    // Confirm: Enter or Numpad 5
    if (key === "Enter" || code === "Numpad5" || code === "NumpadEnter") {
      const chosen = this.entries[this.selected];
      this.onConfirm(state, chosen.value);
      return true;
    }

    // letter select a-z
    const lower = key.toLowerCase();
    if (lower.length === 1 && lower >= "a" && lower <= "z") {
      const idx = lower.charCodeAt(0) - "a".charCodeAt(0);
      if (idx >= 0 && idx < this.entries.length) {
        this.selected = idx;
      }
      return true;
    }

    return true; // modal: consume everything while open
  }
}
