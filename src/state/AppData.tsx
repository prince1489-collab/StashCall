import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Trip } from '../domain/types';
import { removeTrip } from '../domain/household';
import { isGoing, tripFor } from '../domain/people';
import { nextTrip } from '../domain/trips';
import { deleteAllPhotos, deletePhoto } from '../storage/photos';
import { EMPTY_DATA, clearData, loadData, saveData } from '../storage/store';
import type { AppData } from '../storage/store';

interface AppDataContext {
  data: AppData;
  ready: boolean;
  /** The trip being looked at on the Trip and Items tabs: the one picked from the trips list, else the next one. */
  currentTrip?: Trip;
  /** The current trip as this phone's person travels it: with their own flights, if they have them. For showing and reminding, not for saving. */
  myTrip?: Trip;
  /** The next trip coming up, whatever is being looked at. Today follows this one. */
  comingTrip?: Trip;
  /** The next trip as this phone's person travels it. */
  myComingTrip?: Trip;
  /** The trip picked from the trips list, if any. Unset, the Trip tab shows the list. */
  viewingId?: string;
  /** Look at another trip on the Trip and Items tabs. Undefined goes back to the next one. */
  viewTrip: (id: string | undefined) => void;
  saveTrip: (trip: Trip) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  update: (fn: (d: AppData) => AppData) => Promise<void>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<AppDataContext | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  // Which trip is open on the Trip tab. Kept only while the app runs, so it
  // opens on the next trip each time.
  const [viewId, setViewId] = useState<string | undefined>();
  // Which trip is next changes with time: re-check every few minutes and whenever the app opens.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5 * 60 * 1000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setClock(Date.now());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
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
    (trip: Trip) => {
      if (!current.current.trips.some((t) => t.id === trip.id)) setViewId(trip.id);
      return update((d) => {
        const exists = d.trips.some((t) => t.id === trip.id);
        return {
          ...d,
          trips: exists ? d.trips.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...d.trips],
        };
      });
    },
    [update],
  );

  const deleteTrip = useCallback(
    (id: string) => {
      // One-off items go with their trip, photos included.
      for (const i of current.current.items) if (i.tripId === id) deletePhoto(i.photoUri);
      const trip = current.current.trips.find((x) => x.id === id);
      for (const t of [...(trip?.tickets ?? []), ...(trip?.docs?.insurance ?? []), ...(trip?.docs?.visa ?? []), ...(trip?.passes ?? [])]) deletePhoto(t.uri);
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

  const value = useMemo<AppDataContext>(() => {
    // Judged as this phone's person travels, so their own later flight keeps a trip coming.
    const mine = nextTrip(data.trips.filter((t) => isGoing(t, data.meId)).map((t) => tripFor(t, data.meId)), new Date(clock));
    const coming = mine && data.trips.find((t) => t.id === mine.id);
    // Someone else's trip still opens on the Trip tab when it's the only one.
    const current = data.trips.find((t) => t.id === viewId) ?? coming ?? (data.trips.length === 1 ? data.trips[0] : undefined);
    return {
      data,
      ready,
      currentTrip: current,
      myTrip: current && tripFor(current, data.meId),
      comingTrip: coming,
      myComingTrip: coming && tripFor(coming, data.meId),
      viewingId: current && current.id === viewId ? viewId : undefined,
      viewTrip: setViewId,
      saveTrip,
      deleteTrip,
      update,
      resetAll,
    };
  }, [data, ready, viewId, clock, saveTrip, deleteTrip, update, resetAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppDataContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
