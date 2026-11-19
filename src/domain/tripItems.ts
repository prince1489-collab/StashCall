import { itemsForMoment } from './items';
import type { Item, TimelineStep, Trip } from './types';

/** Names of the trip's items that a reminder step should mention. */
export function stepItemNames(trip: Trip, items: Item[], step: TimelineStep): string[] {
  if (!step.itemMoment) return [];
  const onTrip = items.filter((i) => trip.itemIds.includes(i.id));
  return itemsForMoment(onTrip, step.itemMoment).map((i) => i.name);
}
