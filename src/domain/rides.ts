import { AIRPORTS } from './airports';
import type { FlightLeg } from './types';

/**
 * Getting a ride to the airport: a message to send a driver, and a link that
 * opens Uber. Nothing is booked or sent without the person pressing Send.
 */

/** "Mumbai airport (BOM), Terminal 2". */
export function airportLabel(f: FlightLeg): string {
  const a = f.airport ? AIRPORTS[f.airport] : undefined;
  const name = a ? `${a.city} airport (${a.code})` : f.airport ? `the airport (${f.airport})` : 'the airport';
  const t = f.terminal?.replace(/^T\s*/i, '');
  return t ? `${name}, Terminal ${t}` : name;
}

/**
 * A message for a driver: "Hi, could you pick me up from home on Sun 6 Dec
 * at 05:00 for Mumbai airport (BOM), Terminal 2? My flight QP1111 leaves at
 * 07:00. Thanks!"
 */
export function driverMessage(f: FlightLeg, pickup: { day: string; time: string } | undefined, from: 'home' | 'hotel'): string {
  const when = pickup ? ` on ${pickup.day} at ${pickup.time}` : '';
  const flight = `My flight${f.flightNumber ? ` ${f.flightNumber}` : ''} leaves at ${f.departure.slice(11, 16)}.`;
  return `Hi, could you pick me up from ${from === 'home' ? 'home' : 'the hotel'}${when} for ${airportLabel(f)}? ${flight} Thanks!`;
}

/** WhatsApp with the message written; the person picks who to send it to. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Opens Uber from where the person is, with the airport as the drop-off. */
export function uberUrl(f: FlightLeg): string {
  const q = new URLSearchParams({ action: 'setPickup', pickup: 'my_location', 'dropoff[nickname]': airportLabel(f) });
  return `https://m.uber.com/ul/?${q.toString()}`;
}
