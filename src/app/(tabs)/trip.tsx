import { Link, router } from 'expo-router';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { tripChecklistText } from '../../domain/shareText';
import { buildTimeline } from '../../domain/timeline';
import { stepItemNames } from '../../domain/tripItems';
import { useNow } from '../../hooks/useNow';
import { useAppData } from '../../state/AppData';
import { BeforeYouGo } from '../../ui/BeforeYouGo';
import { PrimaryButton, formatLocalDate } from '../../ui/Form';
import { PlaneIcon } from '../../ui/Icons';
import { ReminderStatus } from '../../ui/ReminderStatus';
import { Tickets } from '../../ui/Tickets';
import { Timeline } from '../../ui/Timeline';
import { colors, fonts, space } from '../../ui/theme';

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
      {currentTrip.flight?.airport && currentTrip.flight.destination ? (
        <View style={styles.pass}>
          <View>
            <Text style={styles.code}>{currentTrip.flight.airport}</Text>
            <Text style={styles.passMeta}>
              {formatLocalDate(currentTrip.flight.departure)} · {currentTrip.flight.departure.slice(11)}
            </Text>
          </View>
          <View style={styles.route}>
            <View style={styles.dash} />
            <PlaneIcon color={colors.amber} size={20} />
            <View style={styles.dash} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.code}>{currentTrip.flight.destination}</Text>
            <Text style={styles.passMeta}>
              {currentTrip.returnFlight ? `Home ${formatLocalDate(currentTrip.returnFlight.departure)}` : 'One way'}
            </Text>
          </View>
        </View>
      ) : null}
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
  title: { fontSize: 26, fontFamily: fonts.display, color: colors.text, flex: 1 },
  edit: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.s },
  share: { fontSize: 16, color: colors.accent, fontWeight: '600', paddingVertical: space.m },
  pass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: colors.accent,
    borderRadius: 20,
    padding: space.l,
    marginTop: space.m,
  },
  code: { color: '#fff', fontSize: 28, fontFamily: fonts.display },
  passMeta: { color: colors.onAccentMuted, fontSize: 13 },
  route: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dash: { flex: 1, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  note: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  empty: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.l },
  emptyTitle: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  emptyText: { fontSize: 16, color: colors.muted },
});
