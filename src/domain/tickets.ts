import type { AppData } from '../storage/store';
import type { Ticket } from './types';

/** Adds ticket images to a trip, newest last. */
export function addTickets(data: AppData, tripId: string, tickets: Ticket[]): AppData {
  return {
    ...data,
    trips: data.trips.map((t) => (t.id === tripId ? { ...t, tickets: [...(t.tickets ?? []), ...tickets] } : t)),
  };
}

/** Removes one ticket image from a trip. */
export function removeTicket(data: AppData, tripId: string, ticketId: string): AppData {
  return {
    ...data,
    trips: data.trips.map((t) =>
      t.id === tripId ? { ...t, tickets: (t.tickets ?? []).filter((x) => x.id !== ticketId) } : t,
    ),
  };
}

/** Adds boarding passes to a trip, on this phone only. */
export function addPasses(data: AppData, tripId: string, passes: Ticket[]): AppData {
  return {
    ...data,
    trips: data.trips.map((t) => (t.id === tripId ? { ...t, passes: [...(t.passes ?? []), ...passes] } : t)),
  };
}

/** Removes one boarding pass from a trip. */
export function removePass(data: AppData, tripId: string, passId: string): AppData {
  return {
    ...data,
    trips: data.trips.map((t) => (t.id === tripId ? { ...t, passes: (t.passes ?? []).filter((x) => x.id !== passId) } : t)),
  };
}
