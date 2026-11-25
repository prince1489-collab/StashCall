import { describe, expect, it } from 'vitest';

import { defaultFlight } from '../timeline';
import { nextTrip, pastTrips, upcomingTrips } from '../trips';
import type { Trip } from '../types';

const trip = (id: string, departure?: string): Trip => ({
  id,
  name: id,
  flight: departure ? defaultFlight(departure, 'Asia/Kolkata', false) : undefined,
  itemIds: [],
  ticked: {},
  createdAt: '',
});

const now = new Date('2026-11-24T10:00:00Z');
const delhi = trip('delhi', '2026-12-06T07:00');
const london = trip('london', '2027-02-10T09:00');
const goa = trip('goa', '2026-10-01T07:00');
const draft = trip('draft');

describe('trips list', () => {
  it('puts the soonest trip first, whatever order they were added in', () => {
    expect(upcomingTrips([london, goa, delhi, draft], now).map((t) => t.id)).toEqual(['delhi', 'london', 'draft']);
  });

  it('lists trips that are over, latest first', () => {
    expect(pastTrips([london, goa, delhi], now).map((t) => t.id)).toEqual(['goa']);
  });

  it('opens on the next trip, or the last one when none is coming', () => {
    expect(nextTrip([london, goa, delhi], now)?.id).toBe('delhi');
    expect(nextTrip([goa], now)?.id).toBe('goa');
    expect(nextTrip([], now)).toBeUndefined();
  });
});

describe('trip dates and names', () => {
  it('shows the travel days compactly', async () => {
    const { formatTripDays } = await import('../trips');
    const t = { ...delhi, returnFlight: defaultFlight('2026-12-08T13:20', 'Asia/Kolkata', false) };
    expect(formatTripDays(t, 2026)).toBe('6–8 Dec');
    expect(formatTripDays(london, 2026)).toBe('10 Feb 2027');
    expect(formatTripDays({ ...delhi, returnFlight: defaultFlight('2027-01-03T10:00', 'Asia/Kolkata', false) }, 2026)).toBe('6 Dec – 3 Jan 2027');
    expect(formatTripDays(draft, 2026)).toBe('No date yet');
  });

  it('names a trip after where it ends', async () => {
    const { autoTripName } = await import('../trips');
    const { AIRPORTS } = await import('../airports');
    const city = (c: string) => AIRPORTS[c]?.city;
    expect(autoTripName({ ...delhi.flight!, destination: 'PGH' }, city)).toBe('Pantnagar in December');
    expect(autoTripName(delhi.flight, city)).toBeUndefined();
  });

  it('knows a made-up name from one the user typed', async () => {
    const { isAutoName } = await import('../trips');
    const { AIRPORTS } = await import('../airports');
    const city = (c: string) => AIRPORTS[c]?.city;
    const f = { ...delhi.flight!, airport: 'BOM', destination: 'PGH', connections: [{ departure: '2026-12-06T12:00', timeZone: 'Asia/Kolkata', airport: 'DEL', destination: 'PGH' }] };
    expect(isAutoName('Delhi in December', f, city)).toBe(true);
    expect(isAutoName('Pantnagar in December', f, city)).toBe(true);
    expect(isAutoName('My trip', f, city)).toBe(true);
    expect(isAutoName('Family wedding', f, city)).toBe(false);
    expect(isAutoName('Mumbai in December', f, city)).toBe(false);
  });
});
