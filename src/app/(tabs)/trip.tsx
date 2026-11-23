import { Link, router } from 'expo-router';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { tripChecklistText } from '../../domain/shareText';
import { buildTimeline } from '../../domain/timeline';
import { stepItemNames } from '../../domain/tripItems';
import { useNow } from '../../hooks/useNow';
import { useAppData } from '../../state/AppData';
import { BeforeYouGo } from '../../ui/BeforeYouGo';
import { PrimaryButton, formatLocalDate } from '../../ui/Form';
import { ReminderStatus } from '../../ui/ReminderStatus';
import { Tickets } from '../../ui/Tickets';
import { Timeline } from '../../ui/Timeline';
import { colors, space } from '../../ui/theme';

export default function TripScreen() {
  const { data, currentTrip, ready } = useAppData();
  const now = useNow();
  if (!ready) return null;

  if (!currentTrip) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No trip yet</Text>
        <Text style={styles.emptyText}>
          Add your flight time or hotel checkout. StashCall works out the rest.
        </Text>
        <PrimaryButton label="Add a trip" onPress={() => router.push('/trip/edit')} />
      </View>
    );
  }

  const steps = buildTimeline(currentTrip);
  const share = () =>
    Share.share({ message: tripChecklistText(currentTrip, data.items, data.owners, formatLocalDate) }).catch(() => {});
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{currentTrip.name}</Text>
        <Link href="/trip/edit" style={styles.edit} accessibilityRole="button">
          Edit
        </Link>
        <Link href={{ pathname: '/trip/edit', params: { new: '1' } }} style={styles.edit} accessibilityRole="button">
          New trip
        </Link>
      </View>
      <Text style={styles.note}>
        Estimates are worked out from your flight or checkout time. Tap Edit to change any assumption.
      </Text>
      <Text style={styles.share} onPress={share} accessibilityRole="button">
        Share checklist
      </Text>
      <BeforeYouGo trip={currentTrip} />
      <Tickets trip={currentTrip} />
      <ReminderStatus />
      <Timeline steps={steps} now={now} itemsFor={(s) => stepItemNames(currentTrip, data.items, s)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, flex: 1 },
  edit: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.s },
  share: { fontSize: 16, color: colors.accent, fontWeight: '600', paddingVertical: space.m },
  note: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  empty: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.l },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 16, color: colors.muted },
});
