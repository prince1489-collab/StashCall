import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Item, Owner } from '../domain/types';
import { ItemThumb } from './ItemRow';
import { colors, fonts, space } from './theme';

/** Tap-to-tick list of the items for one reminder. */
export function Checklist(props: {
  title: string;
  items: Item[];
  owners: Owner[];
  done: string[];
  onToggle: (itemId: string) => void;
}) {
  const { items, done } = props;
  const count = items.filter((i) => done.includes(i.id)).length;
  const all = items.length > 0 && count === items.length;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Now</Text>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.progress}>{all ? 'All done. Have a good trip.' : `${count} of ${items.length} checked`}</Text>
      {items.map((item) => {
        const on = done.includes(item.id);
        const owner = props.owners.find((o) => o.id === item.ownerId);
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onToggle(item.id)}
            style={styles.row}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={item.name}
          >
            <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
            <ItemThumb item={item} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, on && styles.nameDone]}>{item.name}</Text>
              {owner || item.note ? (
                <Text style={styles.meta}>{[owner?.name, item.note].filter(Boolean).join(' · ')}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: space.l,
    borderWidth: 2,
    borderColor: colors.accent,
    marginBottom: space.l,
  },
  label: { color: colors.accent, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 22, fontFamily: fonts.display, color: colors.text, marginTop: space.xs },
  progress: { fontSize: 14, color: colors.muted, marginTop: space.xs, marginBottom: space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.done, borderColor: colors.done },
  tick: { color: '#fff', fontWeight: '700' },
  name: { fontSize: 16, color: colors.text },
  nameDone: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
