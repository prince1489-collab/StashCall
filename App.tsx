import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { buildTimeline, defaultFlight } from './src/domain/timeline';

// Temporary first screen: a sample trip so the timeline can be checked on a
// real phone. Replaced by the Today, Trip and Items screens on Friday.
const sample = buildTimeline({
  flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true),
  checkout: { checkout: '2026-12-01T11:00', timeZone: 'Europe/Paris', sweepMinutesBefore: 60 },
});

export default function App() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>StashCall</Text>
      <Text style={styles.subtitle}>Sample trip: London to Paris</Text>
      {sample.map((s) => (
        <View key={s.kind} style={styles.row}>
          <Text style={styles.time}>{s.localTime}</Text>
          <Text style={styles.label}>
            {s.title}
            {s.estimate ? '  (estimate)' : ''}
          </Text>
        </View>
      ))}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 72, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 24 },
  row: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  time: { width: 64, fontVariant: ['tabular-nums'], fontWeight: '600' },
  label: { flex: 1 },
});
