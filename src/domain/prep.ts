import type { AppData } from '../storage/store';
import { DEFAULTS } from './defaults';
import { addMinutes, instantToZoned, zonedToInstant } from './time';
import type { InsuranceCover, Item, LocalDateTime, PrepKind, PrepStatus, Trip } from './types';

/**
 * "Before you go": things to sort out in the weeks before a trip, which
 * can't be fixed on the morning of the flight. Travel insurance for every
 * trip (already ticked when the household has an annual or bank policy),
 * and a visa check for international flights.
 */

export interface PrepTask {
  kind: PrepKind;
  title: string;
  /** todo: still to do. covered: insured by an annual or bank policy. */
  status: 'todo' | 'covered' | PrepStatus;
  /** When the reminders for an open task go off, in time order. */
  remindAt: Date[];
  timeZone: string;
}

/** Days before travel to remind, and again if still not done. */
const REMIND_DAYS: Record<PrepKind, [number, number]> = {
  // Insurance covers cancellations too, so it is worth buying early.
  insurance: [28, 7],
  // Some visas take weeks; e-visas and ESTA/ETA forms a few days.
  visa: [42, 10],
};

export const VISA_ITEM_NAME = 'Visa or e-visa';

export function isInternational(trip: Pick<Trip, 'flight' | 'returnFlight'>): boolean {
  return !!(trip.flight?.international || trip.returnFlight?.international);
}

/** The first fixed time of the trip and its zone, plus the evening reminder time. */
function travelStart(trip: Trip): { at: Date; local: LocalDateTime; timeZone: string; evening: string } | undefined {
  const f = trip.flight ?? trip.returnFlight;
  if (f) return { at: zonedToInstant(f.departure, f.timeZone), local: f.departure, timeZone: f.timeZone, evening: f.packTime };
  const c = trip.checkout;
  if (c) return { at: zonedToInstant(c.checkout, c.timeZone), local: c.checkout, timeZone: c.timeZone, evening: DEFAULTS.packTime };
  return undefined;
}

function daysBefore(local: LocalDateTime, days: number): string {
  const [y, m, d] = local.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** The first evening reminder time at or after `from`, in `timeZone`. */
function nextEvening(from: Date, timeZone: string, evening: string): Date {
  const today = instantToZoned(from, timeZone).slice(0, 10);
  const at = zonedToInstant(`${today}T${evening}`, timeZone);
  return at.getTime() >= from.getTime() ? at : zonedToInstant(`${daysBefore(`${today}T00:00`, -1)}T${evening}`, timeZone);
}

/**
 * Reminder times for an open task. Each is fixed from the trip's dates, so
 * the plan doesn't move every time the app opens. A trip booked later than
 * the first reminder day gets it the evening after it was added.
 */
function reminderTimes(trip: Trip, kind: PrepKind): { times: Date[]; timeZone: string } {
  const start = travelStart(trip);
  if (!start) return { times: [], timeZone: 'UTC' };
  const added = new Date(trip.createdAt);
  const latest = addMinutes(start.at, -12 * 60);
  const times: Date[] = [];
  for (const days of REMIND_DAYS[kind]) {
    let at = zonedToInstant(`${daysBefore(start.local, days)}T${start.evening}`, start.timeZone);
    if (at.getTime() < added.getTime()) at = nextEvening(addMinutes(added, 60), start.timeZone, start.evening);
    if (at.getTime() <= latest.getTime() && !times.some((t) => t.getTime() === at.getTime())) times.push(at);
  }
  return { times, timeZone: start.timeZone };
}

export function prepTasks(trip: Trip, cover: InsuranceCover | undefined): PrepTask[] {
  const tasks: PrepTask[] = [];
  const insured = cover === 'annual' || cover === 'card';
  const ins = reminderTimes(trip, 'insurance');
  tasks.push({
    kind: 'insurance',
    title: 'Travel insurance',
    status: insured ? 'covered' : (trip.prep?.insurance ?? 'todo'),
    remindAt: ins.times,
    timeZone: ins.timeZone,
  });
  if (isInternational(trip)) {
    const visa = reminderTimes(trip, 'visa');
    tasks.push({
      kind: 'visa',
      title: 'Visa and entry rules',
      status: trip.prep?.visa ?? 'todo',
      remindAt: visa.times,
      timeZone: visa.timeZone,
    });
  }
  return tasks;
}

/**
 * Marks a task done, not needed, or open again. A visa that's sorted goes
 * on the packing list as a one-off item for this trip, so the morning
 * reminders name it next to the passports.
 */
export function setPrep(data: AppData, tripId: string, kind: PrepKind, status: PrepStatus | undefined, newId: () => string, now = new Date()): AppData {
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return data;
  const prep = { ...trip.prep };
  if (status) prep[kind] = status;
  else delete prep[kind];
  let items = data.items;
  let itemIds = trip.itemIds;
  const visaItem = items.find((i) => i.tripId === tripId && i.presetId === 'visa');
  if (kind === 'visa' && status === 'done' && !visaItem) {
    const item: Item = { id: newId(), name: VISA_ITEM_NAME, moment: 'home', presetId: 'visa', tripId, createdAt: now.toISOString() };
    items = [...items, item];
    itemIds = [...itemIds, item.id];
  } else if (kind === 'visa' && status !== 'done' && visaItem) {
    items = items.filter((i) => i.id !== visaItem.id);
    itemIds = itemIds.filter((x) => x !== visaItem.id);
  }
  return {
    ...data,
    items,
    trips: data.trips.map((t) => (t.id === tripId ? { ...t, prep, itemIds } : t)),
  };
}
