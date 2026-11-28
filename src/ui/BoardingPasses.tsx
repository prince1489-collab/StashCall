import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { addPasses, removePass } from '../domain/tickets';
import type { Ticket, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { deletePhoto, pickTickets } from '../storage/photos';
import { newId } from '../storage/store';
import { PhotoViewer } from './PhotoViewer';
import { colors, fonts, space } from './theme';

/**
 * This phone's boarding passes for a trip, saved on the phone so they open
 * at the gate without signal. Never shared with the family. `compact` (on
 * Today) shows them only once there are some.
 */
export function BoardingPasses({ trip, compact = false }: { trip: Trip; compact?: boolean }) {
  const { update } = useAppData();
  const [open, setOpen] = useState<Ticket | null>(null);
  const passes = trip.passes ?? [];
  if (compact && passes.length === 0) return null;

  const add = async () => {
    const uris = await pickTickets();
    if (uris.length === 0) return;
    const now = new Date().toISOString();
    await update((d) => addPasses(d, trip.id, uris.map((uri) => ({ id: newId(), uri, addedAt: now }))));
  };

  const remove = (p: Ticket) =>
    Alert.alert('Remove this boarding pass?', 'It is deleted from StashCall. Your gallery keeps its copy.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setOpen(null);
          deletePhoto(p.uri);
          await update((d) => removePass(d, trip.id, p.id));
        },
      },
    ]);

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.title}>Your boarding passes</Text>
        <Text style={styles.link} onPress={add} accessibilityRole="button">
          Add
        </Text>
      </View>
      {passes.length === 0 ? (
        <Text style={styles.hint}>
          After check-in, add a screenshot of each boarding pass. They're kept on this phone, so they open at the gate
          without signal, and aren't shared with anyone.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {passes.map((p) => (
            <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="imagebutton" accessibilityLabel="Boarding pass">
              <Image source={{ uri: p.uri }} style={styles.thumb} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PhotoViewer photos={passes} openId={open?.id ?? null} onClose={() => setOpen(null)} onRemove={remove} light label="Boarding pass" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: 12, padding: space.l, marginVertical: space.m },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  hint: { fontSize: 14, color: colors.muted, marginTop: space.s, lineHeight: 20 },
  row: { gap: space.m, marginTop: space.m },
  thumb: { width: 72, height: 120, borderRadius: 8, backgroundColor: colors.bg },
});
