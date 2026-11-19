import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAppData } from '../state/AppData';
import { planReminders } from './plan';
import type { PermissionState } from './schedule';
import { getPermission, hasExactAlarms, requestExactAlarms, requestPermission, syncReminders } from './schedule';

interface RemindersContext {
  permission: PermissionState;
  /** False only on Android when exact alarms are off (reminders may be late). */
  exact: boolean;
  /** How many reminders are scheduled on the phone right now. */
  scheduled: number;
  askPermission: () => Promise<PermissionState>;
  askExact: () => Promise<void>;
}

const Ctx = createContext<RemindersContext | null>(null);

/**
 * Keeps the phone's scheduled notifications in step with the current trip.
 * Re-syncs whenever trips or items change and whenever the app comes back
 * to the foreground (to pick up permission changes made in Settings).
 */
export function RemindersProvider({ children }: { children: ReactNode }) {
  const { data, ready, currentTrip } = useAppData();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [exact, setExact] = useState(true);
  const [scheduled, setScheduled] = useState(0);
  const [tick, setTick] = useState(0);

  const sync = useCallback(async () => {
    const [perm, ex] = await Promise.all([getPermission(), hasExactAlarms()]);
    setPermission(perm);
    setExact(ex);
    const plan = currentTrip ? planReminders(currentTrip, data.items, new Date()) : [];
    setScheduled(await syncReminders(plan));
  }, [currentTrip, data.items]);

  useEffect(() => {
    if (!ready) return;
    sync().catch(() => setScheduled(0));
  }, [ready, sync, tick]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  const askPermission = useCallback(async () => {
    const p = await requestPermission();
    setTick((t) => t + 1);
    return p;
  }, []);

  const askExact = useCallback(async () => {
    await requestExactAlarms();
    setTick((t) => t + 1);
  }, []);

  const value = useMemo(
    () => ({ permission, exact, scheduled, askPermission, askExact }),
    [permission, exact, scheduled, askPermission, askExact],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminders(): RemindersContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReminders must be used inside RemindersProvider');
  return ctx;
}
