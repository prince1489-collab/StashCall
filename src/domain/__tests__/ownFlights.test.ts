import { describe, expect, it } from 'vitest';

import { EMPTY_DATA } from '../../storage/store';
import { setPersonFlights, tripFor } from '../people';
import { draftFromTicket, joinsTrip } from '../ticketDraft';
import { parseTicketText } from '../ticketParse';
import { buildTimeline, defaultFlight } from '../timeline';
import type { Trip } from '../types';

const today = new Date(2026, 10, 24);

// Mahiman: Mumbai to Delhi, then Delhi to Pantnagar.
const mine = parseTicketText(['6E 2031 BOM DEL', 'Departs 6 Dec 2026 06:10', '6E 7451 DEL PGH', 'Departs 6 Dec 2026 11:20'], today);
// Dad: Udaipur to Delhi, then the same Delhi flight.
const dads = parseTicketText(['6E 6402 UDR DEL', 'Departs 6 Dec 2026 07:45', '6E 7451 DEL PGH', 'Departs 6 Dec 2026 11:20'], today);

function trip(): Trip {
  return {
    id: 't1',
    name: 'Pantnagar in December',
    flight: draftFromTicket(mine, 'Asia/Kolkata').flight,
    itemIds: [],
    ticked: {},
    createdAt: '2026-11-24T02:00:00Z',
  };
}

describe("each person's own flights", () => {
  it('reads Udaipur and Pantnagar, as a domestic journey', () => {
    expect(dads.from?.code).toBe('UDR');
    expect(dads.to?.code).toBe('PGH');
    expect(draftFromTicket(dads, 'Asia/Kolkata').flight?.international).toBe(false);
    expect(mine.to?.code).toBe('PGH');
  });

  it("doesn't read a terminal number as a flight", () => {
    const d = parseTicketText(['6E 2031 BOM DEL', 'Terminal T1 06:10', 'Departs 6 Dec 2026 06:10'], today);
    expect(d).toMatchObject({ flightNumber: '6E2031', departure: '2026-12-06T06:10' });
  });

  it("treats Dad's ticket as joining the trip, not a new one", () => {
    expect(joinsTrip(trip(), dads)).toBe(true);
    expect(joinsTrip(trip(), mine)).toBe(false);
    const later = parseTicketText(['AI 101 DEL GOI', 'Departs 20 Dec 2026 09:00'], today);
    expect(joinsTrip(trip(), later)).toBe(false);
  });

  it("plans Dad's day from his own flight and mine from mine", () => {
    let d = { ...EMPTY_DATA, trips: [trip()] };
    d = setPersonFlights(d, 't1', 'dad', { flight: draftFromTicket(dads, 'Asia/Kolkata').flight });
    const t = d.trips[0];
    const takeoff = (x: Trip) => buildTimeline(x).find((s) => s.kind === 'takeoff')!.localTime;
    expect(takeoff(tripFor(t, 'me'))).toBe('06:10');
    expect(takeoff(tripFor(t, 'dad'))).toBe('07:45');
    expect(tripFor(t, 'dad').flight?.airport).toBe('UDR');
  });

  it('drops flights that are the same as the trip, so trip edits reach them', () => {
    let d = { ...EMPTY_DATA, trips: [trip()] };
    d = setPersonFlights(d, 't1', 'dad', { flight: d.trips[0].flight });
    expect(d.trips[0].personFlights).toBeUndefined();
    const home = defaultFlight('2026-12-08T13:00', 'Asia/Kolkata', false);
    d = setPersonFlights(d, 't1', 'dad', { flight: d.trips[0].flight, returnFlight: home });
    expect(d.trips[0].personFlights).toEqual({ dad: { returnFlight: home } });
  });
});
