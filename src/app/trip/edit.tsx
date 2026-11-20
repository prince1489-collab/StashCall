import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULTS } from '../../domain/defaults';
import { savedItems } from '../../domain/household';
import { buildTimeline, defaultFlight } from '../../domain/timeline';
import type { FlightLeg, HotelCheckout, Trip } from '../../domain/types';
import { newId } from '../../storage/store';
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
  styles as formStyles,
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
  const existing = currentTrip;

  const [name, setName] = useState(existing?.name ?? '');
  const [hasFlight, setHasFlight] = useState(existing ? !!existing.flight : true);
  const [flight, setFlight] = useState<FlightLeg>(
    existing?.flight ?? defaultFlight(localDaysFromNow(7, 10), deviceZone(), true),
  );
  const [hasCheckout, setHasCheckout] = useState(!!existing?.checkout);
  const [checkout, setCheckout] = useState<HotelCheckout>(existing?.checkout ?? newCheckout());

  const draft = { flight: hasFlight ? flight : undefined, checkout: hasCheckout ? checkout : undefined };
  const preview = useMemo(() => buildTimeline(draft), [hasFlight, flight, hasCheckout, checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (patch: Partial<FlightLeg>) => setFlight((f) => ({ ...f, ...patch }));
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
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
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
            <DateTimeRow label="Departs" value={flight.departure} onChange={(departure) => setF({ departure })} />
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
  warn: { color: colors.warn, marginBottom: space.s },
  delete: { color: colors.danger, textAlign: 'center', fontSize: 16, marginTop: space.xl, padding: space.s },
});
