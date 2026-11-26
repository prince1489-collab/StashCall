import { useEffect } from 'react';

import { fillLandings, needsLandings } from '../domain/landings';
import type { TicketDetails } from '../domain/ticketParse';
import { useAppData } from '../state/AppData';
import { readTicket } from './readTicket';

/** Tickets tried since the app started: each is tried once per launch, read or not. */
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
        const done: string[] = [];
        for (const k of t.tickets) {
          const r = await readTicket(k.uri);
          readings.push(r.details);
          // A ticket the reader couldn't open (still downloading, say) stays
          // unmarked on the trip, so it's tried again the next time the app starts.
          if (!r.error) done.push(k.id);
        }
        if (done.length === 0) continue;
        await update((d) => ({
          ...d,
          trips: d.trips.map((x) => {
            if (x.id !== t.id) return x;
            // Remember these were read, found or not, on every phone.
            const landsRead = [...new Set([...(x.landsRead ?? []), ...done])];
            return { ...(fillLandings(x, readings) ?? x), landsRead };
          }),
        }));
      }
    })().catch(() => {});
  }, [ready, data.trips, update]);

  return null;
}
