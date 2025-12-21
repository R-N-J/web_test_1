// js/core/EventBus.ts

export type GameEvent =
  | { type: 'MESSAGE_LOGGED'; text: string; color: string; bold?: boolean; underline?: boolean; reverse?: boolean }
  | { type: 'SCREEN_SHAKE'; intensity: number };

export type Handler<T extends GameEvent['type']> = (data: Extract<GameEvent, { type: T }>) => void;

export class EventBus {
  private handlers: { [K in GameEvent['type']]?: Handler<K>[] } = {};

  /**
   * Register a callback for a specific event type.
   */
  public subscribe<T extends GameEvent['type']>(type: T, handler: Handler<T>): void {
    if (!this.handlers[type]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.handlers[type] = [] as any;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.handlers[type] as any[]).push(handler);
  }

  /**
   * Broadcast an event to all subscribers.
   */
  public publish<T extends GameEvent['type']>(event: Extract<GameEvent, { type: T }>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typeHandlers = this.handlers[event.type] as Handler<any>[] | undefined;
    if (typeHandlers) {
      // Use a copy to avoid issues if a handler unsubscribes during execution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [...typeHandlers].forEach(handler => handler(event as any));
    }
  }

  /**
   * Remove a specific handler for an event type.
   */
  public unsubscribe<T extends GameEvent['type']>(type: T, handler: Handler<T>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typeHandlers = this.handlers[type] as Handler<any>[] | undefined;
    if (typeHandlers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.handlers[type] = typeHandlers.filter(h => h !== handler) as any;
    }
  }
}
