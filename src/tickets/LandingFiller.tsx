import { useEffect } from 'react';

import { fillLandings, needsLandings } from '../domain/landings';
import type { TicketDetails } from '../domain/ticketParse';
import { upcomingTrips } from '../domain/trips';
import { useAppData } from '../state/AppData';
import { readTicket } from './readTicket';

/** Tickets read this session, so each is read once however often data changes. */
const read = new Set<string>();

/**
 * Fills in landing times from the tickets already saved on a trip, for
 * trips made before StashCall read them. Each ticket is read on the
 * phone, once per session; a time found is saved like an edit, so it
 * reaches the family's phones too. Renders nothing.
 */
export function LandingFiller() {
  const { ready, data, update } = useAppData();

  useEffect(() => {
    if (!ready) return;
    const todo = upcomingTrips(data.trips, new Date())
      .filter(needsLandings)
      .map((t) => ({ id: t.id, tickets: (t.tickets ?? []).filter((k) => k.uri && !read.has(k.id)) }))
      .filter((t) => t.tickets.length > 0);
    if (todo.length === 0) return;
    for (const t of todo) for (const k of t.tickets) read.add(k.id);
    (async () => {
      for (const t of todo) {
        const readings: TicketDetails[] = [];
        for (const k of t.tickets) readings.push((await readTicket(k.uri)).details);
        await update((d) => ({
          ...d,
          trips: d.trips.map((x) => (x.id === t.id ? (fillLandings(x, readings) ?? x) : x)),
        }));
      }
    })().catch(() => {});
  }, [ready, data.trips, update]);

  return null;
}
