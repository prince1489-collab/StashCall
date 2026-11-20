import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Linking, Platform, Share } from 'react-native';

import { FEEDBACK_URL } from '../config';

/** One line testers can paste or send as is, so we know which build they ran. */
export function buildInfo(): string {
  const version = Constants.expoConfig?.version ?? '?';
  const phone = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'unknown phone';
  return `StashCall ${version} · ${phone} · ${Platform.OS} ${Device.osVersion ?? Platform.Version}`;
}

/**
 * Opens the feedback form if one is set; otherwise the share sheet with a
 * short template, so testers can send it on WhatsApp, email or text.
 */
export async function sendFeedback(): Promise<void> {
  if (FEEDBACK_URL) {
    await Linking.openURL(FEEDBACK_URL);
    return;
  }
  await Share.share({
    message: `StashCall feedback\n\nWhat worked:\n\nWhat was confusing or broken:\n\n(${buildInfo()})`,
  });
}
