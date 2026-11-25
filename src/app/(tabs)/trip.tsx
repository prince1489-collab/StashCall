import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { travellers, tripFor } from '../../domain/people';
import { tripChecklistText } from '../../domain/shareText';
import { buildTimeline } from '../../domain/timeline';
import { formatTripDays, pastTrips, tripSpan, upcomingTrips } from '../../domain/trips';
import { stepItemNames } from '../../domain/tripItems';
import type { Person, Trip } from '../../domain/types';
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
  const { data, currentTrip, viewingId, ready } = useAppData();
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
  // With more than one trip, the tab opens on the list. Tap one to open it.
  if (data.trips.length > 1 && !viewingId) return <TripList />;
  return <TripDetail key={currentTrip.id} trip={currentTrip} />;
}

const DAY = 24 * 3600 * 1000;

/** "Today", "Tomorrow", "In 11 days", "On now". */
function countdown(trip: Trip, now: Date): string | undefined {
  const span = tripSpan(trip);
  if (!span) return undefined;
  if (span.start.getTime() <= now.getTime()) return 'On now';
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(span.start) - midnight(now)) / DAY);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
}

/** "Mahiman and Bajrang", "Mahiman, Bajrang and Asha". Empty without profiles. */
function goingNames(trip: Trip, people: Person[]): string {
  const names = travellers(trip, people).map((p) => p.name);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Every trip: the next one as a big card with a countdown, the rest coming
 * up as rows, and the ones that are over folded away.
 */
function TripList() {
  const { data, viewTrip } = useAppData();
  const now = useNow();
  const [showPast, setShowPast] = useState(false);
  // Judged as this phone's person travels, as reminders are.
  const mine = (t: Trip) => tripFor(t, data.meId);
  const byId = new Map(data.trips.map((t) => [t.id, t]));
  const coming = upcomingTrips(data.trips.map(mine), now).map((t) => byId.get(t.id)!);
  const over = pastTrips(data.trips.map(mine), now).map((t) => byId.get(t.id)!);
  const [next, ...later] = coming;
  const year = now.getFullYear();
  const meta = (t: Trip) => [formatTripDays(mine(t), year), mine(t).flight ? route(mine(t).flight!) : undefined].filter(Boolean).join(' · ');
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your trips</Text>
        <Link href={{ pathname: '/trip/edit', params: { new: '1' } }} style={styles.edit} accessibilityRole="button">
          New trip
        </Link>
      </View>
      {next ? (
        <Pressable style={styles.nextCard} onPress={() => viewTrip(next.id)} accessibilityRole="button" accessibilityHint="Open this trip">
          <Text style={styles.nextLabel}>Next trip</Text>
          <Text style={styles.nextName}>{next.name}</Text>
          <Text style={styles.nextMeta}>{meta(next)}</Text>
          {goingNames(next, data.owners) ? <Text style={styles.nextMeta}>{goingNames(next, data.owners)}</Text> : null}
          {countdown(mine(next), now) ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownText}>{countdown(mine(next), now)}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <Text style={styles.note}>Nothing planned. Tap New trip to add one.</Text>
      )}
      {later.length > 0 ? <Text style={styles.listHeading}>Coming up</Text> : null}
      {later.map((t) => (
        <TripRow key={t.id} trip={t} meta={meta(t)} who={goingNames(t, data.owners)} onPress={() => viewTrip(t.id)} />
      ))}
      {over.length > 0 ? (
        <Text style={styles.pastToggle} onPress={() => setShowPast(!showPast)} accessibilityRole="button" accessibilityState={{ expanded: showPast }}>
          {showPast ? 'Hide past trips' : `Past trips (${over.length}) ›`}
        </Text>
      ) : null}
      {showPast
        ? over.map((t) => <TripRow key={t.id} trip={t} meta={meta(t)} who={goingNames(t, data.owners)} onPress={() => viewTrip(t.id)} past />)
        : null}
    </ScrollView>
  );
}

