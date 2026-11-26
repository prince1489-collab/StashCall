import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { describeChanges, withHomeTimes, withStayTimes } from '../domain/driveTime';
import type { DriveChange } from '../domain/driveTime';
import { isGoing } from '../domain/people';
import { upcomingTrips } from '../domain/trips';
import type { Trip } from '../domain/types';
import { isShortMapsLink, mapsLink, parsePin, pinLabel } from '../domain/places';
import type { Place } from '../domain/places';
import { useAppData } from '../state/AppData';
import { PrimaryButton, Section, formatMinutes } from '../ui/Form';
import { colors, space } from '../ui/theme';

/**
 * Home (this phone's person, kept on the phone) or where a trip stays
 * (shared with everyone going), as a name and a map pin. Rides from the
 * airport then go straight there in Uber, and the driver gets a map link.
 */
export default function PlaceScreen() {
  const { kind, trip: tripId } = useLocalSearchParams<{ kind?: string; trip?: string }>();
  const { data, update } = useAppData();
  const stay = kind === 'stay';
  const trip = stay ? data.trips.find((t) => t.id === tripId) : undefined;
  const saved = stay ? trip?.stay : data.home;
  const [name, setName] = useState(saved?.name ?? trip?.checkout?.hotelName ?? '');
  const [pinText, setPinText] = useState(saved ? pinLabel(saved) : '');
  const [pin, setPin] = useState(saved && { lat: saved.lat, lng: saved.lng });
  const [problem, setProblem] = useState<string>();
  const [looking, setLooking] = useState(false);
  // The text a link lookup was for: a slow answer for older text is dropped.
  const latest = useRef('');

  const read = async (text: string) => {
    setPinText(text);
    latest.current = text;
    setProblem(undefined);
    const p = parsePin(text);
    if (p || !text.trim()) return setPin(p);
    setPin(undefined);
    if (!isShortMapsLink(text)) return;
    // A share link from the Maps app only says where it goes once opened.
    setLooking(true);
    try {
      const res = await fetch(text.trim().match(/https?:\/\/\S+/)![0]);
      const found = parsePin(res.url) ?? parsePin((await res.text()).slice(0, 200_000));
      if (latest.current !== text) return;
      if (found) setPin(found);
      else setProblem(NO_PIN);
    } catch {
      if (latest.current === text) setProblem('Couldn’t open that link. Check you’re online, or paste the numbers instead.');
    } finally {
      if (latest.current === text) setLooking(false);
    }
  };

  const save = async (place: Place | undefined, timed?: Map<string, Trip>) => {
    await update((d) => {
      const trips = d.trips.map((t) => {
        const base = timed?.get(t.id) ?? t;
        return stay && t.id === tripId ? { ...base, stay: place } : base;
      });
      return stay ? { ...d, trips } : { ...d, trips, home: place };
    });
    router.back();
  };

  /**
   * Saves the pin, first offering the drive times it gives: the hotel to
   * its airports for everyone on the trip, or home to the airports on this
   * person's coming trips.
   */
  const saveWithTimes = (place: Place) => {
    const timed = new Map<string, Trip>();
    const changes: DriveChange[] = [];
    const targets = stay ? [trip!] : upcomingTrips(data.trips, new Date()).filter((t) => isGoing(t, data.meId));
    for (const t of targets) {
      const r = stay ? withStayTimes(t, place) : withHomeTimes(t, data.meId, place);
      if (r.changes.length === 0) continue;
      timed.set(t.id, r.trip);
      for (const c of r.changes) if (!changes.some((x) => x.airport === c.airport)) changes.push(c);
    }
    if (changes.length === 0) return save(place);
    Alert.alert(
      'Use these drive times?',
      `${describeChanges(changes, formatMinutes)}\n\nWorked out from the map, without traffic. Your plan moves to match, and you can still change them under Edit trip.`,
      [
        { text: 'Keep my times', style: 'cancel', onPress: () => save(place) },
        { text: 'Use them', onPress: () => save(place, timed) },
      ],
    );
  };

  if (stay && !trip) return null;
  const clean = name.trim();
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        {stay
          ? `Where everyone on ${trip!.name} is staying. Rides from the airport go here, and it’s shared with everyone going.`
          : 'Rides home from the airport go here, and rides to the airport start here. It stays on this phone.'}
      </Text>
      <Section title={stay ? 'Hotel name or address' : 'Name or address'}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={stay ? 'e.g. Hotel Lakeview, Nainital' : 'e.g. 12 Carter Road, Bandra'}
          placeholderTextColor={colors.muted}
          accessibilityLabel={stay ? 'Hotel name or address' : 'Home address'}
        />
      </Section>
      <Section title="Map pin">
        <TextInput
          style={styles.input}
          value={pinText}
          onChangeText={read}
          placeholder="Paste from Google Maps"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Map pin"
        />
      </Section>
      <Text style={styles.help}>
        In Google Maps, press and hold the {stay ? 'hotel' : 'house'} until a red pin drops. Tap the numbers at the top
        to copy them (like 29.033755, 79.468833), then paste here. A Share link works too.
      </Text>
      {looking ? <Text style={styles.help}>Reading the link…</Text> : null}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      {pin ? (
        <Text style={styles.check} onPress={() => Linking.openURL(mapsLink(pin)).catch(() => {})} accessibilityRole="link">
          Pin {pinLabel(pin)} · Check it in Maps ›
        </Text>
      ) : pinText.trim() && !looking && !problem && !isShortMapsLink(pinText) ? (
        <Text style={styles.problem}>{NO_PIN}</Text>
      ) : null}
      <PrimaryButton label="Save" onPress={() => pin && saveWithTimes({ ...pin, ...(clean && { name: clean }) })} disabled={!pin} />
      {saved ? (
        <Text style={styles.remove} onPress={() => save(undefined)} accessibilityRole="button">
          Remove {stay ? 'the hotel' : 'home'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const NO_PIN = 'No pin in that yet. Paste the two numbers Google Maps shows when you press and hold a place.';

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: space.xl * 2 },
  intro: { fontSize: 15, color: colors.muted, lineHeight: 21, marginBottom: space.m },
  input: { fontSize: 16, color: colors.text, padding: space.l },
  help: { fontSize: 13, color: colors.muted, lineHeight: 18, marginHorizontal: space.s, marginBottom: space.m },
  problem: { fontSize: 14, color: colors.danger, marginHorizontal: space.s, marginBottom: space.m },
  check: { fontSize: 15, color: colors.accent, fontWeight: '600', marginHorizontal: space.s, marginBottom: space.l },
  remove: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'center', marginTop: space.l },
});
