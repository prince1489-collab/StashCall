import type { AppData } from '../storage/store';
import type { Item, Person, Trip } from '../domain/types';

/**
 * Family sharing, as pure functions: AppData becomes one record per trip,
 * item and person, plus the household's settings. Photos and anything else
 * that only makes sense on this phone stay out of the records; tickets are
 * listed by id and their screenshots shared through storage.
 *
 * Conflicts: the phone pulls first. A remote change replaces the local copy
 * unless this phone has an unsent change to the same thing, in which case
 * this phone's version wins and is sent. With two or three people that is
 * simple and predictable.
 */

export type RecordKind = 'trip' | 'item' | 'person' | 'prefs';

export interface SyncRow {
  kind: RecordKind;
  id: string;
  data: unknown;
  deleted: boolean;
  updated_at: string;
}

/** Per record: a fingerprint of the version last agreed with the server. */
export type SyncState = Record<string, string>;

export const keyOf = (kind: RecordKind, id: string) => `${kind}:${id}`;

interface Prefs {
  insurance?: AppData['insurance'];
  insuranceEnds?: AppData['insuranceEnds'];
  passportExpires?: AppData['passportExpires'];
}

/**
 * A trip as the household sees it. Tickets go by id only: the screenshots
 * themselves travel separately (sync/tickets.ts), and each phone keeps its
 * own copy. Insurance and visa photos stay on this phone.
 */
function shareableTrip(t: Trip): Omit<Trip, 'tickets' | 'docs' | 'passes'> & { tickets: { id: string; addedAt: string }[] } {
  const { tickets, docs: _d, passes: _p, ...rest } = t;
  return { ...rest, tickets: (tickets ?? []).map(({ id, addedAt }) => ({ id, addedAt })) };
}
function shareableItem(i: Item): Omit<Item, 'photoUri'> {
  const { photoUri: _p, ...rest } = i;
  return rest;
}

/** Stable JSON: same content, same string, whatever the key order. */
export function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Everything this phone would share, keyed by record. */
export function localRecords(data: AppData): Map<string, { kind: RecordKind; id: string; data: unknown }> {
  const out = new Map<string, { kind: RecordKind; id: string; data: unknown }>();
  for (const t of data.trips) out.set(keyOf('trip', t.id), { kind: 'trip', id: t.id, data: shareableTrip(t) });
  for (const i of data.items) out.set(keyOf('item', i.id), { kind: 'item', id: i.id, data: shareableItem(i) });
  for (const p of data.owners) out.set(keyOf('person', p.id), { kind: 'person', id: p.id, data: p });
  const prefs: Prefs = { insurance: data.insurance, insuranceEnds: data.insuranceEnds, passportExpires: data.passportExpires };
  out.set(keyOf('prefs', 'household'), { kind: 'prefs', id: 'household', data: prefs });
  return out;
}

/** What this phone has changed since it last agreed with the server: rows to send. */
export function changesToPush(data: AppData, state: SyncState): Omit<SyncRow, 'updated_at'>[] {
  const local = localRecords(data);
  const rows: Omit<SyncRow, 'updated_at'>[] = [];
  for (const [key, r] of local) {
    if (state[key] !== fingerprint(r.data)) rows.push({ ...r, deleted: false });
  }
  // Known to the server but gone here: deleted on this phone.
  for (const key of Object.keys(state)) {
    if (local.has(key) || state[key] === DELETED) continue;
    const [kind, ...id] = key.split(':');
    rows.push({ kind: kind as RecordKind, id: id.join(':'), data: null, deleted: true });
  }
  return rows;
}

const DELETED = '∅';

/** After a push succeeds, these rows are what the server holds. */
export function markPushed(state: SyncState, rows: Pick<SyncRow, 'kind' | 'id' | 'data' | 'deleted'>[]): SyncState {
  const next = { ...state };
  for (const r of rows) next[keyOf(r.kind, r.id)] = r.deleted ? DELETED : fingerprint(r.data);
  return next;
}

/**
 * Applies rows from the server. A row is skipped when this phone has an
 * unsent change to the same record; that change is pushed next and wins.
 */
