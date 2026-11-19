import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { addPresets, setOnCurrentTrip } from '../../domain/household';
import { PRESET_ITEMS } from '../../domain/presets';
import { newId } from '../../storage/store';
import { useAppData } from '../../state/AppData';
import { PrimaryButton, Section, styles as formStyles } from '../../ui/Form';
import { ItemRow, MOMENT_LABEL } from '../../ui/ItemRow';
import { colors, space } from '../../ui/theme';

export default function Items() {
  const { data, ready, currentTrip, update } = useAppData();
  const [picked, setPicked] = useState<string[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  if (!ready) return null;

  const savedPresets = new Set(data.items.map((i) => i.presetId));
  const remaining = PRESET_ITEMS.filter((p) => !savedPresets.has(p.id));
  const firstRun = data.items.length === 0;
  const presetsOpen = firstRun || showPresets;

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const addPicked = async () => {
    await update((d) => addPresets(d, picked, newId));
    setPicked([]);
    setShowPresets(false);
  };

  const onTrip = new Set(currentTrip?.itemIds ?? []);
  const ownerOf = (id?: string) => data.owners.find((o) => o.id === id);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {presetsOpen && remaining.length > 0 ? (
        <>
          <Text style={styles.title}>{firstRun ? 'What do you tend to forget?' : 'Add common items'}</Text>
          <Text style={styles.text}>Tap the ones that matter to your household. You can add photos and owners later.</Text>
          <Section>
            {remaining.map((p) => {
              const on = picked.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => togglePick(p.id)}
                  style={styles.presetRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetName}>{p.name}</Text>
                    <Text style={styles.meta}>{MOMENT_LABEL[p.moment]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Section>
          <PrimaryButton
            label={picked.length ? `Add ${picked.length} item${picked.length > 1 ? 's' : ''}` : 'Pick at least one'}
            onPress={addPicked}
            disabled={picked.length === 0}
          />
          <Text style={styles.link} onPress={() => router.push('/item/edit')} accessibilityRole="button">
            Add something else
          </Text>
          {!firstRun ? (
            <Text style={styles.link} onPress={() => setShowPresets(false)} accessibilityRole="button">
              Cancel
            </Text>
          ) : null}
        </>
      ) : null}

      {!firstRun && !presetsOpen ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Your items</Text>
            <Text style={styles.addLink} onPress={() => router.push('/item/edit')} accessibilityRole="button">
              Add
            </Text>
          </View>
          <Text style={styles.text}>
            {currentTrip
              ? `Saved for every trip. The switch puts an item on ${currentTrip.name}.`
              : 'Saved for every trip. Add a trip to get reminders.'}
          </Text>
          <Section>
            {data.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                owner={ownerOf(item.ownerId)}
                onPress={() => router.push({ pathname: '/item/edit', params: { id: item.id } })}
                right={
                  currentTrip ? (
                    <Switch
                      value={onTrip.has(item.id)}
                      onValueChange={(on) => update((d) => setOnCurrentTrip(d, item.id, on))}
                      trackColor={{ true: colors.accent }}
                      accessibilityLabel={`${item.name} on this trip`}
                    />
                  ) : null
                }
              />
            ))}
          </Section>
          {remaining.length > 0 ? (
            <Text style={styles.link} onPress={() => setShowPresets(true)} accessibilityRole="button">
              Add common items
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  addLink: { fontSize: 16, color: colors.accent, fontWeight: '600', padding: space.s },
  text: { fontSize: 15, color: colors.muted, marginTop: space.xs, marginBottom: space.l, lineHeight: 21 },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  presetName: { fontSize: 16, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: '#fff', fontWeight: '700', fontSize: 14 },
  link: { ...formStyles.link, textAlign: 'center', marginTop: space.l, padding: space.s },
});
