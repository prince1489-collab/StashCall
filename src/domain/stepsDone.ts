import { instantToZoned } from './time';
import type { AppData } from '../storage/store';
import type { Person, StepDone, TimelineStep, Trip } from './types';

/**
 * Ticking timeline steps off: "Web check-in" done, "Book a ride" done.
 *
 * A tick belongs to one person's step, saved on the trip so every phone in
 * the household sees it. The key names the step by kind and day, plus the
 * flight it's about when it has one (a check-in, a connection), else its
 * place among that day's steps of the same kind. So nudging a time (a
 * later wake-up, a longer drive) keeps the tick, two check-ins on one day
 * keep their own ticks whatever order they open in, and moving the flight
 * to another day clears it, as it should.
 */
export function stepKey(s: TimelineStep, steps: TimelineStep[]): string {
  const day = instantToZoned(s.at, s.timeZone).slice(0, 10);
  const flight = stepFlight(s);
  if (flight) return `${s.kind}@${day}#${flight}`;
  const same = steps.filter((x) => x.kind === s.kind && instantToZoned(x.at, x.timeZone).slice(0, 10) === day);
  const n = Math.max(0, same.indexOf(s));
  return `${s.kind}@${day}#${n}`;
}

/** The flight a step is about, from its detail: "QP1111 · Akasa Air" → QP1111. */
export function stepFlight(s: Pick<TimelineStep, 'detail'>): string | undefined {
  return s.detail?.match(/\b(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2}\d{1,4}\b/)?.[0];
}

const doneKey = (personId: string, key: string) => `${personId}|${key}`;

/** The tick on one person's step, if it's ticked. */
export function stepDone(trip: Pick<Trip, 'stepsDone'>, personId: string | undefined, s: TimelineStep, steps: TimelineStep[]): StepDone | undefined {
  if (!personId) return undefined;
  const d = trip.stepsDone?.[doneKey(personId, stepKey(s, steps))];
  return d && !d.undone ? d : undefined;
}

/**
 * Ticks or unticks a step of one person's plan. `by` is whoever tapped it,
 * which may be someone else: a son ticking his dad's check-in. An untick
 * is kept (marked undone) so it wins over an older tick from another phone.
 */
export function toggleStep(
  data: AppData,
  tripId: string,
  personId: string,
  s: TimelineStep,
  steps: TimelineStep[],
  by: string | undefined,
  now: Date = new Date(),
): AppData {
  const key = doneKey(personId, stepKey(s, steps));
  return {
    ...data,
    trips: data.trips.map((t) => {
      if (t.id !== tripId) return t;
      const was = t.stepsDone?.[key];
      const next: StepDone = was && !was.undone ? { ...was, at: now.toISOString(), undone: true } : { by, at: now.toISOString() };
      if (!next.by) delete next.by;
      return { ...t, stepsDone: { ...t.stepsDone, [key]: next } };
    }),
  };
}

/** Both phones' ticks: for each step, whichever was tapped last. */
export function mergeStepsDone(
  mine: Trip['stepsDone'],
  theirs: Trip['stepsDone'],
): Trip['stepsDone'] {
  if (!mine && !theirs) return undefined;
  const out: Record<string, StepDone> = { ...theirs };
  for (const [k, v] of Object.entries(mine ?? {})) {
    const t = out[k];
    if (!t || Date.parse(v.at) >= Date.parse(t.at)) out[k] = v;
  }
  return out;
}

/**
 * "Done by you · 10:42", "Done by Bajrang · 6 Dec 08:10": the time in the
 * zone given (the phone's), with the day when it isn't today.
 */
export function doneLabel(d: StepDone, people: Pick<Person, 'id' | 'name'>[], meId: string | undefined, timeZone: string, now: Date = new Date()): string {
  const who = d.by === meId ? 'you' : people.find((p) => p.id === d.by)?.name;
  const at = new Date(d.at);
  const local = instantToZoned(at, timeZone);
  const today = instantToZoned(now, timeZone).slice(0, 10);
  const day = local.slice(0, 10) === today ? '' : `${Number(local.slice(8, 10))} ${MONTHS[Number(local.slice(5, 7)) - 1]} `;
  return `Done${who ? ` by ${who}` : ''} · ${day}${local.slice(11, 16)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
