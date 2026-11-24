import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { updatePerson } from '../domain/people';
import { useAppData } from '../state/AppData';
import { useSync } from '../sync/SyncProvider';
import type { SyncStatus } from '../sync/SyncProvider';
import { PrimaryButton, Section } from '../ui/Form';
import { colors, fonts, space } from '../ui/theme';

const STATUS: Record<SyncStatus, string> = {
  'not-set-up': 'Not switched on in this build yet.',
  off: 'Not sharing.',
  syncing: 'Syncing…',
  synced: 'Up to date.',
  offline: "Can't reach the server. Changes are kept and sent when you're back online.",
};

/**
 * Family sharing: start a household, invite others with a code, or join
 * one. Everyone sees the same trips, items, people and ticks. Photos stay
 * on each phone.
 */
export default function Household() {
  const { data, update } = useAppData();
  const sync = useSync();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const sharing = !!sync.inviteCode;

  useEffect(() => {
    if (params.code) setCode(params.code);
  }, [params.code]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const message = (e as { message?: unknown } | null)?.message;
      Alert.alert("That didn't work", typeof message === 'string' && message ? message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // This phone now has its own person, so the others stop covering their items.
  const claim = (personId: string) =>
    update((d) => ({ ...updatePerson(d, personId, { ownPhone: true }), meId: personId }));

  const start = () =>
    run(async () => {
      await sync.create();
      if (data.meId) await claim(data.meId);
    });

  const join = () =>
    run(async () => {
      const ok = await sync.join(code);
      if (!ok) Alert.alert('Code not found', 'Check the code and try again. It has 8 letters and numbers.');
    });

  const invite = () =>
    Share.share({
      message: `Join our trips on StashCall. Open this link on your phone: stashcall://join?code=${sync.inviteCode}\n\nOr open StashCall, go to Settings, Family sharing, and enter the code ${sync.inviteCode}.`,
    }).catch(() => {});

  const stop = () =>
    Alert.alert('Stop sharing on this phone?', 'Your trips and items stay on this phone. Changes here stop reaching the others.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop sharing', style: 'destructive', onPress: () => void sync.leave() },
    ]);

  if (sync.status === 'not-set-up') {
    return (
      <View style={styles.container}>
        <Text style={styles.lead}>Family sharing isn't switched on in this build yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        Share your trips with the people you travel with. Everyone sees the same flights, items and ticks, and each phone
        reminds its owner about their own things. Photos stay on each phone.
      </Text>

      {sharing ? (
        <>
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Invite code</Text>
            <Text style={styles.code} selectable>
              {sync.inviteCode}
            </Text>
            <Text style={styles.status}>{STATUS[sync.status]}</Text>
          </View>
          <PrimaryButton label="Send an invite" onPress={invite} />

          {!data.meId ? (
            <Section title="Which one are you?">
              <View style={styles.people}>
                {data.owners.map((p) => (
                  <Pressable key={p.id} style={styles.person} onPress={() => void claim(p.id)} accessibilityRole="button">
                    <Text style={styles.personText}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.link} onPress={() => router.push('/people')} accessibilityRole="button">
                Not listed? Add yourself
              </Text>
            </Section>
          ) : (
            <Text style={styles.note}>
              This phone is {phoneOwner(data.owners.find((p) => p.id === data.meId)?.name)}. Its reminders cover your items,
              shared items, and anyone without the app.
            </Text>
          )}

          <Text style={styles.link} onPress={() => void sync.syncNow()} accessibilityRole="button">
            Sync now
          </Text>
          <Text style={[styles.link, { color: colors.danger }]} onPress={stop} accessibilityRole="button">
            Stop sharing on this phone
          </Text>
        </>
      ) : (
        <>
          <PrimaryButton label="Share my trips with family" onPress={start} disabled={busy} />
          <Section title="Or join with a code">
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="8-letter code"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
              accessibilityLabel="Invite code"
            />
          </Section>
          <PrimaryButton label="Join" onPress={join} disabled={busy || code.trim().length < 6} />
          <Text style={styles.note}>
            Joining replaces the trips on this phone with the household's. Anything you made here before stays only if
            the household doesn't have it.
          </Text>
        </>
      )}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.l, paddingBottom: 48, gap: space.m },
  lead: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  codeCard: { backgroundColor: colors.accent, borderRadius: 20, padding: space.xl, gap: space.xs, alignItems: 'center' },
  codeLabel: { color: colors.onAccentMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  code: { color: '#fff', fontSize: 36, fontFamily: fonts.display, letterSpacing: 4 },
  status: { color: colors.onAccentMuted, fontSize: 13, textAlign: 'center' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, padding: space.l },
  person: { borderRadius: 999, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8 },
  personText: { fontSize: 15, color: colors.accent, fontWeight: '600' },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600', paddingVertical: space.s },
  note: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  input: { fontSize: 20, color: colors.text, padding: space.l, letterSpacing: 3, fontFamily: fonts.bold },
});

/** "Dad's", or "yours" when there's no name or the person is called "Me". */
function phoneOwner(name: string | undefined): string {
  const n = name?.trim();
  return !n || n.toLowerCase() === 'me' ? 'yours' : `${n}'s`;
}
