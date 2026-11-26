/**
 * Core data model for StashCall phase 1.
 *
 * Everything lives on the device. Times the user types are kept as local
 * wall-clock strings ("YYYY-MM-DDTHH:mm") plus the IANA time zone they belong
 * to, so a trip still reads correctly if the phone changes zone mid-trip.
 */

/** A wall-clock date and time with no zone, e.g. "2026-11-27T10:00". */
export type LocalDateTime = string;

/** A wall-clock time of day, e.g. "20:00". */
export type LocalTime = string;

/** When an item needs remembering. */
export type ItemMoment = 'home' | 'checkout' | 'both';

/**
 * A person in the household. Items can belong to them, trips list who is
 * going, and each has their own passport date.
 */
export interface Owner {
  id: string;
  name: string;
  /** Children don't get their own reminders; an adult's phone covers them. */
  child?: boolean;
  /** When this person's passport runs out, if known. */
  passportExpires?: LocalDate;
  /** True once they use StashCall on their own phone, so others' phones stop covering their items. */
  ownPhone?: boolean;
  /** Where they are on a travel day, as they last said: shared with the household. */
  status?: TravelStatus;
}

/** A travel-day update: "Left for the airport" at 05:10. */
export interface TravelStatus {
  tripId: string;
  step: StatusStep;
  /** When they said so, as an ISO instant. */
  at: string;
}

export type StatusStep = 'left' | 'airport' | 'landed' | 'arrived';

/** Friendlier name for the same thing: the household's people. */
export type Person = Owner;

export interface Item {
  id: string;
  name: string;
  moment: ItemMoment;
  /** Optional: who the item belongs to. */
  ownerId?: string;
  /** Optional: local file URI of a photo kept on the device. */
  photoUri?: string;
  /** Optional free text, e.g. "lens case is by the sink". */
  note?: string;
  /** Id of the preset this came from, if any. */
  presetId?: string;
  /** Set for a one-off item that belongs to this trip only, not the saved list. */
  tripId?: string;
  createdAt: string;
}

export interface FlightLeg {
  /** Scheduled departure in the home time zone. */
  departure: LocalDateTime;
  timeZone: string;
  international: boolean;
  /** Door-to-terminal travel time. */
  travelMinutes: number;
  /** How early to be at the airport before departure. */
  bufferMinutes: number;
  /** Time between waking up and leaving home. */
  getReadyMinutes: number;
  /** Evening-before packing reminder time. */
  packTime: LocalTime;
  /** IATA code of the departure airport, e.g. "LHR". */
  airport?: string;
  /** IATA code of the arrival airport, when known. */
  destination?: string;
  /** For a flight home: true once the user has confirmed its zone. */
  timeZoneConfirmed?: boolean;
  /** e.g. "6E2008", when read from a ticket. */
  flightNumber?: string;
  /** Departure terminal, e.g. "T2". */
  terminal?: string;
  /** Later flights the same journey connects to, in order. */
  connections?: Connection[];
  /** When the journey's last flight lands, in the destination's time zone. */
  lands?: LocalDateTime;
  /** Airport to the hotel (on the way there) or home (on the way back). */
  onwardMinutes?: number;
}

/** A connecting flight: Delhi → Pantnagar after Udaipur → Delhi. */
export interface Connection {
  /** Scheduled departure, in the connecting airport's zone. */
  departure: LocalDateTime;
  timeZone: string;
  flightNumber?: string;
  /** IATA code of the airport it leaves from. */
  airport?: string;
  destination?: string;
  terminal?: string;
}

export interface HotelCheckout {
  checkout: LocalDateTime;
  timeZone: string;
  /** How long before checkout to send the room sweep reminder. */
  sweepMinutesBefore: number;
  /** True once the user has picked the hotel's zone themselves. */
  timeZoneConfirmed?: boolean;
  hotelName?: string;
}

export interface Ticket {
  id: string;
  /** Local file URI of the image. Empty while a ticket added on another family phone is still on its way. */
  uri: string;
  addedAt: string;
}

