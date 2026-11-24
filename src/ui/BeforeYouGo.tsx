import { Pressable, StyleSheet, Text, View } from 'react-native';

import { updatePerson } from '../domain/people';
import { addDoc, docsFor, prepTasks, removeDoc, setPrep, shortDate } from '../domain/prep';
import type { PrepTask } from '../domain/prep';
import { instantToZoned } from '../domain/time';
import type { InsuranceCover, PrepKind, PrepStatus, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { newId } from '../storage/store';
import type { AppData } from '../storage/store';
import { DocPhotos } from './DocPhotos';
import { formatLocalDate, pickDate } from './Form';
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
  return `Reminder ${formatLocalDate(local)}, ${local.slice(11)}.`;
}

interface Choice {
  label: string;
  onPress: () => void;
}

interface View_ {
  title: string;
  hint: string;
  choices: Choice[];
  /** Photos shown for insurance and visas. */
  docs?: 'insurance' | 'visa';
}

/** What to show for each task, and what its buttons do. */
function describe(t: PrepTask, data: AppData, act: {
  set: (kind: PrepKind, status: PrepStatus | undefined) => void;
  patch: (fn: (d: AppData) => AppData) => void;
  tripId: string;
}): View_ {
  const when = nextReminder(t);
  const dated = (fn: (date: string) => (d: AppData) => AppData) => () => pickDate(t.date, (date) => act.patch(fn(date)));
  const policy = data.insurance === 'annual' ? 'annual policy' : 'bank or card cover';
  switch (t.kind) {
    case 'insurance':
      if (t.status === 'covered')
        return {
          title: 'Travel insurance',
          hint: t.date
            ? `Covered by your ${policy} until ${shortDate(t.date)}.`
            : `Covered by your ${policy}. Add its end date, and StashCall warns you if a trip runs past it.`,
          choices: [{ label: t.date ? 'Change end date' : 'Add end date', onPress: dated((date) => (d) => ({ ...d, insuranceEnds: date })) }],
          docs: 'insurance',
        };
      if (t.problem === 'insuranceEnds' && t.status === 'todo')
        return {
          title: 'Renew your travel insurance',
          hint: `Your ${policy} ends on ${shortDate(t.date!)}, before this trip ends. Renew it or buy cover for this trip. ${when ?? ''}`,
          choices: [
            { label: 'Renewed: new end date', onPress: dated((date) => (d) => ({ ...d, insuranceEnds: date })) },
            { label: 'Bought cover for this trip', onPress: () => act.set('insurance', 'done') },
          ],
          docs: 'insurance',
        };
      if (t.status === 'todo')
        return {
          title: 'Buy travel insurance',
          hint: when ?? 'Buy it soon, so cancellations are covered too.',
          choices: [
            { label: 'Bought it', onPress: () => act.set('insurance', 'done') },
            { label: 'Not needed', onPress: () => act.set('insurance', 'notNeeded') },
          ],
          docs: 'insurance',
        };
      if (t.optional)
        return {
          title: 'Travel insurance',
          hint: 'Optional for a trip within one country.',
          choices: [{ label: 'I bought cover', onPress: () => act.set('insurance', 'done') }],
        };
      return {
        title: 'Travel insurance',
        hint: t.status === 'notNeeded' ? 'Not needed for this trip.' : 'Sorted. Keep a photo of the policy here.',
        choices: [],
        docs: t.status === 'done' ? 'insurance' : undefined,
      };

    case 'visa': {
      const setExpiry = dated((date) => (d) => ({
        ...d,
        trips: d.trips.map((x) => (x.id === act.tripId ? { ...x, visaExpires: date } : x)),
      }));
      if (t.problem === 'visaExpires')
        return {
          title: 'Your visa runs out',
          hint: `It ends on ${shortDate(t.date!)}, before this trip ends. Check your dates. ${when ?? ''}`,
          choices: [
            { label: 'Change expiry date', onPress: setExpiry },
            { label: 'Not needed', onPress: () => act.set('visa', 'notNeeded') },
          ],
          docs: 'visa',
        };
      if (t.status === 'todo')
        return {
          title: 'Check visa and entry rules',
          hint: `Check if you need a visa, e-visa or travel authorisation. ${when ?? 'Some take weeks.'}`,
          choices: [
            { label: 'Got my visa', onPress: () => act.set('visa', 'done') },
            { label: 'Not needed', onPress: () => act.set('visa', 'notNeeded') },
          ],
        };
      if (t.status === 'notNeeded') return { title: 'Visa', hint: 'Not needed for this trip.', choices: [] };
      return {
        title: 'Visa',
        hint: `Sorted, and on your packing list.${t.date ? ` Valid until ${shortDate(t.date)}.` : ''}`,
        choices: [{ label: t.date ? 'Change expiry date' : 'Add expiry date', onPress: setExpiry }],
        docs: 'visa',
      };
    }

    case 'passport': {
      const setExpiry = t.whoseId
        ? dated((date) => (d) => updatePerson(d, t.whoseId!, { passportExpires: date }))
        : dated((date) => (d) => ({ ...d, passportExpires: date }));
      const whose = t.whose ? `${t.whose}'s passport` : 'Your passport';
      if (t.status === 'covered')
        return {
          title: 'Passport',
          hint: `${t.whose ? `${whose} runs out first, on ${shortDate(t.date!)}. That's` : `Valid until ${shortDate(t.date!)},`} more than 6 months after you travel.`,
          choices: [{ label: 'Change date', onPress: setExpiry }],
        };
      if (t.problem === 'passportShort' && t.status === 'todo')
        return {
          title: 'Check your passport',
          hint: `${whose} runs out on ${shortDate(t.date!)}, less than 6 months after this trip starts. Some countries refuse entry, and renewing can take weeks. ${when ?? ''}`,
          choices: [
            { label: 'Renewed: new date', onPress: setExpiry },
            { label: "Checked, it's fine", onPress: () => act.set('passport', 'done') },
          ],
        };
      if (t.status === 'todo')
        return {
          title: 'Check your passport',
          hint: 'Many countries want 6 months left when you arrive. Add the expiry date of the passport that runs out first.',
          choices: [
            { label: 'Add expiry date', onPress: setExpiry },
            { label: "It's fine", onPress: () => act.set('passport', 'done') },
          ],
        };
      return { title: 'Passport', hint: 'Checked.', choices: [] };
    }
  }
}

