import { StyleSheet, Text, View } from 'react-native';

import { colors, space } from '../../ui/theme';

// The item picker (preloaded items, owners, photos) lands next.
export default function Items() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your items</Text>
      <Text style={styles.text}>Coming next: pick from 10 common items or add your own.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.xl, justifyContent: 'center', gap: space.s },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.muted },
});
