import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { Trip } from '../domain/types';
import { removeTrip } from '../domain/household';
import { deleteAllPhotos, deletePhoto } from '../storage/photos';
import { EMPTY_DATA, clearData, loadData, saveData } from '../storage/store';
import type { AppData } from '../storage/store';

interface AppDataContext {
  data: AppData;
  ready: boolean;
  /** The trip the app is focused on. Phase 1 keeps one active trip. */
  currentTrip?: Trip;
  saveTrip: (trip: Trip) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  update: (fn: (d: AppData) => AppData) => Promise<void>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<AppDataContext | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  // Source of truth for writes, so consecutive updates never lose each other.
  const current = useRef<AppData>(EMPTY_DATA);

  useEffect(() => {
    loadData().then((d) => {
      current.current = d;
      setData(d);
      setReady(true);
    });
  }, []);

  const update = useCallback(async (fn: (d: AppData) => AppData) => {
    const next = fn(current.current);
    current.current = next;
    setData(next);
    await saveData(next);
  }, []);

  const saveTrip = useCallback(
    (trip: Trip) =>
      update((d) => {
        const exists = d.trips.some((t) => t.id === trip.id);
        return {
          ...d,
          trips: exists ? d.trips.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...d.trips],
        };
      }),
    [update],
  );

  const deleteTrip = useCallback(
    (id: string) => {
      // One-off items go with their trip, photos included.
      for (const i of current.current.items) if (i.tripId === id) deletePhoto(i.photoUri);
      for (const t of current.current.trips.find((x) => x.id === id)?.tickets ?? []) deletePhoto(t.uri);
      return update((d) => removeTrip(d, id));
    },
    [update],
  );

  const resetAll = useCallback(async () => {
    await clearData();
    deleteAllPhotos();
    current.current = EMPTY_DATA;
    setData(EMPTY_DATA);
  }, []);

  const value = useMemo<AppDataContext>(
    () => ({
      data,
      ready,
      currentTrip: data.trips[0],
      saveTrip,
      deleteTrip,
      update,
      resetAll,
    }),
    [data, ready, saveTrip, deleteTrip, update, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppDataContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
