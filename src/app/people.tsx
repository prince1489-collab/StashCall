import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { addPerson, removePerson, updatePerson } from '../domain/people';
import { shortDate } from '../domain/prep';
import type { Person } from '../domain/types';
import { useAppData } from '../state/AppData';
import { newId } from '../storage/store';
import { PrimaryButton, Section, SwitchRow, pickDate } from '../ui/Form';
import { colors, fonts, space } from '../ui/theme';

/**
 * The household's people. Items can belong to them, each trip says who is
 * going, and each person keeps their own passport date.
 */
export default function People() {
  const { data, update } = useAppData();
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const add = async () => {
    const clean = name.trim();
    if (!clean) return;
    const id = newId();
    await update((d) => addPerson(d, { id, name: clean }));
    setName('');
    setOpenId(id);
  };

  const remove = (p: Person) =>
    Alert.alert(`Remove ${p.name}?`, 'Their items stay on your list as shared items.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => update((d) => removePerson(d, p.id)) },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        Add the people you travel with. Each trip asks who is going, and only their items go on the list.
      </Text>

      {data.owners.map((p) => {
        const open = openId === p.id;
        const me = data.meId === p.id;
        const meta = [me ? 'You' : null, p.child ? 'Child' : null, p.passportExpires ? `Passport to ${shortDate(p.passportExpires)}` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <View key={p.id} style={styles.person}>
            <Pressable style={styles.head} onPress={() => setOpenId(open ? null : p.id)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                {meta ? <Text style={styles.meta}>{meta}</Text> : null}
              </View>
              <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
            </Pressable>
            {open ? (
              <View style={styles.details}>
                <SwitchRow
                  label="This is me"
                  hint="Reminders on this phone are about your items, plus anyone without the app."
                  value={me}
                  onChange={(v) => update((d) => ({ ...d, meId: v ? p.id : undefined }))}
                />
                <SwitchRow
                  label="Child"
                  hint="Their items are on the adults' reminders."
                  value={!!p.child}
                  onChange={(v) => update((d) => updatePerson(d, p.id, { child: v }))}
                />
                <Text
                  style={styles.link}
                  onPress={() => pickDate(p.passportExpires, (date) => update((d) => updatePerson(d, p.id, { passportExpires: date })))}
                  accessibilityRole="button"
                >
                  Passport expires: {p.passportExpires ? shortDate(p.passportExpires) : 'Add date'}
                </Text>
                <Text style={[styles.link, { color: colors.danger }]} onPress={() => remove(p)} accessibilityRole="button">
                  Remove {p.name}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      <Section title="Add someone">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={data.owners.length === 0 ? 'Your name' : 'Name, e.g. Dad'}
          placeholderTextColor={colors.muted}
          style={styles.input}
          onSubmitEditing={add}
          returnKeyType="done"
          accessibilityLabel="Name"
        />
      </Section>
      <PrimaryButton label="Add" onPress={add} disabled={!name.trim()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48, gap: space.m },
  lead: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  person: { backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 17, color: colors.accent },
  name: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.muted },
  details: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600', paddingHorizontal: space.l, paddingVertical: space.m },
  input: { fontSize: 16, color: colors.text, padding: space.l },
});
