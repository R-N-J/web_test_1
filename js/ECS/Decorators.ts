import { Aspect } from "./Aspect";

/**
 * Metadata keys to store data on the class constructor.
 */
const ASPECT_METADATA_KEY = "__ecs_aspect__";
const GROUP_METADATA_KEY = "__ecs_group__";
const TAG_METADATA_KEY = "__ecs_tag__";

/**
 * Internal interface to satisfy the compiler while building the bitmasks
 */
interface AspectData {
  all: bigint;
  one: bigint;
  exclude: bigint;
}

type Constructor = { new (...args: unknown[]): unknown };

function getOrCreateAspectData(target: Constructor | Record<string, unknown>): AspectData {
  const t = target as unknown as Record<string, unknown>;
  if (!t[ASPECT_METADATA_KEY]) {
    t[ASPECT_METADATA_KEY] = { all: 0n, one: 0n, exclude: 0n };
  }
  return t[ASPECT_METADATA_KEY] as AspectData;
}

/**
 * The entity must possess ALL of these components.
 */
export function All(...componentIds: number[]) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    for (const id of componentIds) data.all |= (1n << BigInt(id));
  };
}

/**
 * The entity must possess AT LEAST ONE of these components.
 */
export function One(...componentIds: number[]) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    for (const id of componentIds) data.one |= (1n << BigInt(id));
  };
}

/**
 * The entity may NOT possess any of these components.
 */
export function Exclude(...componentIds: number[]) {
  return function(constructor: Constructor): void {
    const data = getOrCreateAspectData(constructor);
    for (const id of componentIds) data.exclude |= (1n << BigInt(id));
  };
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
 */
export function Tag(name: string) {
  return function(constructor: Constructor): void {
    (constructor as unknown as Record<string, unknown>)[TAG_METADATA_KEY] = name;
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
