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
  private subscriberHandlers = new Map<object, Array<{ type: string; handler: BaseHandler }>>();

  public register(subscriber: object): void {
    if (!subscriber || typeof subscriber !== 'object') {
      throw new Error('[EventBus] Subscriber must be a non-null object.');
    }

    if (this.subscriberHandlers.has(subscriber)) {
      this.unregister(subscriber);
    }

    const meta: SubscriptionMetadata[] = getSubscriptions(subscriber);
    const indexedSubscriber = subscriber as Record<string, unknown>;
    const registeredList: Array<{ type: string; handler: BaseHandler }> = [];

    for (const sub of meta) {
      const method = indexedSubscriber[sub.methodName];

      if (typeof method === 'function') {
        // We bind the method and cast it to our BaseHandler signature.
        // This is a single, safe cast because the method is guaranteed to
        // accept an event object (which satisfies BaseEvent).
        const handler = method.bind(subscriber) as BaseHandler;
        this.subscribe(sub.eventType, handler as unknown as Handler<string>);
        registeredList.push({ type: sub.eventType, handler });
      }
    }

    if (registeredList.length > 0) {
      this.subscriberHandlers.set(subscriber, registeredList);
    }
  }

  public unregister(subscriber: object): void {
    if (!subscriber || typeof subscriber !== 'object') {
      return;
    }

    const list = this.subscriberHandlers.get(subscriber);
    if (list) {
      for (const { type, handler } of list) {
        this.unsubscribe(type, handler as unknown as Handler<string>);
      }
      this.subscriberHandlers.delete(subscriber);
    }
  }

  public subscribe<T extends string>(type: T, handler: Handler<T>): void {
    if (typeof type !== 'string' || type.trim().length === 0) {
      throw new Error('[EventBus] Event type must be a non-empty string.');
    }
    if (typeof handler !== 'function') {
      throw new Error('[EventBus] Event handler must be a function.');
    }

    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    // We cast to BaseHandler for storage.
    // This is safe because our 'publish' method ensures that only events
    // of the correct 'type' are sent to these handlers.
    this.handlers.get(type)!.add(handler as BaseHandler);
  }

  public publish<T extends AnyEvent>(event: T): void {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string' || event.type.trim().length === 0) {
      throw new Error("[EventBus] Invalid event object. An event must be an object with a non-empty string 'type' property.");
    }

    const typeHandlers = this.handlers.get(event.type);
    if (!typeHandlers || typeHandlers.size === 0) return;

    // Snapshot handlers to prevent newly subscribed handlers from running in current dispatch
    const handlersToRun = Array.from(typeHandlers);

    for (const handler of handlersToRun) {
      if ((event as BaseEvent).cancelled) break;

      // Skip handler if it was unsubscribed during this dispatch pass or if handlers were cleared
      if (!this.handlers.get(event.type)?.has(handler)) continue;

      // Since handler expects BaseEvent and event matches BaseEvent,
      // this is now a strictly typed call.
      handler(event as BaseEvent);
    }
  }

  public unsubscribe<T extends string>(type: T, handler: Handler<T>): void {
    if (typeof type !== 'string' || typeof handler !== 'function') {
      return;
    }

    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      // Single cast to the storage signature for the Set lookup.
      typeHandlers.delete(handler as BaseHandler);
    }
  }

  public hasListeners(type: string): boolean {
    return (this.handlers.get(type)?.size ?? 0) > 0;
  }

  public listenerCount(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  public hasSubscriber(subscriber: object): boolean {
    return this.subscriberHandlers.has(subscriber);
  }

  public clear(): void {
    this.handlers.clear();
    this.subscriberHandlers.clear();
  }
}
