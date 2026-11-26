import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAppData } from '../state/AppData';
import { ensureSignedIn, SHARING_SET_UP, supabase } from './client';
import { newStatuses } from '../domain/status';
import { notifyFamily } from '../reminders/schedule';
import { applyRemote, changesToPush, markPushed } from './records';
import type { SyncRow, SyncState } from './records';
import { toDownload } from './ticketPlan';
import { syncTickets } from './tickets';

/** What this phone remembers about sharing. Never shared itself. */
interface Stored {
  householdId?: string;
  inviteCode?: string;
  state: SyncState;
  /** Server time of the newest record pulled so far. */
  lastPull?: string;
  /** Ticket screenshots the household's storage has. */
  tickets?: string[];
}

const KEY = 'stashcall:sync';
const EMPTY: Stored = { state: {} };

export type SyncStatus = 'not-set-up' | 'off' | 'syncing' | 'synced' | 'offline';

interface SyncContext {
  status: SyncStatus;
  inviteCode?: string;
  /** Starts a household from this phone's data. Returns the invite code. */
  create: () => Promise<string>;
  /** Joins with an invite code. False when the code is wrong. */
  join: (code: string) => Promise<boolean>;
  /** Stops sharing on this phone. Its data stays on the phone. */
  leave: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncContext | null>(null);

/** Wait after a change before sending, so a burst of ticks goes in one request. */
const PUSH_DELAY_MS = 1500;
/** A ticket the other phone hasn't finished uploading: look again this often, this many times. */
const TICKET_RETRY_MS = 20_000;
const TICKET_RETRIES = 15;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, ready, update } = useAppData();
  const [stored, setStored] = useState<Stored>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(SHARING_SET_UP ? 'off' : 'not-set-up');
  const storedRef = useRef(stored);
  const dataRef = useRef(data);
  dataRef.current = data;
  // One sync at a time; a request during a run asks for one more run.
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  // Bumped on leave: a run that started before must not apply or send anything after it.
  const epoch = useRef(0);
  // Pending look for tickets still on their way.
  const ticketRetry = useRef<{ timer?: ReturnType<typeof setTimeout>; left: number }>({ left: TICKET_RETRIES });

  const save = useCallback(async (next: Stored) => {
    storedRef.current = next;
    setStored(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const s = raw ? ({ ...EMPTY, ...JSON.parse(raw) } as Stored) : EMPTY;
        storedRef.current = s;
        setStored(s);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  /** Pull what changed on the server, then send what changed here. */
  const runOnce = useCallback(async () => {
    const sb = supabase();
    const s = storedRef.current;
    if (!sb || !s.householdId) return;
    const started = epoch.current;
    const stillHere = () => epoch.current === started && storedRef.current.householdId === s.householdId;
    setStatus('syncing');
    try {
      await ensureSignedIn(sb);
      let query = sb.from('records').select('kind,id,data,deleted,updated_at').eq('household_id', s.householdId);
      // Overlap a minute: a slow save can land with a slightly older server time.
      if (s.lastPull) query = query.gte('updated_at', new Date(Date.parse(s.lastPull) - 60_000).toISOString());
      const { data: rows, error } = await query.order('updated_at');
      if (error) throw error;
      if (!stillHere()) return;
      let state = s.state;
      if (rows && rows.length > 0) {
        const preview = applyRemote(dataRef.current, state, rows as SyncRow[]);
        // Only touch the app's data when something actually changed, or an idle
        // phone would keep re-saving and re-syncing the same rows.
        if (preview.changed) {
          let told: string[] = [];
          await update((d) => {
            const r = applyRemote(d, state, rows as SyncRow[]);
            state = r.state;
            told = newStatuses(d.owners, r.data.owners, r.data.meId, new Date());
            return r.data;
          });
          for (const t of told) notifyFamily(t).catch(() => {});
        } else {
          state = preview.state;
        }
      }
      const lastPull = rows && rows.length > 0 ? (rows[rows.length - 1] as SyncRow).updated_at : s.lastPull;

      const outgoing = changesToPush(dataRef.current, state);
      if (!stillHere()) return;
      if (outgoing.length > 0) {
        const { error: pushError } = await sb
          .from('records')
          .upsert(outgoing.map((r) => ({ ...r, household_id: s.householdId })));
        if (pushError) throw pushError;
        state = markPushed(state, outgoing);
      }
      if (!stillHere()) return;
      await save({ ...storedRef.current, state, lastPull });

      // Ticket screenshots. Slower, and a failure here shouldn't mark the
      // trips themselves as out of date.
      try {
        const tickets = await syncTickets(sb, s.householdId, dataRef.current, storedRef.current.tickets ?? [], async (tripId, ticketId, uri) => {
          if (!stillHere()) return;
          await update((d) => ({
            ...d,
            trips: d.trips.map((t) =>
              t.id === tripId ? { ...t, tickets: t.tickets?.map((x) => (x.id === ticketId ? { ...x, uri } : x)) } : t,
            ),
          }));
        });
        if (stillHere()) await save({ ...storedRef.current, tickets });
      } catch {
        // Tried again on the next sync.
      }
      // Storage uploads don't trigger a sync on the other phones, so a ticket
      // still on its way is looked for again shortly, a limited number of times.
      const retry = ticketRetry.current;
      if (retry.timer) clearTimeout(retry.timer);
      retry.timer = undefined;
      if (toDownload(dataRef.current.trips).length === 0) retry.left = TICKET_RETRIES;
      else if (retry.left > 0 && stillHere()) {
        retry.left -= 1;
        retry.timer = setTimeout(() => void syncNowRef.current?.(), TICKET_RETRY_MS);
      }
      if (!stillHere()) return;
      setStatus('synced');
    } catch {
      // No signal, or the server is unreachable: try again on the next change or when the app opens.
      setStatus('offline');
    }
  }, [save, update]);

  const syncNowRef = useRef<(() => Promise<void>) | null>(null);
  const syncNow = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    running.current = (async () => {
      do {
        again.current = false;
        await runOnce();
      } while (again.current);
    })().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [runOnce]);
  syncNowRef.current = syncNow;

  // Send local changes shortly after they happen.
  useEffect(() => {
    if (!ready || !loaded || !stored.householdId) return;
    const t = setTimeout(() => void syncNow(), PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [data, ready, loaded, stored.householdId, syncNow]);

  // Live changes from the other phones, and a catch-up whenever the app opens.
  useEffect(() => {
    const sb = supabase();
    if (!sb || !stored.householdId) return;
    const channel = sb
      .channel(`household:${stored.householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `household_id=eq.${stored.householdId}` }, () => void syncNow())
      .subscribe();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncNow();
    });
    return () => {
      sub.remove();
      void sb.removeChannel(channel);
    };
  }, [stored.householdId, syncNow]);

  const create = useCallback(async () => {
    const sb = supabase();
    if (!sb) throw new Error('Sharing is not set up in this build.');
    await ensureSignedIn(sb);
    const { data: rows, error } = await sb.rpc('create_household');
    if (error || !rows?.[0]) throw error ?? new Error('Could not start sharing.');
    const { id, invite_code } = rows[0] as { id: string; invite_code: string };
    await save({ householdId: id, inviteCode: invite_code, state: {} });
    await syncNow();
    return invite_code;
  }, [save, syncNow]);

  const join = useCallback(
    async (code: string) => {
      const sb = supabase();
      if (!sb) throw new Error('Sharing is not set up in this build.');
      await ensureSignedIn(sb);
      const { data: id, error } = await sb.rpc('join_household', { code });
      if (error) throw error;
      if (!id) return false;
      // Who this phone belongs to is chosen from the household's people, not
      // from anyone made here before joining.
      await update((d) => ({ ...d, meId: undefined }));
      await save({ householdId: id as string, inviteCode: code.trim().toUpperCase(), state: {} });
      await syncNow();
      return true;
    },
    [save, syncNow, update],
  );

  const leave = useCallback(async () => {
    const sb = supabase();
    const id = storedRef.current.householdId;
    epoch.current += 1;
    await save(EMPTY);
    setStatus(SHARING_SET_UP ? 'off' : 'not-set-up');
    if (sb && id) {
      const { data: session } = await sb.auth.getSession();
      const uid = session.session?.user.id;
      if (uid) await sb.from('members').delete().eq('household_id', id).eq('user_id', uid);
    }
  }, [save]);

  const value = useMemo<SyncContext>(
    () => ({
      status: stored.householdId ? status : SHARING_SET_UP ? 'off' : 'not-set-up',
      inviteCode: stored.inviteCode,
      create,
      join,
      leave,
      syncNow,
    }),
    [status, stored.householdId, stored.inviteCode, create, join, leave, syncNow],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
