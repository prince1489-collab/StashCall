import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { LocalDateTime, LocalTime } from '../domain/types';
import { colors, space } from './theme';

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function SwitchRow(props: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={props.label} hint={props.hint}>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        trackColor={{ true: colors.accent }}
        accessibilityLabel={props.label}
      />
    </Row>
  );
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** Minutes with 15-minute steps. */
export function MinutesStepper(props: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { value, onChange, min = 0, max = 12 * 60, step = 15 } = props;
  return (
    <Row label={props.label} hint={props.hint}>
      <View style={styles.stepper}>
        <StepButton label="−" a11y={`Less ${props.label}`} onPress={() => onChange(Math.max(min, value - step))} />
        <Text style={styles.stepValue}>{formatMinutes(value)}</Text>
        <StepButton label="+" a11y={`More ${props.label}`} onPress={() => onChange(Math.min(max, value + step))} />
      </View>
    </Row>
  );
}

function StepButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={8}>
      <Text style={styles.stepButtonText}>{label}</Text>
    </Pressable>
  );
}

// Wall-clock strings <-> Date objects used only to drive the native picker.
const pad = (n: number) => String(n).padStart(2, '0');
function localToPickerDate(local: LocalDateTime): Date {
  const [d, t] = local.split('T');
  const [y, mo, day] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, mo - 1, day, h, mi);
}
function pickerDateToLocal(date: Date): LocalDateTime {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatLocalDate(local: LocalDateTime): string {
  return localToPickerDate(local).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Picks a date and a time; value and result are wall-clock strings. */
export function DateTimeRow(props: {
  label: string;
  hint?: string;
  value: LocalDateTime;
  onChange: (v: LocalDateTime) => void;
}) {
  const date = localToPickerDate(props.value);
  const set = (d?: Date) => d && props.onChange(pickerDateToLocal(d));

  if (Platform.OS === 'ios') {
    return (
      <Row label={props.label} hint={props.hint}>
        <DateTimePicker value={date} mode="datetime" display="compact" minuteInterval={5} onValueChange={(_, d) => set(d)} />
      </Row>
    );
  }

  const open = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({ value: date, mode, is24Hour: true, onValueChange: (_, d) => set(d) });

  return (
    <Row label={props.label} hint={props.hint}>
      <View style={styles.inlineButtons}>
        <PillButton label={formatLocalDate(props.value)} onPress={() => open('date')} />
        <PillButton label={props.value.slice(11)} onPress={() => open('time')} />
      </View>
    </Row>
  );
}

/** Picks a time of day, e.g. the evening packing reminder. */
export function TimeRow(props: { label: string; hint?: string; value: LocalTime; onChange: (v: LocalTime) => void }) {
  const [h, m] = props.value.split(':').map(Number);
  const date = new Date(2000, 0, 1, h, m);
  const set = (d?: Date) => d && props.onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);

  if (Platform.OS === 'ios') {
    return (
      <Row label={props.label} hint={props.hint}>
        <DateTimePicker value={date} mode="time" display="compact" minuteInterval={15} onValueChange={(_, d) => set(d)} />
      </Row>
    );
  }
  return (
    <Row label={props.label} hint={props.hint}>
      <PillButton
        label={props.value}
        onPress={() => DateTimePickerAndroid.open({ value: date, mode: 'time', is24Hour: true, onValueChange: (_, d) => set(d) })}
      />
    </Row>
  );
}

export function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.pill} accessibilityRole="button">
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/** Time zones offered for a hotel. The device zone is always included. */
const COMMON_ZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Berlin',
  'Europe/Athens',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
];

export function zoneLabel(zone: string): string {
  return zone.split('/').pop()!.replace(/_/g, ' ');
}

export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
}

export function ZoneRow(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (z: string) => void;
  /** Show "Choose" instead of the zone until the user picks one. */
  unset?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const zones = Array.from(new Set([deviceZone(), ...COMMON_ZONES]));
  return (
    <Row label={props.label} hint={props.hint}>
      <PillButton label={props.unset ? 'Choose' : zoneLabel(props.value)} onPress={() => setOpen(true)} />
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Hotel time zone</Text>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
            <Text style={styles.link}>Done</Text>
          </Pressable>
        </View>
        <ScrollView>
          {zones.map((z) => (
            <Pressable
              key={z}
              style={styles.zoneItem}
              onPress={() => {
                props.onChange(z);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: !props.unset && z === props.value }}
            >
              <Text style={[styles.label, !props.unset && z === props.value && { color: colors.accent, fontWeight: '600' }]}>
                {zoneLabel(z)}
              </Text>
              <Text style={styles.hint}>{z}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Modal>
    </Row>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.primary, (pressed || disabled) && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space.s,
    marginLeft: space.xs,
  },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.m,
  },
  rowText: { flex: 1 },
  label: { fontSize: 16, color: colors.text },
  hint: { fontSize: 13, color: colors.muted, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { fontSize: 20, color: colors.accent, fontWeight: '600' },
  stepValue: { minWidth: 76, textAlign: 'center', fontSize: 15, fontVariant: ['tabular-nums'], color: colors.text },
  inlineButtons: { flexDirection: 'row', gap: space.s },
  pill: { paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 8, backgroundColor: colors.bg },
  pillText: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  zoneItem: { paddingHorizontal: space.l, paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  primary: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
