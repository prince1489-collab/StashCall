import { itemsForMoment } from './items';
import { isDomestic } from './prep';
import type { Item, TimelineStep, Trip } from './types';

/** Preset items that only matter when crossing a border. */
const ABROAD_ONLY = new Set(['adaptor']);

/**
 * The trip's items, adjusted for where it goes. On a domestic flight the
 * plug adaptor stays at home and passports become photo ID, which is what
 * the airport asks for.
 */
export function tripItems(trip: Trip, items: Item[]): Item[] {
  const onTrip = items.filter((i) => trip.itemIds.includes(i.id));
  if (!isDomestic(trip)) return onTrip;
  return onTrip
    .filter((i) => !(i.presetId && ABROAD_ONLY.has(i.presetId)))
    .map((i) => (i.presetId === 'passport' ? { ...i, name: 'Photo ID' } : i));
}

/** The trip's items that a reminder step covers. */
export function stepItems(trip: Trip, items: Item[], step: TimelineStep): Item[] {
  if (!step.itemMoment) return [];
  return itemsForMoment(tripItems(trip, items), step.itemMoment);
}

/** Names of the trip's items that a reminder step should mention. */
export function stepItemNames(trip: Trip, items: Item[], step: TimelineStep): string[] {
  return stepItems(trip, items, step).map((i) => i.name);
}

/** "7 items to pack", "1 item to check": a reminder step's items, counted. */
export function itemCountLabel(step: TimelineStep, count: number): string {
  const noun = count === 1 ? 'item' : 'items';
  const verb = step.kind === 'pack' || step.kind === 'returnPack' ? 'to pack' : 'to check';
  return `${count} ${noun} ${verb}`;
}
