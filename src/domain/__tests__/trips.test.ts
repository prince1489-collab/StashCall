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
