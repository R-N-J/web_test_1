//
/**
 * A collection of grayscale color values represented as hexadecimal strings.
 * Each key in this collection corresponds to a specific shade of gray, ranging
 * from black to white. The numeric value in the key represents the intensity
 * of the grayscale, where 0 is completely black ("#000000"), and 1000 is
 * completely white ("#ffffff").
 *
 * Grayscale colors are commonly used in UI design for neutral tones, text,
 * shadows, dividers, and background elements, as well as for accessibility
 * contrasts.
 *
 * Properties:
 *
 * @property {string} GRAY_0 - Hex color code for BLACK ("#000000").
 * @property {string} GRAY_050 - Hex color code for VERY_DARK_GRAY ("#111111").
 * @property {string} GRAY_100 - Hex color code for a very dark shade of gray ("#1a1a1a").
 * @property {string} GRAY_150 - Hex color code for ONYX, a dark accent UI color ("#222222").
 * @property {string} GRAY_200 - Hex color code for DARK_GRAY ("#333333").
 * @property {string} GRAY_300 - Hex color code for a medium-dark gray ("#4d4d4d").
 * @property {string} GRAY_400 - Hex color code for a medium shade of gray ("#666666").
 * @property {string} GRAY_500 - Hex color code for GRAY, a neutral gray tone ("#888888").
 * @property {string} GRAY_600 - Hex color code for a light-medium gray ("#999999").
 * @property {string} GRAY_700 - Hex color code for a lighter gray ("#b3b3b3").
 * @property {string} GRAY_800 - Hex color code for SILVER, a light gray tone ("#c0c0c0").
 * @property {string} GRAY_900 - Hex color code for LIGHT_GRAY ("#dddddd").
 * @property {string} GRAY_1000 - Hex color code for WHITE ("#ffffff").
 *
 * Usage Example:
 *
 * // Accessing specific grayscale colors
 * console.log(GRAY.GRAY_0);     // Output: "#000000" (BLACK)
 * console.log(GRAY.GRAY_150);   // Output: "#222222" (ONYX)
 * console.log(GRAY.GRAY_800);   // Output: "#c0c0c0" (SILVER)
 * console.log(GRAY.GRAY_1000);  // Output: "#ffffff" (WHITE)
 */
export const GRAY = {

  // Grayscale Ramp (0 = Black, 1000 = White)
  GRAY_0: "#000000",    // BLACK
  GRAY_050: "#111111",  // VERY_DARK_GRAY
  GRAY_100: "#1a1a1a",
  GRAY_150: "#222222",  // ONYX DEEP_GRAY Our UI accent color
  GRAY_200: "#333333",  // DARK_GRAY
  GRAY_300: "#4d4d4d",
  GRAY_400: "#666666",
  //GRAY_500: "#808080",
  GRAY_500: "#888888",  //GRAY
  GRAY_600: "#999999",
  GRAY_700: "#b3b3b3",
  GRAY_800: "#c0c0c0",  //SILVER
  //GRAY_800: "#cccccc",
  GRAY_900: "#dddddd",   //LIGHT_GRAY
  GRAY_1000: "#ffffff",  //WHITE

  //https: colorkit.co/color-palette-generator/000000-1a1a1a-333333-4d4d4d-666666-808080-999999-b3b3b3-cccccc/
}


