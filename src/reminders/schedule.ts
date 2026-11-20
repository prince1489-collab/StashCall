import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedReminder } from './plan';

const CHANNEL = 'travel-reminders';

/** Notification button sets. Item reminders get "Done", every reminder gets snooze. */
export const CATEGORY_ITEMS = 'reminder-items';
export const CATEGORY_PLAIN = 'reminder-plain';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';
export const SNOOZE_MINUTES = 15;
const SNOOZE_PREFIX = 'snooze:';

// The buttons open the app briefly: Android only runs our code for a button
// press when the app comes up, so this is the reliable way to act on it.
const DONE_BUTTON = { identifier: ACTION_DONE, buttonTitle: 'Done ✓', options: { opensAppToForeground: true } };
const SNOOZE_BUTTON = {
  identifier: ACTION_SNOOZE,
  buttonTitle: `In ${SNOOZE_MINUTES} min`,
  options: { opensAppToForeground: true },
};

/** Show reminders even when the app is open. Call once at start-up. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  Notifications.setNotificationCategoryAsync(CATEGORY_ITEMS, [DONE_BUTTON, SNOOZE_BUTTON]).catch(() => {});
  Notifications.setNotificationCategoryAsync(CATEGORY_PLAIN, [SNOOZE_BUTTON]).catch(() => {});
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Travel reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    }).catch(() => {});
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionState;
}

/** Asks once; returns the result. Safe to call repeatedly. */
export async function requestPermission(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted' || !current.canAskAgain) return current.status as PermissionState;
  const { status } = await Notifications.requestPermissionsAsync();
  return status as PermissionState;
}

/** Android 12+: whether reminders can fire at the exact minute. Always true on iOS. */
export async function hasExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted;
  } catch {
    return true;
  }
}

export async function requestExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Makes the phone's scheduled notifications match `plan` exactly:
 * everything StashCall scheduled before is cancelled, then the plan is
 * scheduled. Simple and safe because the plan is small (≤ 5 per trip).
 */
export async function syncReminders(plan: PlannedReminder[]): Promise<number> {
  // Cancel everything except snoozes, which the user asked for themselves.
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => !n.identifier.startsWith(SNOOZE_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if ((await getPermission()) !== 'granted') return 0;
  let scheduled = 0;
  for (const r of plan) {
    if (r.at.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: {
        title: r.title,
        body: r.body,
        sound: 'default',
        data: { kind: r.kind, tripId: r.tripId },
        categoryIdentifier: r.hasItems ? CATEGORY_ITEMS : CATEGORY_PLAIN,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId: CHANNEL,
        delivery: r.critical ? 'alarmClock' : 'bestEffort',
      },
    });
    scheduled++;
  }
  return scheduled;
}

/** Shows the same reminder again in SNOOZE_MINUTES. Survives syncReminders. */
export async function snoozeReminder(content: Notifications.NotificationContent, key: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: `${SNOOZE_PREFIX}${key}`,
    content: {
      title: content.title ?? 'StashCall',
      body: content.body ?? '',
      sound: 'default',
      data: content.data,
      categoryIdentifier: content.categoryIdentifier ?? undefined,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: SNOOZE_MINUTES * 60,
      channelId: CHANNEL,
    },
  });
}

/** Sends a sample reminder a few seconds from now so testers can trust it works. */
export async function sendTestReminder(body: string): Promise<boolean> {
  if ((await requestPermission()) !== 'granted') return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'StashCall test reminder', body, sound: 'default', categoryIdentifier: CATEGORY_PLAIN },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL,
    },
  });
  return true;
}
