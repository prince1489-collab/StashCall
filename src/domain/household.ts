import type { AppData } from '../storage/store';
import { PRESET_ITEMS } from './presets';
import type { Item, Owner } from './types';

/**
 * Pure updates to the household's saved items and owners. Each returns new
 * data; the app state layer saves it. Kept free of React for testing.
 */

type IdFn = () => string;

/** Adds the chosen presets that aren't already saved, and puts them on the trip being looked at (else the first). */
export function addPresets(data: AppData, presetIds: string[], newId: IdFn, now = new Date(), tripId?: string): AppData {
  const have = new Set(data.items.map((i) => i.presetId).filter(Boolean));
  const added: Item[] = PRESET_ITEMS.filter((p) => presetIds.includes(p.id) && !have.has(p.id)).map((p) => ({
    id: newId(),
    name: p.name,
    moment: p.moment,
    presetId: p.id,
    createdAt: now.toISOString(),
  }));
  return addToTrip({ ...data, items: [...data.items, ...added] }, added.map((i) => i.id), tripId);
}

/** Creates or updates an item. New items go on the trip being looked at (else the first). */
export function upsertItem(data: AppData, item: Item, tripId?: string): AppData {
  const exists = data.items.some((i) => i.id === item.id);
  if (exists) return { ...data, items: data.items.map((i) => (i.id === item.id ? item : i)) };
  return addToTrip({ ...data, items: [...data.items, item] }, [item.id], tripId);
}

/** Deletes an item everywhere, including from every trip and its ticks. */
export function removeItem(data: AppData, id: string): AppData {
  return {
    ...data,
    items: data.items.filter((i) => i.id !== id),
    trips: data.trips.map((t) => ({
      ...t,
      itemIds: t.itemIds.filter((x) => x !== id),
      ticked: Object.fromEntries(Object.entries(t.ticked).map(([k, v]) => [k, (v ?? []).filter((x) => x !== id)])),
    })),
  };
}

/** Items saved for every trip, leaving out one-off items. */
export function savedItems(items: Item[]): Item[] {
  return items.filter((i) => !i.tripId);
}

/** Deletes a trip and the one-off items that belonged to it. */
export function removeTrip(data: AppData, tripId: string): AppData {
  return {
    ...data,
    trips: data.trips.filter((t) => t.id !== tripId),
    items: data.items.filter((i) => i.tripId !== tripId),
  };
}

/** Finds an owner by name (case-insensitive) or creates one. Empty name → no owner. */
export function ensureOwner(data: AppData, name: string, newId: IdFn): { data: AppData; ownerId?: string } {
  const clean = name.trim();
  if (!clean) return { data };
  const found = data.owners.find((o) => o.name.toLowerCase() === clean.toLowerCase());
  if (found) return { data, ownerId: found.id };
  const owner: Owner = { id: newId(), name: clean };
  return { data: { ...data, owners: [...data.owners, owner] }, ownerId: owner.id };
}

/** The trip with this id, else the first one: where item changes land. */
function target(data: AppData, tripId?: string) {
  return (tripId && data.trips.find((t) => t.id === tripId)) || data.trips[0];
}

/** Puts an item on, or takes it off, a trip (the one being looked at, else the first). */
export function setOnCurrentTrip(data: AppData, itemId: string, on: boolean, tripId?: string): AppData {
  const trip = target(data, tripId);
  if (!trip) return data;
  const ids = trip.itemIds.filter((x) => x !== itemId);
  return { ...data, trips: data.trips.map((t) => (t.id === trip.id ? { ...t, itemIds: on ? [...ids, itemId] : ids } : t)) };
}

function addToTrip(data: AppData, itemIds: string[], tripId?: string): AppData {
  const trip = target(data, tripId);
  if (!trip || itemIds.length === 0) return data;
  const ids = Array.from(new Set([...trip.itemIds, ...itemIds]));
  return { ...data, trips: data.trips.map((t) => (t.id === trip.id ? { ...t, itemIds: ids } : t)) };
}
