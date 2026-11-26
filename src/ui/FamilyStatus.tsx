import { Pressable, StyleSheet, Text, View } from 'react-native';

import { travellers } from '../domain/people';
import { setStatus, showStatus, STATUS_STEPS, statusOn } from '../domain/status';
import type { Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { colors, fonts, space } from './theme';

const time = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * "Where everyone is" on a travel day: each person's last update, and
 * buttons for this phone's person to send theirs. Shows around the trip
 * dates when more than one person is going.
 */
export function FamilyStatus({ trip, now }: { trip: Trip; now: Date }) {
  const { data, update } = useAppData();
  const going = travellers(trip, data.owners);
  if (going.length < 2 || !showStatus(trip, going, now)) return null;
  const me = going.find((p) => p.id === data.meId);
  const mine = me && statusOn(me, trip.id, now);
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Where everyone is</Text>
      {going.map((p) => {
        const s = statusOn(p, trip.id, now);
        return (
          <Text key={p.id} style={styles.line}>
            <Text style={styles.name}>{p.id === data.meId ? 'You' : p.name}</Text>
            {s ? `: ${s.label} · ${time(s.at)}` : ': no update yet'}
          </Text>
        );
      })}
      {me ? (
        <>
          <Text style={styles.hint}>Tap to tell the others where you are.</Text>
          <View style={styles.chips}>
            {STATUS_STEPS.map(({ step, label }) => {
              const on = mine?.step === step;
              return (
                <Pressable
                  key={step}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => update((d) => setStatus(d, me.id, trip.id, step, new Date()))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: 12, padding: space.l, marginVertical: space.m },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, marginBottom: space.s },
  line: { fontSize: 15, color: colors.text, marginTop: space.xs },
  name: { fontWeight: '600' },
  hint: { fontSize: 14, color: colors.muted, marginTop: space.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  chip: { borderWidth: 1, borderColor: colors.accent, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
});
