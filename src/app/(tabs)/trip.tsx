import { Link, router } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { travellers, tripFor } from '../../domain/people';
import { tripChecklistText } from '../../domain/shareText';
import { buildTimeline } from '../../domain/timeline';
import { pastTrips, tripSpan, upcomingTrips } from '../../domain/trips';
import { stepItemNames } from '../../domain/tripItems';
import type { Trip } from '../../domain/types';
import { useNow } from '../../hooks/useNow';
import { useAppData } from '../../state/AppData';
import { useSync } from '../../sync/SyncProvider';
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
      <TripPicker />
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
      <SharedWith />
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

/** Every trip, next first, then the ones that are over. Tap one to open it. */
function TripPicker() {
  const { data, currentTrip, viewTrip } = useAppData();
  if (data.trips.length < 2) return null;
  const now = new Date();
  const trips = [...upcomingTrips(data.trips, now), ...pastTrips(data.trips, now)];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
      {trips.map((t) => {
        const on = t.id === currentTrip?.id;
        const start = tripSpan(t)?.start;
        const over = (tripSpan(t)?.end.getTime() ?? Infinity) < now.getTime();
        return (
          <Pressable
            key={t.id}
            onPress={() => viewTrip(t.id)}
            style={[styles.pick, on && styles.pickOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.pickName, on && styles.pickNameOn]} numberOfLines={1}>
              {t.name}
            </Text>
            <Text style={[styles.pickWhen, on && styles.pickWhenOn]}>
              {over ? 'Over' : start ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: start.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) : 'No date yet'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Who else sees this trip, when family sharing is on. */
function SharedWith() {
  const { data } = useAppData();
  const sync = useSync();
  if (!sync.inviteCode) return null;
  const others = data.owners.filter((p) => p.ownPhone && p.id !== data.meId).map((p) => p.name);
  const who = others.length > 0 ? `Shared with ${others.join(' and ')}` : 'Shared, waiting for family to join';
  const state = sync.status === 'synced' ? 'up to date' : sync.status === 'syncing' ? 'syncing' : sync.status === 'offline' ? 'offline for now' : '';
  return (
    <Text style={styles.shared} onPress={() => router.push('/household')} accessibilityRole="button">
      {who}
      {state ? ` · ${state}` : ''}
    </Text>
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
  picker: { gap: space.s, paddingBottom: space.m },
  pick: { backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: space.m, paddingVertical: space.s, maxWidth: 180 },
  pickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pickName: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  pickNameOn: { color: '#fff' },
  pickWhen: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pickWhenOn: { color: colors.onAccentMuted },
  shared: { fontSize: 14, color: colors.accent, fontWeight: '600', marginTop: space.m },
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
