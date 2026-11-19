import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import type { Item, Owner } from '../domain/types';
import { colors, space } from './theme';

export const MOMENT_LABEL: Record<Item['moment'], string> = {
  home: 'Leaving home',
  checkout: 'Hotel checkout',
  both: 'Home and checkout',
};

export function ItemThumb({ item, size = 40 }: { item: Item; size?: number }) {
  if (item.photoUri) {
    return <Image source={{ uri: item.photoUri }} style={{ width: size, height: size, borderRadius: 8 }} />;
  }
  return (
    <View style={[styles.initial, { width: size, height: size }]}>
      <Text style={styles.initialText}>{item.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function ItemRow(props: { item: Item; owner?: Owner; onPress: () => void; right?: ReactNode }) {
  const { item, owner } = props;
  return (
    <Pressable onPress={props.onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}>
      <ItemThumb item={item} />
      <View style={styles.text}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>
          {MOMENT_LABEL[item.moment]}
          {owner ? ` · ${owner.name}` : ''}
        </Text>
      </View>
      {props.right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { flex: 1 },
  name: { fontSize: 16, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  initial: { borderRadius: 8, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: colors.accent, fontWeight: '700', fontSize: 16 },
});
