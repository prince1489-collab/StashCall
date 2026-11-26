import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULTS } from '../../domain/defaults';
import { savedItems } from '../../domain/household';
import { setPersonFlights, travellers, tripFor } from '../../domain/people';
import { addTickets } from '../../domain/tickets';
import { draftFromTicket, joinLegs, flightLeg, isReturnOf } from '../../domain/ticketDraft';
import { describeTicket, hasTripDetails, type TicketDetails } from '../../domain/ticketParse';
import { buildTimeline, defaultFlight } from '../../domain/timeline';
import { autoTripName, isAutoName } from '../../domain/trips';
import { journeyFlights, namedOn, sortJourneys } from '../../domain/journeys';
import { AIRPORTS } from '../../domain/airports';
import type { FlightLeg, HotelCheckout, Ticket, Trip } from '../../domain/types';
import { deletePhoto, pickTickets } from '../../storage/photos';
import { newId } from '../../storage/store';
import { readProblem, readTicket } from '../../tickets/readTicket';
import { useReminders } from '../../reminders/Reminders';
import { useAppData } from '../../state/AppData';
import {
  DateTimeRow,
  MinutesStepper,
  PrimaryButton,
  Section,
  SwitchRow,
  TimeRow,
  ZoneRow,
  deviceZone,
  formatLocalDate,
  styles as formStyles,
  zoneLabel,
} from '../../ui/Form';
import { Timeline } from '../../ui/Timeline';
import { colors, space } from '../../ui/theme';

