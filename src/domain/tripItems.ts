import { itemsForMoment } from './items';
import type { Item, TimelineStep, Trip } from './types';

/** The trip's items that a reminder step covers. */
export function stepItems(trip: Trip, items: Item[], step: TimelineStep): Item[] {
  if (!step.itemMoment) return [];
  const onTrip = items.filter((i) => trip.itemIds.includes(i.id));
  return itemsForMoment(onTrip, step.itemMoment);
}

/** Names of the trip's items that a reminder step should mention. */
export function stepItemNames(trip: Trip, items: Item[], step: TimelineStep): string[] {
  return stepItems(trip, items, step).map((i) => i.name);
}
