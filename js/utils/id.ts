// js/utils/id.ts
let createIdFallbackCounter = 0;

/**
 * Creates a unique ID string suitable for identifying entities/items individually.
 * Uses crypto.randomUUID() when available, with a safe fallback otherwise.
 */
export function generateUUId(prefix: string): string {
  // Browser-safe (Webpack target): crypto.randomUUID is widely supported in modern browsers.
  const cryptoObj = globalThis.crypto as Crypto | undefined;

  if (cryptoObj?.randomUUID) {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }

  // Fallback: timestamp + increment + random
  // (Less robust than UUID, but fine as a backstop)
  createIdFallbackCounter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}_${createIdFallbackCounter}_${rand}`;
}




let counter = 0;

/**
 * Generates a unique-ish ID for runtime usage and save/load.
 * Example: "monster_mgq1n4kz_12_k3p9a2"
 */
export function createId(prefix: string): string {
  counter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}_${counter}_${rand}`;
}
