import { DEFAULTS } from './defaults';
import { suggestTripName, type TicketDetails } from './ticketParse';
import { defaultFlight } from './timeline';
import type { FlightLeg, HotelCheckout } from './types';

export interface TripDraft {
  name: string;
  flight?: FlightLeg;
  checkout?: HotelCheckout;
}

/**
 * Turns what was read off a ticket into trip form values. The departure is in
 * the departure airport's zone when we know the airport, else `fallbackZone`.
 * A hotel zone taken from the arrival airport counts as chosen.
 */
export function draftFromTicket(d: TicketDetails, fallbackZone: string): TripDraft {
  const international = d.from && d.to ? d.from.country !== d.to.country : true;
  const flight = d.departure
    ? { ...defaultFlight(d.departure, d.from?.timeZone ?? fallbackZone, international), airport: d.from?.code }
    : undefined;
  const checkout: HotelCheckout | undefined = d.checkout
    ? {
        checkout: d.checkout,
        timeZone: d.to?.timeZone ?? fallbackZone,
        sweepMinutesBefore: DEFAULTS.sweepMinutesBefore,
        timeZoneConfirmed: !!d.to,
      }
    : undefined;
  return { name: suggestTripName(d), flight, checkout };
}