export interface Trip {
  id: string;
  name: string;
  /** A trip may have a flight, a hotel checkout, or both. */
  flight?: FlightLeg;
  checkout?: HotelCheckout;
  /** The flight home, planned from the hotel rather than from home. */
  returnFlight?: FlightLeg;
  /**
   * Flights for people who travel differently from the trip's own, keyed by
   * person id: Dad flies Udaipur to Delhi and joins the Delhi flight there.
   * Each person's phone plans their day from their own flights.
   */
  personFlights?: Record<string, PersonFlights>;
  /** Who is going, as person ids. Unset means everyone in the household. */
  travellerIds?: string[];
  /** Items chosen for this trip (ids into the household item list). */
  itemIds: string[];
  /** Screenshots of tickets, boarding passes or bookings, kept on the phone. */
  tickets?: Ticket[];
  /** This phone's own boarding passes: kept on the phone for the gate, never shared. */
  passes?: Ticket[];
  /** Things sorted before travel day, such as insurance and visas. */
  prep?: Partial<Record<PrepKind, PrepStatus>>;
  /** Photos of this trip's insurance policy or visa. */
  docs?: Partial<Record<'insurance' | 'visa', Ticket[]>>;
  /** The passport ("person:date") the passport answer was given for. */
  passportCheckedFor?: string;
  /** When the visa for this trip runs out, if the user told us. */
  visaExpires?: LocalDate;
  /** Item ids ticked off, keyed by timeline step kind. */
  ticked: Partial<Record<StepKind, string[]>>;
  /** Timeline steps ticked off, keyed by "personId|step" (see domain/stepsDone). */
  stepsDone?: Record<string, StepDone>;
  createdAt: string;
}

/** A step ticked off: who tapped it and when. */
export interface StepDone {
  /** Person id of whoever ticked it, if this phone knows who it is. */
  by?: string;
  /** ISO instant of the last tap, ticking or unticking. */
  at: string;
  /** Unticked again. Kept so it beats an older tick from another phone. */
  undone?: true;
}

/**
 * One person's own flights on a shared trip. Unset: same as the trip's.
 * null: they don't take that flight.
 */
export interface PersonFlights {
  flight?: FlightLeg | null;
  returnFlight?: FlightLeg | null;
}

/** Things to sort out in the weeks before a trip. */
export type PrepKind = 'insurance' | 'visa' | 'passport';

/** A calendar date with no time, e.g. "2027-01-23". */
export type LocalDate = string;

/** How the household is insured for travel. */
export type InsuranceCover = 'annual' | 'card' | 'perTrip';

export type PrepStatus = 'done' | 'notNeeded';

export type StepKind =
  | 'pack'
  | 'wake'
  | 'leaveCheck'
  | 'leave'
  | 'airport'
  | 'takeoff'
  | 'sweep'
  | 'checkout'
  | 'returnPack'
  | 'returnWake'
  | 'returnLeaveCheck'
  | 'returnLeave'
  | 'returnAirport'
  | 'returnTakeoff'
  | 'connection'
  | 'returnConnection'
  | 'checkin'
  | 'bookRide'
  | 'land'
  | 'arrive';

export interface TimelineStep {
  kind: StepKind;
  title: string;
  /** Absolute instant of the step. */
  at: Date;
  /** Wall-clock label in the step's own time zone, e.g. "05:15". */
  localTime: LocalTime;
  timeZone: string;
  /** True for times we worked out, false for times the user gave us. */
  estimate: boolean;
  /** Whether this step sends a reminder notification. */
  notify: boolean;
  /** Which items this step reminds about. */
  itemMoment?: 'home' | 'checkout';
  /** When its reminder goes off, if not at the step itself. */
  remindAt?: Date;
  /** A line of detail, e.g. "6E7415 to Pantnagar from T1". */
  detail?: string;
  /** A web page for the step, like the airline's check-in. */
  link?: string;
  /** True for steps of the journey home. */
  home?: boolean;
}
