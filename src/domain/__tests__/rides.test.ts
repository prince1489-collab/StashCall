import { describe, expect, it } from 'vitest';
import { driverMessage, uberUrl, whatsappUrl } from '../rides';
import type { FlightLeg } from '../types';

const qp = { departure: '2026-12-06T07:00', timeZone: 'Asia/Kolkata', airport: 'BOM', flightNumber: 'QP1111', terminal: 'T2' } as FlightLeg;

describe('rides', () => {
  it('writes a message for the driver', () => {
    expect(driverMessage(qp, { day: 'Sun 6 Dec', time: '05:00' }, 'home')).toBe(
      'Hi, could you pick me up from home on Sun 6 Dec at 05:00 for Mumbai airport (BOM), Terminal 2? My flight QP1111 leaves at 07:00. Thanks!',
    );
    expect(driverMessage({ ...qp, terminal: undefined, flightNumber: undefined }, undefined, 'hotel')).toBe(
      'Hi, could you pick me up from the hotel for Mumbai airport (BOM)? My flight leaves at 07:00. Thanks!',
    );
  });

  it('builds WhatsApp and Uber links', () => {
    expect(whatsappUrl('Hi & bye')).toBe('https://wa.me/?text=Hi%20%26%20bye');
    expect(uberUrl(qp)).toContain('dropoff%5Bnickname%5D=Mumbai+airport+%28BOM%29%2C+Terminal+2');
  });
});
