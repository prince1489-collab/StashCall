import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Ticket } from '../domain/types';
import { deletePhoto, takeDocPhoto } from '../storage/photos';
import { newId } from '../storage/store';
import { PhotoViewer } from './PhotoViewer';
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

      <PhotoViewer photos={props.photos} openId={open?.id ?? null} onClose={() => setOpen(null)} onRemove={remove} label={props.label} />
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
});
