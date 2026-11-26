import { describe, expect, it } from 'vitest';
import { driverMessage, fillMessage, rideFrom, rideTo, trafficUrl, uberUrl, whatsappUrl } from '../rides';
import type { FlightLeg } from '../types';
import { terminalPin } from '../airportPins';

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
    const pin = terminalPin('BOM', 'T2');
    expect(uberUrl('Mumbai airport (BOM), Terminal 2', pin)).toContain('dropoff%5Blatitude%5D=19.097591&dropoff%5Blongitude%5D=72.874558');
    // Another Mumbai terminal, or no terminal: no guessing.
    expect(terminalPin('BOM', 'T1')).toBeUndefined();
    expect(terminalPin('BOM')).toBeUndefined();
    expect(terminalPin('PGH')).toEqual({ lat: 29.033755, lng: 79.468833 });
    expect(terminalPin('UDR', 'T1')).toEqual({ lat: 24.61835, lng: 73.89845 });
  });
});

describe('traffic', () => {
  it('opens Google Maps driving to the departure terminal', () => {
    expect(trafficUrl('BOM', 'T2')).toBe('https://www.google.com/maps/dir/?api=1&destination=Mumbai+airport+BOM+Terminal+2&travelmode=driving');
    expect(trafficUrl('PGH')).toContain('destination=Pantnagar+airport+PGH&');
  });

  it('sends the ride to the hotel or home pin when there is one', () => {
    const hotel = { name: 'Hotel Lakeview, Nainital', lat: 29.3945, lng: 79.4521 };
    const j = { ...qp, lands: '2026-12-06T13:15' } as FlightLeg;
    const r = rideFrom(j, { day: 'Sun 6 Dec', time: '13:45' }, 'hotel', hotel)!;
    expect(driverMessage(r, undefined, true)).toBe(
      'Hi, could you pick me up from Pantnagar airport (PGH) on Sun 6 Dec at 13:45? My flight QP1111 lands at 13:15. Please take me to Hotel Lakeview, Nainital. https://maps.google.com/?q=29.3945,79.4521 Thanks!',
    );
    const back = rideTo(qp, { day: 'Tue 8 Dec', time: '10:00' }, 'hotel', { lat: 29.3945, lng: 79.4521 });
    expect(back.from).toBe('the hotel');
    expect(back.map).toBe('https://maps.google.com/?q=29.3945,79.4521');
    const url = uberUrl(r.to, hotel, { lat: 29.03, lng: 79.46 });
    expect(url).toContain('dropoff%5Blatitude%5D=29.3945');
    expect(url).toContain('pickup%5Blatitude%5D=29.03&pickup%5Blongitude%5D=79.46');
    expect(url).not.toContain('my_location');
  });
});
