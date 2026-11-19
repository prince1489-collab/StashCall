import { StyleSheet, Text, View } from 'react-native';

import { instantToZoned } from '../domain/time';
import type { TimelineStep } from '../domain/types';
import { formatLocalDate, zoneLabel } from './Form';
import { colors, space } from './theme';

/** A vertical list of timeline steps, grouped by day. */
export function Timeline({
  steps,
  now = new Date(),
  itemsFor,
}: {
  steps: TimelineStep[];
  now?: Date;
  /** Names of the items a reminder step covers. */
  itemsFor?: (step: TimelineStep) => string[];
}) {
  let lastDay = '';
  const zones = new Set(steps.map((s) => s.timeZone));
  return (
    <View>
      {steps.map((s, i) => {
        const local = instantToZoned(s.at, s.timeZone);
        const day = local.slice(0, 10);
        const header = day !== lastDay ? formatLocalDate(local) : null;
        lastDay = day;
        const past = s.at.getTime() < now.getTime();
        const items = itemsFor?.(s) ?? [];
        return (
          <View key={`${s.kind}-${i}`}>
            {header ? <Text style={styles.day}>{header}</Text> : null}
            <View style={[styles.step, past && styles.past]}>
              <Text style={styles.time}>{s.localTime}</Text>
              <View style={styles.body}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.meta}>
                  {s.estimate ? 'Estimate' : 'Your time'}
                  {zones.size > 1 ? ` · ${zoneLabel(s.timeZone)} time` : ''}
                  {s.notify ? ' · Reminder' : ''}
                </Text>
                {items.length > 0 ? <Text style={styles.items}>{items.join(' · ')}</Text> : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: space.l, marginBottom: space.s },
  step: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: space.m,
    marginBottom: space.s,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  past: { opacity: 0.45 },
  time: { width: 60, fontSize: 17, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  body: { flex: 1 },
  title: { fontSize: 16, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  items: { fontSize: 14, color: colors.accent, marginTop: space.xs, lineHeight: 20 },
});
