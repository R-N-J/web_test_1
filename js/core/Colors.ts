/**
 * Raw color definitions.
 */
export const COLOR = {
  // Grayscale
  WHITE: "#ffffff",
  SILVER: "#c0c0c0",
  LIGHT_GRAY: "#dddddd",
  GRAY: "#888888",
  DARK_GRAY: "#333333",
  ONYX: "#222222",
  VERY_DARK_GRAY: "#111111",
  BLACK: "#000000",


  // Basic Colors
  RED: "#ff0000",
  ORANGE: "#ffa500",
  YELLOW: "#ffff00",
  GREEN: "#00ff00",
  CYAN: "#00ffff",
  BLUE: "#0000ff",
  MAGENTA: "#ff00ff",
  PURPLE: "#800080",
  PINK: "#ffc0cb",
  BROWN: "#a52a2a",
  GOLD: "#ffd700",

  // Variations
  DARK_RED: "#8b0000",
  DARK_GREEN: "#006400",
  DARK_BLUE: "#00008b",
  LIGHT_GREEN: "#90ee90",
  LIGHT_BLUE: "#add8e6",
  LIGHT_YELLOW: "#ffffe0",
  LIGHT_CYAN: "#e0ffff",
  LIGHT_MAGENTA: "#ff00ff", // Magenta is already bright, but for consistency
  DARK_ORANGE: "#ff8c00",
  DARK_PURPLE: "#4b0082", // Indigo-ish

  // Extended Palette (Elements & Statuses)
  LIME: "#00ff00",
  CHARTREUSE: "#7fff00",
  TEAL: "#008080",
  AQUA: "#00ffff",
  SKY_BLUE: "#87ceeb",
  AZURE: "#f0ffff",
  ORANGE_RED: "#ff4500",
  CRIMSON: "#dc143c",
  AMBER: "#ffbf00",
  OLIVE: "#808000",

  // Materials & Metals
  BRONZE: "#cd7f32",
  IRON: "#a19d94",
  STEEL: "#777b7e",
  COPPER: "#b87333",
  STONE: "#888c8d",
  WOOD: "#deb887", // Burlywood
  LEATHER: "#8b4513", // SaddleBrown
  BONE: "#e3dac9",
} as const;

/**
 *
 * These are used to define the colors of UI elements, such
 * as the Overlay windows and menus in the game.
 *
 */
export const UI_COLORS = {
  DEFAULT_TEXT: COLOR.WHITE,
  MUTED_TEXT: COLOR.GRAY,
  BACKGROUND: COLOR.BLACK,

  WINDOW_BORDER: COLOR.LIGHT_GRAY,
  WINDOW_BG: COLOR.BLACK,

  SELECTION_FG: COLOR.BLACK,
  SELECTION_BG: COLOR.WHITE,

  WARNING: COLOR.ORANGE,
  ERROR: COLOR.RED,

  // HUD elements
  HEALTH_HIGH: COLOR.GREEN,
  HEALTH_MEDIUM: COLOR.YELLOW,
  HEALTH_LOW: COLOR.RED,
  MANA: COLOR.BLUE,
  EXP: COLOR.GOLD,
} as const;

/**
 *
 * These are used to define the colors of game world entities, such
 * as the player, enemies, and items in the game.
 */
export const ENTITY_COLORS = {
  PLAYER: COLOR.GREEN,
  ENEMY: COLOR.RED,
  POTION: COLOR.MAGENTA,
  ITEM_COMMON: COLOR.WHITE,
  ITEM_UNCOMMON: COLOR.GREEN,
  ITEM_RARE: COLOR.CYAN,
  ITEM_EPIC: COLOR.MAGENTA,
  ITEM_LEGENDARY: COLOR.ORANGE,
  ITEM_ARTIFACT: COLOR.CRIMSON,

  CORPSE: COLOR.WOOD, // Using wood-ish color for now as per previous hardcoded #aa8866
} as const;
