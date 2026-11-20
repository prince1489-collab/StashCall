import { buildTimeline } from '../domain/timeline';
import { stepItemNames } from '../domain/tripItems';
import type { Item, StepKind, TimelineStep, Trip } from '../domain/types';

export interface PlannedReminder {
  /** Stable id: same trip + step → same id, so rescheduling replaces it. */
  id: string;
  at: Date;
  title: string;
  body: string;
  kind: StepKind;
  /** Time-critical reminders use the strongest delivery Android allows. */
  critical: boolean;
  tripId: string;
  /** Whether the reminder lists items, so it gets a "Done" button. */
  hasItems: boolean;
}

/** Joins item names for a notification: "Passports, Glasses and Phone charger". */
export function listItems(names: string[], max = 6): string {
  if (names.length === 0) return '';
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  if (extra > 0) return `${shown.join(', ')} and ${extra} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

function textFor(step: TimelineStep, steps: TimelineStep[], items: string[]): { title: string; body: string } | null {
  const find = (k: StepKind) => steps.find((s) => s.kind === k);
  const list = listItems(items);
  switch (step.kind) {
    case 'pack':
      return {
        title: 'Time to pack',
        body: list ? `Don't forget: ${list}.` : 'Pack tonight so tomorrow morning is calm.',
      };
    case 'wake': {
      const leave = find('leave');
      return { title: 'Time to get up', body: leave ? `Leave home at ${leave.localTime}.` : 'Travel day.' };
    }
    case 'leaveCheck':
      return {
        title: 'Before you leave',
        body: list ? `Check you have: ${list}.` : 'Quick check of your bags before you go.',
      };
    case 'leave': {
      const takeoff = find('takeoff');
      return {
        title: 'Time to leave for the airport',
        body: takeoff ? `Your flight departs at ${takeoff.localTime}.` : 'Time to go.',
      };
    }
    case 'sweep': {
      const checkout = find('checkout');
      return {
        title: 'Sweep the room',
        body: `${checkout ? `Checkout at ${checkout.localTime}. ` : ''}${
          list ? `Look for: ${list}.` : 'Check drawers, sockets and the bathroom.'
        }`,
      };
    }
    default:
      return null;
  }
}

/** Every future reminder for a trip, in time order. */
export function planReminders(trip: Trip, items: Item[], now: Date): PlannedReminder[] {
  const steps = buildTimeline(trip);
  return steps
    .filter((s) => s.notify && s.at.getTime() > now.getTime())
    .map((s) => {
      const names = stepItemNames(trip, items, s);
      const text = textFor(s, steps, names);
      if (!text) return null;
      return {
        id: `${trip.id}:${s.kind}`,
        at: s.at,
        ...text,
        kind: s.kind,
        critical: s.kind === 'wake' || s.kind === 'leave',
        tripId: trip.id,
        hasItems: names.length > 0,
      };
    })
    .filter((r): r is PlannedReminder => r !== null);
}
