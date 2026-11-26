import { describe, expect, it } from 'vitest';

import { EMPTY_DATA } from '../../storage/store';
import type { AppData } from '../../storage/store';
import type { Trip } from '../../domain/types';
import { applyRemote, changesToPush, fingerprint, markPushed } from '../records';
import type { SyncRow } from '../records';
import { toDownload, toRemove, toUpload } from '../ticketPlan';

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
    // Dad's phone knows about my ticket, and fetches the screenshot next.
    expect(dad.data.trips[0].tickets).toEqual([{ id: 'k', addedAt: '2026-11-24T00:00:00Z', uri: '' }]);
    expect(dad.data.insurance).toBe('annual');
    expect(dad.data.meId).toBeUndefined();
    expect(changesToPush(dad.data, dad.state)).toEqual([]);
  });

  it("applies Dad's tick and keeps my photos", () => {
    const state = markPushed({}, changesToPush(mine, {}));
    const remote = { ...trip, tickets: [{ id: 'k', addedAt: '2026-11-24T00:00:00Z' }], ticked: { pack: ['i1'] } };
    const r = applyRemote(mine, state, asRows([{ kind: 'trip', id: 't1', data: remote, deleted: false }]));
    expect(r.data.trips[0].ticked.pack).toEqual(['i1']);
    expect(r.data.trips[0].tickets?.[0].uri).toBe('file:///mine.jpg');
    expect(r.data.items[0].photoUri).toBe('file:///g.jpg');
    expect(changesToPush(r.data, r.state)).toEqual([]);
  });

  it('keeps my tickets when a phone on an older build sends the trip', () => {
    const state = markPushed({}, changesToPush(mine, {}));
    const { tickets: _t, ...old } = { ...trip, ticked: { pack: ['i1'] } };
    const r = applyRemote(mine, state, asRows([{ kind: 'trip', id: 't1', data: old, deleted: false }]));
    expect(r.data.trips[0].tickets?.[0].uri).toBe('file:///mine.jpg');
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

  it("drops a ticket Dad removed, and keeps my file for the ones still there", () => {
    const two: AppData = { ...mine, trips: [{ ...trip, tickets: [...trip.tickets!, { id: 'k2', uri: 'file:///two.jpg', addedAt: 'x' }] }] };
    const state = markPushed({}, changesToPush(two, {}));
    const { docs: _d, ...remote } = { ...trip, tickets: [{ id: 'k2', addedAt: 'x' }] };
    const r = applyRemote(two, state, asRows([{ kind: 'trip', id: 't1', data: remote, deleted: false }]));
    expect(r.data.trips[0].tickets).toEqual([{ id: 'k2', uri: 'file:///two.jpg', addedAt: 'x' }]);
  });

  it('keeps boarding passes on this phone: never sent, kept when the trip changes elsewhere', () => {
    const pass = { id: 'p1', uri: 'file:///pass.jpg', addedAt: 'x' };
    const withPass: AppData = { ...mine, trips: [{ ...trip, passes: [pass] }] };
    const sent = changesToPush(withPass, {}).find((r) => r.kind === 'trip')!.data as Record<string, unknown>;
    expect('passes' in sent).toBe(false);
    const state = markPushed({}, changesToPush(withPass, {}));
    const r = applyRemote(withPass, state, asRows([{ kind: 'trip', id: 't1', data: { ...sent, name: 'Renamed' }, deleted: false }]));
    expect(r.data.trips[0].name).toBe('Renamed');
    expect(r.data.trips[0].passes).toEqual([pass]);
  });
});

describe('ticket screenshots', () => {
  const trips: Trip[] = [
    { ...trip, tickets: [{ id: 'a', uri: 'file:///a.jpg', addedAt: '' }, { id: 'b', uri: '', addedAt: '' }] },
  ];

  it('sends tickets made here once, fetches the others, and removes deleted ones', () => {
    expect(toUpload(trips, [])).toEqual([{ id: 'a', uri: 'file:///a.jpg' }]);
    expect(toUpload(trips, ['a'])).toEqual([]);
    expect(toDownload(trips)).toEqual([{ tripId: 't1', id: 'b' }]);
    expect(toRemove(trips, ['a', 'gone'])).toEqual(['gone']);
  });

  it("takes Dad's edit after upgrading, then sends my ticket list", () => {
    // What an older build agreed with the server: the trip without tickets.
    const { tickets: _t, ...legacy } = trip;
    const state = { 'trip:t1': fingerprint(legacy) };
    const renamed = { ...legacy, name: 'Pantnagar trip' };
    const r = applyRemote(mine, state, asRows([{ kind: 'trip', id: 't1', data: renamed, deleted: false }]));
    expect(r.data.trips[0].name).toBe('Pantnagar trip');
    expect(r.data.trips[0].tickets?.[0].uri).toBe('file:///mine.jpg');
    const out = changesToPush(r.data, r.state).find((x) => x.id === 't1');
    expect(out?.data).toMatchObject({ name: 'Pantnagar trip', tickets: [{ id: 'k' }] });
  });
});

describe('people changed on two phones', () => {
  it("keeps Dad's travel update and my edit to his passport date", () => {
    const dad = { id: 'b', name: 'Bajrang' };
    const base: AppData = { ...EMPTY_DATA, owners: [dad] };
    const state = markPushed({}, changesToPush(base, {}));
    // Here: I set his passport date. There: he says he's left.
    const here: AppData = { ...base, owners: [{ ...dad, passportExpires: '2030-01-01' }] };
    const status = { tripId: 't1', step: 'left' as const, at: '2026-12-06T00:30:00Z' };
    const r = applyRemote(here, state, asRows([{ kind: 'person', id: 'b', data: { ...dad, status }, deleted: false }]));
    expect(r.data.owners[0]).toEqual({ ...dad, passportExpires: '2030-01-01', status });
    // The merged record goes back to the server.
    expect(changesToPush(r.data, r.state).map((x) => x.data)).toEqual([{ ...dad, passportExpires: '2030-01-01', status }]);
  });
});
