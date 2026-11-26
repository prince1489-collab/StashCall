import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { instantToZoned } from '../domain/time';
import { itemCountLabel } from '../domain/tripItems';
import type { StepKind, TimelineStep } from '../domain/types';
import { formatLocalDate, zoneLabel } from './Form';
import { colors, fonts, space } from './theme';

/** The fixed points of the day, shown a little stronger than the steps around them. */
const KEY_STEPS: StepKind[] = ['takeoff', 'connection', 'returnTakeoff', 'returnConnection', 'land', 'checkout'];

/**
 * The trip, day by day: one card per day, one row per step. Reminder
 * steps show a count of their items ("7 items to pack"); tap it to see the
 * names. With `doneFor` and `onToggle`, each step has a circle to tick it
 * off, and a ticked step says who ticked it. Days that are over fold away.
 */
export function Timeline({
  steps,
  now = new Date(),
  itemsFor,
  actionFor,
  doneFor,
  onToggle,
}: {
  steps: TimelineStep[];
  now?: Date;
  /** Names of the items a reminder step covers. */
  itemsFor?: (step: TimelineStep) => string[];
  /** Something to tap on a step: "Check in", "Message a driver". */
  actionFor?: (step: TimelineStep) => { label: string; url: string } | undefined;
  /** "Done by Bajrang · 10:42" when the step is ticked off. */
  doneFor?: (step: TimelineStep) => string | undefined;
  /** Ticks or unticks a step. */
  onToggle?: (step: TimelineStep) => void;
}) {
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const zones = new Set(steps.map((s) => s.timeZone));
  const t = now.getTime();
  const nextStep = steps.find((s) => s.at.getTime() >= t && !doneFor?.(s));

  const days: { day: string; label: string; steps: TimelineStep[] }[] = [];
  for (const s of steps) {
    const local = instantToZoned(s.at, s.timeZone);
    const day = local.slice(0, 10);
    const last = days[days.length - 1];
    if (last?.day === day) last.steps.push(s);
    else days.push({ day, label: formatLocalDate(local), steps: [s] });
  }
  // A day is over once its last step has passed.
  const over = days.filter((d) => d.steps[d.steps.length - 1].at.getTime() < t);
  const shown = showPast ? days : days.filter((d) => !over.includes(d));

  return (
    <View>
      {over.length > 0 ? (
        <Text style={styles.fold} onPress={() => setShowPast(!showPast)} accessibilityRole="button" accessibilityState={{ expanded: showPast }}>
          {showPast ? 'Hide earlier days' : `Earlier days (${over.length}) ›`}
        </Text>
      ) : null}
      {shown.map((d) => (
        <View key={d.day}>
          <Text style={styles.day}>{d.label}</Text>
          <View style={styles.card}>
            {d.steps.map((s, i) => {
              const id = `${s.kind}-${s.at.getTime()}`;
              const past = s.at.getTime() < t;
              const isNext = s === nextStep;
              const key = KEY_STEPS.includes(s.kind);
              const items = itemsFor?.(s) ?? [];
              const done = doneFor?.(s);
              const action = actionFor?.(s);
              const open = openStep === id;
              return (
                <View key={id} style={[styles.row, i > 0 && styles.divider]}>
                  <View style={[styles.main, past && !done && styles.past]}>
                    <View style={styles.timeCol}>
                      <Text style={[styles.time, isNext && styles.timeNext]}>{s.localTime}</Text>
                      {isNext ? <Text style={styles.nextTag}>Next</Text> : null}
                    </View>
                    <View style={styles.body}>
                      <Text style={[styles.title, key && styles.titleKey, done && styles.titleDone]}>{s.title}</Text>
                      {s.detail ? <Text style={styles.meta}>{s.detail}</Text> : null}
                      {zones.size > 1 ? <Text style={styles.meta}>{zoneLabel(s.timeZone)} time</Text> : null}
                      {done ? <Text style={styles.doneBy}>{done}</Text> : null}
                      {items.length > 0 ? (
                        <Text
                          style={styles.link}
                          onPress={() => setOpenStep(open ? null : id)}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                        >
                          {open ? items.join(' · ') : `${itemCountLabel(s, items.length)} ›`}
                        </Text>
                      ) : null}
                      {action ? (
                        <Text style={styles.link} onPress={() => Linking.openURL(action.url).catch(() => {})} accessibilityRole="link">
                          {action.label} ›
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {onToggle ? (
                    <Pressable
                      onPress={() => onToggle(s)}
                      hitSlop={12}
                      style={[styles.tick, done && styles.tickOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!done }}
                      accessibilityLabel={`${s.title}: ${done ? 'done' : 'not done'}`}
                    >
                      {done ? <Text style={styles.tickMark}>✓</Text> : null}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fold: { fontSize: 15, color: colors.accent, fontWeight: '600', paddingVertical: space.s },
  day: { fontSize: 14, fontFamily: fonts.bold, color: colors.text, marginTop: space.l, marginBottom: space.s },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: space.m,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.m, gap: space.m },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  main: { flex: 1, flexDirection: 'row', gap: space.m },
  past: { opacity: 0.45 },
  timeCol: { width: 52 },
  time: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  timeNext: { color: colors.warn },
  nextTag: {
    alignSelf: 'flex-start',
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.amber,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  body: { flex: 1 },
  title: { fontSize: 16, color: colors.text, lineHeight: 21 },
  titleKey: { fontFamily: fonts.bold },
  titleDone: { textDecorationLine: 'line-through', color: colors.muted },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  doneBy: { fontSize: 13, color: colors.done, fontWeight: '600', marginTop: 2 },
  link: { fontSize: 14, color: colors.accent, fontWeight: '600', marginTop: space.xs, lineHeight: 20 },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: colors.done, borderColor: colors.done },
  tickMark: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
