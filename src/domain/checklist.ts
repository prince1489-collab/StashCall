import type { AppData } from '../storage/store';
import type { StepKind, TimelineStep } from './types';

/** How long after an item reminder its checklist stays on Today at most. */
const OPEN_FOR_MS = 4 * 60 * 60 * 1000;

/**
 * The item reminder the user should be acting on right now: one that has
 * fired and whose window hasn't closed. A window closes at the next
 * reminder or the end of the trip step it leads to, and after 4 hours
 * at most.
 */
export function openChecklistStep(steps: TimelineStep[], now: Date): TimelineStep | undefined {
  const t = now.getTime();
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (!s.itemMoment || s.at.getTime() > t) continue;
    const next = steps.slice(i + 1).find((x) => x.notify || x.kind === 'checkout' || x.kind === 'takeoff' || x.kind === 'returnTakeoff');
    const closes = Math.min(s.at.getTime() + OPEN_FOR_MS, next ? next.at.getTime() : Infinity);
    return t < closes ? s : undefined;
  }
  return undefined;
}

/** Ticks every given item for one step, e.g. from a reminder's "Done" button. */
export function tickAll(data: AppData, tripId: string, kind: StepKind, itemIds: string[]): AppData {
  return {
    ...data,
    trips: data.trips.map((trip) => {
      if (trip.id !== tripId) return trip;
      const done = new Set([...(trip.ticked[kind] ?? []), ...itemIds]);
      return { ...trip, ticked: { ...trip.ticked, [kind]: [...done] } };
    }),
  };
}

/** Ticks or unticks an item for one step of the current trip. */
export function toggleTick(data: AppData, tripId: string, kind: StepKind, itemId: string): AppData {
  return {
    ...data,
    trips: data.trips.map((trip) => {
      if (trip.id !== tripId) return trip;
      const done = trip.ticked[kind] ?? [];
      const nextDone = done.includes(itemId) ? done.filter((x) => x !== itemId) : [...done, itemId];
      return { ...trip, ticked: { ...trip.ticked, [kind]: nextDone } };
    }),
  };
}
