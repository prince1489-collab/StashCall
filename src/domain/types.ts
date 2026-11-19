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

export interface Owner {
  id: string;
  name: string;
}

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
  airport?: string;
}

export interface HotelCheckout {
  checkout: LocalDateTime;
  timeZone: string;
  /** How long before checkout to send the room sweep reminder. */
  sweepMinutesBefore: number;
  hotelName?: string;
}

export interface Trip {
  id: string;
  name: string;
  /** A trip may have a flight, a hotel checkout, or both. */
  flight?: FlightLeg;
  checkout?: HotelCheckout;
  /** Items chosen for this trip (ids into the household item list). */
  itemIds: string[];
  /** Item ids ticked off, keyed by timeline step kind. */
  ticked: Partial<Record<StepKind, string[]>>;
  createdAt: string;
}

export type StepKind =
  | 'pack'
  | 'wake'
  | 'leaveCheck'
  | 'leave'
  | 'airport'
  | 'takeoff'
  | 'sweep'
  | 'checkout';

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
}