/**
 * Travel insurance, visas and passports: things to sort in the weeks before
 * a trip. `compact` shows only open tasks, without photos, and hides the
 * card when nothing is left.
 */
export function BeforeYouGo({ trip, compact }: { trip: Trip; compact?: boolean }) {
  const { data, update } = useAppData();
  const tasks = prepTasks(trip, data);
  const open = tasks.filter((t) => t.status === 'todo');
  if (compact && open.length === 0) return null;

  const act = {
    set: (kind: PrepKind, status: PrepStatus | undefined) => update((d) => setPrep(d, trip.id, kind, status, newId)),
    patch: (fn: (d: AppData) => AppData) => update(fn),
    tripId: trip.id,
  };
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
                  <ChoiceButton key={c} label={COVER_LABELS[c]} onPress={() => update((d) => ({ ...d, insurance: c }))} />
                ))}
              </View>
            </View>
          );
        }
        const v = describe(t, data, act);
        const done = t.status !== 'todo';
        return (
          <View key={t.kind} style={styles.task}>
            <Pressable
              style={styles.row}
              onPress={() => (t.status === 'covered' || t.optional || (t.problem && !done) ? undefined : act.set(t.kind, done ? undefined : 'done'))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={v.title}
            >
              <View style={[styles.box, done && styles.boxOn, t.problem && !done && styles.boxWarn]}>
                {done ? <Text style={styles.tick}>✓</Text> : t.problem ? <Text style={styles.warn}>!</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, done && styles.titleDone]}>{v.title}</Text>
                <Text style={styles.hint}>{v.hint.trim()}</Text>
              </View>
            </Pressable>
            {v.choices.length > 0 && (!compact || !done) ? (
              <View style={styles.choices}>
                {v.choices.map((c) => (
                  <ChoiceButton key={c.label} {...c} />
                ))}
              </View>
            ) : null}
            {v.docs && !compact ? (
              <View style={styles.docs}>
                <DocPhotos
                  label={v.docs === 'visa' ? 'visa' : 'insurance policy'}
                  photos={docsFor(data, trip, v.docs)}
                  onAdd={(doc) => update((d) => addDoc(d, trip.id, v.docs!, doc))}
                  onRemove={(doc) => update((d) => removeDoc(d, doc.id))}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ChoiceButton({ label, onPress }: Choice) {
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
    gap: space.l,
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
  boxOn: { backgroundColor: colors.done, borderColor: colors.done },
  boxWarn: { borderColor: colors.amber },
  tick: { color: '#fff', fontWeight: '700' },
  warn: { color: colors.warn, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  titleDone: { color: colors.muted },
  hint: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 2 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginLeft: 38 },
  choice: { paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 8, backgroundColor: colors.accentSoft },
  choiceText: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  docs: { marginLeft: 38 },
});
