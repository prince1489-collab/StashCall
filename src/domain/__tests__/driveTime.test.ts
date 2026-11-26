import { describe, expect, it } from 'vitest';

import { distanceKm, driveMinutes, withHomeTimes, withStayTimes } from '../driveTime';
import type { FlightLeg, Trip } from '../types';

const leg = (o: Partial<FlightLeg>) =>
  ({ departure: '2026-12-06T07:00', timeZone: 'Asia/Kolkata', international: false, travelMinutes: 60, bufferMinutes: 120, getReadyMinutes: 60, packTime: '20:00', ...o }) as FlightLeg;

const trip: Trip = {
  id: 't',
  name: 'Wedding',
  itemIds: [],
  ticked: {},
  createdAt: '',
  flight: leg({ airport: 'BOM', terminal: 'T2', destination: 'PGH' }),
  returnFlight: leg({ departure: '2026-12-08T13:20', airport: 'PGH', destination: 'BOM' }),
  personFlights: {
    dad: { flight: leg({ airport: 'UDR', destination: 'PGH' }), returnFlight: leg({ departure: '2026-12-08T13:20', airport: 'PGH', destination: 'UDR' }) },
  },
};

const hotel = { lat: 29.323726, lng: 79.586736 };
const home = { lat: 19.02139, lng: 72.85727 };

describe('drive times from the map', () => {
  it('estimates from the distance, rounded up to a quarter hour', () => {
    expect(Math.round(distanceKm(hotel, { lat: 29.033755, lng: 79.468833 }))).toBe(34);
    expect(driveMinutes(hotel, { lat: 29.033755, lng: 79.468833 })).toBe(120);
    expect(driveMinutes(home, { lat: 19.097591, lng: 72.874558 })).toBe(45);
    expect(driveMinutes(home, home)).toBe(15);
  });

  it('sets the hotel drives for everyone on the trip', () => {
    const { trip: t, changes } = withStayTimes(trip, hotel);
    expect(t.flight?.onwardMinutes).toBe(120);
    expect(t.returnFlight?.travelMinutes).toBe(120);
    expect(t.personFlights?.dad.flight?.onwardMinutes).toBe(120);
    expect(t.personFlights?.dad.returnFlight?.travelMinutes).toBe(120);
    // The flight out still leaves from home as before.
    expect(t.flight?.travelMinutes).toBe(60);
    expect(changes).toEqual([{ airport: 'PGH', minutes: 120 }]);
  });

  it('sets home drives on this person’s own flights only', () => {
    const mine = withHomeTimes(trip, 'me', home);
    expect(mine.trip.flight?.travelMinutes).toBe(45);
    expect(mine.trip.returnFlight?.onwardMinutes).toBe(45);
    expect(mine.trip.personFlights?.dad.flight?.travelMinutes).toBe(60);
    // Dad's flights are his own: Udaipur has a pin, his trip's legs don't change.
    const dads = withHomeTimes(trip, 'dad', { lat: 24.58, lng: 73.71 });
    expect(dads.trip.flight?.travelMinutes).toBe(60);
    expect(dads.trip.personFlights?.dad.flight?.travelMinutes).toBe(dads.changes[0].minutes);
  });

  it('keeps someone else on the trip’s flights from moving to fit this home', () => {
    const people = [{ id: 'me', name: 'Me' }, { id: 'kid', name: 'Kid' }];
    const shared = { ...trip, personFlights: undefined };
    const r = withHomeTimes(shared, 'me', home, people);
    expect(r.trip.flight?.travelMinutes).toBe(60);
    expect(r.trip.personFlights?.me.flight?.travelMinutes).toBe(45);
    expect(r.trip.personFlights?.me.returnFlight?.onwardMinutes).toBe(45);
    // Alone on the trip's flights: those change, and stay linked to the trip.
    const alone = withHomeTimes(trip, 'me', home, [{ id: 'me', name: 'Me' }, { id: 'dad', name: 'Dad' }]);
    expect(alone.trip.flight?.travelMinutes).toBe(45);
    expect(alone.trip.personFlights?.me).toBeUndefined();
  });
});
