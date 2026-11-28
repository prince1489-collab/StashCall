import { router } from 'expo-router';
import type { Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import { checkInPath } from '../domain/checkin';
import { tickAll } from '../domain/checklist';
import { setPrep } from '../domain/prep';
import { buildTimeline } from '../domain/timeline';
import { tripFor } from '../domain/people';
import { reminderItems } from '../domain/tripItems';
import type { PrepKind, StepKind } from '../domain/types';
import { newId } from '../storage/store';
import { useAppData } from '../state/AppData';
import { ACTION_DONE, ACTION_SNOOZE, snoozeReminder } from './schedule';

/**
 * Acts on the buttons on a reminder: "Done" ticks off that reminder's items,
 * "In 15 min" shows it again later. Both clear the notification.
 * Renders nothing.
 */
export function NotificationActions() {
  const { data, ready, update } = useAppData();
  const handled = useRef(new Set<string>());
  // Read the latest data inside the listener without re-subscribing.
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => {
    if (!ready) return;

    const handle = async (response: Notifications.NotificationResponse) => {
      const { actionIdentifier, notification } = response;
      const request = notification.request;
      if (actionIdentifier !== ACTION_DONE && actionIdentifier !== ACTION_SNOOZE) {
        // A plain tap opens the app; reminders are sticky, so clear it too.
        if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          await Notifications.dismissNotificationAsync(request.identifier).catch(() => {});
          // A check-in reminder opens StashCall's check-in, which fills in the
          // PNR on the airline's page. Older reminders open the website itself.
          const { url, tripId, flight } = (request.content.data ?? {}) as { url?: unknown; tripId?: unknown; flight?: unknown };
          const key = `${request.identifier}:open:${notification.date}`;
          if (typeof url === 'string' && url.startsWith('https://') && !handled.current.has(key)) {
            handled.current.add(key);
            if (typeof tripId === 'string' && typeof flight === 'string') {
              try {
                router.push(checkInPath(tripId, flight) as Href);
              } catch {
                await Linking.openURL(url).catch(() => {});
              }
            } else await Linking.openURL(url).catch(() => {});
          }
        }
        return;
      }
      const key = `${request.identifier}:${actionIdentifier}:${notification.date}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);

      const { kind, tripId } = (request.content.data ?? {}) as { kind?: StepKind | PrepKind; tripId?: string };
      if (actionIdentifier === ACTION_SNOOZE) {
        await snoozeReminder(request.content, tripId && kind ? `${tripId}:${kind}` : request.identifier);
      } else if (tripId && (kind === 'insurance' || kind === 'visa' || kind === 'passport')) {
        await update((d) => setPrep(d, tripId, kind, 'done', newId));
      } else if (tripId && kind) {
        const trip = latest.current.trips.find((t) => t.id === tripId);
        const step = trip && buildTimeline(tripFor(trip, latest.current.meId)).find((s) => s.kind === kind);
        if (trip && step) {
          const stepKind = step.kind;
          const ids = reminderItems(trip, latest.current.items, step, latest.current.owners, latest.current.meId).map((i) => i.id);
          await update((d) => tickAll(d, tripId, stepKind, ids));
        }
      }
      await Notifications.dismissNotificationAsync(request.identifier).catch(() => {});
      // Otherwise a reload would hand us the same press again.
      Notifications.clearLastNotificationResponse();
    };

    // A button press that launched the app, then any while it's running.
    const last = Notifications.getLastNotificationResponse();
    if (last) handle(last).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handle(r).catch(() => {});
    });
    return () => sub.remove();
  }, [ready, update]);

  return null;
}
