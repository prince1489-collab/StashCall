import { describe, expect, it } from 'vitest';

import type { CheckInDetails } from '../bookingRef';
import { findBookingRefs, isPnr, keepRefs, mergeRefs, pnrFor, withTypedPnr } from '../bookingRef';

// Made-up bookings, laid out like airline and travel-agent e-tickets.
const indigo = `IndiGo
PNR: XK7Q2M
Booking Status Confirmed
6E 2008 Udaipur (UDR) 06 Dec 2026 08:10
6E 7415 Delhi (DEL) T1 06 Dec 2026 12:00`;
const agent = `Quest Travel e-ticket
Booking ID 4410982
Airline PNR
QP9ZTA
QP 1111 Mumbai T2 06-12-2026 06:00`;

describe('findBookingRefs', () => {
  it('reads a PNR with the flights on its ticket', () => {
    expect(findBookingRefs(indigo)).toEqual([{ pnr: 'XK7Q2M', flights: ['6E2008', '6E7415'] }]);
  });

  it('reads a PNR on the line after its label, and skips an all-digit booking id', () => {
    expect(findBookingRefs(agent)).toEqual([{ pnr: 'QP9ZTA', flights: ['QP1111'] }]);
  });

  it('keeps each ticket’s flights with its own PNR when read together', () => {
    const refs = findBookingRefs(`${indigo}\n\n—\n\n${agent}`);
    expect(refs).toEqual([
      { pnr: 'XK7Q2M', flights: ['6E2008', '6E7415'] },
      { pnr: 'QP9ZTA', flights: ['QP1111'] },
    ]);
  });

  it('ignores words after PNR, like "PNR Status"', () => {
    expect(findBookingRefs('Check PNR Status online. Booking reference: ABC123')).toEqual([{ pnr: 'ABC123', flights: [] }]);
    expect(findBookingRefs(undefined)).toEqual([]);
  });

  it('needs six capitals and digits with a letter', () => {
    expect(isPnr('AB12CD')).toBe(true);
    expect(isPnr('123456')).toBe(false);
    expect(isPnr('ab12cd')).toBe(false);
  });
});

describe('pnrFor and keeping refs', () => {
  const refs = [
    { pnr: 'XK7Q2M', flights: ['6E2008', '6E7415'] },
    { pnr: 'QP9ZTA', flights: ['QP1111'] },
  ];

  it('picks the booking a check-in’s flights are on', () => {
    expect(pnrFor(refs, ['6E7415'])).toBe('XK7Q2M');
    expect(pnrFor(refs, ['QP1111'])).toBe('QP9ZTA');
    expect(pnrFor(refs, ['AI101'])).toBeUndefined();
  });

  it('uses a lone booking with no flights read beside it', () => {
    expect(pnrFor([{ pnr: 'ABC123', flights: [] }], ['6E1'])).toBe('ABC123');
  });

  it('moves a flight to a typed PNR, so a rebooking wins', () => {
    const next = withTypedPnr(refs, 'NEW9PN', ['6E7415']);
    expect(pnrFor(next, ['6E7415'])).toBe('NEW9PN');
    expect(next.find((r) => r.pnr === 'XK7Q2M')?.flights).toEqual(['6E2008']);
  });

  it('merges flights into a booking already kept', () => {
    expect(mergeRefs([{ pnr: 'ABC123', flights: ['6E1'] }], [{ pnr: 'ABC123', flights: ['6E2'] }])).toEqual([{ pnr: 'ABC123', flights: ['6E1', '6E2'] }]);
  });

  it('keeps refs per trip and leaves data alone when none were read', () => {
    const d = { checkIn: { lastName: 'Singh' } };
    expect(keepRefs(d, 't1', [])).toBe(d);
    expect(keepRefs(d, 't1', refs).checkIn).toEqual({ lastName: 'Singh', refs: { t1: refs } });
  });
});

describe('bookings per traveller', () => {
  it('keeps two people’s own PNRs for the same flight', () => {
    const mine = keepRefs<{ checkIn?: CheckInDetails }>({}, 't1', [{ pnr: 'MAH111', flights: ['6E7415'] }], 'me');
    const both = keepRefs(mine, 't1', [{ pnr: 'DAD222', flights: ['6E7415'] }], 'dad');
    const refs = both.checkIn!.refs!.t1;
    expect(pnrFor(refs, ['6E7415'], 'me')).toBe('MAH111');
    expect(pnrFor(refs, ['6E7415'], 'dad')).toBe('DAD222');
  });

  it('prefers a person’s own booking over one of unknown owner', () => {
    const refs = [
      { pnr: 'ANY333', flights: ['6E7415'] },
      { pnr: 'MAH111', flights: ['6E7415'], person: 'me' },
    ];
    expect(pnrFor(refs, ['6E7415'], 'me')).toBe('MAH111');
    expect(pnrFor(refs, ['6E7415'], 'dad')).toBe('ANY333');
  });

  it('moves a flight only between the same person’s bookings when one is typed', () => {
    const refs = [
      { pnr: 'MAH111', flights: ['6E7415'], person: 'me' },
      { pnr: 'DAD222', flights: ['6E7415'], person: 'dad' },
    ];
    const next = withTypedPnr(refs, 'NEW999', ['6E7415'], 'me');
    expect(pnrFor(next, ['6E7415'], 'me')).toBe('NEW999');
    expect(pnrFor(next, ['6E7415'], 'dad')).toBe('DAD222');
  });
});

describe('a phone with no person chosen', () => {
  it('can use anyone’s booking', () => {
    expect(pnrFor([{ pnr: 'MAH111', flights: ['6E7415'], person: 'me' }], ['6E7415'], undefined)).toBe('MAH111');
  });
});
