import type { AppData } from '../storage/store';
import type { Person, StatusStep, Trip } from './types';
import { tripFor } from './people';
import { tripSpan } from './trips';

/**
 * Travel-day updates shared with the family: "Left for the airport",
 * "Landed". Each person's update lives on their own person record, which
 * only their phone changes, so two phones never overwrite each other.
 */

export const STATUS_STEPS: { step: StatusStep; label: string; told: string }[] = [
  { step: 'left', label: 'Left for the airport', told: 'has left for the airport' },
  { step: 'airport', label: 'At the airport', told: 'is at the airport' },
  { step: 'landed', label: 'Landed', told: 'has landed' },
  { step: 'arrived', label: 'Arrived', told: 'has arrived' },
];

const STEP = new Map(STATUS_STEPS.map((s) => [s.step, s]));

/** Updates go stale: after 18 hours they no longer show. */
const FRESH_MS = 18 * 3600 * 1000;

/** Sets this person's update for a trip. */
export function setStatus(data: AppData, personId: string, tripId: string, step: StatusStep, now: Date): AppData {
  return {
    ...data,
    owners: data.owners.map((p) => (p.id === personId ? { ...p, status: { tripId, step, at: now.toISOString() } } : p)),
  };
}

/** A person's current update on this trip, if fresh. */
export function statusOn(p: Person, tripId: string, now: Date) {
  const s = p.status;
  if (!s || s.tripId !== tripId || !STEP.has(s.step)) return undefined;
  const at = new Date(s.at);
  if (Number.isNaN(at.getTime()) || now.getTime() - at.getTime() > FRESH_MS) return undefined;
  return { ...STEP.get(s.step)!, at };
}

/**
 * The card shows from the day before anyone on the trip sets off until the
 * day after the last of them is done, each traveller with their own flights.
 */
export function showStatus(trip: Trip, people: Person[], now: Date): boolean {
  const day = 24 * 3600 * 1000;
  const plans = people.length > 0 ? people.map((p) => tripFor(trip, p.id)) : [trip];
  return plans.some((t) => {
    const span = tripSpan(t);
    return !!span && now.getTime() >= span.start.getTime() - day && now.getTime() <= span.end.getTime() + day;
  });
}

/**
 * Other people's new updates after a sync, to tell this phone about:
 * "Bajrang has landed". Only fresh ones, and never this phone's own.
 */
export function newStatuses(before: Person[], after: Person[], meId: string | undefined, now: Date): string[] {
  const out: string[] = [];
  for (const p of after) {
    if (p.id === meId || !p.status) continue;
    const old = before.find((o) => o.id === p.id)?.status;
    if (old && old.at === p.status.at && old.step === p.status.step) continue;
    const s = statusOn(p, p.status.tripId, now);
    if (s) out.push(`${p.name} ${s.told}`);
  }
  return out;
}
