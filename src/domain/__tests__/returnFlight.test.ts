import { describe, expect, it } from 'vitest';

import { planReminders } from '../../reminders/plan';
import { buildTimeline, defaultFlight } from '../timeline';
import type { Item, Trip } from '../types';

const items: Item[] = [
  { id: 'c', name: 'Phone charger', moment: 'both', createdAt: '' },
  { id: 'p', name: 'Passports', moment: 'home', createdAt: '' },
];

const trip: Trip = {
  id: 't',
  name: 'Mumbai in February',
  flight: defaultFlight('2027-02-05T09:40', 'Europe/London', true),
  returnFlight: defaultFlight('2027-02-19T02:15', 'Asia/Kolkata', true),
  itemIds: ['c', 'p'],
  ticked: {},
  createdAt: '',
};

describe('flight home', () => {
  it('plans the day home in the departure airport zone', () => {
    const steps = buildTimeline(trip).filter((s) => s.kind.startsWith('return'));
    expect(steps.map((s) => s.kind)).toEqual([
      'returnPack',
      'returnWake',
      'returnLeaveCheck',
      'returnLeave',
      'returnAirport',
      'returnTakeoff',
    ]);
    const takeoff = steps.find((s) => s.kind === 'returnTakeoff')!;
    expect(takeoff.localTime).toBe('02:15');
    expect(takeoff.timeZone).toBe('Asia/Kolkata');
  });

  it('reminds about hotel items, not home-only ones, on the way home', () => {
    const reminders = planReminders(trip, items, new Date('2027-01-01T00:00:00Z'));
    const check = reminders.find((r) => r.kind === 'returnLeaveCheck')!;
    expect(check.body).toContain('Phone charger');
    expect(check.body).not.toContain('Passports');
    expect(reminders.find((r) => r.kind === 'returnLeave')?.body).toContain('02:15');
  });
});
