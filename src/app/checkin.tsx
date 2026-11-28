import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, Ref } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';

import { fillScript, findBookingRefs, keepRefs, pnrFor, withTypedPnr } from '../domain/bookingRef';
import type { BookingRef } from '../domain/bookingRef';
import { checkIns } from '../domain/checkin';
import { tripFor } from '../domain/people';
import { stepDone, stepFlight, toggleStep } from '../domain/stepsDone';
import { addPasses } from '../domain/tickets';
import { buildTimeline } from '../domain/timeline';
import { useAppData } from '../state/AppData';
import { pickTickets } from '../storage/photos';
import { newId } from '../storage/store';
import { readTicket } from '../tickets/readTicket';
import { PrimaryButton, Section } from '../ui/Form';
import { colors, space } from '../ui/theme';

/** What the screen calls on the page. */
interface WebHandle {
  injectJavaScript: (script: string) => void;
  goBack: () => void;
}
// The library's class typing doesn't fit React 19's; this is how it's used.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebHandle> }>;

/**
 * One-tap check-in: the airline's check-in page inside StashCall, with
 * this person's PNR and surname filled in. They confirm on the airline's
 * page, then tick it off and keep the boarding pass. The PNR and surname
 * stay on this phone.
 */
export default function CheckInScreen() {
  const { trip: tripId, flight } = useLocalSearchParams<{ trip?: string; flight?: string }>();
  const { data, update } = useAppData();
  const insets = useSafeAreaInsets();
  const trip = data.trips.find((t) => t.id === tripId);
  const mine = trip && tripFor(trip, data.meId);
  const c = useMemo(() => (mine ? checkIns(mine).find((x) => x.flightNumbers.includes(flight ?? '')) : undefined), [mine, flight]);
  const refs = tripId ? data.checkIn?.refs?.[tripId] : undefined;
  const known = c ? pnrFor(refs, c.flightNumbers) : undefined;

  const [pnr, setPnr] = useState(known ?? '');
  const [lastName, setLastName] = useState(data.checkIn?.lastName ?? '');
  const [reading, setReading] = useState(false);
  // Everything known already: straight to the airline's page.
  const [open, setOpen] = useState(!!(known && data.checkIn?.lastName && c?.url));
  const [filled, setFilled] = useState<string[]>([]);
  const web = useRef<WebHandle>(null);
  const started = useRef(false);

  // No PNR kept yet: look for one on the trip's ticket screenshots, read on the phone.
  useEffect(() => {
    if (!trip || !c || known || started.current) return;
    started.current = true;
    const shots = (trip.tickets ?? []).filter((t) => t.uri);
    if (shots.length === 0) return;
    setReading(true);
    (async () => {
      const found: BookingRef[] = [];
      for (const t of shots) found.push(...findBookingRefs((await readTicket(t.uri)).text));
      if (found.length > 0) await update((d) => keepRefs(d, trip.id, found));
      const p = pnrFor(found, c.flightNumbers);
      if (p) setPnr((had) => had || p);
    })()
      .catch(() => {})
      .finally(() => setReading(false));
  }, [trip, c, known, update]);

  if (!trip || !c) {
    return (
      <View style={styles.container}>
        <Text style={styles.intro}>That check-in isn't on this phone's plan any more.</Text>
      </View>
    );
  }

  const cleanPnr = pnr.trim().toUpperCase();
  const cleanLast = lastName.trim();
  const flights = c.flightNumbers.join(' and ');

  const start = async () => {
    // Remembered on this phone for next time; never shared.
    await update((d) => ({
      ...d,
      checkIn: {
        ...d.checkIn,
        ...(cleanLast && { lastName: cleanLast }),
        refs: cleanPnr ? { ...d.checkIn?.refs, [trip.id]: withTypedPnr(d.checkIn?.refs?.[trip.id], cleanPnr, c.flightNumbers) } : d.checkIn?.refs,
      },
    }));
    setFilled([]);
    setOpen(true);
  };

  /** Ticks "Web check-in" off this person's plan, then offers to keep the boarding pass. */
  const done = async () => {
    const meId = data.meId;
    const steps = buildTimeline(mine!);
    const step = steps.find((s) => s.kind === 'checkin' && stepFlight(s) === c.flightNumbers[0]);
    if (meId && step && !stepDone(trip, meId, step, steps)) await update((d) => toggleStep(d, trip.id, meId, step, steps, meId));
    Alert.alert(
      'Keep your boarding pass',
      `Take a screenshot of each boarding pass on ${c.airline}'s page, then add them here. They open at the gate without signal.`,
      [
        { text: 'Later', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Add them now',
          onPress: async () => {
            const uris = await pickTickets();
            if (uris.length > 0) {
              const now = new Date().toISOString();
              await update((d) => addPasses(d, trip.id, uris.map((uri) => ({ id: newId(), uri, addedAt: now }))));
            }
            router.back();
          },
        },
      ],
    );
  };

  if (open && c.url) {
    const script = fillScript({ pnr: cleanPnr, lastName: cleanLast });
    const both = filled.includes('pnr') && filled.includes('lastName');
    return (
      <View style={styles.webScreen}>
        <Stack.Screen options={{ title: `Check in · ${c.airline}` }} />
        <View style={styles.banner}>
          <Text style={styles.bannerText} selectable>
            {both
              ? `Filled in your PNR and surname. Finish on ${c.airline}'s page.`
              : filled.length > 0
                ? `Filled in your ${filled.includes('pnr') ? 'PNR' : 'surname'}. Your PNR is ${cleanPnr || 'not saved'}, surname ${cleanLast || 'not saved'}.`
                : `When ${c.airline} asks, StashCall fills in PNR ${cleanPnr || '(none)'} and surname ${cleanLast || '(none)'}. Open their check-in if it isn't showing.`}
          </Text>
        </View>
        <WebView
          ref={web}
          source={{ uri: c.url }}
          style={styles.web}
          injectedJavaScript={script}
          // Again after each page loads, for pages that load the next step in place.
          onLoadEnd={() => web.current?.injectJavaScript(script)}
          onMessage={(e: WebViewMessageEvent) => {
            try {
              const got = (JSON.parse(e.nativeEvent.data) as { filled?: string[] }).filled;
              if (got) setFilled((had) => [...new Set([...had, ...got])]);
            } catch {
              // Not ours.
            }
          }}
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={styles.loading} color={colors.accent} />}
        />
        <View style={[styles.bar, { paddingBottom: space.m + insets.bottom }]}>
          <Text style={styles.barLink} onPress={() => web.current?.goBack()} accessibilityRole="button">
            ‹ Back
          </Text>
          <Text style={[styles.barLink, styles.barDone]} onPress={done} accessibilityRole="button">
            I'm checked in
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Check in' }} />
      <Text style={styles.intro}>
        {flights} · {c.airline}. StashCall opens their check-in and fills these in for you. You choose seats and confirm
        on their page. Both stay on this phone.
      </Text>
      <Section title="PNR or booking reference">
        <TextInput
          style={styles.input}
          value={pnr}
          onChangeText={setPnr}
          placeholder={reading ? 'Looking on your tickets…' : 'e.g. AB12CD'}
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          accessibilityLabel="PNR or booking reference"
        />
      </Section>
      {reading ? <Text style={styles.help}>Looking for the PNR on your tickets…</Text> : null}
      <Section title="Surname, as on the booking">
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="e.g. Singh"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          accessibilityLabel="Surname"
        />
      </Section>
      {c.url ? (
        <PrimaryButton label={`Check in with ${c.airline}`} onPress={start} disabled={!cleanPnr || !cleanLast} />
      ) : (
        <Text style={styles.help}>StashCall doesn't know {c.airline}'s check-in page yet. Use their app or website.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: space.xl * 2 },
  intro: { fontSize: 15, color: colors.muted, lineHeight: 21, marginBottom: space.m },
  input: { fontSize: 16, color: colors.text, padding: space.l },
  help: { fontSize: 13, color: colors.muted, lineHeight: 18, marginHorizontal: space.s, marginBottom: space.m },
  webScreen: { flex: 1, backgroundColor: colors.bg },
  banner: { backgroundColor: colors.accentSoft, paddingHorizontal: space.l, paddingVertical: space.m },
  bannerText: { fontSize: 14, color: colors.text, lineHeight: 19 },
  web: { flex: 1 },
  loading: { position: 'absolute', top: space.xl, alignSelf: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.m, backgroundColor: colors.card },
  barLink: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.s },
  barDone: { color: colors.text },
});
