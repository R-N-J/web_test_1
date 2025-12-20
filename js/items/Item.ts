// Item.ts
import { Entity } from "../entities/Entity";
import { MessageLog } from "../core/MessageLog";
import { EventBus } from "../core/EventBus";

export type EquipmentSlot =
  | "head"
  | "chest"
  | "legs"
  | "feet"
  | "weapon"
  | "offhand"
  | "consumable"
  | "none";


export interface Item {
  id: string;
  x: number;
  y: number;
  symbol: string;
  color: string;
  name: string;
  slot: EquipmentSlot; // Where the item goes (weapon, armor, consumable)
  // STATS: Effects applied when equipped or consumed
  attackBonus: number;
  defenseBonus: number;
  healAmount: number;
}

export type InventoryItem = Omit<Item, 'x' | 'y'>;
export type EquippableSlot = Exclude<EquipmentSlot, 'consumable' | 'none'>;

export class Inventory {
    private readonly messageLog: MessageLog;
    private events?: EventBus;
    public static readonly CAPACITY = 26; // Limit to 'a'-'z' labels

  private static readonly DEFENSE_SLOTS: Array<
      Extract<EquippableSlot, "head" | "chest" | "legs" | "feet">
    > = ["head", "chest", "legs", "feet"];

    public items: InventoryItem[] = [];

    // Track what is currently equipped
    public equipment: Partial<Record<EquippableSlot, InventoryItem>> = {};

    constructor(messageLog: MessageLog) {
        this.messageLog = messageLog;
    }

    private log(text: string, color: string = 'white'): void {
        console.log(text);
        if (this.events) {
          this.events.publish({ type: 'MESSAGE_LOGGED', text, color });
        } else {
          this.messageLog.addMessage(text, color);
        }
    }

    public setEventBus(events: EventBus): void {
      this.events = events;
    }


    private formatBonuses(item: InventoryItem): string {
      const parts: string[] = [];
      if (item.attackBonus) parts.push(`ATK ${item.attackBonus > 0 ? '+' : ''}${item.attackBonus}`);
      if (item.defenseBonus) parts.push(`DEF ${item.defenseBonus > 0 ? '+' : ''}${item.defenseBonus}`);
      return parts.length > 0 ? parts.join(', ') : 'no stat changes';
    }

  addItem(item: Item): void {
    // Defensive: never allow map-decoration items into inventory.
    if (item.slot === "none") {
      this.log(`You can't pick up ${item.name}.`, "gray");
      return;
    }

    // Check capacity limit
    if (this.items.length >= Inventory.CAPACITY) {
      this.log(`Your inventory is full! (Max ${Inventory.CAPACITY} items)`, "orange");
      return;
    }

    // Defensive: IDs are unique, so don't allow duplicates.
    if (this.items.some(i => i.id === item.id)) {
      this.log(`You already have ${item.name}.`, "gray");
      return;
    }

    const { x: _x, y: _y, ...inventoryItem } = item; // Remove x and y from the item
    this.items.push(inventoryItem);
    this.log(`Picked up ${item.name}!`, item.color);
  }

    hasItems(): boolean {
      return this.items.length > 0;
    }

  equipItem(itemId: string, player: Entity): void {
    const itemIndex = this.items.findIndex(i => i.id === itemId);
    const itemToEquip = this.items[itemIndex];

    if (!itemToEquip || itemToEquip.slot === 'consumable' || itemToEquip.slot === 'none') {
      return;
    }

    const slot: EquippableSlot = itemToEquip.slot;

    if (this.equipment[slot]) {
      this.unequipItem(slot, player);
    }

    this.equipment[slot] = itemToEquip;

    // Remove item from the main inventory list using the index we found
    this.items.splice(itemIndex, 1);

    this.log(
      `Equipped ${itemToEquip.name} (${slot}). ${this.formatBonuses(itemToEquip)}. ` +
      `Now: ATK=${player.damage}, DEF=${player.defense}`,
      itemToEquip.color
    );
  }

    unequipItem(slot: Exclude<EquipmentSlot, 'consumable' | 'none'>, player: Entity): void {
        const item = this.equipment[slot];
        if (!item) return;


        this.items.push(item);
        delete this.equipment[slot];

        this.log(
            `Unequipped ${item.name} (${slot}). Now: ATK=${player.damageBase}, DEF=${player.defenseBase}`,
            item.color
        );
    }

    useConsumable(itemId: string, player: Entity): void {
      const itemIndex = this.items.findIndex(i => i.id === itemId);
      const item = this.items[itemIndex];

      if (!item || item.slot !== 'consumable') return;

      if (item.healAmount > 0) {
        player.hp = Math.min(player.maxHp, player.hp + item.healAmount);
        this.log(`Used ${item.name}. HP restored to ${player.hp}.`, item.color);
      }

      this.items.splice(itemIndex, 1);
    }

  dropItem(itemId: string): InventoryItem | null {
    const index = this.items.findIndex(i => i.id === itemId);
    if (index === -1) return null;

    const item = this.items.splice(index, 1)[0];
    this.log(`Dropped ${item.name}.`, "gray");
    return item;
  }


    getAttackBonus(): number {
        return this.equipment.weapon?.attackBonus ?? 0;
    }

    getDefenseBonus(): number {
        return Inventory.DEFENSE_SLOTS.reduce((total, slot) => {
            return total + (this.equipment[slot]?.defenseBonus ?? 0);
        }, 0);
    }

  /**
   * Reconstructs an inventory from saved data.
   */
  public static fromSnapshot(log: MessageLog, snapshot: { items: InventoryItem[], equipment: Partial<Record<EquippableSlot, InventoryItem>> }): Inventory {
    const inventory = new Inventory(log);
    inventory.items = snapshot.items;
    inventory.equipment = snapshot.equipment;
    return inventory;
  }

}
