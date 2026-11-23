import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { PlannedReminder } from './plan';

// Android fixes a channel's sound and importance when it's first created, so
// alarm-style reminders need a new channel id.
const CHANNEL = 'travel-alarms';
const OLD_CHANNEL = 'travel-reminders';
/** Bundled via the expo-notifications plugin in app.json (assets/sounds). */
const ALARM_SOUND = 'stashcall_alarm.wav';

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
      name: 'Travel alarms',
      description: 'Packing, wake-up, leave-home and room-sweep reminders',
      importance: Notifications.AndroidImportance.MAX,
      sound: ALARM_SOUND,
      // Play on the alarm volume, so a phone on silent still rings.
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800],
      enableVibrate: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
    // The old quiet channel is kept: a snooze set before this update still
    // points at it, and deleting it would push that snooze onto Expo's
    // fallback channel. It holds nothing else now.
    void OLD_CHANNEL;
  }
}

/**
 * Opens Android's settings page for the alarm channel, where the user can
 * check the sound and volume StashCall's reminders use.
 */
export async function openAlarmSoundSettings(packageName: string): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: packageName },
      { key: 'android.provider.extra.CHANNEL_ID', value: CHANNEL },
    ]);
  } catch {
    await Linking.openSettings();
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
export async function syncReminders(plan: PlannedReminder[], tripIds: string[]): Promise<number> {
  // Cancel everything except snoozes, which the user asked for themselves,
  // unless the snoozed reminder's trip has since been deleted.
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const keep = (n: Notifications.NotificationRequest) => {
    if (!n.identifier.startsWith(SNOOZE_PREFIX)) return false;
    const tripId = (n.content.data as { tripId?: string } | undefined)?.tripId;
    return !tripId || tripIds.includes(tripId);
  };
  await Promise.all(
    existing.filter((n) => !keep(n)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
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
        sound: ALARM_SOUND,
        priority: Notifications.AndroidNotificationPriority.MAX,
        // Stays until "Done", "In 15 min" or a tap, like an alarm.
        sticky: true,
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
      sound: ALARM_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
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
    content: {
      title: 'StashCall test reminder',
      body,
      sound: ALARM_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: CATEGORY_PLAIN,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL,
    },
  });
  return true;
}
