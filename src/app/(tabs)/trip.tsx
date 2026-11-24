import { Link, router } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { travellers, tripFor } from '../../domain/people';
import { tripChecklistText } from '../../domain/shareText';
import { buildTimeline } from '../../domain/timeline';
import { stepItemNames } from '../../domain/tripItems';
import type { Trip } from '../../domain/types';
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
  // Shown as this phone's person travels it, with their own flights.
  const { data, myTrip: currentTrip, currentTrip: sharedTrip, ready } = useAppData();
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
      {sharedTrip ? <WhoFlies trip={sharedTrip} /> : null}
      <Text style={styles.note}>
        Estimates are worked out from your flight or checkout time. Tap Edit to change any assumption.
      </Text>
      <Text style={styles.share} onPress={share} accessibilityRole="button">
        Share checklist
      </Text>
      <BeforeYouGo trip={currentTrip} />
      <Tickets trip={currentTrip} />
      <ReminderStatus />
      <Timeline steps={steps} now={now} itemsFor={(s) => stepItemNames(currentTrip, data.items, s, data.owners)} />
    </ScrollView>
  );
}

/**
 * Each traveller's first flight, when people travel differently: Dad flies
 * from Udaipur and joins the Delhi flight. Tap a person to give them their
 * own flights.
 */
function WhoFlies({ trip }: { trip: Trip }) {
  const { data } = useAppData();
  const going = travellers(trip, data.owners);
  if (going.length < 2 || !trip.flight) return null;
  return (
    <View style={styles.who}>
      <Text style={styles.whoHeading}>Who flies when</Text>
      {going.map((p) => {
        const f = tripFor(trip, p.id).flight;
        const own = trip.personFlights?.[p.id]?.flight !== undefined;
        return (
          <Pressable
            key={p.id}
            style={styles.whoRow}
            onPress={() => router.push({ pathname: '/trip/edit', params: { person: p.id } })}
            accessibilityRole="button"
            accessibilityHint={`Edit ${p.name}'s flights`}
          >
            <Text style={styles.whoName}>{p.name}</Text>
            <Text style={styles.whoFlight}>
              {f ? `${f.airport ?? 'Flight'}${f.destination ? ` → ${f.destination}` : ''} · ${formatLocalDate(f.departure)} ${f.departure.slice(11)}` : 'No flight'}
              {own ? '' : ' · same as trip'}
            </Text>
            <Text style={styles.whoEdit}>Edit</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  who: { backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: space.l, marginTop: space.m, gap: space.s },
  whoHeading: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.xs },
  whoName: { fontSize: 15, fontFamily: fonts.bold, color: colors.text, width: 72 },
  whoFlight: { flex: 1, fontSize: 14, color: colors.text },
  whoEdit: { fontSize: 14, fontWeight: '700', color: colors.accent },
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
