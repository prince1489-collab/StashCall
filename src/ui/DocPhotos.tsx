import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Ticket } from '../domain/types';
import { deletePhoto, takeDocPhoto } from '../storage/photos';
import { newId } from '../storage/store';
import { colors, space } from './theme';

/**
 * Photos of a document, such as an insurance policy or a visa: a row of
 * thumbnails with an "Add photo" button. Tap one to see it full screen.
 */
export function DocPhotos(props: {
  label: string;
  photos: Ticket[];
  onAdd: (doc: Ticket) => void;
  onRemove: (doc: Ticket) => void;
}) {
  const [open, setOpen] = useState<Ticket | null>(null);
  const insets = useSafeAreaInsets();

  const keep = async (source: 'camera' | 'library') => {
    const uri = await takeDocPhoto(source);
    if (uri) props.onAdd({ id: newId(), uri, addedAt: new Date().toISOString() });
  };
  const add = () =>
    Alert.alert(`Add a photo of your ${props.label}`, 'It stays on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'From gallery', onPress: () => keep('library') },
      { text: 'Take photo', onPress: () => keep('camera') },
    ]);
  const remove = (doc: Ticket) =>
    Alert.alert('Remove this photo?', 'It is deleted from StashCall.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setOpen(null);
          deletePhoto(doc.uri);
          props.onRemove(doc);
        },
      },
    ]);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {props.photos.map((p) => (
          <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="imagebutton" accessibilityLabel={props.label}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
          </Pressable>
        ))}
        <Pressable onPress={add} style={styles.add} accessibilityRole="button" accessibilityLabel={`Add a photo of your ${props.label}`}>
          <Text style={styles.addText}>{props.photos.length ? '+' : '+ Photo'}</Text>
        </Pressable>
      </ScrollView>

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
  row: { gap: space.s, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.bg },
  add: {
    minWidth: 56,
    height: 56,
    paddingHorizontal: space.m,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  viewer: { flex: 1, backgroundColor: '#000' },
  full: { flex: 1 },
  viewerBar: { flexDirection: 'row', justifyContent: 'space-between', padding: space.l },
  viewerLink: { color: '#fff', fontSize: 17, fontWeight: '600', padding: space.s },
});
