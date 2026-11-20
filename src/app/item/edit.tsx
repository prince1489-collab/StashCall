import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';

import { ensureOwner, removeItem, setOnCurrentTrip, upsertItem } from '../../domain/household';
import type { Item, ItemMoment } from '../../domain/types';
import { deletePhoto, takeItemPhoto } from '../../storage/photos';
import { newId } from '../../storage/store';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useAppData } from '../../state/AppData';
import { PrimaryButton, Row, Section, SwitchRow } from '../../ui/Form';
import { ItemThumb, MOMENT_LABEL } from '../../ui/ItemRow';
import { colors, space } from '../../ui/theme';

const MOMENTS: ItemMoment[] = ['home', 'checkout', 'both'];

export default function EditItem() {
  const { id, tripOnly } = useLocalSearchParams<{ id?: string; tripOnly?: string }>();
  const { data, update, currentTrip } = useAppData();
  const existing = data.items.find((i) => i.id === id);
  const [justThisTrip, setJustThisTrip] = useState(existing ? !!existing.tripId : tripOnly === '1' && !!currentTrip);

  const [name, setName] = useState(existing?.name ?? '');
  const [moment, setMoment] = useState<ItemMoment>(existing?.moment ?? 'both');
  const [ownerName, setOwnerName] = useState(data.owners.find((o) => o.id === existing?.ownerId)?.name ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [photoUri, setPhotoUri] = useState(existing?.photoUri);
  const scroll = useRef<ScrollViewInstance>(null);
  const keyboard = useKeyboardInset();
  // The note sits near the bottom: bring it above the keyboard once it opens.
  const showNote = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300);

  const addPhoto = async (source: 'camera' | 'library') => {
    const uri = await takeItemPhoto(source);
    if (!uri) return;
    if (photoUri && photoUri !== existing?.photoUri) deletePhoto(photoUri);
    setPhotoUri(uri);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Give the item a name', 'For example "Lens kit" or "Ellie\'s rabbit".');
      return;
    }
    if (existing?.photoUri && existing.photoUri !== photoUri) deletePhoto(existing.photoUri);
    await update((d) => {
      const { data: withOwner, ownerId } = ensureOwner(d, ownerName, newId);
      const item: Item = {
        id: existing?.id ?? newId(),
        name: name.trim(),
        moment,
        ownerId,
        photoUri,
        note: note.trim() || undefined,
        presetId: existing?.presetId,
        tripId: justThisTrip ? (existing?.tripId ?? currentTrip?.id) : undefined,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      const saved = upsertItem(withOwner, item);
      // A one-off item is only useful on its trip.
      return item.tripId ? setOnCurrentTrip(saved, item.id, true) : saved;
    });
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(`Delete ${existing.name}?`, 'It will be removed from every trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          deletePhoto(existing.photoUri);
          await update((d) => removeItem(d, existing.id));
          router.back();
        },
      },
    ]);
  };

  const preview: Item = { id: 'preview', name: name || '?', moment, photoUri, createdAt: '' };

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={[styles.container, { paddingBottom: 48 + keyboard }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Section title="Item">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Lens kit"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.name]}
          accessibilityLabel="Item name"
          autoFocus={!existing}
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
        />
      </Section>

      {currentTrip || existing?.tripId ? (
        <Section>
          <SwitchRow
            label="Just for this trip"
            hint={justThisTrip ? `Only on ${currentTrip?.name ?? 'this trip'}. Not saved for later trips.` : 'Saved for every trip'}
            value={justThisTrip}
            onChange={setJustThisTrip}
          />
        </Section>
      ) : null}

      <Section title="Remind me">
        {MOMENTS.map((m) => (
          <Pressable
            key={m}
            onPress={() => setMoment(m)}
            style={styles.option}
            accessibilityRole="radio"
            accessibilityState={{ checked: moment === m }}
          >
            <Text style={styles.optionText}>{MOMENT_LABEL[m]}</Text>
            {moment === m ? <Text style={styles.selected}>✓</Text> : null}
          </Pressable>
        ))}
      </Section>

      <Section title="Whose is it? (optional)">
        <Row label="Owner">
          <TextInput
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="Anyone"
            placeholderTextColor={colors.muted}
            style={styles.input}
            accessibilityLabel="Owner"
          />
        </Row>
        {data.owners.length > 0 ? (
          <View style={styles.chips}>
            {data.owners.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setOwnerName(o.name === ownerName ? '' : o.name)}
                style={[styles.chip, o.name === ownerName && styles.chipOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, o.name === ownerName && styles.chipTextOn]}>{o.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Photo (optional)">
        <View style={styles.photoRow}>
          <ItemThumb item={preview} size={64} />
          <View style={styles.photoButtons}>
            <Text style={styles.link} onPress={() => addPhoto('camera')} accessibilityRole="button">
              Take photo
            </Text>
            <Text style={styles.link} onPress={() => addPhoto('library')} accessibilityRole="button">
              Choose photo
            </Text>
            {photoUri ? (
              <Text style={[styles.link, { color: colors.danger }]} onPress={() => setPhotoUri(undefined)} accessibilityRole="button">
                Remove
              </Text>
            ) : null}
          </View>
        </View>
      </Section>

      <Section title="Note (optional)">
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. the case usually ends up by the sink"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.note]}
          multiline
          accessibilityLabel="Note"
          onFocus={showNote}
        />
      </Section>

      <PrimaryButton label="Save item" onPress={save} />
      {existing ? (
        <Text style={styles.delete} onPress={remove} accessibilityRole="button">
          Delete item
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48 },
  input: { flex: 1, fontSize: 16, color: colors.text, textAlign: 'right' },
  name: { textAlign: 'left', paddingHorizontal: space.l, paddingVertical: 14 },
  note: { textAlign: 'left', padding: space.l, minHeight: 72, textAlignVertical: 'top' },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.l,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionText: { fontSize: 16, color: colors.text },
  selected: { fontSize: 16, color: colors.accent, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, padding: space.m },
  chip: { paddingHorizontal: space.m, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.l, padding: space.l },
  photoButtons: { gap: space.s },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  delete: { color: colors.danger, textAlign: 'center', fontSize: 16, marginTop: space.xl, padding: space.s },
});
