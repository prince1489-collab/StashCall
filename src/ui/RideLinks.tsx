import { Linking, StyleSheet, Text, View } from 'react-native';

import { AIRPORTS } from '../domain/airports';
import { driverMessage, rideFrom, rideTo, uberUrl, whatsappUrl } from '../domain/rides';
import type { Ride } from '../domain/rides';
import { addMinutes, timeLabel, zonedToInstant } from '../domain/time';
import { EXIT_MINUTES } from '../domain/timeline';
import type { FlightLeg, TimelineStep, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { colors, space } from './theme';

/**
 * "Ride to the airport at 04:00: Message a driver · Uber". The message
 * opens in WhatsApp in the person's own words, ready to send to whoever
 * they pick.
 */
export function RideLinks({ label, ride, fromAirport = false, dropoff }: { label: string; ride: Ride; fromAirport?: boolean; dropoff?: string }) {
  const { data } = useAppData();
  const t = data.driverTemplates;
  const text = driverMessage(ride, fromAirport ? t?.fromAirport : t?.toAirport, fromAirport);
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <View style={styles.row}>
      <Text style={styles.label}>
        {label}
        {ride.time ? ` at ${ride.time}` : ''}:
      </Text>
      <Text style={styles.link} onPress={() => open(whatsappUrl(text))} accessibilityRole="link">
        Message a driver
      </Text>
      <Text style={styles.label}>·</Text>
      <Text style={styles.link} onPress={() => open(uberUrl(dropoff))} accessibilityRole="link">
        Uber
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: -space.xs, marginBottom: space.s, paddingHorizontal: space.xs },
  label: { fontSize: 14, color: colors.muted },
  rides: { marginBottom: space.m },
  hint: { fontSize: 13, color: colors.muted, paddingHorizontal: space.xs },
  link: { fontSize: 14, color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
});

/** Both rides for a journey: to the departure airport, and on from where it lands. */
export function JourneyRides({ f, leave, home }: { f: FlightLeg; leave?: TimelineStep; home: boolean }) {
  const day = (d: Date, tz: string) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  const to = rideTo(f, leave && { day: day(leave.at, leave.timeZone), time: leave.localTime }, home ? 'hotel' : 'home');
  let from: Ride | undefined;
  if (f.lands) {
    const tz = (f.destination && AIRPORTS[f.destination]?.timeZone) || f.timeZone;
    const pickup = addMinutes(zonedToInstant(f.lands, tz), EXIT_MINUTES);
    from = rideFrom(f, { day: day(pickup, tz), time: timeLabel(pickup, tz) }, home ? 'home' : 'hotel');
  }
  return (
    <View style={styles.rides}>
      <RideLinks label="Ride to the airport" ride={to} dropoff={to.to} />
      {from ? (
        <RideLinks label={home ? 'Ride home' : 'Ride to the hotel'} ride={from} fromAirport />
      ) : (
        <Text style={styles.hint}>Add when you land (Edit) to plan the ride from the airport.</Text>
      )}
    </View>
  );
}

/**
 * Taps on the timeline: "Check in" on check-in opening, "Message a driver"
 * on booking the ride and on landing.
 */
export function stepAction(
  s: TimelineStep,
  steps: TimelineStep[],
  plan: Pick<Trip, 'flight' | 'returnFlight'>,
  templates: { toAirport?: string; fromAirport?: string } | undefined,
): { label: string; url: string } | undefined {
  const day = (d: Date, tz: string) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  if (s.kind === 'checkin') return s.link ? { label: 'Check in', url: s.link } : undefined;
  if (s.kind === 'bookRide') {
    const leave = steps.find((x) => (x.kind === 'leave' || x.kind === 'returnLeave') && x.at.getTime() >= s.at.getTime());
    const home = leave?.kind === 'returnLeave';
    const f = home ? plan.returnFlight : plan.flight;
    if (!f || !leave) return undefined;
    const ride = rideTo(f, { day: day(leave.at, leave.timeZone), time: leave.localTime }, home ? 'hotel' : 'home');
    return { label: 'Message a driver', url: whatsappUrl(driverMessage(ride, templates?.toAirport)) };
  }
  if (s.kind === 'land') {
    const takeoffs = steps.filter((x) => (x.kind === 'takeoff' || x.kind === 'returnTakeoff') && x.at.getTime() < s.at.getTime());
    const home = takeoffs[takeoffs.length - 1]?.kind === 'returnTakeoff';
    const f = home ? plan.returnFlight : plan.flight;
    if (!f) return undefined;
    const pickup = addMinutes(s.at, EXIT_MINUTES);
    const ride = rideFrom(f, { day: day(pickup, s.timeZone), time: timeLabel(pickup, s.timeZone) }, home ? 'home' : 'hotel');
    return ride ? { label: 'Message a driver', url: whatsappUrl(driverMessage(ride, templates?.fromAirport, true)) } : undefined;
  }
  return undefined;
}
