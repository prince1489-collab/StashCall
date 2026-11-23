import { describe, expect, it } from 'vitest';

import { planPrepReminders } from '../../reminders/plan';
import { EMPTY_DATA } from '../../storage/store';
import type { AppData } from '../../storage/store';
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
    expect(prepTasks(trip(true), { insurance: 'annual' }).find((t) => t.kind === 'insurance')?.status).toBe('covered');
    expect(prepTasks(trip(true), { insurance: 'card' }).find((t) => t.kind === 'insurance')?.status).toBe('covered');
    expect(prepTasks(trip(true), { insurance: 'perTrip' }).find((t) => t.kind === 'insurance')?.status).toBe('todo');
    expect(planPrepReminders(trip(false), { insurance: 'annual' }, new Date('2026-11-23T12:00:00Z'))).toEqual([]);
  });

  it('asks about a visa only for international trips', () => {
    expect(prepTasks(trip(true), { insurance: 'annual' }).map((t) => t.kind)).toEqual(['insurance', 'visa', 'passport']);
    expect(prepTasks(trip(false), { insurance: 'annual' }).map((t) => t.kind)).toEqual(['insurance']);
  });

  it('reminds weeks ahead, in the evening', () => {
    const [first, second] = prepTasks(trip(true), { insurance: 'perTrip' }).find((t) => t.kind === 'visa')!.remindAt;
    expect(first.toISOString()).toBe('2026-12-25T20:00:00.000Z'); // 42 days before
    expect(second.toISOString()).toBe('2027-01-26T20:00:00.000Z'); // 10 days before
  });

  it('reminds the evening after a late booking instead of in the past', () => {
    const t = trip(true, '2027-01-20T10:00:00Z');
    const visa = prepTasks(t, { insurance: 'perTrip' }).find((x) => x.kind === 'visa')!;
    expect(visa.remindAt.map((d) => d.toISOString())).toEqual(['2027-01-20T20:00:00.000Z', '2027-01-26T20:00:00.000Z']);
  });

  it('stops reminding once a task is sorted', () => {
    const t = { ...trip(true), prep: { insurance: 'done' as const, visa: 'notNeeded' as const } };
    expect(planPrepReminders(t, { insurance: 'perTrip' }, new Date('2026-11-23T12:00:00Z'))).toEqual([]);
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

describe('expiry dates', () => {
  const withReturn = (): Trip => ({
    ...trip(true),
    returnFlight: defaultFlight('2027-02-19T02:15', 'Asia/Kolkata', true),
  });

  it('reopens insurance when the annual policy ends before the trip does', () => {
    const t = withReturn();
    const ins = (ends?: string) => prepTasks(t, { insurance: 'annual', insuranceEnds: ends }).find((x) => x.kind === 'insurance')!;
    expect(ins('2027-03-01').status).toBe('covered');
    expect(ins('2027-02-19').status).toBe('covered'); // ends on the last day: still covered
    expect(ins('2027-02-10').status).toBe('todo');
    expect(ins('2027-02-10').problem).toBe('insuranceEnds');
    const r = planPrepReminders(t, { insurance: 'annual', insuranceEnds: '2027-02-10' }, new Date('2026-11-23T12:00:00Z'));
    expect(r[0].title).toBe('Travel insurance runs out');
    expect(r[0].body).toContain('10 Feb 2027');
  });

  it('flags a visa that runs out before the flight home', () => {
    const t = { ...withReturn(), prep: { visa: 'done' as const }, visaExpires: '2027-02-15' };
    const visa = prepTasks(t, {}).find((x) => x.kind === 'visa')!;
    expect(visa.status).toBe('todo');
    expect(visa.problem).toBe('visaExpires');
    const ok = prepTasks({ ...t, visaExpires: '2027-08-01' }, {}).find((x) => x.kind === 'visa')!;
    expect(ok.status).toBe('done');
  });

  it('checks the passport has 6 months left when the trip starts', () => {
    const pass = (expires?: string) => prepTasks(trip(true), { passportExpires: expires }).find((x) => x.kind === 'passport')!;
    expect(pass('2027-08-05').status).toBe('covered');
    expect(pass('2027-06-01').status).toBe('todo');
    expect(pass('2027-06-01').problem).toBe('passportShort');
    expect(pass('2027-06-01').remindAt.length).toBe(2);
    // Unknown: shown on the card, but no reminders.
    expect(pass(undefined).status).toBe('todo');
    expect(pass(undefined).remindAt).toEqual([]);
  });
});

describe('document photos', () => {
  const doc = (id: string) => ({ id, uri: `file:///${id}.jpg`, addedAt: '2026-11-23T12:00:00Z' });

  it('keeps an annual policy for every trip, and a per-trip one with its trip', async () => {
    const { addDoc, docsFor, removeDoc } = await import('../prep');
    const t1 = trip(true);
    const t2 = { ...trip(false), id: 't2' };
    let data: AppData = { ...EMPTY_DATA, insurance: 'annual', trips: [t1, t2] };
    data = addDoc(data, 't1', 'insurance', doc('policy'));
    expect(docsFor(data, data.trips[1], 'insurance').map((d) => d.id)).toEqual(['policy']);
    data = addDoc(data, 't1', 'visa', doc('visa'));
    expect(docsFor(data, data.trips[0], 'visa').map((d) => d.id)).toEqual(['visa']);
    expect(docsFor(data, data.trips[1], 'visa')).toEqual([]);
    data = removeDoc(removeDoc(data, 'policy'), 'visa');
    expect(docsFor(data, data.trips[0], 'insurance')).toEqual([]);
    expect(docsFor(data, data.trips[0], 'visa')).toEqual([]);
  });
});
