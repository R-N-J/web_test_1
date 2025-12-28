import { getSubscriptions, SubscriptionMetadata } from "../ECS/Decorators";

export interface BaseEvent {
  type: string;
  cancelled?: boolean;
}

export type GameEvent =
  | { type: 'MESSAGE_LOGGED'; text: string; color: string; bold?: boolean; underline?: boolean; reverse?: boolean }
  | { type: 'SCREEN_SHAKE'; intensity: number };

type AnyEvent = GameEvent | BaseEvent;

export type Handler<T extends string> = (event: Extract<AnyEvent, { type: T }>) => void;

/**
 * We define a base signature that is compatible with all event handlers.
 * By using 'BaseEvent' here, we ensure that every handler in our system
 * is logically capable of being stored in the Map.
 */
type BaseHandler = (event: BaseEvent) => void;

export class EventBus {
  /**
   * Internal storage uses the base signature.
   */
  private handlers = new Map<string, Set<BaseHandler>>();

  public register(subscriber: object): void {
    const meta: SubscriptionMetadata[] = getSubscriptions(subscriber);
    const indexedSubscriber = subscriber as Record<string, unknown>;

    for (const sub of meta) {
      const method = indexedSubscriber[sub.methodName];

      if (typeof method === 'function') {
        // We bind the method and cast it to our BaseHandler signature.
        // This is a single, safe cast because the method is guaranteed to
        // accept an event object (which satisfies BaseEvent).
        const handler = method.bind(subscriber) as BaseHandler;
        this.subscribe(sub.eventType, handler as unknown as Handler<string>);
      }
    }
  }

  public subscribe<T extends string>(type: T, handler: Handler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    // We cast to BaseHandler for storage.
    // This is safe because our 'publish' method ensures that only events
    // of the correct 'type' are sent to these handlers.
    this.handlers.get(type)!.add(handler as BaseHandler);
  }

  public publish<T extends AnyEvent>(event: T): void {
    const typeHandlers = this.handlers.get(event.type);
    if (!typeHandlers) return;

    for (const handler of typeHandlers) {
      if ((event as BaseEvent).cancelled) break;

      // Since handler expects BaseEvent and event matches BaseEvent,
      // this is now a strictly typed call.
      handler(event as BaseEvent);
    }
  }

  public unsubscribe<T extends string>(type: T, handler: Handler<T>): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      // Single cast to the storage signature for the Set lookup.
      typeHandlers.delete(handler as BaseHandler);
    }
  }

  public clear(): void {
    this.handlers.clear();
  }
}
