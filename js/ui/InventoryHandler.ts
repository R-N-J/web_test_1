import { Game } from "../core/Game";
import { PickListOverlay } from "./overlays/PickListOverlay";
import { InventoryOverlay } from "./overlays/InventoryOverlay";
import { InventoryItem } from "../items/Item";
import { ActionType } from "../core/Actions";

export class InventoryHandler {
  constructor(private game: Game) {}

  /**
   * Opens the inventory list, optionally filtered by a specific criteria.
   */
  public openMain(filter?: (item: InventoryItem) => boolean, title: string = "Inventory"): boolean {
    const s = this.game.state;
    const filteredItems = filter ? s.inventory.items.filter(filter) : s.inventory.items;

    if (filteredItems.length === 0) {
      const msg = filter ? `You have no items for that action.` : "Your inventory is empty.";
      this.game.events.publish({ type: 'MESSAGE_LOGGED', text: msg, color: "gray" });
      return false;
    }

    const entries = InventoryOverlay.getEntryList(s, filter);

    this.game.pushUi(
      new PickListOverlay<InventoryItem>(
        title,
        entries,
        (_state, item) => {
          this.game.popUi();
          this.openActionMenu(item, filter, title); // Pass filter back for 'cancel' logic
        },
        () => this.game.popUi()
      )
    );
    return false;
  }

  /**
   * Opens the sub-menu for a specific item.
   */
  private openActionMenu(item: InventoryItem, filter?: (item: InventoryItem) => boolean, title: string = "Inventory"): void {
    const actions = [];
    if (item.slot === "consumable") {
      actions.push({ label: "u", text: "u) Use", value: ActionType.USE_CONSUMABLE });
    } else {
      actions.push({ label: "e", text: "e) Equip", value: ActionType.EQUIP });
    }
    actions.push({ label: "d", text: "d) Drop", value: ActionType.DROP  });

    this.game.pushUi(
      new PickListOverlay<string>(
        `${item.name}`,
        actions,
        (_state, action) => {
          this.game.popUi();
          this.processAction(item, action);
        },
        () => {
          this.game.popUi();
          this.openMain(filter, title); // Return to filtered list
        }
      )
    );
  }
  /**
   * Executes the logical consequences of an inventory action.
   */
  private processAction(item: InventoryItem, action: string) {
    const s = this.game.state;
    if (action === ActionType.USE_CONSUMABLE) {
      s.inventory.useConsumable(item.id, s.player);
      // Passing time via a WAIT action if the item is used
      // void this.game.handleAction({ type: ActionType.WAIT });
    } else if (action === ActionType.EQUIP) {
      s.inventory.equipItem(item.id, s.player);
      s.player.damage = s.player.damageBase + s.inventory.getAttackBonus();
      s.player.defense = s.player.defenseBase + s.inventory.getDefenseBonus();
    } else if (action === ActionType.DROP) {
      const dropped = s.inventory.dropItem(item.id);
      if (dropped) {
        s.itemsOnMap.push({
          ...dropped,
          x: s.player.x,
          y: s.player.y
        });
      }
    }
    this.game.render();
  }
}
