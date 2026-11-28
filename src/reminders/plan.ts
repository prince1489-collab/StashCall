import { buildTimeline } from '../domain/timeline';
import { reminderItems } from '../domain/tripItems';
import { checkIns } from '../domain/checkin';
import { stepDone, stepFlight } from '../domain/stepsDone';
import { prepTasks, shortDate } from '../domain/prep';
import type { PrepPrefs, PrepTask } from '../domain/prep';
import type { Item, Person, PrepKind, StepKind, TimelineStep, Trip } from '../domain/types';

export interface PlannedReminder {
  /** Stable id: same trip + step → same id, so rescheduling replaces it. */
  id: string;
  at: Date;
  title: string;
  body: string;
  kind: StepKind | PrepKind | 'checkin';
  /** Time-critical reminders use the strongest delivery Android allows. */
  critical: boolean;
  tripId: string;
  /** Whether the reminder lists items, so it gets a "Done" button. */
  hasItems: boolean;
  /** A page a tap opens, like the airline's check-in. */
  url?: string;
  /** For a check-in: its first flight, which names StashCall's check-in screen for it. */
  flight?: string;
}

/** "Check in for QP1111" when online check-in opens, a tap away from the airline. */
export function planCheckInReminders(trip: Trip, now: Date, meId?: string): PlannedReminder[] {
  // Checked in already, and ticked it off: no nudge.
  const steps = buildTimeline(trip);
  // Matched by flight, not time: two airlines' check-ins can open at once.
  const done = steps.filter((s) => s.kind === 'checkin' && stepDone(trip, meId, s, steps)).map(stepFlight);
  return checkIns(trip)
    .filter((c) => c.at.getTime() > now.getTime() && !done.includes(c.flightNumbers[0]))
    .map((c) => ({
      id: `${trip.id}:checkin:${c.flightNumbers[0]}`,
      at: c.at,
      title: `Check in for ${listItems(c.flightNumbers)}`,
      body: `${c.airline} online check-in should be open now${c.home ? ' for your flight home' : ''}. ${
        c.url ? 'Tap to check in: StashCall fills in your PNR.' : 'Use their app or website.'
      }`,
      kind: 'checkin' as const,
      critical: false,
      tripId: trip.id,
      hasItems: false,
      ...(c.url && { url: c.url, flight: c.flightNumbers[0] }),
    }));
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
    case 'returnPack':
      return {
        title: 'Pack to go home',
        body: list ? `Don't leave behind: ${list}.` : 'Pack tonight so the morning is calm.',
      };
    case 'returnWake': {
      const leave = find('returnLeave');
      return { title: 'Time to get up', body: leave ? `Leave for the airport at ${leave.localTime}.` : 'Flying home today.' };
    }
    case 'returnLeaveCheck':
      return {
        title: 'Last check of the room',
        body: list ? `Have you got: ${list}?` : 'Check drawers, sockets, the safe and the bathroom.',
      };
    case 'connection':
    case 'returnConnection':
      return {
        title: `Next flight at ${step.localTime}`,
        body: step.detail ? `${step.detail}. Head to the gate in good time.` : 'Head to the gate for your next flight in good time.',
      };
    case 'returnLeave': {
      const takeoff = find('returnTakeoff');
      return {
        title: 'Time to leave for the airport',
        body: takeoff ? `Your flight home departs at ${takeoff.localTime}.` : 'Time to go.',
      };
    }
    default:
      return null;
  }
}

function prepText(t: PrepTask): { title: string; body: string } {
  switch (t.kind) {
    case 'insurance':
      return t.problem === 'insuranceEnds'
        ? {
            title: 'Travel insurance runs out',
            body: `Your policy ends on ${shortDate(t.date!)}, before this trip ends. Renew it or buy cover for this trip.`,
          }
        : { title: 'Travel insurance', body: 'Have you bought travel insurance for this trip? Tap Done once it is sorted.' };
    case 'visa':
      return t.problem === 'visaExpires'
        ? { title: 'Visa runs out', body: `Your visa ends on ${shortDate(t.date!)}, before this trip ends. Check your dates.` }
        : {
            title: 'Visa and entry rules',
            body: 'Check if you need a visa, e-visa or travel authorisation for this trip. Some take weeks. Open StashCall to tick it off.',
          };
    case 'passport':
      return {
        title: t.whose ? `Check ${t.whose}'s passport` : 'Check your passport',
        body: `It runs out on ${shortDate(t.date!)}. Many countries want 6 months left when you arrive, and renewing can take weeks.`,
      };
  }
}

/** Reminders for the "Before you go" tasks that are still open. */
export function planPrepReminders(trip: Trip, prefs: PrepPrefs, now: Date): PlannedReminder[] {
  return prepTasks(trip, prefs)
    .filter((t) => t.status === 'todo')
    .flatMap((t) =>
      t.remindAt
        .filter((at) => at.getTime() > now.getTime())
        .map((at, i) => ({
          id: `${trip.id}:${t.kind}:${i}`,
          at,
          ...prepText(t),
          kind: t.kind,
          critical: false,
          tripId: trip.id,
          // Plain insurance gets a "Done" button. The rest need an answer or
          // a new date in the app.
          hasItems: t.kind === 'insurance' && !t.problem,
        })),
    );
}

/** Every future reminder for a trip, in time order. */
export function planReminders(trip: Trip, items: Item[], now: Date, people: Person[] = [], meId?: string): PlannedReminder[] {
  // Someone else's item is named with its owner: "Inhaler (Aarav)".
  const label = (i: Item) => {
    const owner = i.ownerId && i.ownerId !== meId ? people.find((p) => p.id === i.ownerId) : undefined;
    return owner ? `${i.name} (${owner.name})` : i.name;
  };
  const steps = buildTimeline(trip);
  const timeline = steps
    // A step ticked off already needs no reminder.
    .filter((s) => s.notify && (s.remindAt ?? s.at).getTime() > now.getTime() && !stepDone(trip, meId, s, steps))
    .map((s): PlannedReminder | null => {
      const names = reminderItems(trip, items, s, people, meId).map(label);
      const text = textFor(s, steps, names);
      if (!text) return null;
      return {
        // Several connections each get their own reminder.
        id: s.kind === 'connection' || s.kind === 'returnConnection' ? `${trip.id}:${s.kind}:${s.at.getTime()}` : `${trip.id}:${s.kind}`,
        at: s.remindAt ?? s.at,
        ...text,
        kind: s.kind,
        critical: ['wake', 'leave', 'returnWake', 'returnLeave'].includes(s.kind),
        tripId: trip.id,
        hasItems: names.length > 0,
      };
    })
    .filter((r): r is PlannedReminder => r !== null);
  return timeline;
}
