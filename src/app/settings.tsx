import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { ReactNode } from 'react';

import { sendFeedback } from '../feedback/sendFeedback';
import { useAppData } from '../state/AppData';
import { useSync } from '../sync/SyncProvider';
import type { InsuranceCover } from '../domain/types';
import { COVER_LABELS } from '../ui/BeforeYouGo';
import { shortDate } from '../domain/prep';
import { Row, Section, pickDate } from '../ui/Form';
import { ReminderStatus } from '../ui/ReminderStatus';
import { colors, space } from '../ui/theme';

export default function Settings() {
  const { data, resetAll, update } = useAppData();
  const sync = useSync();

  const deleteAll = () =>
    Alert.alert(
      'Delete all your data?',
      'This removes your trips, items, people and photos from this phone and cancels every reminder. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await sync.leave().catch(() => {});
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

      <Section title="Family sharing">
        <Nav onPress={() => router.push('/household')}>
          Share trips with the people you travel with
        </Nav>
      </Section>

      <Section title="Home">
        <Nav onPress={() => router.push({ pathname: '/place', params: { kind: 'home' } })}>
          {data.home ? data.home.name || 'Home pin added' : 'Add your home’s pin, for Uber to and from the airport'}
        </Nav>
      </Section>

      <Section title="Driver message">
        <Nav onPress={() => router.push('/driver-message')}>
          {data.driverTemplates?.toAirport || data.driverTemplates?.fromAirport ? 'Your own message' : 'Write your own, in any language'}
        </Nav>
      </Section>

      <Section title="People">
        <Nav onPress={() => router.push('/people')}>
          {data.owners.length > 0 ? data.owners.map((p) => p.name).join(', ') : 'Add the people you travel with'}
        </Nav>
      </Section>

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
        {data.owners.length > 0 ? (
          <Nav onPress={() => router.push('/people')}>
            Each person's passport date is on People
          </Nav>
        ) : (
        <Text
          style={styles.option}
          onPress={() => pickDate(data.passportExpires, (date) => update((d) => ({ ...d, passportExpires: date })))}
          accessibilityRole="button"
        >
          Expires: <Text style={styles.optionOn}>{data.passportExpires ? shortDate(data.passportExpires) : 'Add date'}</Text>
        </Text>
        )}
        <Text style={styles.note}>
          The passport in your household that runs out first. Many countries want 6 months left when you arrive, so
          StashCall warns you in time to renew.
        </Text>
      </Section>

      <Section title="Your data">
        <Row
          label="Stored on this phone"
          hint={`${data.trips.length} trip${data.trips.length === 1 ? '' : 's'}, ${data.items.length} item${
            data.items.length === 1 ? '' : 's'
          }. Nothing is sent to a server unless you turn on family sharing, which shares ticket screenshots but no other photos.`}
        />
        <Text style={[styles.action, { color: colors.danger }]} onPress={deleteAll} accessibilityRole="button">
          Delete all my data
        </Text>
      </Section>

      <Section title="Tester feedback">
        <Nav onPress={sendFeedback}>
          Send feedback
        </Nav>
      </Section>

      <Text style={styles.version}>StashCall {Constants.expoConfig?.version ?? ''} · tester build</Text>
    </ScrollView>
  );
}

/** A row that opens another screen: label, then a chevron. */
function Nav({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Pressable style={styles.nav} onPress={onPress} accessibilityRole="button">
      <Text style={styles.navText}>{children}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', padding: space.l, gap: space.s },
  navText: { flex: 1, fontSize: 16, color: colors.accent, fontWeight: '600' },
  chevron: { fontSize: 22, color: colors.muted, lineHeight: 22 },
  container: { padding: space.l, paddingBottom: 48 },
  heading: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', marginLeft: space.xs },
  action: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.l },
  option: { fontSize: 16, color: colors.text, paddingHorizontal: space.l, paddingVertical: space.m },
  optionOn: { color: colors.accent, fontWeight: '600' },
  note: { fontSize: 13, color: colors.muted, paddingHorizontal: space.l, paddingBottom: space.m },
  version: { textAlign: 'center', color: colors.muted, fontSize: 13, marginTop: space.l },
});
