import { describe, expect, it } from 'vitest';

import { EMPTY_DATA } from '../../storage/store';
import type { AppData } from '../../storage/store';
import { doneLabel, stepDone, stepKey, toggleStep } from '../stepsDone';
import { buildTimeline, defaultFlight } from '../timeline';
import type { Trip } from '../types';
import { planCheckInReminders, planReminders } from '../../reminders/plan';

const flight = { ...defaultFlight('2026-12-06T07:00', 'Asia/Kolkata', false), flightNumber: 'QP1111', airport: 'BOM', destination: 'DEL' };
const trip: Trip = { id: 't', name: 'Wedding', flight, itemIds: [], ticked: {}, createdAt: '2026-11-26T00:00:00Z' };
const data: AppData = { ...EMPTY_DATA, owners: [{ id: 'me', name: 'Mahiman' }, { id: 'b', name: 'Bajrang' }], trips: [trip], meId: 'me' };
const steps = buildTimeline(trip);
const find = (kind: string) => steps.find((s) => s.kind === kind)!;

describe('ticking off timeline steps', () => {
  it('ticks a step for one person, and unticks it again', () => {
    const leave = find('leave');
    const ticked = toggleStep(data, 't', 'me', leave, steps, 'me', new Date('2026-12-06T00:00:00Z'));
    expect(stepDone(ticked.trips[0], 'me', leave, steps)).toEqual({ by: 'me', at: '2026-12-06T00:00:00.000Z' });
    // Bajrang's plan is his own.
    expect(stepDone(ticked.trips[0], 'b', leave, steps)).toBeUndefined();
    const unticked = toggleStep(ticked, 't', 'me', leave, steps, 'me');
    expect(stepDone(unticked.trips[0], 'me', leave, steps)).toBeUndefined();
  });

  it('keeps a tick when a time moves on the same day', () => {
    const later = buildTimeline({ flight: { ...flight, travelMinutes: flight.travelMinutes + 20 } });
    expect(stepKey(later.find((s) => s.kind === 'leave')!, later)).toBe(stepKey(find('leave'), steps));
  });

  it('says who ticked it', () => {
    const d = { by: 'b', at: '2026-12-06T05:12:00Z' };
    expect(doneLabel(d, data.owners, 'me', 'Asia/Kolkata', new Date('2026-12-06T06:00:00Z'))).toBe('Done by Bajrang · 10:42');
    expect(doneLabel({ ...d, by: 'me' }, data.owners, 'me', 'Asia/Kolkata', new Date('2026-12-07T06:00:00Z'))).toBe('Done by you · 6 Dec 10:42');
  });

  it('drops reminders for steps already ticked off', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    const checkin = find('checkin');
    const wake = find('wake');
    let d = toggleStep(data, 't', 'me', checkin, steps, 'me');
    d = toggleStep(d, 't', 'me', wake, steps, 'me');
    expect(planCheckInReminders(trip, now, 'me')).toHaveLength(1);
    expect(planCheckInReminders(d.trips[0], now, 'me')).toHaveLength(0);
    // Someone else's tick doesn't silence my reminder.
    expect(planCheckInReminders(d.trips[0], now, 'b')).toHaveLength(1);
    expect(planReminders(trip, [], now, data.owners, 'me').some((r) => r.kind === 'wake')).toBe(true);
    expect(planReminders(d.trips[0], [], now, data.owners, 'me').some((r) => r.kind === 'wake')).toBe(false);
  });
});
