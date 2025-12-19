import type { UiOverlay, GameState } from "../../core/GameState";
import type { AsciiRenderer } from "../AsciiRenderer";
import type { InventoryItem } from "../../items/Item";

/**
 * Utility class for inventory-related UI logic.
 * The actual rendering is handled by PickListOverlay, while this class
 * provides static helpers to format the inventory data.
 */
export class InventoryOverlay implements UiOverlay {
  public readonly kind = "INVENTORY";

  public render(state: GameState, display: AsciiRenderer): void {
    // Logic delegated to PickListOverlay in Game.ts
  }

  public onKeyDown(state: GameState, event: KeyboardEvent): boolean {
    return false;
  }

  /**
   * Helper to build the list of inventory items for PickListOverlay.
   * Formats each item with its corresponding 'a-z' label and slot information.
   */
  public static getEntryList(state: GameState) {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    return state.inventory.items.map((it: InventoryItem, i: number) => ({
      label: letters[i],
      text: `${letters[i]}) ${it.name} ${it.slot === 'consumable' ? '(use)' : '(' + it.slot + ')'}`,
      value: it
    }));
  }
}
