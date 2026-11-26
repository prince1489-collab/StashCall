import { describe, expect, it } from 'vitest';
import { driverMessage, fillMessage, rideFrom, rideTo, uberUrl, whatsappUrl } from '../rides';
import type { FlightLeg } from '../types';

const qp = { departure: '2026-12-06T07:00', timeZone: 'Asia/Kolkata', airport: 'BOM', destination: 'PGH', flightNumber: 'QP1111', terminal: 'T2' } as FlightLeg;

describe('rides', () => {
  it('writes the English message for the ride to the airport', () => {
    expect(driverMessage(rideTo(qp, { day: 'Sun 6 Dec', time: '05:00' }, 'home'), undefined)).toBe(
      'Hi, could you pick me up from home on Sun 6 Dec at 05:00 for Mumbai airport (BOM), Terminal 2? My flight QP1111 leaves at 07:00. Thanks!',
    );
  });

  it('uses the last flight for the ride from the airport', () => {
    const j = { ...qp, lands: '2026-12-06T13:15', connections: [{ departure: '2026-12-06T12:00', timeZone: 'Asia/Kolkata', flightNumber: '6E7415' }] } as FlightLeg;
    const r = rideFrom(j, { day: 'Sun 6 Dec', time: '13:45' }, 'hotel')!;
    expect(driverMessage(r, undefined, true)).toBe(
      'Hi, could you pick me up from Pantnagar airport (PGH) on Sun 6 Dec at 13:45? My flight 6E7415 lands at 13:15. Please take me to the hotel. Thanks!',
    );
    expect(rideFrom(qp, { day: '', time: '' }, 'hotel')).toBeUndefined();
  });

  it('fills a template in any language, dropping blanks it has nothing for', () => {
    const r = rideTo({ ...qp, flightNumber: undefined }, { day: 'रवि 6 दिसंबर', time: '05:00' }, 'home');
    expect(driverMessage(r, 'नमस्ते, {day} को {time} बजे {to} जाना है। फ्लाइट {flight}')).toBe(
      'नमस्ते, रवि 6 दिसंबर को 05:00 बजे Mumbai airport (BOM), Terminal 2 जाना है। फ्लाइट',
    );
    expect(fillMessage('Hi {name}', { day: '', time: '', from: '', to: '', flightTime: '' })).toBe('Hi {name}');
  });

  it('builds WhatsApp and Uber links', () => {
    expect(whatsappUrl('Hi & bye')).toBe('https://wa.me/?text=Hi%20%26%20bye');
    expect(uberUrl('Mumbai airport (BOM)')).toContain('dropoff%5Bnickname%5D=Mumbai+airport+%28BOM%29');
    expect(uberUrl()).not.toContain('dropoff');
  });
});
