import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { openChecklistStep, toggleTick } from '../../domain/checklist';
import { instantToZoned } from '../../domain/time';
import { buildTimeline } from '../../domain/timeline';
import { stepItemNames, stepItems } from '../../domain/tripItems';
import { useNow } from '../../hooks/useNow';
import { sendFeedback } from '../../feedback/sendFeedback';
import { useAppData } from '../../state/AppData';
import { Checklist } from '../../ui/Checklist';
import { PrimaryButton, formatLocalDate } from '../../ui/Form';
import { ReminderStatus } from '../../ui/ReminderStatus';
import { Tickets } from '../../ui/Tickets';
import { Timeline } from '../../ui/Timeline';
import { colors, space } from '../../ui/theme';

export default function Today() {
  const { data, currentTrip, ready, update } = useAppData();
  const now = useNow();
  if (!ready) return null;

  if (!currentTrip) {
    return (
      <View style={styles.empty}>
        <Text style={styles.brand}>StashCall</Text>
        <Text style={styles.emptyTitle}>Remember what matters on both sides of your trip.</Text>
        <Text style={styles.emptyText}>
          Enter your flight time and StashCall reminds you to pack your own items the night before, and to sweep the
          hotel room before checkout.
        </Text>
        <PrimaryButton label="Add a trip" onPress={() => router.push('/trip/edit')} />
      </View>
    );
  }

  const steps = buildTimeline(currentTrip);
  const upcoming = steps.filter((s) => s.at.getTime() >= now.getTime());
  const open = openChecklistStep(steps, now);
  const openItems = open ? stepItems(currentTrip, data.items, open) : [];
  const trip = currentTrip;
  const next = upcoming[0];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.tripName}>{currentTrip.name}</Text>
      {open && openItems.length > 0 ? (
        <Checklist
          title={open.title}
          items={openItems}
          owners={data.owners}
          done={trip.ticked[open.kind] ?? []}
          onToggle={(itemId) => update((d) => toggleTick(d, trip.id, open.kind, itemId))}
        />
      ) : null}
      {next ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>Next</Text>
          <Text style={styles.nextTitle}>{next.title}</Text>
          <Text style={styles.nextTime}>{next.localTime}</Text>
          <Text style={styles.nextDay}>{formatLocalDate(instantToZoned(next.at, next.timeZone))}</Text>
          {stepItemNames(currentTrip, data.items, next).length > 0 ? (
            <Text style={styles.nextItems}>{stepItemNames(currentTrip, data.items, next).join(' · ')}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.overBox}>
          <Text style={styles.emptyText}>This trip is over.</Text>
          <PrimaryButton
            label="Plan your next trip"
            onPress={() => router.push({ pathname: '/trip/edit', params: { new: '1' } })}
          />
        </View>
      )}
      <Tickets trip={currentTrip} compact />
      <ReminderStatus />
      {upcoming.length > 1 ? (
        <>
          <Text style={styles.section}>Coming up</Text>
          <Timeline steps={upcoming.slice(1, 5)} itemsFor={(s) => stepItemNames(currentTrip, data.items, s)} now={now} />
        </>
      ) : null}
      <Text style={styles.footerLink} onPress={sendFeedback} accessibilityRole="button">
        Send feedback
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  footerLink: { color: colors.accent, fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: space.xl, padding: space.s },
  tripName: { fontSize: 15, color: colors.muted, marginBottom: space.s },
  nextCard: { backgroundColor: colors.accent, borderRadius: 16, padding: space.xl },
  nextLabel: { color: '#CFE7DF', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  nextTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: space.xs },
  nextTime: { color: '#fff', fontSize: 40, fontWeight: '700', marginTop: space.s, fontVariant: ['tabular-nums'] },
  nextDay: { color: '#fff', fontSize: 15, opacity: 0.85 },
  nextItems: { color: '#fff', fontSize: 16, marginTop: space.m, lineHeight: 22 },
  section: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', marginTop: space.xl },
  empty: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.l },
  brand: { fontSize: 15, fontWeight: '700', color: colors.accent },
  emptyTitle: { fontSize: 26, fontWeight: '700', color: colors.text },
  overBox: { gap: space.l },
  emptyText: { fontSize: 16, color: colors.muted, lineHeight: 22 },
});
