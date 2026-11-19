import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, Text } from 'react-native';

import { FEEDBACK_URL } from '../config';
import { useAppData } from '../state/AppData';
import { Row, Section } from '../ui/Form';
import { ReminderStatus } from '../ui/ReminderStatus';
import { colors, space } from '../ui/theme';

export default function Settings() {
  const { data, resetAll } = useAppData();

  const deleteAll = () =>
    Alert.alert(
      'Delete all your data?',
      'This removes your trips, items, owners and photos from this phone and cancels every reminder. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await resetAll();
            router.back();
          },
        },
      ],
    );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Reminders</Text>
      <ReminderStatus />

      <Section title="Your data">
        <Row
          label="Stored on this phone only"
          hint={`${data.trips.length} trip${data.trips.length === 1 ? '' : 's'}, ${data.items.length} item${
            data.items.length === 1 ? '' : 's'
          }. Nothing is sent to a server.`}
        />
        <Text style={[styles.action, { color: colors.danger }]} onPress={deleteAll} accessibilityRole="button">
          Delete all my data
        </Text>
      </Section>

      {FEEDBACK_URL ? (
        <Section title="Tester feedback">
          <Text style={styles.action} onPress={() => Linking.openURL(FEEDBACK_URL)} accessibilityRole="link">
            Tell us what worked and what didn't
          </Text>
        </Section>
      ) : null}

      <Text style={styles.version}>StashCall {Constants.expoConfig?.version ?? ''} · tester build</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  heading: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', marginLeft: space.xs },
  action: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.l },
  version: { textAlign: 'center', color: colors.muted, fontSize: 13, marginTop: space.l },
});
