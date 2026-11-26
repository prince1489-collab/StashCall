import { describe, expect, it } from 'vitest';
import { checkIns } from '../checkin';
import type { FlightLeg } from '../types';

const IST = 'Asia/Kolkata';
const leg = (departure: string, flightNumber: string, connections: FlightLeg['connections'] = []): FlightLeg =>
  ({ departure, timeZone: IST, flightNumber, connections } as FlightLeg);

describe('checkIns', () => {
  it("gives one reminder per airline on each journey, at the earliest opening", () => {
    // Mahiman's Pantnagar trip.
    const there = leg('2026-12-06T07:00', 'QP1111', [{ departure: '2026-12-06T12:00', timeZone: IST, flightNumber: '6E7415' }]);
    const home = leg('2026-12-08T13:20', '6E7414', [{ departure: '2026-12-08T17:45', timeZone: IST, flightNumber: '6E328' }]);
    const c = checkIns({ flight: there, returnFlight: home });
    expect(c.map((x) => [x.airline, x.flightNumbers, x.at.toISOString(), x.home])).toEqual([
      ['Akasa Air', ['QP1111'], '2026-12-04T01:30:00.000Z', false],
      ['IndiGo', ['6E7415'], '2026-12-04T06:30:00.000Z', false],
      ['IndiGo', ['6E7414', '6E328'], '2026-12-06T07:50:00.000Z', true],
    ]);
    expect(c[1].url).toContain('goindigo');
  });

  it('uses 24 hours and no link for an airline it does not know, and skips flights with no number', () => {
    const c = checkIns({ flight: leg('2027-02-19T02:15', 'XY123', [{ departure: '2027-02-19T09:00', timeZone: IST }]) });
    expect(c).toHaveLength(1);
    expect(c[0].at.toISOString()).toBe('2027-02-17T20:45:00.000Z');
    expect(c[0].url).toBeUndefined();
  });
});
