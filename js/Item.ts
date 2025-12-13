// Item.ts
import { Entity } from './Entity';

export interface Item {
  x: number;
  y: number;
  symbol: string;
  color: string;
  name: string;
  type: 'healing' | 'weapon' | 'armor';
  effect: number; // e.g., +2 damage, +5 HP
}

export class Inventory {
  items: Item[] = [];

  // Simple example: check if player has any items
  hasItems(): boolean {
    return this.items.length > 0;
  }

  // Add an item to the inventory
  addItem(item: Item): void {
    // Remove map-specific properties (x, y) before adding
    const { x, y, ...inventoryItem } = item;
    this.items.push(inventoryItem as Item);
    console.log(`Picked up ${item.name}!`);
  }

  // Use an item (e.g., a potion)
  useItem(itemIndex: number, player: Entity): void {
    const item = this.items[itemIndex];
    if (!item || item.type !== 'healing') return;

    player.hp = Math.min(player.maxHp, player.hp + item.effect);
    console.log(`Used ${item.name}. HP restored to ${player.hp}.`);

    // Remove the item from inventory
    this.items.splice(itemIndex, 1);
  }
}
