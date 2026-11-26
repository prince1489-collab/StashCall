import { describe, expect, it } from 'vitest';

import { AIRPORTS } from '../airports';
import { journeyFlights, namedOn, sortJourneys } from '../journeys';
import type { TicketDetails } from '../ticketParse';

const A = AIRPORTS;
// Mahiman's two bookings: Mumbai–Delhi return, and Delhi–Pantnagar return.
const mumbai: TicketDetails = {
  flightNumber: '6E2134', from: A.BOM, to: A.DEL, departure: '2026-12-06T07:00',
  returnFlight: { flightNumber: '6E2051', from: A.DEL, to: A.BOM, departure: '2026-12-08T17:45' },
};
const pantnagar: TicketDetails = {
  flightNumber: '6E7415', from: A.DEL, to: A.PGH, departure: '2026-12-06T12:00', terminal: 'T1',
  returnFlight: { flightNumber: '6E7414', from: A.PGH, to: A.DEL, departure: '2026-12-08T13:20' },
};
const route = (f?: { airport?: string; destination?: string; connections?: { airport?: string }[] }) =>
  f ? [f.airport, ...(f.connections ?? []).map((c) => c.airport), f.destination].join(' ') : '';

describe('sorting screenshots into journeys', () => {
  it('makes the way there and the way home, whatever order the screenshots come in', () => {
    for (const order of [[mumbai, pantnagar], [pantnagar, mumbai]]) {
      const s = sortJourneys(order, 'Asia/Kolkata');
      expect(route(s.flight)).toBe('BOM DEL PGH');
      expect(route(s.returnFlight)).toBe('PGH DEL BOM');
      expect(s.flight?.international).toBe(false);
      expect(s.between).toEqual([]);
    }
  });

  it('counts the same flight on two screenshots once', () => {
    const s = sortJourneys([mumbai, mumbai, pantnagar], 'Asia/Kolkata');
    expect(s.flight?.connections).toHaveLength(1);
  });

  it('keeps journeys in between, for multi-stop trips', () => {
    const goa: TicketDetails = { from: A.PGH, to: A.GOI, departure: '2026-12-07T09:00' };
    const s = sortJourneys([{ ...mumbai, returnFlight: { ...mumbai.returnFlight!, from: A.GOI, departure: '2026-12-10T10:00' } }, { ...pantnagar, returnFlight: undefined }, goa], 'Asia/Kolkata');
    expect(route(s.flight)).toBe('BOM DEL PGH');
    expect(s.between.map(route)).toEqual(['PGH GOI']);
    expect(route(s.returnFlight)).toBe('GOI BOM');
  });

  it("keeps a booking's own flight home apart, even on a day trip", () => {
    const day: TicketDetails = { ...mumbai, returnFlight: { ...mumbai.returnFlight!, departure: '2026-12-06T19:00' } };
    const s = sortJourneys([day, { from: A.GOI, to: A.BOM, departure: '2026-12-01T09:00' }], 'Asia/Kolkata');
    expect(route(s.returnFlight)).toBe('DEL BOM');
  });

  it('lists each flight of a journey', () => {
    const s = sortJourneys([mumbai, pantnagar], 'Asia/Kolkata');
    expect(journeyFlights(s.flight!).map((f) => `${f.departure.slice(11)} ${f.flightNumber} ${f.from}-${f.to}`)).toEqual([
      '07:00 6E2134 BOM-DEL',
      '12:00 6E7415 DEL-PGH',
    ]);
  });
});

describe('whose ticket', () => {
  const people = [
    { id: 'm', name: 'Mahiman' },
    { id: 'b', name: 'Bajrang' },
  ] as Parameters<typeof namedOn>[1];
  it('finds the passengers named on a ticket', () => {
    expect(namedOn('Passenger: MR BAJRANG SINGH  Seat 12C', people).map((p) => p.id)).toEqual(['b']);
    expect(namedOn('Mahiman Singh, Bajrang Singh', people).map((p) => p.id)).toEqual(['m', 'b']);
    expect(namedOn('DEL to PGH', people)).toEqual([]);
  });
});

describe('landing and the ride on', () => {
  it('lands when the last booking does, and plans the ride to the hotel', async () => {
    const { joinLegs } = await import('../ticketDraft');
    const { buildTimeline, defaultFlight } = await import('../timeline');
    const qp = { ...defaultFlight('2026-12-06T07:00', 'Asia/Kolkata', false), airport: 'BOM', destination: 'DEL', flightNumber: 'QP1111', lands: '2026-12-06T09:25' };
    const pgh = { ...defaultFlight('2026-12-06T12:00', 'Asia/Kolkata', false), airport: 'DEL', destination: 'PGH', flightNumber: '6E7415', lands: '2026-12-06T13:00' };
    const j = joinLegs({ ...qp, onwardMinutes: 45 }, pgh);
    expect(j.lands).toBe('2026-12-06T13:00');
    expect(j.onwardMinutes).toBe(45);
    // Either order of adding the screenshots.
    expect(joinLegs(pgh, qp).lands).toBe('2026-12-06T13:00');

    const steps = buildTimeline({ flight: j });
    const at = (k: string) => steps.filter((s) => s.kind === k).map((s) => `${s.localTime} ${s.title}${s.detail ? ` (${s.detail})` : ''}`);
    expect(at('land')).toEqual(['13:00 Land in Pantnagar (Ride to the hotel: about 45 min)']);
    expect(at('arrive')).toEqual(['14:15 At the hotel']);
    expect(at('checkin')).toEqual(['07:00 Web check-in opens (QP1111 · Akasa Air)', '12:00 Web check-in opens (6E7415 · IndiGo)']);
    expect(at('bookRide')).toHaveLength(1);
  });
});
