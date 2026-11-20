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
