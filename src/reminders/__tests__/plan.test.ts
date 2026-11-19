import { describe, expect, it } from 'vitest';

import { defaultFlight } from '../../domain/timeline';
import type { Item, Trip } from '../../domain/types';
import { listItems, planReminders } from '../plan';

const items: Item[] = [
  { id: 'p', name: 'Passports', moment: 'home', createdAt: '' },
  { id: 'g', name: 'Glasses', moment: 'both', createdAt: '' },
  { id: 'c', name: 'Phone charger', moment: 'both', createdAt: '' },
];

const trip: Trip = {
  id: 't1',
  name: 'Paris',
  flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true),
  checkout: { checkout: '2026-12-01T11:00', timeZone: 'Europe/Paris', sweepMinutesBefore: 60 },
  itemIds: ['p', 'g', 'c'],
  ticked: {},
  createdAt: '',
};

describe('listItems', () => {
  it('reads naturally', () => {
    expect(listItems(['A'])).toBe('A');
    expect(listItems(['A', 'B', 'C'])).toBe('A, B and C');
    expect(listItems(['A', 'B', 'C', 'D'], 2)).toBe('A, B and 2 more');
  });
});

describe('planReminders', () => {
  it('plans pack, wake, last check, leave and sweep with their items', () => {
    const r = planReminders(trip, items, new Date('2026-11-20T00:00:00Z'));
    expect(r.map((x) => x.kind)).toEqual(['pack', 'wake', 'leaveCheck', 'leave', 'sweep']);
    expect(r[0].body).toBe("Don't forget: Passports, Glasses and Phone charger.");
    expect(r[1].body).toBe('Leave home at 06:00.');
    expect(r[3].body).toBe('Your flight departs at 10:00.');
    expect(r[4].body).toBe('Checkout at 11:00. Look for: Glasses and Phone charger.');
    expect(r[4].at.toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });

  it('skips reminders already in the past', () => {
    const r = planReminders(trip, items, new Date('2026-11-27T05:30:00Z'));
    expect(r.map((x) => x.kind)).toEqual(['leaveCheck', 'leave', 'sweep']);
  });

  it('marks wake and leave as time-critical and uses stable ids', () => {
    const r = planReminders(trip, items, new Date('2026-11-20T00:00:00Z'));
    expect(r.filter((x) => x.critical).map((x) => x.kind)).toEqual(['wake', 'leave']);
    expect(r[0].id).toBe('t1:pack');
  });

  it('still reminds with no items saved', () => {
    const r = planReminders({ ...trip, itemIds: [] }, [], new Date('2026-11-20T00:00:00Z'));
    expect(r[0].body).toBe('Pack tonight so tomorrow morning is calm.');
  });
});
