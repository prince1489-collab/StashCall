import { itemsForMoment } from './items';
import { itemGoes, remindsHere } from './people';
import { isDomestic } from './prep';
import type { Item, Person, TimelineStep, Trip } from './types';

/** Preset items that only matter when crossing a border. */
const ABROAD_ONLY = new Set(['adaptor']);

/**
 * The trip's items, adjusted for where it goes. On a domestic flight the
 * plug adaptor stays at home and passports become photo ID, which is what
 * the airport asks for. Items of people not going are left out.
 */
export function tripItems(trip: Trip, items: Item[], people: Person[] = []): Item[] {
  const onTrip = items.filter((i) => trip.itemIds.includes(i.id) && itemGoes(i, trip, people));
  if (!isDomestic(trip)) return onTrip;
  return onTrip
    .filter((i) => !(i.presetId && ABROAD_ONLY.has(i.presetId)))
    .map((i) => (i.presetId === 'passport' ? { ...i, name: 'Photo ID' } : i));
}

/** The trip's items that a reminder step covers. */
export function stepItems(trip: Trip, items: Item[], step: TimelineStep, people: Person[] = []): Item[] {
  if (!step.itemMoment) return [];
  return itemsForMoment(tripItems(trip, items, people), step.itemMoment);
}

/** Names of the trip's items that a reminder step should mention. */
export function stepItemNames(trip: Trip, items: Item[], step: TimelineStep, people: Person[] = []): string[] {
  return stepItems(trip, items, step, people).map((i) => i.name);
}

/** "7 items to pack", "1 item to check": a reminder step's items, counted. */
export function itemCountLabel(step: TimelineStep, count: number): string {
  const noun = count === 1 ? 'item' : 'items';
  const verb = step.kind === 'pack' || step.kind === 'returnPack' ? 'to pack' : 'to check';
  return `${count} ${noun} ${verb}`;
}

/**
 * The items this phone's reminder for a step should name: the user's own,
 * shared ones, and those of children or anyone without the app.
 */
export function reminderItems(trip: Trip, items: Item[], step: TimelineStep, people: Person[] = [], meId?: string): Item[] {
  return stepItems(trip, items, step, people).filter((i) => remindsHere(i, people, meId));
}
