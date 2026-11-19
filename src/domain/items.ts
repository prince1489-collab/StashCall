import type { Item } from './types';

/** Items to remind about at a 'home' or 'checkout' moment. */
export function itemsForMoment(items: Item[], moment: 'home' | 'checkout'): Item[] {
  return items.filter((i) => i.moment === moment || i.moment === 'both');
}
