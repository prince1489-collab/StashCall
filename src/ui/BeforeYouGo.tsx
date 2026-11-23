import { Pressable, StyleSheet, Text, View } from 'react-native';

import { prepTasks, setPrep } from '../domain/prep';
import type { PrepTask } from '../domain/prep';
import { instantToZoned } from '../domain/time';
import type { InsuranceCover, PrepKind, PrepStatus, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { newId } from '../storage/store';
import { formatLocalDate } from './Form';
import { colors, space } from './theme';

export const COVER_LABELS: Record<InsuranceCover, string> = {
  annual: 'Annual policy',
  card: 'Through my bank or card',
  perTrip: 'I buy it for each trip',
};

function nextReminder(t: PrepTask): string | undefined {
  const at = t.remindAt.find((d) => d.getTime() > Date.now());
  if (!at) return undefined;
  const local = instantToZoned(at, t.timeZone);
  return `Reminder ${formatLocalDate(local)}, ${local.slice(11)}`;
}

/**
 * Travel insurance and visas: things to sort in the weeks before a trip.
 * `compact` shows only open tasks and hides the card when nothing is left.
 */
export function BeforeYouGo({ trip, compact }: { trip: Trip; compact?: boolean }) {
  const { data, update } = useAppData();
  const tasks = prepTasks(trip, data.insurance);
  const open = tasks.filter((t) => t.status === 'todo');
  if (compact && open.length === 0) return null;

  const set = (kind: PrepKind, status: PrepStatus | undefined) => update((d) => setPrep(d, trip.id, kind, status, newId));
  const setCover = (cover: InsuranceCover) => update((d) => ({ ...d, insurance: cover }));
  const shown = compact ? open : tasks;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Before you go</Text>
      {shown.map((t) => {
        if (t.kind === 'insurance' && !data.insurance && t.status === 'todo') {
          return (
            <View key={t.kind} style={styles.task}>
              <Text style={styles.title}>How are you covered for travel insurance?</Text>
              <Text style={styles.hint}>Asked once. With an annual or bank policy, StashCall ticks this off on every trip.</Text>
              <View style={[styles.choices, { marginLeft: 0 }]}>
                {(Object.keys(COVER_LABELS) as InsuranceCover[]).map((c) => (
                  <Choice key={c} label={COVER_LABELS[c]} onPress={() => setCover(c)} />
                ))}
              </View>
            </View>
          );
        }
        const done = t.status !== 'todo';
        const hint =
          t.status === 'covered'
            ? `Covered by your ${data.insurance === 'annual' ? 'annual policy' : 'bank or card'}. Change it in Settings.`
            : t.status === 'notNeeded'
              ? 'Not needed for this trip.'
              : t.kind === 'visa' && t.status === 'done'
                ? 'Sorted. Your visa is on the packing list.'
                : t.status === 'done'
                  ? 'Sorted.'
                  : t.kind === 'insurance'
                    ? (nextReminder(t) ?? 'Buy it soon, so cancellations are covered too.')
                    : `Check if you need a visa, e-visa or travel authorisation. ${nextReminder(t) ?? 'Some take weeks.'}`;
        return (
          <View key={t.kind} style={styles.task}>
            <Pressable
              style={styles.row}
              onPress={() => (t.status === 'covered' ? undefined : set(t.kind, done ? undefined : 'done'))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={t.title}
            >
              <View style={[styles.box, done && styles.boxOn]}>{done ? <Text style={styles.tick}>✓</Text> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, done && styles.titleDone]}>
                  {t.kind === 'visa' && !done ? 'Check visa and entry rules' : t.kind === 'insurance' && !done ? 'Buy travel insurance' : t.title}
                </Text>
                <Text style={styles.hint}>{hint}</Text>
              </View>
            </Pressable>
            {t.status === 'todo' ? (
              <View style={styles.choices}>
                <Choice label={t.kind === 'visa' ? 'Got my visa' : 'Bought it'} onPress={() => set(t.kind, 'done')} />
                <Choice label="Not needed" onPress={() => set(t.kind, 'notNeeded')} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.choice} accessibilityRole="button">
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.l,
    marginVertical: space.m,
    gap: space.m,
  },
  heading: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  task: { gap: space.s },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: '#fff', fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  titleDone: { color: colors.muted },
  hint: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 2 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginLeft: 38 },
  choice: { paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 8, backgroundColor: colors.accentSoft },
  choiceText: { fontSize: 14, color: colors.accent, fontWeight: '600' },
});