const pad = (n: number) => String(n).padStart(2, '0');
/** "YYYY-MM-DDTHH:mm" for `days` from today at the given hour, device time. */
function localDaysFromNow(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

/** Route params: `new=1` starts a blank trip; `tickets` and `details` come from a shared screenshot. */
type Params = {
  new?: string;
  tickets?: string;
  details?: string;
  problem?: string;
  text?: string;
  /** Edit one person's own flights on the current trip; "ask" lets the user pick whose. */
  person?: string;
};

function fromJson<T>(s?: string): T | undefined {
  try {
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

function newCheckout(): HotelCheckout {
  return {
    checkout: localDaysFromNow(11, 11),
    timeZone: deviceZone(),
    sweepMinutesBefore: DEFAULTS.sweepMinutesBefore,
  };
}

const cityOf = (code: string) => AIRPORTS[code]?.city;

export default function EditTrip() {
  const { data, currentTrip, saveTrip, deleteTrip, update } = useAppData();
  const { askPermission } = useReminders();
  const params = useLocalSearchParams<Params>();
  // Person mode: the same form, editing only one person's flights on the trip.
  const personMode = !!params.person && !!currentTrip && params.new !== '1';
  const [personId, setPersonId] = useState(
    params.person === 'ask' ? (data.meId ?? data.owners[0]?.id ?? '') : (params.person ?? ''),
  );
  const person = data.owners.find((p) => p.id === personId);
  const existing = params.new === '1' ? undefined : personMode ? tripFor(currentTrip!, personId) : currentTrip;

  const [name, setName] = useState(existing?.name ?? '');
  // A name StashCall made up follows the journey: add the Delhi → Pantnagar
  // leg and "Delhi in December" becomes "Pantnagar in December". A name the
  // user typed stays.
  const nameTouched = useRef(!!existing && !isAutoName(existing.name, existing.flight, cityOf));
  const typeName = (n: string) => {
    nameTouched.current = true;
    setName(n);
  };
  const [hasFlight, setHasFlight] = useState(existing ? !!existing.flight : true);
  const [flight, setFlight] = useState<FlightLeg>(
    existing?.flight ?? defaultFlight(localDaysFromNow(7, 10), deviceZone(), true),
  );
  const [hasCheckout, setHasCheckout] = useState(!!existing?.checkout);
  const [checkout, setCheckout] = useState<HotelCheckout>(existing?.checkout ?? newCheckout());
  const [hasReturn, setHasReturn] = useState(!!existing?.returnFlight);
  const [returnFlight, setReturnFlight] = useState<FlightLeg>(
    existing?.returnFlight ?? defaultFlight(localDaysFromNow(14, 10), deviceZone(), true),
  );

  // Ticket screenshots added on this screen. They're deleted again if the
  // trip isn't saved, so a cancelled form leaves nothing behind.
  // Who is going: everyone unless the trip says otherwise.
  const [going, setGoing] = useState<string[]>(existing?.travellerIds ?? data.owners.map((p) => p.id));
  const [added, setAdded] = useState<Ticket[]>([]);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  // What the text reader saw, so testers can show us when a read goes wrong.
  const [readText, setReadText] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const saved = useRef(false);
  // Which legs came from a screenshot, so picking a different person keeps them.
  const fromTicket = useRef({ flight: false, returnFlight: false });
  // The legs exactly as read, so a time the user then corrects is kept as typed.
  // Every leg read on this screen, in order, so later screenshots add to earlier ones.
  const readLegs = useRef<{ flight: FlightLeg[]; returnFlight: FlightLeg[] }>({ flight: [], returnFlight: [] });
  // False while the flight is still the blank form's placeholder.
  const flightTouched = useRef(false);

  /**
   * The flights a booking read now joins, when it's for the same day: the
   * trip's own, or in person mode that person's. On their own phone a person
   * with none of their own flies the trip's (they made it); never someone else's.
   */
  const baseFor = (pid: string, k: 'flight' | 'returnFlight'): FlightLeg | null | undefined => {
    if (onlyRead.current[k]) return undefined;
    if (!personMode) return existing?.[k];
    const own = currentTrip!.personFlights?.[pid];
    if (own && own[k] !== undefined) return own[k];
    return pid === data.meId ? currentTrip![k] : undefined;
  };
  /**
   * Records a leg read from a ticket and returns the journey: the saved
   * flights joined with every leg read on this screen so far (Udaipur → Delhi,
   * then Delhi → Pantnagar).
   */
  /**
   * The saved flights, unless a ticket just read puts one of their flights
   * the other way: a misread left Bajrang's 6E2008 out as his flight home.
   */
  const cleanBase = (pid: string, k: 'flight' | 'returnFlight') => {
    const base = baseFor(pid, k);
    const other = readLegs.current[k === 'flight' ? 'returnFlight' : 'flight'];
    const numbers = new Set(other.flatMap(journeyFlights).map((f) => f.flightNumber).filter(Boolean));
    return base && journeyFlights(base).some((f) => f.flightNumber && numbers.has(f.flightNumber)) ? undefined : base;
  };
  const read = (pid: string, k: 'flight' | 'returnFlight', leg?: FlightLeg): FlightLeg => {
    if (leg) readLegs.current[k].push(leg);
    const legs = readLegs.current[k];
    const journey = legs.reduce<FlightLeg | null | undefined>((had, l) => joinLegs(had, l), cleanBase(pid, k))!;
    // Joined onto a flight that was already there: let the user undo that.
    if (leg && cleanBase(pid, k)) {
      const alone = legs.reduce<FlightLeg | undefined>((had, l) => joinLegs(had, l), undefined)!;
      if (JSON.stringify(alone) !== JSON.stringify(journey)) setJoined((j) => ({ ...j, [k]: true }));
    }
    return journey;
  };
  /** Flights that ignore what was saved before and keep only what was read here. */
  const onlyRead = useRef({ flight: false, returnFlight: false });
  // Which directions a ticket joined onto flights already there.
  const [joined, setJoined] = useState<{ flight?: boolean; returnFlight?: boolean }>({});
  const keepOnlyRead = () => {
    if (joined.flight) {
      onlyRead.current.flight = true;
      setFlight(read(personId, 'flight'));
    }
    if (joined.returnFlight) {
      onlyRead.current.returnFlight = true;
      setReturnFlight(read(personId, 'returnFlight'));
    }
    setJoined({});
  };
  const addedRef = useRef(added);
  addedRef.current = added;
  useEffect(
    () => () => {
      if (!saved.current) for (const t of addedRef.current) deletePhoto(t.uri);
    },
    [],
  );

  /** `problem` says why nothing was read, when the reader itself failed. */
  const applyTicket = (d: TicketDetails, problem?: string) => {
    if (!hasTripDetails(d)) {
      setReadNote(
        `${problem ?? "Couldn't find a flight or checkout time in that screenshot."} It's kept with the trip; fill in the times below.`,
      );
      return;
    }
    // A screenshot of just the flight home, for a trip that already has its
    // outbound flight: fill in the flight home and leave the rest alone.
    const outbound = hasFlight && (existing?.flight || flightTouched.current) ? flight : undefined;
    if (outbound && !d.returnFlight && !d.checkout && isReturnOf(outbound, d)) {
      fromTicket.current.returnFlight = true;
      setHasReturn(true);
      setReturnFlight(read(personId, 'returnFlight', flightLeg(d, hasCheckout ? checkout.timeZone : deviceZone(), hasCheckout && !!checkout.timeZoneConfirmed)));
      setReadNote(`Added your flight home: ${describeTicket(d, formatLocalDate)}. Check the times before saving.`);
      return;
    }
    const draft = draftFromTicket(d, deviceZone());
    // The whole round-trip booking, for a trip that already has this outbound
    // flight: add the flight home and keep the user's outbound settings.
    if (outbound && draft.returnFlight && d.departure === outbound.departure) {
      fromTicket.current.returnFlight = true;
      setHasReturn(true);
      setReturnFlight(read(personId, 'returnFlight', draft.returnFlight));
      setReadNote(`Added your flight home: ${describeTicket(d.returnFlight!, formatLocalDate)}. Check the times before saving.`);
      return;
    }
    setName((n) => n.trim() || draft.name);
    if (draft.flight) {
      fromTicket.current.flight = true;
      flightTouched.current = true;
      setHasFlight(true);
      setFlight(read(personId, 'flight', draft.flight));
    } else if (!existing && !flightTouched.current) {
      // A hotel-only booking: don't keep the made-up flight from a blank form,
      // but keep a flight the user typed or read from an earlier screenshot.
      setHasFlight(false);
    }
    if (draft.checkout) {
      setHasCheckout(true);
      setCheckout(draft.checkout);
    }
    if (draft.returnFlight) {
      fromTicket.current.returnFlight = true;
      setHasReturn(true);
      setReturnFlight(read(personId, 'returnFlight', draft.returnFlight));
    }
    setReadNote(`Filled in from your screenshot: ${describeTicket(d, formatLocalDate)}. Check the times before saving.`);
  };

  useEffect(() => {
    if (personMode || nameTouched.current || !hasFlight) return;
    const auto = autoTripName(flight, cityOf);
    if (auto) setName(auto);
  }, [personMode, hasFlight, flight]);

  // Picking someone else shows their flights, except a leg read from the
  // screenshot, which is what the user is assigning to them.
  const firstPerson = useRef(personId);
  useEffect(() => {
    if (!personMode || personId === firstPerson.current) return;
    firstPerson.current = personId;
    const theirs = tripFor(currentTrip!, personId);
    if (!fromTicket.current.flight) {
      setHasFlight(!!theirs.flight);
      if (theirs.flight) setFlight(theirs.flight);
    } else if (readLegs.current.flight.length > 0) {
      // The screenshot's flight now joins this person's flights instead.
      setFlight(read(personId, 'flight'));
    }
    if (!fromTicket.current.returnFlight) {
      setHasReturn(!!theirs.returnFlight);
      if (theirs.returnFlight) setReturnFlight(theirs.returnFlight);
    } else if (readLegs.current.returnFlight.length > 0) {
      setReturnFlight(read(personId, 'returnFlight'));
    }
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A screenshot shared to StashCall arrives already read.
  useEffect(() => {
    const shared = fromJson<Ticket[]>(params.tickets);
    if (!shared?.length) return;
    setAdded(shared);
    const details = fromJson<TicketDetails | TicketDetails[]>(params.details);
    applyTickets(Array.isArray(details) ? details : [details ?? {}], params.problem);
    if (params.text) setReadText(params.text);
    followPassenger(params.text);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Several screenshots at once, in any order: every flight on them is
   * sorted into the way there and the way home.
   */
  const applyTickets = (list: TicketDetails[], problem?: string) => {
    const useful = list.filter(hasTripDetails);
    if (useful.length <= 1) return applyTicket(useful[0] ?? list[0] ?? {}, problem);
    const s = sortJourneys(useful, deviceZone());
    // Only the way home, for a trip that already has its way there.
    const outbound = hasFlight && (existing?.flight || flightTouched.current) ? flight : undefined;
    const one = s.flight;
    if (one && !s.returnFlight && outbound) {
      const airport = (code?: string) => (code ? AIRPORTS[code] : undefined);
      if (isReturnOf(outbound, { departure: one.departure, from: airport(one.airport), to: airport(one.destination) })) {
        s.returnFlight = one;
        s.flight = undefined;
      }
    }
    const withCheckout = useful.find((d) => d.checkout);
    setName((n) => n.trim() || draftFromTicket(useful[0], deviceZone()).name);
    if (s.flight) {
      fromTicket.current.flight = true;
      flightTouched.current = true;
      setHasFlight(true);
      setFlight(read(personId, 'flight', s.flight));
    } else if (!existing && !flightTouched.current) {
      // Hotel bookings only: drop the blank form's made-up flight.
      setHasFlight(false);
    }
    if (withCheckout) {
      setHasCheckout(true);
      setCheckout(draftFromTicket(withCheckout, deviceZone()).checkout!);
    }
    if (s.returnFlight) {
      fromTicket.current.returnFlight = true;
      setHasReturn(true);
      setReturnFlight(read(personId, 'returnFlight', s.returnFlight));
    }
    const route = (f: FlightLeg) =>
      [f.airport, ...(f.connections ?? []).map((c) => c.airport), f.destination].filter((x, i, a) => x && x !== a[i - 1]).join(' → ');
    const parts = [
      s.flight && `there ${route(s.flight)}`,
      s.returnFlight && `home ${route(s.returnFlight)}`,
    ].filter(Boolean);
    const between = s.between.length > 0 ? ` ${s.between.length === 1 ? 'One flight' : `${s.between.length} flights`} in between can't be planned yet.` : '';
    setReadNote(`Read ${useful.length} screenshots: ${parts.join(', ')}.${between} Check the times before saving.`);
  };

  /**
   * In person mode, a ticket that names only someone else: offer to put it
   * on their plan. Not done unasked, since family often share one booking.
   */
  const [namedPerson, setNamedPerson] = useState<{ id: string; name: string } | null>(null);
  const followPassenger = (text: string | undefined) => {
    if (!personMode) return;
    const named = namedOn(text, travellers(currentTrip!, data.owners));
    setNamedPerson(named.length === 1 && named[0].id !== personId ? { id: named[0].id, name: named[0].name } : null);
  };

  const fillFromScreenshot = async () => {
    const uris = await pickTickets();
    if (uris.length === 0) return;
    setAdded((a) => [...a, ...uris.map((uri) => ({ id: newId(), uri, addedAt: new Date().toISOString() }))]);
    setReading(true);
    try {
      const readings = [];
      for (const uri of uris) readings.push(await readTicket(uri));
      applyTickets(
        readings.map((r) => r.details),
        readings.map(readProblem).find(Boolean),
      );
      const text = readings.map((r) => r.text).filter(Boolean).join('\n\n—\n\n');
      setReadText(text || null);
      setShowText(false);
      followPassenger(text);
    } finally {
      setReading(false);
    }
  };

  const draft = {
    flight: hasFlight ? flight : undefined,
    checkout: hasCheckout ? checkout : undefined,
    returnFlight: hasReturn ? returnFlight : undefined,
  };
  const preview = useMemo(() => buildTimeline(draft), [hasFlight, flight, hasCheckout, checkout, hasReturn, returnFlight]); // eslint-disable-line react-hooks/exhaustive-deps
  const setR = (patch: Partial<FlightLeg>) => setReturnFlight((f) => ({ ...f, ...patch }));

  const setF = (patch: Partial<FlightLeg>) => {
    flightTouched.current = true;
    setFlight((f) => ({ ...f, ...patch }));
  };
  const setC = (patch: Partial<HotelCheckout>) => setCheckout((c) => ({ ...c, ...patch }));

  const setInternational = (international: boolean) => {
    const wasDefault =
      flight.bufferMinutes ===
      (flight.international ? DEFAULTS.bufferMinutesInternational : DEFAULTS.bufferMinutesDomestic);
    setF({
      international,
      ...(wasDefault && {
        bufferMinutes: international ? DEFAULTS.bufferMinutesInternational : DEFAULTS.bufferMinutesDomestic,
      }),
    });
  };

  // Abroad, the phone's zone is usually the wrong guess for the hotel, and a
  // wrong zone moves the sweep and checkout reminders by hours. Make it a choice.
  const zoneUnset = hasCheckout && hasFlight && flight.international && !checkout.timeZoneConfirmed;
  // Same for the flight home: it leaves from wherever you are staying.
  const returnZoneUnset = hasReturn && hasFlight && flight.international && !returnFlight.timeZoneConfirmed;

  const savePerson = async () => {
    if (!currentTrip || !person) {
      Alert.alert('Whose flights are these?', 'Pick a person first.');
      return;
    }
    if (returnZoneUnset) {
      Alert.alert('Where do you fly home from?', 'Pick the time zone of the flight home, so those reminders arrive on time.');
      return;
    }
    const tripId = currentTrip.id;
    saved.current = true;
    const out = hasFlight ? flight : undefined;
    const home = hasReturn ? returnFlight : undefined;
    await update((d) => {
      let next = setPersonFlights(d, tripId, person.id, { flight: out, returnFlight: home });
      // Their own flights mean they're going.
      const t = next.trips.find((x) => x.id === tripId);
      if (t?.travellerIds && !t.travellerIds.includes(person.id))
        next = { ...next, trips: next.trips.map((x) => (x.id === tripId ? { ...x, travellerIds: [...x.travellerIds!, person.id] } : x)) };
      return added.length > 0 ? addTickets(next, tripId, added) : next;
    });
    await askPermission();
    router.back();
  };

  const save = async () => {
    if (personMode) return savePerson();
    if (!hasFlight && !hasCheckout && !hasReturn) {
      Alert.alert('Add a flight or a hotel checkout', 'StashCall needs at least one time to plan around.');
      return;
    }
    if (zoneUnset) {
      Alert.alert("Choose the hotel's time zone", 'Pick where the hotel is, so the checkout reminders arrive on time.');
      return;
    }
    if (returnZoneUnset) {
      Alert.alert(
        'Where do you fly home from?',
        'Pick the time zone you fly home from, so those reminders arrive on time.',
      );
      return;
    }
    const trip: Trip = {
      // Keep everything else the trip holds (insurance and visa answers,
      // document photos, visa expiry); the fields below are what this form edits.
      ...existing,
      id: existing?.id ?? newId(),
      name: name.trim() || 'My trip',
      flight: draft.flight,
      checkout: draft.checkout,
      returnFlight: draft.returnFlight,
      // A new trip starts with every saved item; the Items tab can take some off.
      itemIds: existing?.itemIds ?? savedItems(data.items).map((i) => i.id),
      // Everyone going is stored as unset, so people added later join by default.
      travellerIds: data.owners.length > 0 && data.owners.some((p) => !going.includes(p.id)) ? going : undefined,
      ticked: existing?.ticked ?? {},
      prep: existing?.prep,
      tickets: [...(existing?.tickets ?? []), ...added],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    saved.current = true;
    await saveTrip(trip);
    // Ask at the moment it obviously matters: right after planning a trip.
    await askPermission();
    router.back();
    // First trip and nothing saved yet: go straight to picking items, or the
    // reminders have nothing to name.
    if (savedItems(data.items).length === 0) router.navigate('/items');
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Delete this trip?', 'Its reminders will be cancelled. Your saved items stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(existing.id);
          router.back();
        },
      },
    ]);
  };

  const inPast = preview.length > 0 && preview[preview.length - 1].at.getTime() < Date.now();

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.fillBox}>
        {reading ? (
          <View style={styles.readingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.fillHint}>Reading your screenshots… The first time can take up to a minute.</Text>
          </View>
        ) : (
          <Text style={styles.fillLink} onPress={fillFromScreenshot} accessibilityRole="button">
            Add screenshots
          </Text>
        )}
        <Text style={styles.fillHint}>
          {readNote ??
            'Add your bookings one at a time or all at once. StashCall reads them on your phone, works out the way there and the way home, connections included, and keeps them with the trip for everyone on it.'}
        </Text>
        {namedPerson && namedPerson.id !== personId ? (
          <Text
            style={styles.textLink}
            onPress={() => {
              setPersonId(namedPerson.id);
              setNamedPerson(null);
            }}
            accessibilityRole="button"
          >
            This ticket names {namedPerson.name}. Put these flights on {namedPerson.name}'s plan instead?
          </Text>
        ) : null}
        {joined.flight || joined.returnFlight ? (
          <Text style={styles.textLink} onPress={keepOnlyRead} accessibilityRole="button">
            {joined.flight && joined.returnFlight ? 'Joined to the flights that were already there' : joined.flight ? 'Joined to the flight that was already there' : 'Joined to the flight home that was already there'}. Not
            one journey? Tap to use only this ticket.
          </Text>
        ) : null}
        {readText ? (
          <>
            <Text style={styles.textLink} onPress={() => setShowText((v) => !v)} accessibilityRole="button">
              {showText ? 'Hide what StashCall read' : 'Show what StashCall read'}
            </Text>
            {showText ? (
              <Text style={styles.rawText} selectable>
                {readText}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>

      {personMode ? (
        <Section title="Whose flights?">
          <View style={styles.people}>
            {travellers(currentTrip!, data.owners).map((p) => {
              const on = p.id === personId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPersonId(p.id)}
                  style={[styles.person, on && styles.personOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.personText, on && styles.personTextOn]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.personHint}>
            {person ? `${person.name}'s own flights on ${currentTrip!.name}. Everything else on the trip is shared.` : 'Pick whose flights these are.'}
          </Text>
        </Section>
      ) : null}

      {personMode ? null : (
      <Section title="Trip name">
        <TextInput
          value={name}
          onChangeText={typeName}
          placeholder="Milan in December"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.name]}
          accessibilityLabel="Trip name"
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
        />
      </Section>
      )}

      {data.owners.length > 0 && !personMode ? (
        <Section title="Who's going?">
          <View style={styles.people}>
            {data.owners.map((p) => {
              const on = going.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setGoing((g) => (on ? g.filter((x) => x !== p.id) : [...g, p.id]))}
                  style={[styles.person, on && styles.personOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.personText, on && styles.personTextOn]}>{on ? '✓ ' : ''}{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>
      ) : null}

      <Section title="Flight">
        <SwitchRow label="I'm flying" value={hasFlight} onChange={setHasFlight} />
        {hasFlight ? (
          <>
            <DateTimeRow
              label="Departs"
              hint={
                flight.timeZone !== deviceZone()
                  ? `${flight.airport ? `${flight.airport}, ` : ''}${zoneLabel(flight.timeZone)} time`
                  : undefined
              }
              value={flight.departure}
              onChange={(departure) => setF({ departure })}
            />
            <Connections leg={flight} onChange={(connections) => setF({ connections })} />
            <SwitchRow label="International" value={flight.international} onChange={setInternational} />
            <MinutesStepper
              label="Home to airport"
              value={flight.travelMinutes}
              onChange={(travelMinutes) => setF({ travelMinutes })}
              min={15}
            />
            <MinutesStepper
              label="At the airport early"
              hint="Before departure"
              value={flight.bufferMinutes}
              onChange={(bufferMinutes) => setF({ bufferMinutes })}
              min={30}
            />
            <MinutesStepper
              label="Getting ready"
              hint="Wake-up to leaving home"
              value={flight.getReadyMinutes}
              onChange={(getReadyMinutes) => setF({ getReadyMinutes })}
              min={15}
            />
            <TimeRow
              label="Packing reminder"
              hint="The evening before"
              value={flight.packTime}
              onChange={(packTime) => setF({ packTime })}
            />
            <Landing leg={flight} place="hotel" onChange={setF} />
          </>
        ) : null}
      </Section>

      {personMode ? null : (
      <Section title="Hotel checkout">
        <SwitchRow
          label="Remind me before checkout"
          hint="A room sweep for your items"
          value={hasCheckout}
          onChange={setHasCheckout}
        />
        {hasCheckout ? (
          <>
            <DateTimeRow label="Checkout" value={checkout.checkout} onChange={(v) => setC({ checkout: v })} />
            <ZoneRow
              label="Hotel time zone"
              hint="Where the hotel is, not where you are now"
              value={checkout.timeZone}
              unset={zoneUnset}
              onChange={(timeZone) => setC({ timeZone, timeZoneConfirmed: true })}
            />
            <MinutesStepper
              label="Sweep the room"
              hint="Before checkout"
              value={checkout.sweepMinutesBefore}
              onChange={(sweepMinutesBefore) => setC({ sweepMinutesBefore })}
              min={15}
              max={180}
            />
          </>
        ) : null}
      </Section>
      )}

      <Section title="Flight home">
        <SwitchRow
          label="I'm flying home"
          hint="Plans the day you leave, from the hotel"
          value={hasReturn}
          onChange={setHasReturn}
        />
        {hasReturn ? (
          <>
            <DateTimeRow
              label="Departs"
              hint={returnFlight.airport ? `${returnFlight.airport}, ${zoneLabel(returnFlight.timeZone)} time` : undefined}
              value={returnFlight.departure}
              onChange={(departure) => setR({ departure })}
            />
            <Connections leg={returnFlight} onChange={(connections) => setR({ connections })} />
            <ZoneRow
              label="Flying home from"
              hint="The time zone of that airport"
              title="Flying home from"
              value={returnFlight.timeZone}
              unset={returnZoneUnset}
              onChange={(timeZone) => setR({ timeZone, timeZoneConfirmed: true })}
            />
            <MinutesStepper
              label="Hotel to airport"
              value={returnFlight.travelMinutes}
              onChange={(travelMinutes) => setR({ travelMinutes })}
              min={15}
            />
            <MinutesStepper
              label="At the airport early"
              hint="Before departure"
              value={returnFlight.bufferMinutes}
              onChange={(bufferMinutes) => setR({ bufferMinutes })}
              min={30}
            />
            <Landing leg={returnFlight} place="home" onChange={setR} />
          </>
        ) : null}
      </Section>

      {preview.length > 0 ? (
        <View style={formStyles.section}>
          <Text style={formStyles.sectionTitle}>Your plan</Text>
          {inPast ? <Text style={styles.warn}>These times are in the past.</Text> : null}
          {zoneUnset ? <Text style={styles.warn}>Checkout times will show once you choose the hotel's time zone.</Text> : null}
          {returnZoneUnset ? (
            <Text style={styles.warn}>Your flight home will show once you choose where you fly home from.</Text>
          ) : null}
          <Timeline
            steps={preview.filter(
              (s) =>
                !(zoneUnset && (s.kind === 'sweep' || s.kind === 'checkout')) &&
                !(returnZoneUnset && ['returnPack', 'returnWake', 'returnLeaveCheck', 'returnLeave', 'returnAirport', 'returnTakeoff'].includes(s.kind)),
            )}
          />
        </View>
      ) : null}

      <PrimaryButton label={personMode ? (person ? `Save ${person.name}'s flights` : 'Save flights') : 'Save trip'} onPress={save} />
      {existing && !personMode ? (
        <Text style={styles.delete} onPress={remove} accessibilityRole="button">
          Delete trip
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * The flights a journey connects to that day, read from a second booking.
 * Shown under the first flight; each can be taken off.
 */
function Connections({ leg, onChange }: { leg: FlightLeg; onChange: (c: FlightLeg['connections']) => void }) {
  const list = leg.connections ?? [];
  if (list.length === 0) return null;
  return (
    <View style={styles.connections}>
      {list.map((c, i) => (
        <View key={`${c.departure}-${i}`} style={styles.connection}>
          <Text style={styles.connectionText}>
            Then {c.departure.slice(11)} · {[c.airport, c.destination].filter(Boolean).join(' → ') || 'next flight'}
            {c.flightNumber ? ` · ${c.flightNumber}` : ''}
            {c.terminal ? ` · ${c.terminal}` : ''}
          </Text>
          <Text
            style={styles.connectionRemove}
            onPress={() => {
              const rest = list.filter((_, j) => j !== i);
              onChange(rest.length > 0 ? rest : undefined);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Remove the ${c.departure.slice(11)} flight`}
          >
            Remove
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  addLanding: { fontSize: 15, color: colors.accent, fontWeight: "600", paddingHorizontal: space.l, paddingVertical: space.m },
  connections: { paddingHorizontal: space.l, paddingBottom: space.m, gap: space.s },
  connection: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  connectionText: { flex: 1, fontSize: 14, color: colors.text },
  connectionRemove: { fontSize: 14, fontWeight: '600', color: colors.danger },
  container: { padding: space.l, paddingBottom: 48 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, padding: space.l },
  person: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8 },
  personOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  personText: { fontSize: 15, color: colors.text },
  personTextOn: { color: '#fff', fontWeight: '600' },
  personHint: { fontSize: 13, color: colors.muted, paddingHorizontal: space.l, paddingBottom: space.m },
  input: { flex: 1, fontSize: 16, color: colors.text, textAlign: 'right' },
  name: { textAlign: 'left', paddingHorizontal: space.l, paddingVertical: 14 },
  fillBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: space.l,
    marginBottom: space.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.xs,
  },
  fillLink: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  fillHint: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  textLink: { fontSize: 14, color: colors.accent, fontWeight: '600', marginTop: space.xs },
  rawText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', marginTop: space.xs },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  warn: { color: colors.warn, marginBottom: space.s },
  delete: { color: colors.danger, textAlign: 'center', fontSize: 16, marginTop: space.xl, padding: space.s },
});

/**
 * When the journey lands, and how long from that airport to the hotel or
 * home: plans the ride from the airport. Optional; a ticket fills it in
 * when it shows the arrival time.
 */
function Landing({ leg, place, onChange }: { leg: FlightLeg; place: 'hotel' | 'home'; onChange: (patch: Partial<FlightLeg>) => void }) {
  const last = leg.connections?.length ? leg.connections[leg.connections.length - 1].departure : leg.departure;
  if (!leg.lands) {
    return (
      <Text
        style={styles.addLanding}
        onPress={() => onChange({ lands: addLocalMinutes(last, 120) })}
        accessibilityRole="button"
      >
        + When you land, to plan the ride to {place === 'hotel' ? 'the hotel' : 'home'}
      </Text>
    );
  }
  const city = leg.destination ? AIRPORTS[leg.destination]?.city : undefined;
  return (
    <>
      <DateTimeRow
        label="Lands"
        hint={city ? `${city} time` : 'Local time where you land'}
        value={leg.lands}
        onChange={(lands) => onChange({ lands })}
      />
      <MinutesStepper
        label={place === 'hotel' ? 'Airport to hotel' : 'Airport to home'}
        value={leg.onwardMinutes ?? DEFAULTS.travelMinutes}
        onChange={(onwardMinutes) => onChange({ onwardMinutes })}
        min={15}
      />
      <Text style={styles.addLanding} onPress={() => onChange({ lands: undefined, onwardMinutes: undefined })} accessibilityRole="button">
        Remove landing time
      </Text>
    </>
  );
}

/** "2026-12-06T12:00" plus 120 minutes, as wall-clock time. */
function addLocalMinutes(local: string, minutes: number): string {
  const d = new Date(`${local}:00Z`);
  return new Date(d.getTime() + minutes * 60000).toISOString().slice(0, 16);
}
