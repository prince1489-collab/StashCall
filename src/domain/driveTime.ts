import { airportPoint } from './airportPins';
import { AIRPORTS } from './airports';
import type { Place } from './places';
import { travellers } from './people';
import type { FlightLeg, Person, Trip } from './types';

/**
 * Rough drive times from the map, with no traffic service: the straight-line
 * distance, stretched for roads that wind, at town or highway speed, rounded
 * up to the next quarter hour. Good enough to plan a day by; people can
 * still change it on the trip.
 */
const ROAD_FACTOR = 1.6;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function driveMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const road = distanceKm(a, b) * ROAD_FACTOR;
  // Town traffic for short hops, open road beyond.
  const speed = road < 20 ? 20 : 30;
  return Math.max(15, Math.ceil(((road / speed) * 60) / 15) * 15);
}

/** One drive time a pin changes: "Pantnagar airport to the hotel, about 2 h". */
export interface DriveChange {
  airport: string;
  minutes: number;
}

type Leg = FlightLeg | null | undefined;

/**
 * The trip with the hotel's drive times: from each landing airport to the
 * hotel, and from the hotel to each airport on the way home, for everyone.
 */
export function withStayTimes(trip: Trip, stay: Place): { trip: Trip; changes: DriveChange[] } {
  const changes: DriveChange[] = [];
  const note = (code: string, minutes: number) => {
    if (!changes.some((c) => c.airport === code)) changes.push({ airport: code, minutes });
  };
  const there = <T extends Leg>(f: T): T => {
    const p = f && airportPoint(f.destination);
    if (!f || !p) return f;
    const minutes = driveMinutes(p, stay);
    note(f.destination!, minutes);
    return { ...f, onwardMinutes: minutes };
  };
  const back = <T extends Leg>(f: T): T => {
    const p = f && airportPoint(f.airport, f.terminal);
    if (!f || !p) return f;
    const minutes = driveMinutes(stay, p);
    note(f.airport!, minutes);
    return { ...f, travelMinutes: minutes };
  };
  const next: Trip = { ...trip, flight: there(trip.flight), returnFlight: back(trip.returnFlight) };
  if (trip.personFlights) {
    next.personFlights = Object.fromEntries(
      Object.entries(trip.personFlights).map(([id, p]) => [id, { ...p, flight: there(p.flight), returnFlight: back(p.returnFlight) }]),
    );
  }
  return { trip: next, changes };
}

/**
 * The trip with this phone's person's drive times from home: to the airport
 * on the way out, and from the airport on the way back. On their own flights
 * when they have them; on the trip's when nobody else going uses those, so
 * the trip's flights keep reaching them; otherwise as their own copy, so
 * someone else's day doesn't move to fit this home.
 */
export function withHomeTimes(trip: Trip, meId: string | undefined, home: Place, people: Person[] = []): { trip: Trip; changes: DriveChange[] } {
  const changes: DriveChange[] = [];
  const note = (code: string, minutes: number) => {
    if (!changes.some((c) => c.airport === code)) changes.push({ airport: code, minutes });
  };
  const out = (f: FlightLeg): FlightLeg | undefined => {
    const p = airportPoint(f.airport, f.terminal);
    if (!p) return undefined;
    const minutes = driveMinutes(home, p);
    note(f.airport!, minutes);
    return { ...f, travelMinutes: minutes };
  };
  const inbound = (f: FlightLeg): FlightLeg | undefined => {
    const p = airportPoint(f.destination);
    if (!p) return undefined;
    const minutes = driveMinutes(p, home);
    note(f.destination!, minutes);
    return { ...f, onwardMinutes: minutes };
  };
  const others = travellers(trip, people).filter((p) => p.id !== meId);
  let next = trip;
  for (const [key, set] of [['flight', out], ['returnFlight', inbound]] as const) {
    const own = meId ? next.personFlights?.[meId] : undefined;
    const mine = own?.[key];
    if (mine === null) continue;
    const leg = mine ?? next[key];
    if (!leg) continue;
    const changed = set(leg);
    if (!changed) continue;
    const othersShare = others.some((p) => next.personFlights?.[p.id]?.[key] === undefined);
    if (mine || (meId && othersShare)) {
      next = { ...next, personFlights: { ...next.personFlights, [meId!]: { ...own, [key]: changed } } };
    } else {
      next = { ...next, [key]: changed };
    }
  }
  return { trip: next, changes };
}

/** "Pantnagar airport, about 2 h; Mumbai airport, about 45 min". */
export function describeChanges(changes: DriveChange[], fmt: (m: number) => string): string {
  return changes.map((c) => `${AIRPORTS[c.airport]?.city ?? c.airport} airport: about ${fmt(c.minutes)}`).join('\n');
}
