import { Aspect } from "./Aspect";

/**
 * Metadata keys to store data on the class constructor.
 */
const ASPECT_METADATA_KEY = "__ecs_aspect__";
const GROUP_METADATA_KEY = "__ecs_group__";
const TAG_METADATA_KEY = "__ecs_tag__";
const INTERVAL_METADATA_KEY = "__ecs_interval__";
const SUBSCRIBE_METADATA_KEY = "__ecs_subscriptions__";
const ORDER_METADATA_KEY = "__ecs_order__";
const PRIORITY_METADATA_KEY = "__ecs_priority__";


export interface OrderMetadata {
  after: string[]; // Names of systems to run after
  before: string[]; // Names of systems to run before
}


/**
 * Ensures this system runs AFTER the specified system names.
 * Replaced 'any' with 'unknown' and a specific object return type.
 */
export function After(...systemNames: string[]) {
  return function(constructor: { new (...args: unknown[]): object }): void {
    const meta = getOrderMetadata(constructor);
    meta.after.push(...systemNames);
  };
}

/**
 * Ensures this system runs BEFORE the specified system names.
 */
export function Before(...systemNames: string[]) {
  return function(constructor: { new (...args: unknown[]): object }): void {
    const meta = getOrderMetadata(constructor);
    meta.before.push(...systemNames);
  };
}

/**
 * Internal: Retrieves or creates the order metadata on a constructor.
 // ... existing code ...

/**
 * Internal: Retrieves or creates the order metadata on a constructor.
 */
function getOrderMetadata(constructor: object): OrderMetadata {
  const c = constructor as unknown as Record<string, OrderMetadata>;
  if (!c[ORDER_METADATA_KEY]) {
    c[ORDER_METADATA_KEY] = { after: [], before: [] };
  }
  return c[ORDER_METADATA_KEY];
}

/**
 * Retrieves the defined order for a system instance.
 */
export function getSystemOrder(instance: object): OrderMetadata {
  const constructor = instance.constructor as unknown as Record<string, OrderMetadata>;
  return constructor[ORDER_METADATA_KEY] || { after: [], before: [] };
}


/**
 * Sets a numerical priority. Lower numbers run earlier.
 * Default is 1000.
 */
export function Priority(value: number) {
  return function(constructor: { new (...args: unknown[]): object }): void {
    const c = constructor as unknown as Record<string, number>;
    c[PRIORITY_METADATA_KEY] = value;
  };
}

export function getSystemPriority(instance: object): number {
  const constructor = instance.constructor as unknown as Record<string, number>;
  return constructor[PRIORITY_METADATA_KEY] ?? 1000;
}




export interface SubscriptionMetadata {
  eventType: string;
  methodName: string;
}

/**
 * Interface for a constructor that has been decorated with @Subscribe.
 */
interface DecoratedConstructor {
  [SUBSCRIBE_METADATA_KEY]?: SubscriptionMetadata[];
}

/**
 * Marks a method as an event listener.
 * Uses 'object' and index signatures to avoid 'any'.
 */
export function Subscribe(eventType: string) {
  return function(target: object, propertyKey: string): void {
    const constructor = target.constructor as unknown as DecoratedConstructor;

    if (!constructor[SUBSCRIBE_METADATA_KEY]) {
      constructor[SUBSCRIBE_METADATA_KEY] = [];
    }

    constructor[SUBSCRIBE_METADATA_KEY].push({ eventType, methodName: propertyKey });
  };
}

/**
 * Internal: Retrieves all @Subscribe metadata for an instance.
 */
export function getSubscriptions(instance: object): SubscriptionMetadata[] {
  const constructor = instance.constructor as unknown as DecoratedConstructor;
  return constructor[SUBSCRIBE_METADATA_KEY] || [];
}

/**
 * Internal interface to satisfy the compiler while building the bitmasks
 */
interface AspectData {
  all: bigint;
  one: bigint;
  exclude: bigint;
}

export type Constructor = { new (...args: unknown[]): unknown };

