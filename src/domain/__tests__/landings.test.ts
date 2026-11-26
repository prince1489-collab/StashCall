import { describe, expect, it } from 'vitest';

import { fillLandings, needsLandings } from '../landings';
import { defaultFlight } from '../timeline';
import type { Trip } from '../types';

const leg = (dep: string, extra: object) => ({ ...defaultFlight(dep, 'Asia/Kolkata', false), ...extra });
const trip: Trip = {
  id: 't',
  name: 'Wedding',
  itemIds: [],
  ticked: {},
  createdAt: '2026-11-24T00:00:00Z',
  flight: leg('2026-12-06T07:00', { flightNumber: 'QP1111', connections: [{ departure: '2026-12-06T12:00', timeZone: 'Asia/Kolkata', flightNumber: '6E7415' }] }),
  returnFlight: leg('2026-12-08T13:20', { flightNumber: '6E7414', connections: [{ departure: '2026-12-08T17:45', timeZone: 'Asia/Kolkata', flightNumber: '6E328' }] }),
  personFlights: { b: { flight: leg('2026-12-06T08:55', { flightNumber: '6E2008', lands: '2026-12-06T13:10' }), returnFlight: leg('2026-12-08T13:20', { flightNumber: '6E7414', connections: [{ departure: '2026-12-08T18:00', timeZone: 'Asia/Kolkata', flightNumber: '6E6228' }] }) } },
};

describe('landing times from saved tickets', () => {
  it("fills in each journey's landing from its last flight", () => {
    const t = fillLandings(trip, [
      { flightNumber: 'QP1111', departure: '2026-12-06T07:00', arrival: '2026-12-06T09:10', connections: [{ flightNumber: '6E 7415', departure: '2026-12-06T12:00', arrival: '2026-12-06T13:10' }] },
      { flightNumber: '6E7414', departure: '2026-12-08T13:20', connections: [{ flightNumber: '6E328', departure: '2026-12-08T17:45', arrival: '2026-12-08T20:05' }] },
      { flightNumber: '6E6228', departure: '2026-12-08T18:00', arrival: '2026-12-08T19:30' },
    ])!;
    expect(t.flight?.lands).toBe('2026-12-06T13:10');
    expect(t.returnFlight?.lands).toBe('2026-12-08T20:05');
    expect(t.personFlights?.b.returnFlight?.lands).toBe('2026-12-08T19:30');
    // Typed in already: kept.
    expect(t.personFlights?.b.flight?.lands).toBe('2026-12-06T13:10');
    expect(needsLandings(t)).toBe(false);
  });

  it('leaves the trip alone when no ticket says when the last flight lands', () => {
    expect(fillLandings(trip, [{ flightNumber: '6E328', departure: '2026-12-09T17:45', arrival: '2026-12-09T20:05' }])).toBeUndefined();
    expect(needsLandings(trip)).toBe(true);
  });
});

describe('which trips still need landing times', () => {
  it('counts a journey in the air, and stops a day after its last flight left', () => {
    const oneWay: Trip = { ...trip, returnFlight: undefined, personFlights: undefined };
    // 6E7415 left Delhi at 12:00 IST (06:30 UTC); not landed yet.
    expect(needsLandings(oneWay, new Date('2026-12-06T07:00:00Z'))).toBe(true);
    expect(needsLandings(oneWay, new Date('2026-12-07T07:00:00Z'))).toBe(false);
  });
});
