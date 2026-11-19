import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time, refreshed every `intervalMs`, when the screen regains
 * focus and when the app returns to the foreground, so "next step" views
 * move on as steps pass.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  const refresh = useCallback(() => setNow(new Date()), []);

  useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs, refresh]);

  useFocusEffect(refresh);
  return now;
}
