import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addTickets, removeTicket } from '../domain/tickets';
import type { Ticket, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { deletePhoto, pickTicket } from '../storage/photos';
import { newId } from '../storage/store';
import { colors, fonts, space } from './theme';

/**
 * The trip's ticket screenshots: a row of thumbnails, tap one to see it full
 * screen. `compact` hides the add button and the hint, for the Today tab.
 */
export function Tickets({ trip, compact = false }: { trip: Trip; compact?: boolean }) {
  const { update } = useAppData();
  const [open, setOpen] = useState<Ticket | null>(null);
  const insets = useSafeAreaInsets();
  const tickets = trip.tickets ?? [];
  if (compact && tickets.length === 0) return null;

  const add = async () => {
    const uri = await pickTicket();
    if (!uri) return;
    await update((d) => addTickets(d, trip.id, [{ id: newId(), uri, addedAt: new Date().toISOString() }]));
  };

  const remove = (t: Ticket) =>
    Alert.alert('Remove this ticket?', 'The screenshot is deleted from StashCall. Your gallery keeps its copy.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setOpen(null);
          deletePhoto(t.uri);
          await update((d) => removeTicket(d, trip.id, t.id));
        },
      },
    ]);

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.title}>Tickets</Text>
        {!compact ? (
          <Text style={styles.link} onPress={add} accessibilityRole="button">
            Add
          </Text>
        ) : null}
      </View>
      {tickets.length === 0 ? (
        <Text style={styles.hint}>
          Keep your boarding pass or booking here. Add a screenshot, or share one to StashCall from your gallery or
          WhatsApp.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {tickets.map((t) => (
            t.uri ? (
              <Pressable key={t.id} onPress={() => setOpen(t)} accessibilityRole="imagebutton" accessibilityLabel="Ticket">
                <Image source={{ uri: t.uri }} style={styles.thumb} />
              </Pressable>
            ) : (
              // Added on another family phone; the screenshot is still on its way.
              <View key={t.id} style={[styles.thumb, styles.waiting]} accessibilityLabel="Ticket on its way">
                <Text style={styles.waitingText}>On its way</Text>
              </View>
            )
          ))}
        </ScrollView>
      )}

      <Modal visible={!!open} animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={[styles.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {open ? <Image source={{ uri: open.uri }} style={styles.full} resizeMode="contain" /> : null}
          <View style={styles.viewerBar}>
            <Text style={[styles.viewerLink, { color: '#ff8a80' }]} onPress={() => open && remove(open)}>
              Remove
            </Text>
            <Text style={styles.viewerLink} onPress={() => setOpen(null)}>
              Close
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  waiting: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  waitingText: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  box: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: space.l,
    marginVertical: space.m,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  link: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  hint: { fontSize: 14, color: colors.muted, marginTop: space.s, lineHeight: 20 },
  row: { gap: space.m, marginTop: space.m },
  thumb: { width: 72, height: 120, borderRadius: 8, backgroundColor: colors.bg },
  viewer: { flex: 1, backgroundColor: '#000' },
  full: { flex: 1 },
  viewerBar: { flexDirection: 'row', justifyContent: 'space-between', padding: space.l },
  viewerLink: { color: '#fff', fontSize: 17, fontWeight: '600', padding: space.s },
});
