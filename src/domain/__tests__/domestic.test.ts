import { describe, expect, it } from 'vitest';

import { planPrepReminders } from '../../reminders/plan';
import { prepTasks } from '../prep';
import { buildTimeline, defaultFlight } from '../timeline';
import { itemCountLabel, stepItemNames } from '../tripItems';
import type { Item, Trip } from '../types';

const items: Item[] = [
  { id: 'a', name: 'Passports', moment: 'home', presetId: 'passport', createdAt: '2026-11-01T00:00:00Z' },
  { id: 'b', name: 'Plug adaptor', moment: 'both', presetId: 'adaptor', createdAt: '2026-11-01T00:00:00Z' },
  { id: 'c', name: 'Glasses', moment: 'both', presetId: 'glasses', createdAt: '2026-11-01T00:00:00Z' },
];

function trip(international: boolean): Trip {
  return {
    id: 't1',
    name: 'Pantnagar',
    flight: defaultFlight('2026-12-06T09:40', 'Asia/Kolkata', international),
    itemIds: ['a', 'b', 'c'],
    ticked: {},
    createdAt: '2026-11-24T02:00:00Z',
  };
}

describe('domestic trips', () => {
  it('asks for photo ID and leaves the adaptor at home', () => {
    const pack = buildTimeline(trip(false)).find((s) => s.kind === 'pack')!;
    expect(stepItemNames(trip(false), items, pack)).toEqual(['Photo ID', 'Glasses']);
    const abroad = buildTimeline(trip(true)).find((s) => s.kind === 'pack')!;
    expect(stepItemNames(trip(true), items, abroad)).toEqual(['Passports', 'Plug adaptor', 'Glasses']);
  });

  it('makes insurance optional and never reminds about it', () => {
    const t = trip(false);
    const insurance = prepTasks(t, { insurance: 'perTrip' }).find((x) => x.kind === 'insurance')!;
    expect(insurance).toMatchObject({ status: 'notNeeded', optional: true, remindAt: [] });
    expect(planPrepReminders(t, { insurance: 'perTrip' }, new Date('2026-11-24T03:00:00Z'))).toEqual([]);
    const bought = { ...t, prep: { insurance: 'done' as const } };
    expect(prepTasks(bought, {}).find((x) => x.kind === 'insurance')?.status).toBe('done');
  });

  it('still covers a domestic trip with an annual policy', () => {
    expect(prepTasks(trip(false), { insurance: 'annual' })[0].status).toBe('covered');
  });
});

describe('item counts', () => {
  it('says what to do with them', () => {
    const steps = buildTimeline(trip(false));
    expect(itemCountLabel(steps.find((s) => s.kind === 'pack')!, 7)).toBe('7 items to pack');
    expect(itemCountLabel(steps.find((s) => s.kind === 'leaveCheck')!, 1)).toBe('1 item to check');
  });
});