function getOrCreateAspectData(target: Constructor | Record<string, unknown>): AspectData {
  const t = target as unknown as Record<string, unknown>;
  if (!t[ASPECT_METADATA_KEY]) {
    t[ASPECT_METADATA_KEY] = { all: 0n, one: 0n, exclude: 0n };
  }
  return t[ASPECT_METADATA_KEY] as AspectData;
}

/**
 * Builds a mask from an array of IDs.
 */
function buildMask(ids: number[]): bigint {
  let mask = 0n;
  for (const id of ids) mask |= (1n << BigInt(id));
  return mask;
}

/**
 * The entity must possess ALL of these components.
 */
export function All(...componentIds: number[]) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    data.all |= buildMask(componentIds);
  };
}

/**
 * Alias for All. The entity must possess these components.
 */
export function And(...componentIds: number[]) {
  return All(...componentIds);
}




/**
 * The entity must possess AT LEAST ONE of these components.
 */
export function One(...componentIds: number[]) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    data.one |= buildMask(componentIds);
  };
}

/**
 * The entity must possess AT LEAST ONE of these components.
 // ... existing code ...
 /**
 * The entity may NOT possess any of these components.
 */
export function Exclude(...componentIds: number[]) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    data.exclude |= buildMask(componentIds);
  };
}

/**
 * The entity must NOT possess ANY of these components. (Semantic alias for Exclude)
 */
export function NoneOf(...componentIds: number[]) {
  return Exclude(...componentIds);
}

/**
 * The entity must possess AT LEAST ONE of these components. (Semantic alias for One)
 */
export function AnyOf(...componentIds: number[]) {
  return One(...componentIds);
}

/**
 * Merges an existing Aspect object into the system's requirements.
 * Useful for reusing shared queries across multiple systems.
 */
export function Match(aspect: Aspect) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    data.all |= aspect.all;
    data.one |= aspect.one;
    data.exclude |= aspect.exclude;
  };
}


/**
 * Alias for Exclude. The entity may NOT possess these components.
 */
export function ButNot(...componentIds: number[]) {
  return Exclude(...componentIds);
}


/**
 * Associates the system with a specific entity group.
 */
export function Group(name: string) {
  return function(constructor: Constructor): void {
    (constructor as unknown as Record<string, unknown>)[GROUP_METADATA_KEY] = name;
  };
}

/**
 * Associates the system with a specific entity tag.
 * Use this if a system should only ever process one specific entity.
 */
export function Tag(name: string) {
  return function(constructor: Constructor): void {
    (constructor as unknown as Record<string, unknown>)[TAG_METADATA_KEY] = name;
  };
}

/**
 * Defines the period (how often) an IntervalSystem runs.
 * In your game, this represents the number of turns.
 */
export function Interval(period: number) {
  return function(constructor: Constructor): void {
    (constructor as unknown as Record<string, unknown>)[INTERVAL_METADATA_KEY] = period;
  };
}



/**
 * Retrieves the Aspect defined by decorators for a given class.
 */
export function getSystemAspect(constructor: object): Aspect {
  const meta = (constructor as Record<string, unknown>)[ASPECT_METADATA_KEY] as AspectData | undefined;
  return meta ? new Aspect(meta.all, meta.one, meta.exclude) : new Aspect();
}

/**
 * Retrieves the Group name defined by decorators for a given class.
 */
export function getSystemGroup(constructor: object): string | undefined {
  return (constructor as unknown as Record<string, unknown>)[GROUP_METADATA_KEY] as string | undefined;
}

/**
 * Retrieves the Tag name defined by decorators for a given class.
 */
export function getSystemTag(constructor: object): string | undefined {
  return (constructor as unknown as Record<string, unknown>)[TAG_METADATA_KEY] as string | undefined;
}

/**
 * Retrieves the update interval defined by decorators for a given class.
 */
export function getSystemInterval(constructor: object): number | undefined {
  return (constructor as unknown as Record<string, unknown>)[INTERVAL_METADATA_KEY] as number | undefined;
}

