import { AIRPORTS } from './airports';
import { addMinutes, timeLabel } from './time';
import { EXIT_MINUTES } from './timeline';
import type { FlightLeg, TimelineStep, Trip } from './types';

/**
 * Getting a ride to and from the airport: a message to send a driver, and a
 * link that opens Uber. Nothing is booked or sent without the person
 * pressing Send.
 */

/** "Mumbai airport (BOM), Terminal 2". */
export function airportLabel(code: string | undefined, terminal?: string): string {
  const a = code ? AIRPORTS[code] : undefined;
  const name = a ? `${a.city} airport (${a.code})` : code ? `the airport (${code})` : 'the airport';
  const t = terminal?.replace(/^T\s*/i, '');
  return t ? `${name}, Terminal ${t}` : name;
}

/** The blanks a driver message can use, and what each holds. */
export const BLANKS: { key: string; means: string }[] = [
  { key: 'day', means: 'pickup day, e.g. Sun 6 Dec' },
  { key: 'time', means: 'pickup time, e.g. 05:00' },
  { key: 'from', means: 'where to pick you up, e.g. home, or Delhi airport (DEL)' },
  { key: 'to', means: 'where you are going, e.g. Mumbai airport (BOM), Terminal 2' },
  { key: 'flight', means: 'flight number, e.g. QP1111' },
  { key: 'flightTime', means: 'when the flight leaves or lands, e.g. 07:00' },
];

export const DEFAULT_TO_AIRPORT =
  'Hi, could you pick me up from {from} on {day} at {time} for {to}? My flight {flight} leaves at {flightTime}. Thanks!';
export const DEFAULT_FROM_AIRPORT =
  'Hi, could you pick me up from {from} on {day} at {time}? My flight {flight} lands at {flightTime}. Please take me to {to}. Thanks!';

export interface Ride {
  day: string;
  time: string;
  from: string;
  to: string;
  flight?: string;
  flightTime: string;
}

/** Fills a message's blanks. A blank with nothing to put in goes, with any space before it. */
export function fillMessage(template: string, ride: Ride): string {
  const values: Record<string, string | undefined> = { ...ride };
  return template
    .replace(/\s?\{(\w+)\}/g, (m, k: string) => {
      const v = values[k];
      if (!(k in values) && !BLANKS.some((b) => b.key === k)) return m;
      return v ? `${m.startsWith(' ') ? ' ' : ''}${v}` : '';
    })
    .trim();
}

/** The ride to the airport for a flight. */
export function rideTo(f: FlightLeg, pickup: { day: string; time: string } | undefined, from: 'home' | 'hotel'): Ride {
  return {
    day: pickup?.day ?? '',
    time: pickup?.time ?? '',
    from: from === 'home' ? 'home' : 'the hotel',
    to: airportLabel(f.airport, f.terminal),
    flight: f.flightNumber,
    flightTime: f.departure.slice(11, 16),
  };
}

/** A message for a driver: the person's own wording if they wrote one, else ours. */
export function driverMessage(ride: Ride, template: string | undefined, fromAirport = false): string {
  return fillMessage(template?.trim() || (fromAirport ? DEFAULT_FROM_AIRPORT : DEFAULT_TO_AIRPORT), ride);
}

/** WhatsApp with the message written; the person picks who to send it to. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Opens Uber from where the person is, with the drop-off named when we know it. */
export function uberUrl(dropoff?: string): string {
  const q = new URLSearchParams({ action: 'setPickup', pickup: 'my_location', ...(dropoff && { 'dropoff[nickname]': dropoff }) });
  return `https://m.uber.com/ul/?${q.toString()}`;
}

/**
 * The ride from the airport after the journey's last flight lands: pickup
 * half an hour after landing, at the destination airport.
 */
export function rideFrom(f: FlightLeg, pickup: { day: string; time: string }, place: 'home' | 'hotel'): Ride | undefined {
  if (!f.lands) return undefined;
  const last = f.connections?.length ? f.connections[f.connections.length - 1] : undefined;
  return {
    day: pickup.day,
    time: pickup.time,
    from: airportLabel(f.destination),
    to: place === 'home' ? 'home' : 'the hotel',
    flight: last ? last.flightNumber : f.flightNumber,
    flightTime: f.lands.slice(11, 16),
  };
}

/**
 * Google Maps, driving from wherever the phone is to the departure
 * terminal: live traffic and the drive time right now. Free, no key.
 */
export function trafficUrl(code: string, terminal?: string): string {
  const a = AIRPORTS[code];
  const t = terminal?.replace(/^T\s*/i, '');
  const place = [a ? `${a.city} airport ${code}` : `${code} airport`, t && `Terminal ${t}`].filter(Boolean).join(' ');
  const q = new URLSearchParams({ api: '1', destination: place, travelmode: 'driving' });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/**
 * Taps on the timeline: "Check in" on check-in opening, "Check traffic"
 * when it's time to leave, "Message a driver" on booking the ride and on
 * landing.
 */
export function stepAction(
  s: TimelineStep,
  steps: TimelineStep[],
  plan: Pick<Trip, 'flight' | 'returnFlight'>,
  templates: { toAirport?: string; fromAirport?: string } | undefined,
): { label: string; url: string } | undefined {
  const day = (d: Date, tz: string) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  if (s.kind === 'checkin') return s.link ? { label: 'Check in', url: s.link } : undefined;
  if (s.kind === 'leave' || s.kind === 'returnLeave') {
    const f = s.kind === 'returnLeave' ? plan.returnFlight : plan.flight;
    return f?.airport ? { label: 'Check traffic', url: trafficUrl(f.airport, f.terminal) } : undefined;
  }
  if (s.kind === 'bookRide') {
    // Each journey's own booking step and leave time, even on the same day.
    const home = !!s.home;
    const leave = steps.find((x) => x.kind === (home ? 'returnLeave' : 'leave'));
    const f = home ? plan.returnFlight : plan.flight;
    if (!f || !leave) return undefined;
    const ride = rideTo(f, { day: day(leave.at, leave.timeZone), time: leave.localTime }, home ? 'hotel' : 'home');
    return { label: 'Message a driver', url: whatsappUrl(driverMessage(ride, templates?.toAirport)) };
  }
  if (s.kind === 'land') {
    const home = !!s.home;
    const f = home ? plan.returnFlight : plan.flight;
    if (!f) return undefined;
    const pickup = addMinutes(s.at, EXIT_MINUTES);
    const ride = rideFrom(f, { day: day(pickup, s.timeZone), time: timeLabel(pickup, s.timeZone) }, home ? 'home' : 'hotel');
    return ride ? { label: 'Message a driver', url: whatsappUrl(driverMessage(ride, templates?.fromAirport, true)) } : undefined;
  }
  return undefined;
}