function TripRow({ trip, meta, who, onPress, past }: { trip: Trip; meta: string; who: string; onPress: () => void; past?: boolean }) {
  return (
    <Pressable style={[styles.row, past && styles.rowPast]} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {trip.name}
        </Text>
        <Text style={styles.rowMeta}>{meta}</Text>
        {who ? <Text style={styles.rowMeta}>{who}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/**
 * One trip. The top is shared by everyone going; below it, each person's
 * plan: their route, connections and day, on this phone's person first.
 */
function TripDetail({ trip }: { trip: Trip }) {
  const { data, viewTrip } = useAppData();
  const now = useNow();
  const going = travellers(trip, data.owners);
  const [pid, setPid] = useState(() => (going.some((p) => p.id === data.meId) ? data.meId : going[0]?.id));
  const person = going.find((p) => p.id === pid);
  const plan = tripFor(trip, person?.id ?? data.meId);
  const mine = tripFor(trip, data.meId);
  const own = person && trip.personFlights?.[person.id] !== undefined;
  const steps = buildTimeline(plan);
  const share = () =>
    Share.share({ message: tripChecklistText(mine, data.items, data.owners, formatLocalDate) }).catch(() => {});
  const days = formatTripDays(plan, now.getFullYear());
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {data.trips.length > 1 ? (
        <Text style={styles.back} onPress={() => viewTrip(undefined)} accessibilityRole="button">
          ‹ All trips
        </Text>
      ) : null}
      <View style={styles.header}>
        <Text style={styles.title}>{trip.name}</Text>
        <Link href="/trip/edit" style={styles.edit} accessibilityRole="button">
          Edit
        </Link>
        {data.trips.length > 1 ? null : (
          <Link href={{ pathname: '/trip/edit', params: { new: '1' } }} style={styles.edit} accessibilityRole="button">
            New trip
          </Link>
        )}
      </View>
      <Text style={styles.note}>
        {[days, goingNames(trip, data.owners)].filter(Boolean).join(' · ')}
      </Text>
      <SharedWith />
      {going.length > 1 ? (
        <View style={styles.plans}>
          <Text style={styles.whoHeading}>Plans</Text>
          <View style={styles.planChips}>
            {going.map((p) => {
              const on = p.id === person?.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPid(p.id)}
                  style={[styles.pick, on && styles.pickOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.pickName, on && styles.pickNameOn]}>{p.id === data.meId ? `${p.name} (you)` : p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {plan.flight ? <Pass trip={plan} /> : null}
      {person && going.length > 1 ? (
        <Text
          style={styles.share}
          onPress={() => router.push({ pathname: '/trip/edit', params: { person: person.id } })}
          accessibilityRole="button"
        >
          {plan.flight ? `Edit ${person.name}'s flights` : `Add ${person.name}'s flights`}
          {own || !plan.flight ? '' : ' (same as the trip)'}
        </Text>
      ) : null}
      <Timeline steps={steps} now={now} itemsFor={(s) => stepItemNames(plan, data.items, s, data.owners)} />
      <Text style={styles.sectionHeading}>For everyone</Text>
      <BeforeYouGo trip={mine} />
      <Tickets trip={mine} />
      <ReminderStatus />
      <Text style={styles.share} onPress={share} accessibilityRole="button">
        Share checklist
      </Text>
      <Text style={styles.note}>
        Estimates are worked out from your flight or checkout time. Tap Edit to change any assumption.
      </Text>
    </ScrollView>
  );
}

/** The boarding-pass card: where the journey starts and ends, with any stops. */
function Pass({ trip }: { trip: Trip }) {
  const f = trip.flight!;
  const via = (f.connections ?? []).map((c) => c.airport).filter((x): x is string => !!x && x !== f.airport && x !== f.destination);
  return (
    <View style={styles.pass}>
      <View>
        <Text style={styles.code}>{f.airport ?? '—'}</Text>
        <Text style={styles.passMeta}>
          {formatLocalDate(f.departure)} · {f.departure.slice(11)}
        </Text>
      </View>
      <View style={styles.routeCol}>
        <View style={styles.route}>
          <View style={styles.dash} />
          <PlaneIcon color={colors.amber} size={20} />
          <View style={styles.dash} />
        </View>
        {via.length > 0 ? <Text style={styles.passMeta}>via {[...new Set(via)].join(', ')}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.code}>{f.destination ?? '—'}</Text>
        <Text style={styles.passMeta}>{trip.returnFlight ? `Home ${formatLocalDate(trip.returnFlight.departure)}` : 'One way'}</Text>
      </View>
    </View>
  );
}

/** "UDR → DEL → PGH": every stop on the way, connections included. */
function route(f: NonNullable<Trip['flight']>): string {
  const stops = [f.airport ?? 'Flight', ...(f.connections ?? []).map((c) => c.airport), f.destination].filter(
    (x, i, all): x is string => !!x && x !== all[i - 1],
  );
  return stops.join(' → ');
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

const styles = StyleSheet.create({
  back: { fontSize: 16, color: colors.accent, fontWeight: '600', paddingVertical: space.s, marginBottom: space.xs },
  nextCard: { backgroundColor: colors.accent, borderRadius: 20, padding: space.l, marginTop: space.m, gap: 4 },
  nextLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.onAccentMuted },
  nextName: { fontSize: 24, fontFamily: fonts.display, color: '#fff' },
  nextMeta: { fontSize: 14, color: colors.onAccentMuted },
  countdown: { alignSelf: 'flex-start', backgroundColor: colors.amber, borderRadius: 12, paddingHorizontal: space.m, paddingVertical: 4, marginTop: space.s },
  countdownText: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  listHeading: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, marginTop: space.l, marginBottom: space.s },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: space.m, marginBottom: space.s },
  rowPast: { opacity: 0.6 },
  rowName: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.muted, paddingLeft: space.s },
  pastToggle: { fontSize: 15, color: colors.accent, fontWeight: '600', paddingVertical: space.m, marginTop: space.s },
  plans: { marginTop: space.m, gap: space.s },
  planChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  sectionHeading: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, marginTop: space.xl },
  routeCol: { flex: 1, alignItems: 'center', gap: 2 },
  pick: { backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: space.m, paddingVertical: space.s, maxWidth: 180 },
  pickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pickName: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  pickNameOn: { color: '#fff' },
  pickWhen: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pickWhenOn: { color: colors.onAccentMuted },
  shared: { fontSize: 14, color: colors.accent, fontWeight: '600', marginTop: space.m },
  whoHeading: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
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
