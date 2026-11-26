import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { instantToZoned } from '../domain/time';
import { itemCountLabel } from '../domain/tripItems';
import type { TimelineStep } from '../domain/types';
import { formatLocalDate, zoneLabel } from './Form';
import { colors, fonts, space } from './theme';

/**
 * A vertical list of timeline steps, grouped by day. Reminder steps show a
 * count of their items ("7 items to pack"); tap it to see the names.
 */
export function Timeline({
  steps,
  now = new Date(),
  itemsFor,
  actionFor,
}: {
  steps: TimelineStep[];
  now?: Date;
  /** Names of the items a reminder step covers. */
  itemsFor?: (step: TimelineStep) => string[];
  /** Something to tap on a step: "Check in", "Message a driver". */
  actionFor?: (step: TimelineStep) => { label: string; url: string } | undefined;
}) {
  const [openStep, setOpenStep] = useState<number | null>(null);
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
                {s.detail ? <Text style={styles.meta}>{s.detail}</Text> : null}
                {zones.size > 1 ? <Text style={styles.meta}>{zoneLabel(s.timeZone)} time</Text> : null}
                {items.length > 0 ? (
                  <Text
                    style={styles.items}
                    onPress={() => setOpenStep(openStep === i ? null : i)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: openStep === i }}
                  >
                    {openStep === i ? items.join(' · ') : `${itemCountLabel(s, items.length)} ›`}
                  </Text>
                ) : null}
                {(() => {
                  const a = actionFor?.(s);
                  return a ? (
                    <Text style={styles.items} onPress={() => Linking.openURL(a.url).catch(() => {})} accessibilityRole="link">
                      {a.label} ›
                    </Text>
                  ) : null;
                })()}
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
  time: { width: 60, fontSize: 17, fontFamily: fonts.display, color: colors.text, fontVariant: ['tabular-nums'] },
  body: { flex: 1 },
  title: { fontSize: 16, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  items: { fontSize: 14, color: colors.accent, marginTop: space.xs, lineHeight: 20 },
});
