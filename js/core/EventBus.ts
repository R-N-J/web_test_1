// js/core/EventBus.ts
import { getSubscriptions, SubscriptionMetadata } from "../ECS/Decorators";


/**
 * The core interface for all events in the system.
 */
export interface BaseEvent {
  type: string;
  cancelled?: boolean;
}


/**
 * strictly typed events.
 */
export type GameEvent =
  | { type: 'MESSAGE_LOGGED'; text: string; color: string; bold?: boolean; underline?: boolean; reverse?: boolean }
  | { type: 'SCREEN_SHAKE'; intensity: number };


// Helper to make the EventBus work with BOTH the union and new custom events
type AnyEvent = GameEvent | BaseEvent;

export type Handler<T extends string> = (event: Extract<AnyEvent, { type: T }>) => void;

/**
 * Internal signature for storage.
 * We use 'any' here specifically to allow the Map to hold handlers for different event shapes.
 */
type InternalHandler<T extends BaseEvent = BaseEvent> = (event: T) => void;

export class EventBus {
  /**
   * We use InternalHandler<BaseEvent> here. This tells ESLint:
   * "I know these functions take at least a BaseEvent."
   */
  private handlers = new Map<string, Set<InternalHandler<BaseEvent>>>();

  public register(subscriber: object): void {
    const meta: SubscriptionMetadata[] = getSubscriptions(subscriber);
    const indexedSubscriber = subscriber as Record<string, unknown>;

    for (const sub of meta) {
      const method = indexedSubscriber[sub.methodName];

      if (typeof method === 'function') {
        // We cast the bound method to InternalHandler<BaseEvent>.
        // This is safe because our event bus logic ensures only
        // objects matching BaseEvent are ever passed in.
        const boundHandler = method.bind(subscriber) as InternalHandler<BaseEvent>;
        this.subscribe(sub.eventType, boundHandler as unknown as Handler<string>);
      }
    }
  }

  public subscribe<T extends string>(type: T, handler: Handler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    // Cast the specific handler to the base handler for storage.
    this.handlers.get(type)!.add(handler as unknown as InternalHandler<BaseEvent>);
  }

  public publish<T extends AnyEvent>(event: T): void {
    const typeHandlers = this.handlers.get(event.type);
    if (!typeHandlers) return;

    for (const handler of typeHandlers) {
      if ((event as BaseEvent).cancelled) break;

      // Since handler is typed as InternalHandler<BaseEvent>,
      // and event matches BaseEvent, this call is now strictly typed and valid.
      handler(event as BaseEvent);
    }
  }

  public unsubscribe<T extends string>(type: T, handler: Handler<T>): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler as unknown as InternalHandler<BaseEvent>);
    }
  }
}
