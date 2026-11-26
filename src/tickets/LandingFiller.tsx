import { useEffect } from 'react';

import { fillLandings, needsLandings } from '../domain/landings';
import type { TicketDetails } from '../domain/ticketParse';
import { useAppData } from '../state/AppData';
import { readTicket } from './readTicket';

/** Tickets being read now, so a change to the data meanwhile doesn't read them twice. */
const read = new Set<string>();

/**
 * Fills in landing times from the tickets already saved on a trip, for
 * trips made before StashCall read them. Each ticket is read on the
 * phone once (the trip remembers which were read); a time found is saved
 * like an edit, so it reaches the family's phones too. Renders nothing.
 */
export function LandingFiller() {
  const { ready, data, update } = useAppData();

  useEffect(() => {
    if (!ready) return;
    const now = new Date();
    const todo = data.trips
      .filter((t) => needsLandings(t, now))
      .map((t) => ({ id: t.id, tickets: (t.tickets ?? []).filter((k) => k.uri && !read.has(k.id) && !t.landsRead?.includes(k.id)) }))
      .filter((t) => t.tickets.length > 0);
    if (todo.length === 0) return;
    for (const t of todo) for (const k of t.tickets) read.add(k.id);
    (async () => {
      for (const t of todo) {
        const readings: TicketDetails[] = [];
        for (const k of t.tickets) readings.push((await readTicket(k.uri)).details);
        await update((d) => ({
          ...d,
          trips: d.trips.map((x) => {
            if (x.id !== t.id) return x;
            // Remember these were read, found or not, on every phone.
            const landsRead = [...new Set([...(x.landsRead ?? []), ...t.tickets.map((k) => k.id)])];
            return { ...(fillLandings(x, readings) ?? x), landsRead };
          }),
        }));
      }
    })().catch(() => {});
  }, [ready, data.trips, update]);

  return null;
}
