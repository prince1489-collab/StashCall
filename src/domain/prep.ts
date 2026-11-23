import type { AppData } from '../storage/store';
import { DEFAULTS } from './defaults';
import { addMinutes, instantToZoned, zonedToInstant } from './time';
import type { InsuranceCover, Item, LocalDate, Ticket, LocalDateTime, PrepKind, PrepStatus, Trip } from './types';

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
  /**
   * Why a task that would be fine needs looking at again:
   * the annual policy or the visa runs out before the trip ends, or the
   * passport has less than 6 months left when the trip starts.
   */
  problem?: 'insuranceEnds' | 'visaExpires' | 'passportShort';
  /** The date behind the problem, or the known expiry date. */
  date?: LocalDate;
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
  // Passport renewals can take several weeks.
  passport: [56, 21],
};

/** What the household told us once, for every trip. */
export type PrepPrefs = Pick<AppData, 'insurance' | 'insuranceEnds' | 'passportExpires'>;

/** Countries often want 6 months left on a passport after arrival. */
export const PASSPORT_MONTHS = 6;

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

/** The first and last days of the trip, as dates. */
export function tripDates(trip: Trip): { start: LocalDate; end: LocalDate } | undefined {
  const times = [trip.flight?.departure, trip.checkout?.checkout, trip.returnFlight?.departure].filter(
    (x): x is string => !!x,
  );
  if (times.length === 0) return undefined;
  const days = times.map((t) => t.slice(0, 10)).sort();
  return { start: days[0], end: days[days.length - 1] };
}

/** "23 Jan 2027", for reminder texts. */
export function shortDate(date: LocalDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function prepTasks(trip: Trip, prefs: PrepPrefs): PrepTask[] {
  const tasks: PrepTask[] = [];
  const dates = tripDates(trip);
  const task = (kind: PrepKind, title: string, status: PrepTask['status'], extra: Partial<PrepTask> = {}): PrepTask => {
    const r = reminderTimes(trip, kind);
    return { kind, title, status, remindAt: r.times, timeZone: r.timeZone, ...extra };
  };

  // Insurance: an annual or bank policy covers the trip unless it ends first.
  const policy = prefs.insurance === 'annual' || prefs.insurance === 'card';
  const policyEndsFirst = policy && !!prefs.insuranceEnds && !!dates && prefs.insuranceEnds < dates.end;
  if (policy && !policyEndsFirst) {
    tasks.push(task('insurance', 'Travel insurance', 'covered', { date: prefs.insuranceEnds }));
  } else {
    tasks.push(
      task('insurance', 'Travel insurance', trip.prep?.insurance ?? 'todo', {
        ...(policyEndsFirst && { problem: 'insuranceEnds' as const, date: prefs.insuranceEnds }),
      }),
    );
  }

  if (isInternational(trip)) {
    // Visa: sorted, unless it runs out before the trip ends.
    const visaShort = trip.prep?.visa === 'done' && !!trip.visaExpires && !!dates && trip.visaExpires < dates.end;
    tasks.push(
      task('visa', 'Visa and entry rules', visaShort ? 'todo' : (trip.prep?.visa ?? 'todo'), {
        date: trip.visaExpires,
        ...(visaShort && { problem: 'visaExpires' as const }),
      }),
    );

    // Passport: fine with 6 months left at the start; otherwise worth a check.
    const expires = prefs.passportExpires;
    const short = !!expires && !!dates && expires < addMonths(dates.start, PASSPORT_MONTHS);
    const answered = trip.prep?.passport;
    const status: PrepTask['status'] = answered ?? (expires && !short ? 'covered' : 'todo');
    tasks.push(
      task('passport', 'Passport', status, {
        date: expires,
        ...(short && { problem: 'passportShort' as const }),
        // Only nag when we know there's a problem; an unknown date just shows on the card.
        ...(!short && { remindAt: [] }),
      }),
    );
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

/** Where a task's document photos live: the household policy, or the trip. */
function docsOwner(data: AppData, kind: 'insurance' | 'visa'): 'household' | 'trip' {
  return kind === 'insurance' && (data.insurance === 'annual' || data.insurance === 'card') ? 'household' : 'trip';
}

/** Photos for a task. */
export function docsFor(data: AppData, trip: Trip, kind: 'insurance' | 'visa'): Ticket[] {
  // The household policy shows on every trip, next to any bought for this one.
  const household = kind === 'insurance' ? (data.insuranceDocs ?? []) : [];
  return [...household, ...(trip.docs?.[kind] ?? [])];
}

export function addDoc(data: AppData, tripId: string, kind: 'insurance' | 'visa', doc: Ticket): AppData {
  if (docsOwner(data, kind) === 'household') return { ...data, insuranceDocs: [...(data.insuranceDocs ?? []), doc] };
  return {
    ...data,
    trips: data.trips.map((t) =>
      t.id === tripId ? { ...t, docs: { ...t.docs, [kind]: [...(t.docs?.[kind] ?? []), doc] } } : t,
    ),
  };
}

/** Removes a photo wherever it is kept. */
export function removeDoc(data: AppData, docId: string): AppData {
  const drop = (list?: Ticket[]) => list?.filter((d) => d.id !== docId);
  return {
    ...data,
    insuranceDocs: drop(data.insuranceDocs),
    trips: data.trips.map((t) =>
      t.docs ? { ...t, docs: { insurance: drop(t.docs.insurance), visa: drop(t.docs.visa) } } : t,
    ),
  };
}
