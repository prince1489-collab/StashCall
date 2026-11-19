import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedReminder } from './plan';

const CHANNEL = 'travel-reminders';

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
  await Notifications.cancelAllScheduledNotificationsAsync();
  if ((await getPermission()) !== 'granted') return 0;
  let scheduled = 0;
  for (const r of plan) {
    if (r.at.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, sound: 'default', data: { kind: r.kind } },
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

/** Sends a sample reminder a few seconds from now so testers can trust it works. */
export async function sendTestReminder(body: string): Promise<boolean> {
  if ((await requestPermission()) !== 'granted') return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'StashCall test reminder', body, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL,
    },
  });
  return true;
}
