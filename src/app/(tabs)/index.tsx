import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { openChecklistStep, toggleTick } from '../../domain/checklist';
import { savedItems } from '../../domain/household';
import { instantToZoned } from '../../domain/time';
import { buildTimeline } from '../../domain/timeline';
import { stepItemNames, stepItems } from '../../domain/tripItems';
import { useNow } from '../../hooks/useNow';
import { sendFeedback } from '../../feedback/sendFeedback';
import { useAppData } from '../../state/AppData';
import { BeforeYouGo } from '../../ui/BeforeYouGo';
import { Checklist } from '../../ui/Checklist';
import { PrimaryButton, formatLocalDate } from '../../ui/Form';
import { ReminderStatus } from '../../ui/ReminderStatus';
import { Tickets } from '../../ui/Tickets';
import { Timeline } from '../../ui/Timeline';
import { colors, space } from '../../ui/theme';

const HOW_IT_WORKS = [
  { title: 'Add your trip', text: 'Type your flight time, or share a screenshot of your booking.' },
  { title: 'Pick what you tend to forget', text: 'Passports, chargers, glasses, the kids\' toys.' },
  { title: 'Get alarm-style reminders', text: 'Pack the night before, a last check before you leave, a room sweep before checkout.' },
];

export default function Today() {
  const { data, currentTrip, ready, update } = useAppData();
  const now = useNow();
  if (!ready) return null;

  if (!currentTrip) {
    return (
      <ScrollView contentContainerStyle={styles.empty}>
        <Text style={styles.brand}>StashCall</Text>
        <Text style={styles.emptyTitle}>Never leave the important things behind.</Text>
        <View style={styles.steps}>
          {HOW_IT_WORKS.map((s, i) => (
            <View key={s.title} style={styles.step}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            </View>
          ))}
        </View>
        <PrimaryButton label="Add your first trip" onPress={() => router.push('/trip/edit')} />
        <Text style={styles.tip}>
          Got a booking email or boarding pass? Screenshot it, then share it to StashCall from your gallery. It fills in
          the trip for you.
        </Text>
      </ScrollView>
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
      {savedItems(data.items).length === 0 ? (
        <View style={styles.nudge}>
          <Text style={styles.nudgeTitle}>What do you tend to forget?</Text>
          <Text style={styles.stepText}>Pick a few items and StashCall names them in each reminder.</Text>
          <Text style={styles.nudgeLink} onPress={() => router.navigate('/items')} accessibilityRole="button">
            Pick items
          </Text>
        </View>
      ) : null}
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
      {next ? <BeforeYouGo trip={currentTrip} compact /> : null}
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
  empty: { flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.l },
  brand: { fontSize: 15, fontWeight: '700', color: colors.accent },
  emptyTitle: { fontSize: 26, fontWeight: '700', color: colors.text },
  overBox: { gap: space.l },
  steps: { gap: space.l },
  step: { flexDirection: 'row', gap: space.m, alignItems: 'flex-start' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  stepTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  stepText: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 2 },
  tip: { fontSize: 14, color: colors.muted, lineHeight: 20, textAlign: 'center' },
  nudge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: space.l,
    marginBottom: space.l,
    gap: space.xs,
  },
  nudgeTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  nudgeLink: { fontSize: 16, color: colors.accent, fontWeight: '600', marginTop: space.xs },
  emptyText: { fontSize: 16, color: colors.muted, lineHeight: 22 },
});
