import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { sendFeedback } from '../feedback/sendFeedback';
import { useAppData } from '../state/AppData';
import type { InsuranceCover } from '../domain/types';
import { COVER_LABELS } from '../ui/BeforeYouGo';
import { shortDate } from '../domain/prep';
import { Row, Section, pickDate } from '../ui/Form';
import { ReminderStatus } from '../ui/ReminderStatus';
import { colors, space } from '../ui/theme';

export default function Settings() {
  const { data, resetAll, update } = useAppData();

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

      <Section title="Travel insurance">
        {(Object.keys(COVER_LABELS) as InsuranceCover[]).map((c) => (
          <Text
            key={c}
            style={[styles.option, data.insurance === c && styles.optionOn]}
            onPress={() => update((d) => ({ ...d, insurance: c }))}
            accessibilityRole="radio"
            accessibilityState={{ checked: data.insurance === c }}
          >
            {data.insurance === c ? '● ' : '○ '}
            {COVER_LABELS[c]}
          </Text>
        ))}
        {data.insurance === 'annual' || data.insurance === 'card' ? (
          <Text
            style={styles.option}
            onPress={() => pickDate(data.insuranceEnds, (date) => update((d) => ({ ...d, insuranceEnds: date })))}
            accessibilityRole="button"
          >
            Policy ends: <Text style={styles.optionOn}>{data.insuranceEnds ? shortDate(data.insuranceEnds) : 'Add date'}</Text>
          </Text>
        ) : null}
        <Text style={styles.note}>
          With an annual or bank policy, insurance is ticked off on every trip that ends before the policy does.
          Otherwise StashCall reminds you to buy it.
        </Text>
      </Section>

      <Section title="Passport">
        <Text
          style={styles.option}
          onPress={() => pickDate(data.passportExpires, (date) => update((d) => ({ ...d, passportExpires: date })))}
          accessibilityRole="button"
        >
          Expires: <Text style={styles.optionOn}>{data.passportExpires ? shortDate(data.passportExpires) : 'Add date'}</Text>
        </Text>
        <Text style={styles.note}>
          The passport in your household that runs out first. Many countries want 6 months left when you arrive, so
          StashCall warns you in time to renew.
        </Text>
      </Section>

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

      <Section title="Tester feedback">
        <Text style={styles.action} onPress={sendFeedback} accessibilityRole="button">
          Send feedback
        </Text>
      </Section>

      <Text style={styles.version}>StashCall {Constants.expoConfig?.version ?? ''} · tester build</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  heading: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', marginLeft: space.xs },
  action: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.l },
  option: { fontSize: 16, color: colors.text, paddingHorizontal: space.l, paddingVertical: space.m },
  optionOn: { color: colors.accent, fontWeight: '600' },
  note: { fontSize: 13, color: colors.muted, paddingHorizontal: space.l, paddingBottom: space.m },
  version: { textAlign: 'center', color: colors.muted, fontSize: 13, marginTop: space.l },
});
