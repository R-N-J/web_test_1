// MessageLog.ts

import { UI_COLORS } from "./Colors";

export interface Message {
  text: string;
  color: string;
  bold?: boolean;
  underline?: boolean;
  reverse?: boolean;
}

export interface MessageLoggedEvent {
  type: 'MESSAGE_LOGGED';
  text: string;
  color?: string;
  bold?: boolean;
  underline?: boolean;
  reverse?: boolean;
}


export class MessageLog {
  private history: Message[] = [];
  private readonly MAX_HISTORY = 100; // Total messages kept in memory
  public static readonly DISPLAY_LINES = 3;  // How many messages to show on screen
  public readonly DISPLAY_LINES = MessageLog.DISPLAY_LINES;

   /**
   * Adds a new message to the log history with optional styling.
   */
  addMessage(text: string, color: string = UI_COLORS.DEFAULT_TEXT, options?: { bold?: boolean, underline?: boolean, reverse?: boolean }): void {
    const message: Message = {
      text,
      color,
      ...options
    };
    this.history.push(message);

    // Keep history from growing too large
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift(); // Remove the oldest message
    }
  }

  /**
   * Gets the messages to display on the screen (the most recent ones).
   * Returns them in order from oldest to newest displayed.
   */
  getDisplayMessages(): Message[] {
    const start = Math.max(0, this.history.length - this.DISPLAY_LINES);
    return this.history.slice(start);
  }

  /**
   * Full log history (oldest -> newest). Returns a copy to keep encapsulation.
   */
  getHistory(): Message[] {
    return this.history.slice();
  }

  /**
   * Restores history from a saved state.
   */
  setHistory(history: Message[]): void {
    this.history = history.slice(-this.MAX_HISTORY);
  }

  /**
   * Returns history filtered by search text (case-insensitive).
   */
  getFilteredHistory(query: string): Message[] {
    if (!query) return this.getHistory();
    const lower = query.toLowerCase();
    return this.history.filter(m => m.text.toLowerCase().includes(lower));
  }
}
