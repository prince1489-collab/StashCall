import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BLANKS, DEFAULT_FROM_AIRPORT, DEFAULT_TO_AIRPORT, fillMessage } from '../domain/rides';
import type { Ride } from '../domain/rides';
import { useAppData } from '../state/AppData';
import { PrimaryButton, Section } from '../ui/Form';
import { colors, space } from '../ui/theme';

const SAMPLE_TO: Ride = { day: 'Sun 6 Dec', time: '05:00', from: 'home', to: 'Mumbai airport (BOM), Terminal 2', flight: 'QP1111', flightTime: '07:00' };
const SAMPLE_FROM: Ride = { day: 'Sun 6 Dec', time: '13:15', from: 'Pantnagar airport (PGH)', to: 'the hotel', flight: '6E7415', flightTime: '13:15' };

/**
 * The person's own words for a driver, in any language: Hindi, say. Blanks
 * like {time} are filled in for each ride. Kept on this phone only.
 */
export default function DriverMessage() {
  const { data, update } = useAppData();
  const [to, setTo] = useState(data.driverTemplates?.toAirport || DEFAULT_TO_AIRPORT);
  const [from, setFrom] = useState(data.driverTemplates?.fromAirport || DEFAULT_FROM_AIRPORT);

  const save = async () => {
    const keep = (t: string, d: string) => (t.trim() && t.trim() !== d ? t.trim() : undefined);
    await update((d) => ({ ...d, driverTemplates: { toAirport: keep(to, DEFAULT_TO_AIRPORT), fromAirport: keep(from, DEFAULT_FROM_AIRPORT) } }));
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Write the WhatsApp message for your driver in your own words or language. StashCall fills in the blanks for each
        ride. It stays on this phone.
      </Text>
      <Section title="To the airport">
        <TextInput style={styles.input} value={to} onChangeText={setTo} multiline accessibilityLabel="Message for a ride to the airport" />
      </Section>
      <Text style={styles.preview}>{fillMessage(to, SAMPLE_TO)}</Text>
      <Section title="From the airport">
        <TextInput style={styles.input} value={from} onChangeText={setFrom} multiline accessibilityLabel="Message for a ride from the airport" />
      </Section>
      <Text style={styles.preview}>{fillMessage(from, SAMPLE_FROM)}</Text>
      <Section title="Blanks you can use">
        <View style={styles.blanks}>
          {BLANKS.map((b) => (
            <Text key={b.key} style={styles.blank}>
              <Text style={styles.key}>{`{${b.key}}`}</Text> {b.means}
            </Text>
          ))}
        </View>
      </Section>
      <Text
        style={styles.reset}
        onPress={() => {
          setTo(DEFAULT_TO_AIRPORT);
          setFrom(DEFAULT_FROM_AIRPORT);
        }}
        accessibilityRole="button"
      >
        Go back to the English messages
      </Text>
      <PrimaryButton label="Save" onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: space.xl * 2 },
  intro: { fontSize: 15, color: colors.muted, lineHeight: 21, marginBottom: space.m },
  input: { fontSize: 16, color: colors.text, padding: space.l, minHeight: 96, textAlignVertical: 'top' },
  preview: { fontSize: 14, color: colors.muted, fontStyle: 'italic', marginHorizontal: space.s, marginBottom: space.m },
  blanks: { padding: space.l, gap: space.s },
  blank: { fontSize: 14, color: colors.text },
  key: { fontWeight: '700' },
  reset: { fontSize: 15, color: colors.accent, fontWeight: '600', textAlign: 'center', marginVertical: space.l },
});
