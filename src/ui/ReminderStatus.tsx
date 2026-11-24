import Constants from 'expo-constants';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { useReminders } from '../reminders/Reminders';
import { openAlarmSoundSettings, sendTestReminder } from '../reminders/schedule';
import { colors, space } from './theme';

/** Shows whether reminders are set, fixes permission problems, and offers a test. */
export function ReminderStatus({ problemsOnly = false }: { problemsOnly?: boolean } = {}) {
  const { permission, exact, scheduled, askPermission, askExact } = useReminders();

  const test = async () => {
    const ok = await sendTestReminder('This is what your travel reminders look like. You can close the app now.');
    if (!ok) {
      Alert.alert('Notifications are off', 'Turn on notifications for StashCall in Settings to get reminders.');
      return;
    }
    Alert.alert(
      'Test reminder on its way',
      Platform.OS === 'android'
        ? 'It will arrive in about 5 seconds. Try locking your phone. It rings at your alarm volume, so it sounds even when the phone is on silent.'
        : 'It will arrive in about 5 seconds. Try locking your phone.',
    );
  };

  if (permission !== 'granted') {
    return (
      <View style={[styles.card, styles.warnCard]}>
        <Text style={styles.title}>Reminders are off</Text>
        <Text style={styles.text}>StashCall can't remind you to pack or sweep the room without notifications.</Text>
        <Text
          style={styles.link}
          accessibilityRole="button"
          onPress={async () => {
            const p = await askPermission();
            if (p !== 'granted') Linking.openSettings();
          }}
        >
          Turn on notifications
        </Text>
      </View>
    );
  }

  // Today only speaks up when reminders might not arrive.
  if (problemsOnly && exact) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {scheduled === 0 ? 'No reminders coming up' : `${scheduled} reminder${scheduled > 1 ? 's' : ''} set`}
      </Text>
      {!exact ? (
        <>
          <Text style={styles.text}>Your phone may deliver reminders a few minutes late.</Text>
          <Text style={styles.link} accessibilityRole="button" onPress={askExact}>
            Allow on-time reminders
          </Text>
        </>
      ) : null}
      <Text style={styles.link} accessibilityRole="button" onPress={test}>
        Send a test reminder
      </Text>
      {Platform.OS === 'android' ? (
        <Text
          style={styles.link}
          accessibilityRole="button"
          onPress={() => openAlarmSoundSettings(Constants.expoConfig?.android?.package ?? 'com.stashcall.app')}
        >
          Reminder sound settings
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: space.l,
    marginTop: space.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.s,
  },
  warnCard: { borderColor: colors.warn, backgroundColor: '#FFF8EC' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  text: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600', paddingVertical: space.xs },
});
