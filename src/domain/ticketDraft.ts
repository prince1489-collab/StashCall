import { DEFAULTS } from './defaults';
import { suggestTripName, type FlightDetails, type TicketDetails } from './ticketParse';
import { defaultFlight } from './timeline';
import type { FlightLeg, HotelCheckout, Trip } from './types';

export interface TripDraft {
  name: string;
  flight?: FlightLeg;
  checkout?: HotelCheckout;
  returnFlight?: FlightLeg;
}

/**
 * Turns what was read off a ticket into trip form values. The departure is in
 * the departure airport's zone when we know the airport, else `fallbackZone`.
 * A hotel zone taken from the arrival airport counts as chosen.
 */
export function draftFromTicket(d: TicketDetails, fallbackZone: string): TripDraft {
  const flight = d.departure ? flightLeg(d, fallbackZone) : undefined;
  const checkout: HotelCheckout | undefined = d.checkout
    ? {
        checkout: d.checkout,
        timeZone: d.to?.timeZone ?? fallbackZone,
        sweepMinutesBefore: DEFAULTS.sweepMinutesBefore,
        timeZoneConfirmed: !!d.to,
      }
    : undefined;
  const returnFlight = d.returnFlight?.departure
    ? flightLeg(d.returnFlight, checkout?.timeZone ?? fallbackZone, !!checkout?.timeZoneConfirmed)
    : undefined;
  return { name: suggestTripName(d), flight, checkout, returnFlight };
}

/**
 * A flight from what was read. Its zone is the departure airport's when we
 * know the airport (then it counts as confirmed), else `fallbackZone`.
 */
export function flightLeg(f: FlightDetails, fallbackZone: string, fallbackConfirmed = false): FlightLeg {
  const international = f.from && f.to ? f.from.country !== f.to.country : true;
  return {
    ...defaultFlight(f.departure!, f.from?.timeZone ?? fallbackZone, international),
    airport: f.from?.code,
    destination: f.to?.code,
    timeZoneConfirmed: f.from ? true : fallbackConfirmed,
  };
}

/**
 * True when a single flight read off a screenshot looks like the way home
 * for `outbound`: it leaves later, and from where the outbound landed (or
 * we can't tell the airports).
 */
export function isReturnOf(outbound: FlightLeg, f: FlightDetails): boolean {
  if (!f.departure || f.departure <= outbound.departure) return false;
  if (f.from && outbound.destination) return f.from.code === outbound.destination;
  if (f.to && outbound.airport) return f.to.code === outbound.airport;
  return true;
}

/**
 * Someone else's flights for the same trip: a different departure that
 * lands where the trip goes, or leaves within a day of it. Dad's Udaipur
 * flight to Pantnagar joins the trip rather than starting a new one.
 */
export function joinsTrip(trip: Trip, d: TicketDetails): boolean {
  const f = trip.flight;
  if (!f || !d.departure || d.departure === f.departure) return false;
  if (d.to && f.destination && d.to.code === f.destination) return true;
  const day = (x: string) => Date.parse(`${x.slice(0, 10)}T00:00Z`);
  return Math.abs(day(d.departure) - day(f.departure)) <= 86400000;
}
