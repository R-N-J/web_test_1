import { Aspect } from "./Aspect";
import { MAX_COMPONENT_ID, isValidComponentId } from "./Archetype";

/**
 * Polyfill for Symbol.metadata if it's missing (needed for Stage 3 decorators and hybrid support).
 */
if (typeof Symbol !== "undefined" && !(Symbol as unknown as { metadata: symbol }).metadata) {
  (Symbol as unknown as { metadata: symbol }).metadata = Symbol("Symbol.metadata");
}

/**
 * Internal helper to retrieve the metadata object in a way that supports both
 * modern Stage 3 decorators and legacy Stage 2 decorators (used by toolchains like jiti/sucrase).
 */
function getMetadata(value: unknown, context: unknown): Record<string, unknown> {
  // Stage 3
  if (typeof context === "object" && context !== null && "metadata" in context) {
    return (((context as { metadata?: Record<string, unknown> }).metadata) || {}) as Record<string, unknown>;
  }
  // Stage 2
  const constructor = (typeof value === "function" ? value : (value as { constructor?: unknown })?.constructor) as { [key: symbol]: Record<string, unknown> | undefined } | undefined;
  if (!constructor) {
    return {};
  }
  const metaKey = Symbol.metadata;
  if (!Object.prototype.hasOwnProperty.call(constructor, metaKey)) {
    const parentMeta = constructor[metaKey];
    constructor[metaKey] = parentMeta ? Object.create(parentMeta) : {};
  }
  return constructor[metaKey] as Record<string, unknown>;
}

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
const INJECT_METADATA_KEY = "__ecs_inject__";
const SINGLETON_METADATA_KEY = "__ecs_singleton__";
const SINGLETON_CLASS_METADATA_KEY = "__ecs_singleton_class__";




export interface OrderMetadata {
  after: string[]; // Names of systems to run after
  before: string[]; // Names of systems to run before
}
export interface InjectMetadata { // Renamed from WireMetadata
  propertyKey: string;
  type: 'MAPPER' | 'MANAGER' | 'EVENT_BUS' | 'SINGLETON';
  id?: number; // ComponentId for Mappers or Singletons
}
/**
 * Automatically injects a dependency into this property.
 * @param id Optional ComponentId if injecting a Mapper.
 */
export function Inject(id?: number) { // Renamed from Wire
  if (id !== undefined && !isValidComponentId(id)) {
    throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
  }
  return function(_value: unknown, context: unknown): void {
    const metadata = getMetadata(_value, context);

    if (!Object.prototype.hasOwnProperty.call(metadata, INJECT_METADATA_KEY)) {
      const parentMeta = metadata[INJECT_METADATA_KEY] as InjectMetadata[] | undefined;
      metadata[INJECT_METADATA_KEY] = parentMeta ? [...parentMeta] : [];
    }

    // Determine what we are injecting based on the property name or ID presence
    const propertyKey = typeof context === "object" && context !== null && "name" in context
      ? String((context as { name: string | symbol }).name)
      : String(context);
    let type: InjectMetadata['type'] = 'MANAGER';
    if (id !== undefined) type = 'MAPPER';
    if (propertyKey === 'events') type = 'EVENT_BUS';

    (metadata[INJECT_METADATA_KEY] as InjectMetadata[]).push({ propertyKey, type, id });
  };
}

export function getInjectMetadata(instance: object): InjectMetadata[] { // Renamed from getWireMetadata
  const constructor = instance.constructor as { [Symbol.metadata]?: Record<string, InjectMetadata[]> | null };
  const metadata = constructor[Symbol.metadata];
  return metadata?.[INJECT_METADATA_KEY] || [];
}


/**
 * Ensures this system runs AFTER the specified system names.
 * Replaced 'any' with 'unknown' and a specific object return type.
 */
export function After(...systemNames: string[]) {
  return function(_value: unknown, context: unknown): void {
    const meta = getOrderMetadata(getMetadata(_value, context));
    meta.after.push(...systemNames);
  };
}

/**
 * Ensures this system runs BEFORE the specified system names.
 */
export function Before(...systemNames: string[]) {
  return function(_value: unknown, context: unknown): void {
    const meta = getOrderMetadata(getMetadata(_value, context));
    meta.before.push(...systemNames);
  };
}

/**
 * Internal: Retrieves or creates the order metadata.
 */
function getOrderMetadata(metadata: Record<string, unknown>): OrderMetadata {
  const m = metadata as Record<string, OrderMetadata>;
  if (!Object.prototype.hasOwnProperty.call(m, ORDER_METADATA_KEY)) {
    const parentMeta = m[ORDER_METADATA_KEY];
    m[ORDER_METADATA_KEY] = parentMeta
      ? { after: [...parentMeta.after], before: [...parentMeta.before] }
      : { after: [], before: [] };
  }
  return m[ORDER_METADATA_KEY];
}

/**
 * Retrieves the defined order for a system instance.
 */
