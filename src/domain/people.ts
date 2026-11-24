import type { AppData } from '../storage/store';
import type { FlightLeg, Item, LocalDate, Person, PersonFlights, Trip } from './types';

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
    // A trip only they were going on keeps an empty list, not "everyone".
    trips: data.trips.map((t) => (t.travellerIds ? { ...t, travellerIds: t.travellerIds.filter((x) => x !== id) } : t)),
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

/**
 * The trip as one person travels it: their own flights where they have
 * them, the trip's otherwise. Everything else (hotel, items, ticks) is shared.
 */
export function tripFor(trip: Trip, personId?: string): Trip {
  const own = personId ? trip.personFlights?.[personId] : undefined;
  if (!own) return trip;
  const leg = (mine: FlightLeg | null | undefined, shared?: FlightLeg) => (mine === null ? undefined : (mine ?? shared));
  return { ...trip, flight: leg(own.flight, trip.flight), returnFlight: leg(own.returnFlight, trip.returnFlight) };
}

const sameLeg = (a: FlightLeg | null | undefined, b?: FlightLeg) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Saves one person's flights. Flights that match the trip's are dropped, so later trip edits reach them. */
export function setPersonFlights(data: AppData, tripId: string, personId: string, flights: PersonFlights): AppData {
  return {
    ...data,
    trips: data.trips.map((t) => {
      if (t.id !== tripId) return t;
      // "Not flying" is kept as null, so it doesn't fall back to the trip's flight.
      const own: PersonFlights = {
        ...(!sameLeg(flights.flight, t.flight) && { flight: flights.flight ?? null }),
        ...(!sameLeg(flights.returnFlight, t.returnFlight) && { returnFlight: flights.returnFlight ?? null }),
      };
      const rest = { ...t.personFlights };
      delete rest[personId];
      const personFlights = 'flight' in own || 'returnFlight' in own ? { ...rest, [personId]: own } : rest;
      return { ...t, personFlights: Object.keys(personFlights).length > 0 ? personFlights : undefined };
    }),
  };
}
