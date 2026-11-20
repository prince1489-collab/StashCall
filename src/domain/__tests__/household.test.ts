import { describe, expect, it } from 'vitest';

import type { AppData } from '../../storage/store';
import { addPresets, ensureOwner, removeItem, removeTrip, savedItems, setOnCurrentTrip, upsertItem } from '../household';
import type { Trip } from '../types';

let n = 0;
const id = () => `id${++n}`;

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Trip',
  itemIds: [],
  ticked: {},
  createdAt: '2026-11-19T00:00:00Z',
  ...over,
});
const empty = (trips: Trip[] = []): AppData => ({ version: 1, owners: [], items: [], trips });

describe('addPresets', () => {
  it('adds chosen presets once and puts them on the current trip', () => {
    let d = addPresets(empty([trip()]), ['glasses', 'medication'], id);
    d = addPresets(d, ['glasses', 'passport'], id);
    expect(d.items.map((i) => i.presetId)).toEqual(['glasses', 'medication', 'passport']);
    expect(d.trips[0].itemIds).toHaveLength(3);
  });

  it('works with no trip yet', () => {
    const d = addPresets(empty(), ['glasses'], id);
    expect(d.items).toHaveLength(1);
    expect(d.trips).toEqual([]);
  });
});

describe('items and trips', () => {
  it('a new custom item goes on the current trip; editing does not duplicate it', () => {
    let d = upsertItem(empty([trip()]), { id: 'x', name: 'Lens kit', moment: 'both', createdAt: '' });
    d = upsertItem(d, { id: 'x', name: 'Lens kit and case', moment: 'both', createdAt: '' });
    expect(d.items).toHaveLength(1);
    expect(d.items[0].name).toBe('Lens kit and case');
    expect(d.trips[0].itemIds).toEqual(['x']);
  });

  it('removing an item clears it from trips and ticks', () => {
    let d = upsertItem(empty([trip({ ticked: { pack: ['x', 'y'] } })]), {
      id: 'x',
      name: 'Toy',
      moment: 'both',
      createdAt: '',
    });
    d = removeItem(d, 'x');
    expect(d.items).toEqual([]);
    expect(d.trips[0].itemIds).toEqual([]);
    expect(d.trips[0].ticked.pack).toEqual(['y']);
  });

  it('toggles an item on and off the current trip', () => {
    let d = setOnCurrentTrip(empty([trip()]), 'x', true);
    expect(d.trips[0].itemIds).toEqual(['x']);
    d = setOnCurrentTrip(d, 'x', false);
    expect(d.trips[0].itemIds).toEqual([]);
  });
});

describe('ensureOwner', () => {
  it('reuses an owner regardless of case and ignores blank names', () => {
    const a = ensureOwner(empty(), 'Mum', id);
    const b = ensureOwner(a.data, ' mum ', id);
    expect(b.ownerId).toBe(a.ownerId);
    expect(b.data.owners).toHaveLength(1);
    expect(ensureOwner(empty(), '  ', id).ownerId).toBeUndefined();
  });
});

describe('stepItemNames', () => {
  it('lists only items on the trip that match the step moment', async () => {
    const { stepItemNames } = await import('../tripItems');
    const { buildTimeline, defaultFlight } = await import('../timeline');
    const items = [
      { id: 'a', name: 'Passports', moment: 'home' as const, createdAt: '' },
      { id: 'b', name: 'Charger', moment: 'both' as const, createdAt: '' },
      { id: 'c', name: 'Toy', moment: 'both' as const, createdAt: '' },
    ];
    const t = trip({ itemIds: ['a', 'b'] });
    const steps = buildTimeline({
      flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true),
      checkout: { checkout: '2026-12-01T11:00', timeZone: 'Europe/Paris', sweepMinutesBefore: 60 },
    });
    const at = (k: string) => stepItemNames(t, items, steps.find((s) => s.kind === k)!);
    expect(at('pack')).toEqual(['Passports', 'Charger']);
    expect(at('sweep')).toEqual(['Charger']);
    expect(at('takeoff')).toEqual([]);
  });
});

describe('one-off items', () => {
  it('leaves them out of the saved list and deletes them with their trip', () => {
    const data: AppData = {
      version: 1,
      owners: [],
      items: [
        { id: 'a', name: 'Passports', moment: 'home', createdAt: '' },
        { id: 'g', name: 'Gift', moment: 'home', tripId: 't1', createdAt: '' },
      ],
      trips: [
        { id: 't1', name: 'One', itemIds: ['a', 'g'], ticked: {}, createdAt: '' },
        { id: 't2', name: 'Two', itemIds: ['a'], ticked: {}, createdAt: '' },
      ],
    };
    expect(savedItems(data.items).map((i) => i.id)).toEqual(['a']);
    const after = removeTrip(data, 't1');
    expect(after.trips.map((t) => t.id)).toEqual(['t2']);
    expect(after.items.map((i) => i.id)).toEqual(['a']);
  });
});
