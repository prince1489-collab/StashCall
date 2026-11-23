import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULTS } from '../../domain/defaults';
import { savedItems } from '../../domain/household';
import { draftFromTicket } from '../../domain/ticketDraft';
import { describeTicket, hasTripDetails, type TicketDetails } from '../../domain/ticketParse';
import { buildTimeline, defaultFlight } from '../../domain/timeline';
import type { FlightLeg, HotelCheckout, Ticket, Trip } from '../../domain/types';
import { deletePhoto, pickTicket } from '../../storage/photos';
import { newId } from '../../storage/store';
import { readProblem, readTicket } from '../../tickets/readTicket';
import { useReminders } from '../../reminders/Reminders';
import { useAppData } from '../../state/AppData';
import {
  DateTimeRow,
  MinutesStepper,
  PrimaryButton,
  Section,
  SwitchRow,
  TimeRow,
  ZoneRow,
  deviceZone,
  formatLocalDate,
  styles as formStyles,
  zoneLabel,
} from '../../ui/Form';
import { Timeline } from '../../ui/Timeline';
import { colors, space } from '../../ui/theme';

const pad = (n: number) => String(n).padStart(2, '0');
/** "YYYY-MM-DDTHH:mm" for `days` from today at the given hour, device time. */
function localDaysFromNow(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

/** Route params: `new=1` starts a blank trip; `tickets` and `details` come from a shared screenshot. */
type Params = { new?: string; tickets?: string; details?: string; problem?: string };

function fromJson<T>(s?: string): T | undefined {
  try {
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

function newCheckout(): HotelCheckout {
  return {
    checkout: localDaysFromNow(11, 11),
    timeZone: deviceZone(),
    sweepMinutesBefore: DEFAULTS.sweepMinutesBefore,
  };
}

export default function EditTrip() {
  const { data, currentTrip, saveTrip, deleteTrip } = useAppData();
  const { askPermission } = useReminders();
  const params = useLocalSearchParams<Params>();
  const existing = params.new === '1' ? undefined : currentTrip;

  const [name, setName] = useState(existing?.name ?? '');
  const [hasFlight, setHasFlight] = useState(existing ? !!existing.flight : true);
  const [flight, setFlight] = useState<FlightLeg>(
    existing?.flight ?? defaultFlight(localDaysFromNow(7, 10), deviceZone(), true),
  );
  const [hasCheckout, setHasCheckout] = useState(!!existing?.checkout);
  const [checkout, setCheckout] = useState<HotelCheckout>(existing?.checkout ?? newCheckout());

  // Ticket screenshots added on this screen. They're deleted again if the
  // trip isn't saved, so a cancelled form leaves nothing behind.
  const [added, setAdded] = useState<Ticket[]>([]);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const saved = useRef(false);
  // False while the flight is still the blank form's placeholder.
  const flightTouched = useRef(false);
  const addedRef = useRef(added);
  addedRef.current = added;
  useEffect(
    () => () => {
      if (!saved.current) for (const t of addedRef.current) deletePhoto(t.uri);
    },
    [],
  );

  /** `problem` says why nothing was read, when the reader itself failed. */
  const applyTicket = (d: TicketDetails, problem?: string) => {
    if (!hasTripDetails(d)) {
      setReadNote(
        `${problem ?? "Couldn't find a flight or checkout time in that screenshot."} It's kept with the trip; fill in the times below.`,
      );
      return;
    }
    const draft = draftFromTicket(d, deviceZone());
    setName((n) => n.trim() || draft.name);
    if (draft.flight) {
      flightTouched.current = true;
      setHasFlight(true);
      setFlight(draft.flight);
    } else if (!existing && !flightTouched.current) {
      // A hotel-only booking: don't keep the made-up flight from a blank form,
      // but keep a flight the user typed or read from an earlier screenshot.
      setHasFlight(false);
    }
    if (draft.checkout) {
      setHasCheckout(true);
      setCheckout(draft.checkout);
    }
    setReadNote(`Filled in from your screenshot: ${describeTicket(d, formatLocalDate)}. Check the times before saving.`);
  };

  // A screenshot shared to StashCall arrives already read.
  useEffect(() => {
    const shared = fromJson<Ticket[]>(params.tickets);
    if (!shared?.length) return;
    setAdded(shared);
    applyTicket(fromJson<TicketDetails>(params.details) ?? {}, params.problem);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fillFromScreenshot = async () => {
    const uri = await pickTicket();
    if (!uri) return;
    setAdded((a) => [...a, { id: newId(), uri, addedAt: new Date().toISOString() }]);
    setReading(true);
    try {
      const r = await readTicket(uri);
      applyTicket(r.details, readProblem(r));
    } finally {
      setReading(false);
    }
  };

  const draft = { flight: hasFlight ? flight : undefined, checkout: hasCheckout ? checkout : undefined };
  const preview = useMemo(() => buildTimeline(draft), [hasFlight, flight, hasCheckout, checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (patch: Partial<FlightLeg>) => {
    flightTouched.current = true;
    setFlight((f) => ({ ...f, ...patch }));
  };
  const setC = (patch: Partial<HotelCheckout>) => setCheckout((c) => ({ ...c, ...patch }));

  const setInternational = (international: boolean) => {
    const wasDefault =
      flight.bufferMinutes ===
      (flight.international ? DEFAULTS.bufferMinutesInternational : DEFAULTS.bufferMinutesDomestic);
    setF({
      international,
      ...(wasDefault && {
        bufferMinutes: international ? DEFAULTS.bufferMinutesInternational : DEFAULTS.bufferMinutesDomestic,
      }),
    });
  };

  // Abroad, the phone's zone is usually the wrong guess for the hotel, and a
  // wrong zone moves the sweep and checkout reminders by hours. Make it a choice.
  const zoneUnset = hasCheckout && hasFlight && flight.international && !checkout.timeZoneConfirmed;

  const save = async () => {
    if (!hasFlight && !hasCheckout) {
      Alert.alert('Add a flight or a hotel checkout', 'StashCall needs at least one time to plan around.');
      return;
    }
    if (zoneUnset) {
      Alert.alert("Choose the hotel's time zone", 'Pick where the hotel is, so the checkout reminders arrive on time.');
      return;
    }
    const trip: Trip = {
      id: existing?.id ?? newId(),
      name: name.trim() || 'My trip',
      flight: draft.flight,
      checkout: draft.checkout,
      // A new trip starts with every saved item; the Items tab can take some off.
      itemIds: existing?.itemIds ?? savedItems(data.items).map((i) => i.id),
      ticked: existing?.ticked ?? {},
      tickets: [...(existing?.tickets ?? []), ...added],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    saved.current = true;
    await saveTrip(trip);
    // Ask at the moment it obviously matters: right after planning a trip.
    await askPermission();
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Delete this trip?', 'Its reminders will be cancelled. Your saved items stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(existing.id);
          router.back();
        },
      },
    ]);
  };

  const inPast = preview.length > 0 && preview[preview.length - 1].at.getTime() < Date.now();

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.fillBox}>
        {reading ? (
          <View style={styles.readingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.fillHint}>Reading your screenshot… The first time can take up to a minute.</Text>
          </View>
        ) : (
          <Text style={styles.fillLink} onPress={fillFromScreenshot} accessibilityRole="button">
            Fill in from a ticket screenshot
          </Text>
        )}
        <Text style={styles.fillHint}>
          {readNote ??
            'Pick a booking email, boarding pass or hotel booking. StashCall reads it on your phone and keeps it with the trip.'}
        </Text>
      </View>

      <Section title="Trip name">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Milan in December"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.name]}
          accessibilityLabel="Trip name"
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
        />
      </Section>

      <Section title="Flight">
        <SwitchRow label="I'm flying" value={hasFlight} onChange={setHasFlight} />
        {hasFlight ? (
          <>
            <DateTimeRow
              label="Departs"
              hint={
                flight.timeZone !== deviceZone()
                  ? `${flight.airport ? `${flight.airport}, ` : ''}${zoneLabel(flight.timeZone)} time`
                  : undefined
              }
              value={flight.departure}
              onChange={(departure) => setF({ departure })}
            />
            <SwitchRow label="International" value={flight.international} onChange={setInternational} />
            <MinutesStepper
              label="Home to airport"
              value={flight.travelMinutes}
              onChange={(travelMinutes) => setF({ travelMinutes })}
              min={15}
            />
            <MinutesStepper
              label="At the airport early"
              hint="Before departure"
              value={flight.bufferMinutes}
              onChange={(bufferMinutes) => setF({ bufferMinutes })}
              min={30}
            />
            <MinutesStepper
              label="Getting ready"
              hint="Wake-up to leaving home"
              value={flight.getReadyMinutes}
              onChange={(getReadyMinutes) => setF({ getReadyMinutes })}
              min={15}
            />
            <TimeRow
              label="Packing reminder"
              hint="The evening before"
              value={flight.packTime}
              onChange={(packTime) => setF({ packTime })}
            />
          </>
        ) : null}
      </Section>

      <Section title="Hotel checkout">
        <SwitchRow
          label="Remind me before checkout"
          hint="A room sweep for your items"
          value={hasCheckout}
          onChange={setHasCheckout}
        />
        {hasCheckout ? (
          <>
            <DateTimeRow label="Checkout" value={checkout.checkout} onChange={(v) => setC({ checkout: v })} />
            <ZoneRow
              label="Hotel time zone"
              hint="Where the hotel is, not where you are now"
              value={checkout.timeZone}
              unset={zoneUnset}
              onChange={(timeZone) => setC({ timeZone, timeZoneConfirmed: true })}
            />
            <MinutesStepper
              label="Sweep the room"
              hint="Before checkout"
              value={checkout.sweepMinutesBefore}
              onChange={(sweepMinutesBefore) => setC({ sweepMinutesBefore })}
              min={15}
              max={180}
            />
          </>
        ) : null}
      </Section>

      {preview.length > 0 ? (
        <View style={formStyles.section}>
          <Text style={formStyles.sectionTitle}>Your plan</Text>
          {inPast ? <Text style={styles.warn}>These times are in the past.</Text> : null}
          {zoneUnset ? <Text style={styles.warn}>Checkout times will show once you choose the hotel's time zone.</Text> : null}
          <Timeline steps={zoneUnset ? preview.filter((s) => s.kind !== 'sweep' && s.kind !== 'checkout') : preview} />
        </View>
      ) : null}

      <PrimaryButton label="Save trip" onPress={save} />
      {existing ? (
        <Text style={styles.delete} onPress={remove} accessibilityRole="button">
          Delete trip
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  input: { flex: 1, fontSize: 16, color: colors.text, textAlign: 'right' },
  name: { textAlign: 'left', paddingHorizontal: space.l, paddingVertical: 14 },
  fillBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: space.l,
    marginBottom: space.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.xs,
  },
  fillLink: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  fillHint: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  warn: { color: colors.warn, marginBottom: space.s },
  delete: { color: colors.danger, textAlign: 'center', fontSize: 16, marginTop: space.xl, padding: space.s },
});