export function applyRemote(data: AppData, state: SyncState, rows: SyncRow[]): { data: AppData; state: SyncState; changed: boolean } {
  const local = localRecords(data);
  let next = data;
  const nextState = { ...state };
  let changed = false;
  for (const row of rows) {
    const key = keyOf(row.kind, row.id);
    // Already applied (pulls overlap a little): nothing to do.
    if (state[key] === (row.deleted ? DELETED : fingerprint(row.data))) continue;
    const mine = local.get(key);
    const known = key in state;
    // Changed here since we last agreed with the server, and not sent yet.
    const changedHere =
      mine && known && state[key] !== fingerprint(mine.data) && !onlyNewTicketList(state[key], row.kind, mine.data);
    // Deleted here, and the deletion not sent yet.
    const deletedHere = !mine && known && state[key] !== DELETED;
    // Anything this phone made before it joined loses to the household's copy.
    if (changedHere || deletedHere) continue;
    next = row.deleted ? remove(next, row.kind, row.id) : put(next, row.kind, row.id, row.data);
    nextState[key] = row.deleted ? DELETED : fingerprint(row.data);
    changed = true;
  }
  return { data: changed ? next : data, state: nextState, changed };
}

/**
 * Builds before ticket sharing agreed on trips without a ticket list. Adding
 * the list isn't an edit made on this phone, so it mustn't win over a change
 * from the others; the list is sent after their change is applied.
 */
function onlyNewTicketList(agreed: string | undefined, kind: RecordKind, mine: unknown): boolean {
  if (kind !== 'trip' || !agreed || agreed === DELETED) return false;
  try {
    const before = JSON.parse(agreed) as Record<string, unknown> | null;
    if (!before || 'tickets' in before) return false;
  } catch {
    return false;
  }
  const { tickets: _t, ...rest } = mine as Record<string, unknown>;
  return fingerprint(rest) === agreed;
}

function remove(data: AppData, kind: RecordKind, id: string): AppData {
  switch (kind) {
    case 'trip':
      return { ...data, trips: data.trips.filter((t) => t.id !== id) };
    case 'item':
      return { ...data, items: data.items.filter((i) => i.id !== id) };
    case 'person':
      return { ...data, owners: data.owners.filter((p) => p.id !== id), meId: data.meId === id ? undefined : data.meId };
    default:
      return data;
  }
}

function put(data: AppData, kind: RecordKind, id: string, value: unknown): AppData {
  switch (kind) {
    case 'trip': {
      const remote = value as Omit<Trip, 'tickets'> & { tickets?: { id: string; addedAt: string }[] };
      const old = data.trips.find((t) => t.id === id);
      // The household's list of tickets, with this phone's copy of each. One
      // this phone hasn't fetched yet has no file (uri '') until it arrives.
      // A phone on an older build sends no list at all: keep what's here.
      const tickets = remote.tickets
        ? remote.tickets.map((r) => old?.tickets?.find((x) => x.id === r.id) ?? { id: r.id, addedAt: r.addedAt, uri: '' })
        : (old?.tickets ?? []);
      // Document photos and boarding passes never leave this phone.
      const trip: Trip = { ...remote, tickets: tickets.length > 0 ? tickets : undefined, docs: old?.docs, passes: old?.passes };
      if (old) return { ...data, trips: data.trips.map((t) => (t.id === id ? trip : t)) };
      // A new trip goes first if it was made after the current one, like a trip made here.
      const first = data.trips[0];
      return first && first.createdAt > trip.createdAt
        ? { ...data, trips: [...data.trips, trip] }
        : { ...data, trips: [trip, ...data.trips] };
    }
    case 'item': {
      const old = data.items.find((i) => i.id === id);
      const item: Item = { ...(value as Item), photoUri: old?.photoUri };
      return old ? { ...data, items: data.items.map((i) => (i.id === id ? item : i)) } : { ...data, items: [...data.items, item] };
    }
    case 'person': {
      const p = value as Person;
      return data.owners.some((o) => o.id === id)
        ? { ...data, owners: data.owners.map((o) => (o.id === id ? p : o)) }
        : { ...data, owners: [...data.owners, p] };
    }
    case 'prefs': {
      const prefs = value as Prefs;
      return { ...data, insurance: prefs.insurance, insuranceEnds: prefs.insuranceEnds, passportExpires: prefs.passportExpires };
    }
  }
}
