// MessageLog.ts

export interface Message {
  text: string;
  color: string;
}

export class MessageLog {
  private history: Message[] = [];
  private readonly MAX_HISTORY = 100; // Total messages kept in memory
  public static readonly DISPLAY_LINES = 3;  // How many messages to show on screen
  public readonly DISPLAY_LINES = MessageLog.DISPLAY_LINES;/**
   /*
   * Adds a new message to the log history.
   */
  addMessage(text: string, color: string = 'white'): void {
    const message: Message = { text, color };
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
}
