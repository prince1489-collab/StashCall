import { describe, expect, it } from 'vitest';

import { planPrepReminders } from '../../reminders/plan';
import { EMPTY_DATA } from '../../storage/store';
import { prepTasks, setPrep, VISA_ITEM_NAME } from '../prep';
import { defaultFlight } from '../timeline';
import type { Trip } from '../types';

function trip(international: boolean, createdAt = '2026-11-01T09:00:00Z'): Trip {
  return {
    id: 't1',
    name: 'Mumbai in February',
    flight: defaultFlight('2027-02-05T09:40', 'Europe/London', international),
    itemIds: [],
    ticked: {},
    createdAt,
  };
}

describe('before you go', () => {
  it('ticks insurance off for an annual or bank policy', () => {
    expect(prepTasks(trip(true), 'annual').find((t) => t.kind === 'insurance')?.status).toBe('covered');
    expect(prepTasks(trip(true), 'card').find((t) => t.kind === 'insurance')?.status).toBe('covered');
    expect(prepTasks(trip(true), 'perTrip').find((t) => t.kind === 'insurance')?.status).toBe('todo');
    expect(planPrepReminders(trip(false), 'annual', new Date('2026-11-23T12:00:00Z'))).toEqual([]);
  });

  it('asks about a visa only for international trips', () => {
    expect(prepTasks(trip(true), 'annual').map((t) => t.kind)).toEqual(['insurance', 'visa']);
    expect(prepTasks(trip(false), 'annual').map((t) => t.kind)).toEqual(['insurance']);
  });

  it('reminds weeks ahead, in the evening', () => {
    const [first, second] = prepTasks(trip(true), 'perTrip').find((t) => t.kind === 'visa')!.remindAt;
    expect(first.toISOString()).toBe('2026-12-25T20:00:00.000Z'); // 42 days before
    expect(second.toISOString()).toBe('2027-01-26T20:00:00.000Z'); // 10 days before
  });

  it('reminds the evening after a late booking instead of in the past', () => {
    const t = trip(true, '2027-01-20T10:00:00Z');
    const visa = prepTasks(t, 'perTrip').find((x) => x.kind === 'visa')!;
    expect(visa.remindAt.map((d) => d.toISOString())).toEqual(['2027-01-20T20:00:00.000Z', '2027-01-26T20:00:00.000Z']);
  });

  it('stops reminding once a task is sorted', () => {
    const t = { ...trip(true), prep: { insurance: 'done' as const, visa: 'notNeeded' as const } };
    expect(planPrepReminders(t, 'perTrip', new Date('2026-11-23T12:00:00Z'))).toEqual([]);
  });

  it('puts a sorted visa on the packing list, and takes it off again', () => {
    let n = 0;
    const id = () => `id${++n}`;
    const data = { ...EMPTY_DATA, trips: [trip(true)] };
    const done = setPrep(data, 't1', 'visa', 'done', id);
    expect(done.trips[0].prep?.visa).toBe('done');
    expect(done.items.map((i) => i.name)).toEqual([VISA_ITEM_NAME]);
    expect(done.trips[0].itemIds).toEqual(['id1']);
    const undone = setPrep(done, 't1', 'visa', undefined, id);
    expect(undone.items).toEqual([]);
    expect(undone.trips[0].itemIds).toEqual([]);
    expect(undone.trips[0].prep?.visa).toBeUndefined();
  });
});