export function getSystemOrder(instance: object): OrderMetadata {
  const constructor = instance.constructor as { [Symbol.metadata]?: Record<string, OrderMetadata> | null };
  const metadata = constructor[Symbol.metadata];
  return metadata?.[ORDER_METADATA_KEY] || { after: [], before: [] };
}


/**
 * Sets a numerical priority. Lower numbers run earlier.
 * Default is 1000.
 */
export function Priority(value: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[ECS] Invalid Priority: ${value}. Priority must be a finite number.`);
  }
  return function(_value: unknown, context: unknown): void {
    const metadata = getMetadata(_value, context);
    metadata[PRIORITY_METADATA_KEY] = value;
  };
}

export function getSystemPriority(instance: object): number {
  const constructor = instance.constructor as { [Symbol.metadata]?: Record<string, number> | null };
  const metadata = constructor[Symbol.metadata];
  return metadata?.[PRIORITY_METADATA_KEY] ?? 1000;
}




export interface SubscriptionMetadata {
  eventType: string;
  methodName: string;
}

/**
 * Interface for a constructor that has been decorated with @Subscribe.
 */
// Removed unused DecoratedConstructor interface

/**
 * Marks a method as an event listener.
 * Uses 'object' and index signatures to avoid 'any'.
 */
export function Subscribe(eventType: string) {
  if (typeof eventType !== "string" || eventType.trim().length === 0) {
    throw new Error(`[ECS] @Subscribe requires a non-empty string event type.`);
  }

  return function(_value: unknown, context: unknown): void {
    const metadata = getMetadata(_value, context);

    if (!Object.prototype.hasOwnProperty.call(metadata, SUBSCRIBE_METADATA_KEY)) {
      const parentMeta = metadata[SUBSCRIBE_METADATA_KEY] as SubscriptionMetadata[] | undefined;
      metadata[SUBSCRIBE_METADATA_KEY] = parentMeta ? [...parentMeta] : [];
    }

    const methodName = typeof context === "object" && context !== null && "name" in context
      ? String((context as { name: string | symbol }).name)
      : String(context);
    (metadata[SUBSCRIBE_METADATA_KEY] as SubscriptionMetadata[]).push({ eventType, methodName });
  };
}

/**
 * Internal: Retrieves all @Subscribe metadata for an instance.
 */
export function getSubscriptions(instance: object): SubscriptionMetadata[] {
  const constructor = instance.constructor as { [Symbol.metadata]?: Record<string, SubscriptionMetadata[]> | null };
  const metadata = constructor[Symbol.metadata];
  return metadata?.[SUBSCRIBE_METADATA_KEY] || [];
}

/**
 * Internal interface to satisfy the compiler while building the bitmasks
 */
interface AspectData {
  allMask: bigint;
  oneMasks: bigint[];
  excludeMask: bigint;
}

function getOrCreateAspectData(metadata: Record<string, unknown>): AspectData {
  const m = metadata;
  if (!Object.prototype.hasOwnProperty.call(m, ASPECT_METADATA_KEY)) {
    const parentData = m[ASPECT_METADATA_KEY] as AspectData | undefined;
    m[ASPECT_METADATA_KEY] = parentData
      ? { allMask: parentData.allMask, oneMasks: [...parentData.oneMasks], excludeMask: parentData.excludeMask }
      : { allMask: 0n, oneMasks: [], excludeMask: 0n };
  }
  return m[ASPECT_METADATA_KEY] as AspectData;
}
/**
 * Builds a bitmask from an array of component IDs.
 * Validates that IDs are non-negative safe integers <= MAX_COMPONENT_ID.
 */
function buildMask(ids: (number | bigint)[]): bigint {
  let mask = 0n;
  for (const id of ids) {
    const numId = typeof id === "bigint" ? Number(id) : id;
    if (!isValidComponentId(numId)) {
      throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
    }
    mask |= (1n << BigInt(id));
  }
  return mask;
}

/**
 * The entity must possess ALL of these components.
 */
export function All(...componentIds: number[]) {
  const mask = buildMask(componentIds);
  return function(_value: unknown, context: unknown): void {
    const data = getOrCreateAspectData(getMetadata(_value, context));
    data.allMask |= mask;
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
  const mask = buildMask(componentIds);
  return function(_value: unknown, context: unknown): void {
    const data = getOrCreateAspectData(getMetadata(_value, context));
    data.oneMasks.push(mask);
  };
}

/**
 * The entity may NOT possess any of these components.
 */
export function Exclude(...componentIds: number[]) {
  const mask = buildMask(componentIds);
  return function(_value: unknown, context: unknown): void {
    const data = getOrCreateAspectData(getMetadata(_value, context));
    data.excludeMask |= mask;
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
  return function(_value: unknown, context: unknown): void {
    const data = getOrCreateAspectData(getMetadata(_value, context));
    data.allMask |= aspect.allMask;
    data.oneMasks.push(...aspect.oneMasks);
    data.excludeMask |= aspect.excludeMask;
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
  return function(_value: unknown, context: unknown): void {
    getMetadata(_value, context)[GROUP_METADATA_KEY] = name;
  };
}

/**
 * Associates the system with a specific entity tag.
 * Use this if a system should only ever process one specific entity.
 */
export function Tag(name: string) {
  return function(_value: unknown, context: unknown): void {
    getMetadata(_value, context)[TAG_METADATA_KEY] = name;
  };
}

/**
 * Defines the period (how often) an IntervalSystem runs.
 * In your game, this represents the number of turns or time units.
 */
export function Interval(period: number) {
  if (typeof period !== "number" || !Number.isFinite(period) || period <= 0) {
    throw new Error(`[ECS] Invalid Interval: ${period}. Interval must be a positive finite number (> 0).`);
  }
  return function(_value: unknown, context: unknown): void {
    getMetadata(_value, context)[INTERVAL_METADATA_KEY] = period;
  };
}



/**
 * Retrieves the Aspect defined by decorators for a given class.
 */
export function getSystemAspect(constructor: unknown): Aspect {
  const metadata = (constructor as { [Symbol.metadata]?: Record<string, AspectData> | null })[Symbol.metadata];
  const meta = metadata?.[ASPECT_METADATA_KEY];
  return meta ? new Aspect(meta.allMask, meta.oneMasks, meta.excludeMask) : new Aspect();
}

/**
 * Retrieves the Group name defined by decorators for a given class.
 */
export function getSystemGroup(constructor: unknown): string | undefined {
  const metadata = (constructor as { [Symbol.metadata]?: Record<string, unknown> | null })[Symbol.metadata];
  return metadata?.[GROUP_METADATA_KEY] as string | undefined;
}

/**
 * Retrieves the Tag name defined by decorators for a given class.
 */
export function getSystemTag(constructor: unknown): string | undefined {
  const metadata = (constructor as { [Symbol.metadata]?: Record<string, unknown> | null })[Symbol.metadata];
  return metadata?.[TAG_METADATA_KEY] as string | undefined;
}

/**
 * Retrieves the update interval defined by decorators for a given class.
 */
export function getSystemInterval(constructor: unknown): number | undefined {
  const metadata = (constructor as { [Symbol.metadata]?: Record<string, unknown> | null })[Symbol.metadata];
  return metadata?.[INTERVAL_METADATA_KEY] as number | undefined;
}

/**
 * Retrieves all singleton components requested by a system.
 */
export function getSystemSingletons(constructor: unknown): Record<string, number> {
  const metadata = (constructor as { [Symbol.metadata]?: Record<string, Record<string, number>> | null })[Symbol.metadata];
  return metadata?.[SINGLETON_METADATA_KEY] || {};
}

/**
 * Checks if a class is marked as a Singleton Component and returns its ID.
 */
export function getSingletonComponentId(constructor: unknown): number | undefined {
  const metadata = (constructor as { [Symbol.metadata]?: Record<string, number> | null })[Symbol.metadata];
  return metadata?.[SINGLETON_CLASS_METADATA_KEY];
}

/**
 * Marks a class as a Singleton Component.
 * This can be used for automated registration or documentation.
 */
export function SingletonComponent(id: number) {
  if (!isValidComponentId(id)) {
    throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
  }
  return function(_value: unknown, context: unknown): void {
    const metadata = getMetadata(_value, context) as Record<string, number>;
    metadata[SINGLETON_CLASS_METADATA_KEY] = id;
  };
}

/**
 * Marks a Component ID as a singleton field in a System.
 * Framework will automatically look for this ID on the World's singleton entity.
 */
export function Singleton(id: number) {
  if (!isValidComponentId(id)) {
    throw new Error(`[ECS] Invalid Component ID: ${id}. Component IDs must be non-negative integers <= ${MAX_COMPONENT_ID}.`);
  }
  return function(_value: unknown, context: unknown): void {
    const metadata = getMetadata(_value, context);

    if (!Object.prototype.hasOwnProperty.call(metadata, INJECT_METADATA_KEY)) {
      const parentMeta = metadata[INJECT_METADATA_KEY] as InjectMetadata[] | undefined;
      metadata[INJECT_METADATA_KEY] = parentMeta ? [...parentMeta] : [];
    }

    const propertyKey = typeof context === "object" && context !== null && "name" in context
      ? String((context as { name: string | symbol }).name)
      : String(context);
    (metadata[INJECT_METADATA_KEY] as InjectMetadata[]).push({
      propertyKey,
      type: 'SINGLETON',
      id
    });

    // Also store in the specific singleton metadata for easier querying if needed
    if (!Object.prototype.hasOwnProperty.call(metadata, SINGLETON_METADATA_KEY)) {
      const parentSingletonMeta = metadata[SINGLETON_METADATA_KEY] as Record<string, number> | undefined;
      metadata[SINGLETON_METADATA_KEY] = parentSingletonMeta ? { ...parentSingletonMeta } : {};
    }
    (metadata[SINGLETON_METADATA_KEY] as Record<string, number>)[propertyKey] = id;
  };
}