/**
 * A collection of raw color definitions used throughout the application.
 *
 * This object provides a comprehensive palette of predefined colors organized into
 * several categories: grayscale, basic colors, color variations, extended palette,
 * and materials/metals. All colors are represented as hexadecimal strings.
 *
 * The color values are sourced from the `GRAY` collection for grayscale tones,
 * and defined as hex codes for all other colors. This centralized definition
 * ensures consistency across the application and simplifies color management.
 *
 * **Categories:**
 *
 * - **Grayscale**: Common neutral tones from black to white (WHITE, LIGHT_GRAY, SILVER, etc.)
 * - **Basic Colors**: Primary and secondary colors (RED, ORANGE, YELLOW, GREEN, CYAN, BLUE, MAGENTA, PURPLE, PINK, BROWN, GOLD)
 * - **Variations**: Lighter and darker versions of basic colors (DARK_RED, LIGHT_GREEN, DARK_BLUE, etc.)
 * - **Extended Palette**: Additional named colors for specific use cases (LIME, CHARTREUSE, TEAL, CRIMSON, AMBER, OLIVE, etc.)
 * - **Materials & Metals**: Colors representing physical materials (BRONZE, IRON, STEEL, COPPER, STONE, WOOD, LEATHER, BONE)
 *
 * **Properties:**
 *
 * @property {string} WHITE - Pure white ("#ffffff").
 * @property {string} LIGHT_GRAY - Light gray tone ("#dddddd").
 * @property {string} SILVER - Silver gray ("#c0c0c0").
 * @property {string} GRAY - Neutral gray ("#888888").
 * @property {string} DARK_GRAY - Dark gray ("#333333").
 * @property {string} DEEP_GRAY - Deep gray, used as UI accent color ("#222222").
 * @property {string} VERY_DARK_GRAY - Very dark gray ("#111111").
 * @property {string} BLACK - Pure black ("#000000").
 * @property {string} RED - Pure red ("#ff0000").
 * @property {string} ORANGE - Pure orange ("#ffa500").
 * @property {string} YELLOW - Pure yellow ("#ffff00").
 * @property {string} GREEN - Pure green ("#00ff00").
 * @property {string} CYAN - Pure cyan ("#00ffff").
 * @property {string} BLUE - Pure blue ("#0000ff").
 * @property {string} MAGENTA - Pure magenta ("#ff00ff").
 * @property {string} PURPLE - Purple ("#800080").
 * @property {string} PINK - Pink ("#ffc0cb").
 * @property {string} BROWN - Brown ("#a52a2a").
 * @property {string} GOLD - Gold ("#ffd700").
 * @property {string} DARK_RED - Dark red ("#8b0000").
 * @property {string} DARK_GREEN - Dark green ("#006400").
 * @property {string} DARK_BLUE - Dark blue ("#00008b").
 * @property {string} LIGHT_GREEN - Light green ("#90ee90").
 * @property {string} LIGHT_BLUE - Light blue ("#add8e6").
 * @property {string} LIGHT_YELLOW - Light yellow ("#ffffe0").
 * @property {string} LIGHT_CYAN - Light cyan ("#e0ffff").
 * @property {string} LIGHT_MAGENTA - Light magenta ("#ff00ff").
 * @property {string} DARK_ORANGE - Dark orange ("#ff8c00").
 * @property {string} DARK_PURPLE - Dark purple/indigo ("#4b0082").
 * @property {string} LIME - Lime green ("#00ff00").
 * @property {string} CHARTREUSE - Chartreuse ("#7fff00").
 * @property {string} TEAL - Teal ("#008080").
 * @property {string} AQUA - Aqua ("#00ffff").
 * @property {string} SKY_BLUE - Sky blue ("#87ceeb").
 * @property {string} AZURE - Azure ("#f0ffff").
 * @property {string} ORANGE_RED - Orange-red ("#ff4500").
 * @property {string} CRIMSON - Crimson ("#dc143c").
 * @property {string} AMBER - Amber ("#ffbf00").
 * @property {string} OLIVE - Olive ("#808000").
 * @property {string} BRONZE - Bronze ("#cd7f32").
 * @property {string} IRON - Iron ("#a19d94").
 * @property {string} STEEL - Steel ("#777b7e").
 * @property {string} COPPER - Copper ("#b87333").
 * @property {string} STONE - Stone gray ("#888c8d").
 * @property {string} WOOD - Wood/burlywood ("#deb887").
 * @property {string} LEATHER - Leather/saddle brown ("#8b4513").
 * @property {string} BONE - Bone ("#e3dac9").
 *
 * **Usage Example:**
 *
 * ```typescript
 * import { COLOR } from './Colors';
 *
 * // Use in rendering or styling
 * const playerColor = COLOR.GREEN;
 * const backgroundColor = COLOR.BLACK;
 * const warningColor = COLOR.ORANGE;
 *
 * // Materials
 * const swordColor = COLOR.STEEL;
 * const chestColor = COLOR.WOOD;
 * ```
 *
 * @constant
 * @readonly
 */
export const COLOR = {
  // Grayscale
  WHITE: GRAY.GRAY_1000,
  LIGHT_GRAY: GRAY.GRAY_900,
  SILVER: GRAY.GRAY_800,
  GRAY: GRAY.GRAY_500,
  DARK_GRAY: GRAY.GRAY_200,
  DEEP_GRAY:  GRAY.GRAY_150,
  VERY_DARK_GRAY:  GRAY.GRAY_050,
  BLACK: GRAY.GRAY_0,

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
