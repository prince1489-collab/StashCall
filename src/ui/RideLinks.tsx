import { Linking, StyleSheet, Text, View } from 'react-native';

import { driverMessage, uberUrl, whatsappUrl } from '../domain/rides';
import type { FlightLeg, TimelineStep } from '../domain/types';
import { colors, space } from './theme';

/**
 * "Ride to the airport: Message a driver · Uber". The message opens in
 * WhatsApp ready to send to whoever the person picks.
 */
export function RideLinks({ f, leave, from }: { f: FlightLeg; leave?: TimelineStep; from: 'home' | 'hotel' }) {
  const pickup = leave && {
    day: leave.at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: leave.timeZone }),
    time: leave.localTime,
  };
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Ride to the airport{leave ? ` at ${leave.localTime}` : ''}:</Text>
      <Text style={styles.link} onPress={() => open(whatsappUrl(driverMessage(f, pickup, from)))} accessibilityRole="link">
        Message a driver
      </Text>
      <Text style={styles.label}>·</Text>
      <Text style={styles.link} onPress={() => open(uberUrl(f))} accessibilityRole="link">
        Uber
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: -space.xs, marginBottom: space.m, paddingHorizontal: space.xs },
  label: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
});
