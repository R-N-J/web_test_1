import type { GameState } from "../../core/GameState";
import type { InventoryItem } from "../../items/Item";

/**
 * Utility for formatting inventory data for UI display.
 */
export class InventoryOverlay {
  /**
   * Builds an array of PickList entries from the current inventory state,
   * optionally filtered by a predicate function.
   */
  public static getEntryList(state: GameState, filter?: (item: InventoryItem) => boolean) {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const items = filter ? state.inventory.items.filter(filter) : state.inventory.items;

    return items.map((it: InventoryItem, i: number) => ({
      label: letters[i],
      text: `${letters[i]}) ${it.name} ${it.slot === 'consumable' ? '(use)' : '(' + it.slot + ')'}`,
      value: it
    }));
  }
}
