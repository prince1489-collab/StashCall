import type { AppData } from '../storage/store';
import type { Item, LocalDate, Person, Trip } from './types';

/**
 * The household's people: who is going on a trip, whose items go on it,
 * and whose items this phone reminds about. Pure functions, like household.ts.
 */

/** People going on a trip. A trip with no list takes everyone. */
export function travellers(trip: Pick<Trip, 'travellerIds'>, people: Person[]): Person[] {
  if (!trip.travellerIds) return people;
  return people.filter((p) => trip.travellerIds!.includes(p.id));
}

/** Whether an item goes on a trip: shared items always do, personal ones when their owner is going. */
export function itemGoes(item: Item, trip: Pick<Trip, 'travellerIds'>, people: Person[]): boolean {
  if (!item.ownerId || !trip.travellerIds) return true;
  // An owner who has since been removed shouldn't hide the item.
  if (!people.some((p) => p.id === item.ownerId)) return true;
  return trip.travellerIds.includes(item.ownerId);
}

/**
 * Whether this phone's reminders should name an item. Each adult with their
 * own phone gets their own items; this phone also covers shared items,
 * children, and anyone without the app.
 */
export function remindsHere(item: Item, people: Person[], meId?: string): boolean {
  if (!item.ownerId || !meId || item.ownerId === meId) return true;
  const owner = people.find((p) => p.id === item.ownerId);
  return !owner || !!owner.child || !owner.ownPhone;
}

/** The earliest passport expiry among the people going, with whose it is. */
export function firstPassport(
  trip: Pick<Trip, 'travellerIds'>,
  data: { owners?: Person[]; passportExpires?: LocalDate },
): { date: LocalDate; name?: string; personId?: string } | undefined {
  const dated = travellers(trip, data.owners ?? [])
    .filter((p): p is Person & { passportExpires: LocalDate } => !!p.passportExpires)
    .sort((a, b) => a.passportExpires.localeCompare(b.passportExpires));
  if (dated.length > 0) return { date: dated[0].passportExpires, name: dated[0].name, personId: dated[0].id };
  return data.passportExpires ? { date: data.passportExpires } : undefined;
}

export function addPerson(data: AppData, person: Person): AppData {
  const owners = [...data.owners, person];
  // The first person added is most likely whoever is holding the phone.
  return { ...data, owners, meId: data.meId ?? person.id };
}

export function updatePerson(data: AppData, id: string, patch: Partial<Omit<Person, 'id'>>): AppData {
  return { ...data, owners: data.owners.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Removes a person. Their items become shared items rather than vanishing. */
export function removePerson(data: AppData, id: string): AppData {
  return {
    ...data,
    owners: data.owners.filter((p) => p.id !== id),
    items: data.items.map((i) => (i.ownerId === id ? { ...i, ownerId: undefined } : i)),
    trips: data.trips.map((t) => {
      if (!t.travellerIds) return t;
      const left = t.travellerIds.filter((x) => x !== id);
      return { ...t, travellerIds: left.length > 0 ? left : undefined };
    }),
    meId: data.meId === id ? undefined : data.meId,
  };
}

/** Sets who is going. Everyone going is stored as "unset", so new people join future edits by default. */
export function setTravellers(data: AppData, tripId: string, ids: string[]): AppData {
  const everyone = data.owners.length > 0 && data.owners.every((p) => ids.includes(p.id));
  return {
    ...data,
    trips: data.trips.map((t) => (t.id === tripId ? { ...t, travellerIds: everyone ? undefined : ids } : t)),
  };
}
