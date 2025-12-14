// Item.ts
import { Entity } from "./Entity";
import { MessageLog } from "./MessageLog";

export type EquipmentSlot = 'head' | 'chest' | 'legs' | 'feet' | 'weapon' | 'offhand' | 'consumable' | 'none';

export interface Item {
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

    private static readonly DEFENSE_SLOTS: Array<Extract<EquippableSlot, 'head' | 'chest' | 'legs' | 'feet'>> =
        ['head', 'chest', 'legs', 'feet'];

    public items: InventoryItem[] = [];

    // Track what is currently equipped
    public equipment: Partial<Record<EquippableSlot, InventoryItem>> = {};

    constructor(messageLog: MessageLog) {
        this.messageLog = messageLog;
    }

    private log(text: string, color: string = 'white'): void {
        console.log(text);
        this.messageLog.addMessage(text, color);
    }


    private formatBonuses(item: InventoryItem): string {
      const parts: string[] = [];
      if (item.attackBonus) parts.push(`ATK ${item.attackBonus > 0 ? '+' : ''}${item.attackBonus}`);
      if (item.defenseBonus) parts.push(`DEF ${item.defenseBonus > 0 ? '+' : ''}${item.defenseBonus}`);
      return parts.length > 0 ? parts.join(', ') : 'no stat changes';
    }

    addItem(item: Item): void {
      const { x, y, ...inventoryItem } = item;
      this.items.push(inventoryItem);
      this.log(`Picked up ${item.name}!`, item.color);
    }

    hasItems(): boolean {
      return this.items.length > 0;
    }

    equipItem(itemIndex: number, player: Entity): void {
        const itemToEquip = this.items[itemIndex];
        if (!itemToEquip || itemToEquip.slot === 'consumable' || itemToEquip.slot === 'none') {
            return; // cannot equip consumables/none
        }

        const slot: EquippableSlot = itemToEquip.slot;

        if (this.equipment[slot]) {
            this.unequipItem(slot, player);
        }

        this.equipment[slot] = itemToEquip;


        // Remove item from the main inventory list
        this.items.splice(itemIndex, 1);

        this.log(
            `Equipped ${itemToEquip.name} (${slot}). ${this.formatBonuses(itemToEquip)}. ` +
            `Now: ATK=${player.damageBase}, DEF=${player.defenseBase}`,
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

    useConsumable(itemIndex: number, player: Entity): void {
        const item = this.items[itemIndex];
        if (!item || item.slot !== 'consumable') return;

        if (item.healAmount > 0) {
            player.hp = Math.min(player.maxHp, player.hp + item.healAmount);
            this.log(`Used ${item.name}. HP restored to ${player.hp}.`, item.color);
        }

        this.items.splice(itemIndex, 1);
    }

    getAttackBonus(): number {
        return this.equipment.weapon?.attackBonus ?? 0;
    }

    getDefenseBonus(): number {
        return Inventory.DEFENSE_SLOTS.reduce((total, slot) => {
            return total + (this.equipment[slot]?.defenseBonus ?? 0);
        }, 0);
    }
}
