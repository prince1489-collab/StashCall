import { Link, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { buildTimeline } from '../../domain/timeline';
import { useAppData } from '../../state/AppData';
import { PrimaryButton } from '../../ui/Form';
import { Timeline } from '../../ui/Timeline';
import { colors, space } from '../../ui/theme';

export default function TripScreen() {
  const { currentTrip, ready } = useAppData();
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
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{currentTrip.name}</Text>
        <Link href="/trip/edit" style={styles.edit} accessibilityRole="button">
          Edit
        </Link>
      </View>
      <Text style={styles.note}>
        Estimates are worked out from your flight or checkout time. Tap Edit to change any assumption.
      </Text>
      <Timeline steps={steps} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, flex: 1 },
  edit: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.s },
  note: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  empty: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.l },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 16, color: colors.muted },
});
