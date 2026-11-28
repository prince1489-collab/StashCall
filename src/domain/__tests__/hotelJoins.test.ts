import { describe, expect, it } from 'vitest';

import { hotelTripFor, withHotelCheckout } from '../ticketDraft';
import type { FlightLeg, Trip } from '../types';

const leg = (departure: string): FlightLeg => ({
  departure,
  timeZone: 'Asia/Kolkata',
  international: false,
  travelMinutes: 45,
  bufferMinutes: 120,
  getReadyMinutes: 60,
  packTime: '20:00',
});
const trip = (id: string, out: string, back?: string): Trip => ({
  id,
  name: id,
  flight: leg(out),
  returnFlight: back ? leg(back) : undefined,
  itemIds: [],
  ticked: {},
  createdAt: '2026-11-01T00:00:00Z',
});

describe('hotel booking joins its trip', () => {
  const kanpur = trip('kanpur', '2026-11-30T11:40', '2026-12-01T20:45');
  const wedding = trip('wedding', '2026-12-06T06:00', '2026-12-08T13:20');

  it('finds the trip whose stay the checkout falls in', () => {
    expect(hotelTripFor([wedding, kanpur], { checkout: '2026-12-01T12:00' })?.id).toBe('kanpur');
    expect(hotelTripFor([wedding, kanpur], { checkout: '2026-12-08T11:00' })?.id).toBe('wedding');
  });

  it('leaves a checkout outside every trip, and flight tickets, alone', () => {
    expect(hotelTripFor([wedding, kanpur], { checkout: '2027-01-10T11:00' })).toBeUndefined();
    expect(hotelTripFor([kanpur], { checkout: '2026-12-01T12:00', departure: '2026-11-30T11:40' })).toBeUndefined();
  });

  it('sets the checkout in the trip’s zone, keeping a hotel name', () => {
    const t = withHotelCheckout({ ...kanpur, checkout: { checkout: '2026-12-01T10:00', timeZone: 'Asia/Kolkata', sweepMinutesBefore: 30, hotelName: 'Landmark' } }, '2026-12-01T12:00');
    expect(t.checkout).toEqual({ checkout: '2026-12-01T12:00', timeZone: 'Asia/Kolkata', sweepMinutesBefore: 30, hotelName: 'Landmark', timeZoneConfirmed: false });
  });
});

import { parseTicketText } from '../ticketParse';

describe('reading a hotel booking', () => {
  it('reads checkout from a line of its own', () => {
    expect(parseTicketText(['Hotel Landmark, Kanpur', 'Check-in: Sun 30 Nov 2026, 14:00', 'Check-out: Mon 1 Dec 2026, 12:00'], new Date('2026-11-28')).checkout).toBe('2026-12-01T12:00');
  });

  it('reads the later date when check-in and check-out head a table', () => {
    expect(parseTicketText(['Hotel Landmark, Kanpur', 'Check-in Check-out', '30 Nov 2026 01 Dec 2026'], new Date('2026-11-28')).checkout?.slice(0, 10)).toBe('2026-12-01');
  });
});

describe('hotel zone and whose trip', () => {
  const london: Trip = {
    ...trip('london', '2027-02-19T02:00'),
    flight: { ...leg('2027-02-19T02:00'), international: true, airport: 'BOM', destination: 'LHR' },
  };

  it('puts a London checkout in London time', () => {
    expect(withHotelCheckout(london, '2027-02-21T11:00').checkout).toMatchObject({ timeZone: 'Europe/London', timeZoneConfirmed: true });
  });

  it('leaves a guessed zone unconfirmed abroad', () => {
    const noDest: Trip = { ...london, flight: { ...london.flight!, destination: undefined } };
    expect(withHotelCheckout(noDest, '2027-02-21T11:00').checkout?.timeZoneConfirmed).toBe(false);
  });

  it('skips trips this person isn’t going on', () => {
    const dads = { ...trip('dads', '2026-11-30T11:40', '2026-12-01T20:45'), travellerIds: ['dad'] };
    expect(hotelTripFor([dads], { checkout: '2026-12-01T12:00' }, 'me')).toBeUndefined();
    expect(hotelTripFor([dads], { checkout: '2026-12-01T12:00' }, 'dad')?.id).toBe('dads');
  });
});
