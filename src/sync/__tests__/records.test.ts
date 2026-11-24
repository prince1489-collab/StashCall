import { describe, expect, it } from 'vitest';

import { EMPTY_DATA } from '../../storage/store';
import type { AppData } from '../../storage/store';
import type { Trip } from '../../domain/types';
import { applyRemote, changesToPush, markPushed } from '../records';
import type { SyncRow } from '../records';

const trip: Trip = {
  id: 't1',
  name: 'Pantnagar',
  itemIds: ['i1'],
  ticked: {},
  tickets: [{ id: 'k', uri: 'file:///mine.jpg', addedAt: '2026-11-24T00:00:00Z' }],
  createdAt: '2026-11-24T02:00:00Z',
};
const mine: AppData = {
  ...EMPTY_DATA,
  owners: [{ id: 'me', name: 'Mahi' }],
  items: [{ id: 'i1', name: 'Glasses', moment: 'both', photoUri: 'file:///g.jpg', createdAt: '2026-11-01T00:00:00Z' }],
  trips: [trip],
  insurance: 'annual',
  meId: 'me',
};
const asRows = (rows: Omit<SyncRow, 'updated_at'>[]): SyncRow[] => rows.map((r) => ({ ...r, updated_at: '2026-11-24T03:00:00Z' }));

describe('family sharing records', () => {
  it('sends everything the first time, without photos', () => {
    const rows = changesToPush(mine, {});
    expect(rows.map((r) => `${r.kind}:${r.id}`).sort()).toEqual(['item:i1', 'person:me', 'prefs:household', 'trip:t1']);
    expect(JSON.stringify(rows)).not.toContain('file://');
    expect(changesToPush(mine, markPushed({}, rows))).toEqual([]);
  });

  it("gives Dad's empty phone the whole household, and nothing of his own to send", () => {
    const sent = changesToPush(mine, {});
    const dad = applyRemote({ ...EMPTY_DATA }, {}, asRows(sent));
    expect(dad.data.trips[0]).toMatchObject({ id: 't1', name: 'Pantnagar' });
    expect(dad.data.trips[0].tickets).toBeUndefined();
    expect(dad.data.insurance).toBe('annual');
    expect(dad.data.meId).toBeUndefined();
    expect(changesToPush(dad.data, dad.state)).toEqual([]);
  });

  it("applies Dad's tick and keeps my photos", () => {
    const state = markPushed({}, changesToPush(mine, {}));
    const ticked = { ...trip, tickets: undefined, ticked: { pack: ['i1'] } };
    const { tickets: _t, ...remote } = ticked;
    const r = applyRemote(mine, state, asRows([{ kind: 'trip', id: 't1', data: remote, deleted: false }]));
    expect(r.data.trips[0].ticked.pack).toEqual(['i1']);
    expect(r.data.trips[0].tickets?.[0].uri).toBe('file:///mine.jpg');
    expect(r.data.items[0].photoUri).toBe('file:///g.jpg');
    expect(changesToPush(r.data, r.state)).toEqual([]);
  });

  it('keeps my unsent change over an older remote one, then sends it', () => {
    const state = markPushed({}, changesToPush(mine, {}));
    const renamed = { ...mine, trips: [{ ...trip, name: 'Pantnagar with Dad' }] };
    const { tickets: _t, ...remote } = { ...trip, ticked: { pack: ['i1'] } };
    const r = applyRemote(renamed, state, asRows([{ kind: 'trip', id: 't1', data: remote, deleted: false }]));
    expect(r.data.trips[0].name).toBe('Pantnagar with Dad');
    expect(changesToPush(r.data, r.state).map((x) => x.id)).toEqual(['t1']);
  });

  it('ignores rows it already has, so an idle phone stays idle', () => {
    const sent = changesToPush(mine, {});
    const state = markPushed({}, sent);
    const r = applyRemote(mine, state, asRows(sent));
    expect(r.changed).toBe(false);
    expect(r.data).toBe(mine);
  });

  it('shares deletions both ways', () => {
    const state = markPushed({}, changesToPush(mine, {}));
    const noItem = { ...mine, items: [] };
    const del = changesToPush(noItem, state);
    expect(del).toEqual([{ kind: 'item', id: 'i1', data: null, deleted: true }]);
    const after = markPushed(state, del);
    expect(changesToPush(noItem, after)).toEqual([]);
    const r = applyRemote(mine, state, asRows([{ kind: 'trip', id: 't1', data: null, deleted: true }]));
    expect(r.data.trips).toEqual([]);
  });
});
