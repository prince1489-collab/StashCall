import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULTS } from '../../domain/defaults';
import { savedItems } from '../../domain/household';
import { draftFromTicket, flightLeg, isReturnOf } from '../../domain/ticketDraft';
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
type Params = { new?: string; tickets?: string; details?: string; problem?: string; text?: string };

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
  const [hasReturn, setHasReturn] = useState(!!existing?.returnFlight);
  const [returnFlight, setReturnFlight] = useState<FlightLeg>(
    existing?.returnFlight ?? defaultFlight(localDaysFromNow(14, 10), deviceZone(), true),
  );

  // Ticket screenshots added on this screen. They're deleted again if the
  // trip isn't saved, so a cancelled form leaves nothing behind.
  const [added, setAdded] = useState<Ticket[]>([]);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  // What the text reader saw, so testers can show us when a read goes wrong.
  const [readText, setReadText] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
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
    // A screenshot of just the flight home, for a trip that already has its
    // outbound flight: fill in the flight home and leave the rest alone.
    const outbound = hasFlight && (existing?.flight || flightTouched.current) ? flight : undefined;
    if (outbound && !d.returnFlight && !d.checkout && isReturnOf(outbound, d)) {
      setHasReturn(true);
      setReturnFlight(flightLeg(d, hasCheckout ? checkout.timeZone : deviceZone(), hasCheckout && !!checkout.timeZoneConfirmed));
      setReadNote(`Added your flight home: ${describeTicket(d, formatLocalDate)}. Check the times before saving.`);
      return;
    }
    const draft = draftFromTicket(d, deviceZone());
    // The whole round-trip booking, for a trip that already has this outbound
    // flight: add the flight home and keep the user's outbound settings.
    if (outbound && draft.returnFlight && d.departure === outbound.departure) {
      setHasReturn(true);
      setReturnFlight(draft.returnFlight);
      setReadNote(`Added your flight home: ${describeTicket(d.returnFlight!, formatLocalDate)}. Check the times before saving.`);
      return;
    }
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
    if (draft.returnFlight) {
      setHasReturn(true);
      setReturnFlight(draft.returnFlight);
    }
    setReadNote(`Filled in from your screenshot: ${describeTicket(d, formatLocalDate)}. Check the times before saving.`);
  };

  // A screenshot shared to StashCall arrives already read.
  useEffect(() => {
    const shared = fromJson<Ticket[]>(params.tickets);
    if (!shared?.length) return;
    setAdded(shared);
    applyTicket(fromJson<TicketDetails>(params.details) ?? {}, params.problem);
    if (params.text) setReadText(params.text);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fillFromScreenshot = async () => {
    const uri = await pickTicket();
    if (!uri) return;
    setAdded((a) => [...a, { id: newId(), uri, addedAt: new Date().toISOString() }]);
    setReading(true);
    try {
      const r = await readTicket(uri);
      applyTicket(r.details, readProblem(r));
      setReadText(r.text ?? null);
      setShowText(false);
    } finally {
      setReading(false);
    }
  };

  const draft = {
    flight: hasFlight ? flight : undefined,
    checkout: hasCheckout ? checkout : undefined,
    returnFlight: hasReturn ? returnFlight : undefined,
  };
  const preview = useMemo(() => buildTimeline(draft), [hasFlight, flight, hasCheckout, checkout, hasReturn, returnFlight]); // eslint-disable-line react-hooks/exhaustive-deps
  const setR = (patch: Partial<FlightLeg>) => setReturnFlight((f) => ({ ...f, ...patch }));

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
  // Same for the flight home: it leaves from wherever you are staying.
  const returnZoneUnset = hasReturn && hasFlight && flight.international && !returnFlight.timeZoneConfirmed;

  const save = async () => {
    if (!hasFlight && !hasCheckout && !hasReturn) {
      Alert.alert('Add a flight or a hotel checkout', 'StashCall needs at least one time to plan around.');
      return;
    }
    if (zoneUnset) {
      Alert.alert("Choose the hotel's time zone", 'Pick where the hotel is, so the checkout reminders arrive on time.');
      return;
    }
    if (returnZoneUnset) {
      Alert.alert(
        'Where do you fly home from?',
        'Pick the time zone you fly home from, so those reminders arrive on time.',
      );
      return;
    }
    const trip: Trip = {
      id: existing?.id ?? newId(),
      name: name.trim() || 'My trip',
      flight: draft.flight,
      checkout: draft.checkout,
      returnFlight: draft.returnFlight,
      // A new trip starts with every saved item; the Items tab can take some off.
      itemIds: existing?.itemIds ?? savedItems(data.items).map((i) => i.id),
      ticked: existing?.ticked ?? {},
      prep: existing?.prep,
      tickets: [...(existing?.tickets ?? []), ...added],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    saved.current = true;
    await saveTrip(trip);
    // Ask at the moment it obviously matters: right after planning a trip.
    await askPermission();
    router.back();
    // First trip and nothing saved yet: go straight to picking items, or the
    // reminders have nothing to name.
    if (savedItems(data.items).length === 0) router.navigate('/items');
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
        {readText ? (
          <>
            <Text style={styles.textLink} onPress={() => setShowText((v) => !v)} accessibilityRole="button">
              {showText ? 'Hide what StashCall read' : 'Show what StashCall read'}
            </Text>
            {showText ? (
              <Text style={styles.rawText} selectable>
                {readText}
              </Text>
            ) : null}
          </>
        ) : null}
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

      <Section title="Flight home">
        <SwitchRow
          label="I'm flying home"
          hint="Plans the day you leave, from the hotel"
          value={hasReturn}
          onChange={setHasReturn}
        />
        {hasReturn ? (
          <>
            <DateTimeRow
              label="Departs"
              hint={returnFlight.airport ? `${returnFlight.airport}, ${zoneLabel(returnFlight.timeZone)} time` : undefined}
              value={returnFlight.departure}
              onChange={(departure) => setR({ departure })}
            />
            <ZoneRow
              label="Flying home from"
              hint="The time zone of that airport"
              title="Flying home from"
              value={returnFlight.timeZone}
              unset={returnZoneUnset}
              onChange={(timeZone) => setR({ timeZone, timeZoneConfirmed: true })}
            />
            <MinutesStepper
              label="Hotel to airport"
              value={returnFlight.travelMinutes}
              onChange={(travelMinutes) => setR({ travelMinutes })}
              min={15}
            />
            <MinutesStepper
              label="At the airport early"
              hint="Before departure"
              value={returnFlight.bufferMinutes}
              onChange={(bufferMinutes) => setR({ bufferMinutes })}
              min={30}
            />
          </>
        ) : null}
      </Section>

      {preview.length > 0 ? (
        <View style={formStyles.section}>
          <Text style={formStyles.sectionTitle}>Your plan</Text>
          {inPast ? <Text style={styles.warn}>These times are in the past.</Text> : null}
          {zoneUnset ? <Text style={styles.warn}>Checkout times will show once you choose the hotel's time zone.</Text> : null}
          {returnZoneUnset ? (
            <Text style={styles.warn}>Your flight home will show once you choose where you fly home from.</Text>
          ) : null}
          <Timeline
            steps={preview.filter(
              (s) =>
                !(zoneUnset && (s.kind === 'sweep' || s.kind === 'checkout')) &&
                !(returnZoneUnset && ['returnPack', 'returnWake', 'returnLeaveCheck', 'returnLeave', 'returnAirport', 'returnTakeoff'].includes(s.kind)),
            )}
          />
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
  textLink: { fontSize: 14, color: colors.accent, fontWeight: '600', marginTop: space.xs },
  rawText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', marginTop: space.xs },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  warn: { color: colors.warn, marginBottom: space.s },
  delete: { color: colors.danger, textAlign: 'center', fontSize: 16, marginTop: space.xl, padding: space.s },
});
