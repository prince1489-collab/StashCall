import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AIRPORTS } from '../domain/airports';
import { driverMessage, rideFrom, rideTo, uberUrl, whatsappUrl } from '../domain/rides';
import type { Ride } from '../domain/rides';
import { addMinutes, timeLabel, zonedToInstant } from '../domain/time';
import { EXIT_MINUTES } from '../domain/timeline';
import type { FlightLeg, TimelineStep } from '../domain/types';
import { useAppData } from '../state/AppData';
import { colors, fonts, space } from './theme';

/**
 * One ride, as a row inside a journey card: "Ride to the airport, 04:00"
 * with two buttons. The message opens in WhatsApp in the person's own
 * words, ready to send to whoever they pick.
 */
export function RideLinks({
  label,
  ride,
  fromAirport = false,
  dropoff,
  dark = false,
}: {
  label: string;
  ride: Ride;
  fromAirport?: boolean;
  dropoff?: string;
  dark?: boolean;
}) {
  const { data } = useAppData();
  const t = data.driverTemplates;
  const text = driverMessage(ride, fromAirport ? t?.fromAirport : t?.toAirport, fromAirport);
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <View style={[styles.row, dark && styles.rowDark]}>
      <View style={styles.what}>
        <Text style={[styles.label, dark && styles.onNavy]}>{label}</Text>
        {ride.time ? <Text style={[styles.time, dark && styles.onNavyMuted]}>{fromAirport ? `Pickup ${ride.time}` : `Leave ${ride.time}`}</Text> : null}
      </View>
      <Pressable style={[styles.button, dark && styles.buttonDark]} onPress={() => open(whatsappUrl(text))} accessibilityRole="link" accessibilityLabel={`${label}: message a driver on WhatsApp`}>
        <Text style={[styles.buttonText, dark && styles.onNavy]}>WhatsApp</Text>
      </Pressable>
      <Pressable style={[styles.button, dark && styles.buttonDark]} onPress={() => open(uberUrl(dropoff))} accessibilityRole="link" accessibilityLabel={`${label}: open Uber`}>
        <Text style={[styles.buttonText, dark && styles.onNavy]}>Uber</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rides: { marginTop: space.m },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingTop: space.m,
    marginTop: space.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowDark: { borderTopColor: 'rgba(255,255,255,0.18)' },
  what: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  time: { fontSize: 13, color: colors.muted, marginTop: 1, fontVariant: ['tabular-nums'] },
  button: {
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    paddingHorizontal: space.m,
    paddingVertical: 7,
    minWidth: 64,
    alignItems: 'center',
  },
  buttonDark: { backgroundColor: 'rgba(255,255,255,0.14)' },
  buttonText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
  onNavy: { color: '#fff' },
  onNavyMuted: { color: colors.onAccentMuted },
  hint: { fontSize: 13, color: colors.muted, marginTop: space.m },
});

/** Both rides for a journey: to the departure airport, and on from where it lands. */
export function JourneyRides({ f, leave, home, dark = false }: { f: FlightLeg; leave?: TimelineStep; home: boolean; dark?: boolean }) {
  const day = (d: Date, tz: string) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  const to = rideTo(f, leave && { day: day(leave.at, leave.timeZone), time: leave.localTime }, home ? 'hotel' : 'home');
  let from: Ride | undefined;
  if (f.lands) {
    const tz = (f.destination && AIRPORTS[f.destination]?.timeZone) || f.timeZone;
    const pickup = addMinutes(zonedToInstant(f.lands, tz), EXIT_MINUTES);
    from = rideFrom(f, { day: day(pickup, tz), time: timeLabel(pickup, tz) }, home ? 'home' : 'hotel');
  }
  return (
    <View>
      <RideLinks label="Ride to the airport" ride={to} dropoff={to.to} dark={dark} />
      {from ? (
        <RideLinks label={home ? 'Ride home' : 'Ride to the hotel'} ride={from} fromAirport dark={dark} />
      ) : (
        <Text style={[styles.hint, dark && styles.onNavyMuted]}>Add when you land (Edit) to plan the ride from the airport.</Text>
      )}
    </View>
  );
}

export { stepAction } from '../domain/rides';
