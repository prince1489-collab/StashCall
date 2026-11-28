import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { hasTripDetails, type TicketDetails } from '../domain/ticketParse';
import { findBookingRefs, keepRefs } from '../domain/bookingRef';
import { isReturnOf, joinsTrip } from '../domain/ticketDraft';
import { addTickets } from '../domain/tickets';
import { buildTimeline } from '../domain/timeline';
import type { Ticket, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { keepTicket } from '../storage/photos';
import { newId } from '../storage/store';
import { pdfPages } from '../tickets/PdfPages';
import { readPdfTicket, readProblem, readTicket } from '../tickets/readTicket';

/** True when the screenshot is about the trip we already have. */
function sameTrip(trip: Trip, d: TicketDetails): boolean {
  return (
    (!!d.departure && trip.flight?.departure === d.departure) ||
    (!!d.checkout && trip.checkout?.checkout === d.checkout) ||
    (!!d.departure && trip.returnFlight?.departure === d.departure)
  );
}

function tripIsOver(trip: Trip): boolean {
  const steps = buildTimeline(trip);
  return steps.length === 0 || steps[steps.length - 1].at.getTime() < Date.now();
}

/**
 * Receives images and PDFs shared to StashCall from another app (Gallery,
 * WhatsApp, Gmail, an airline app). Each is read on the phone: a ticket for a new flight or
 * stay opens a filled-in new trip; otherwise the images are kept with the
 * current trip. Renders nothing.
 */
export function ShareInbox() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { ready, currentTrip, update, data, viewTrip } = useAppData();

  useEffect(() => {
    if (!ready || !hasShareIntent) return;
    const files = shareIntent.files ?? [];
    const images = files.filter((f) => f.mimeType?.startsWith('image/'));
    // A PDF fills in the trip from its own text, and its first pages are
    // kept with the tickets as pictures, which open at the gate without signal.
    const pdfs = files.filter((f) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.fileName ?? f.path ?? ''));
    resetShareIntent();

    if (images.length === 0 && pdfs.length === 0) {
      Alert.alert('Share a ticket', 'StashCall reads screenshots and PDFs of tickets and bookings. Share one of those instead.');
      return;
    }

    (async () => {
      const kept: Ticket[] = [];
      for (const f of images) {
        try {
          kept.push({ id: newId(), uri: await keepTicket(f.path), addedAt: new Date().toISOString() });
        } catch {
          // Skip a file we couldn't read; keep the rest.
        }
      }
      if (kept.length === 0 && pdfs.length === 0) {
        Alert.alert("Couldn't save that", 'Try again, or add the screenshot from the Trip tab.');
        return;
      }

      // Read them all: the trip form sorts several bookings into the way
      // there and the way home. The first one with a flight or stay decides
      // where they go.
      const readings = [];
      for (const f of pdfs) readings.push(await readPdfTicket(f.path));
      for (const t of kept) readings.push(await readTicket(t.uri));
      const all = readings.map((r) => r.details).filter(hasTripDetails);
      const details: TicketDetails = all[0] ?? readings[0]?.details ?? {};
      const problem = all.length > 0 ? undefined : readings.map(readProblem).find(Boolean);
      const text = readings.map((r) => r.text).filter(Boolean).join('\n\n—\n\n') || undefined;
      // Each PDF's first pages, drawn as pictures and kept with the tickets
      // (not read again: its own text was read above).
      const pages: Ticket[] = [];
      for (const f of pdfs) for (const uri of await pdfPages(f.path)) pages.push({ id: newId(), uri, addedAt: new Date().toISOString() });
      const tickets = [...kept, ...pages];
      const detailsParam = JSON.stringify(all.length > 1 ? all : details);

      // The flight home for the current trip, on its own or in the whole
      // round-trip booking: add it to that trip.
      const homeOnly = !details.returnFlight && !details.checkout && !!currentTrip?.flight && isReturnOf(currentTrip.flight, details);
      const fullBooking = !!details.returnFlight && !!details.departure && currentTrip?.flight?.departure === details.departure;
      if (currentTrip?.flight && !currentTrip.returnFlight && (homeOnly || fullBooking)) {
        router.push({
          pathname: '/trip/edit',
          params: { tickets: JSON.stringify(tickets), details: detailsParam, ...(text && { text }) },
        });
        return;
      }

      // A household member's own flights for this trip: pick whose, then save
      // them on the trip instead of starting a new one.
      if (currentTrip && data.owners.length > 1 && joinsTrip(currentTrip, details)) {
        router.push({
          pathname: '/trip/edit',
          params: { person: 'ask', tickets: JSON.stringify(tickets), details: detailsParam, ...(text && { text }) },
        });
        return;
      }

      const keepWithCurrent =
        currentTrip && (hasTripDetails(details) ? sameTrip(currentTrip, details) : !tripIsOver(currentTrip));
      if (!currentTrip || !keepWithCurrent) {
        // A new flight or stay, or nothing current to keep it with: start a
        // new trip, filled in from the screenshot, for the user to check and save.
        router.push({
          pathname: '/trip/edit',
          params: {
            new: '1',
            tickets: JSON.stringify(tickets),
            details: detailsParam,
            ...(problem && { problem }),
            ...(text && { text }),
          },
        });
        return;
      }

      if (tickets.length === 0) {
        // Only PDFs, and none could be drawn. Nothing read from them: say why, rather than claim a match.
        if (all.length === 0) {
          Alert.alert('No flight or hotel found', problem ?? "StashCall couldn't find a flight or hotel in that PDF. Share a screenshot of it instead.");
          return;
        }
        // They match this trip as it is. Keep their PNRs for check-in.
        await update((d) => keepRefs(d, currentTrip.id, findBookingRefs(text), d.meId));
        Alert.alert('Already in your trip', `That booking matches ${currentTrip.name}, so nothing needed changing.`);
        return;
      }
      await update((d) => keepRefs(addTickets(d, currentTrip.id, tickets), currentTrip.id, findBookingRefs(text), d.meId));
      viewTrip(currentTrip.id);
      router.navigate('/trip');
      Alert.alert(
        tickets.length === 1 ? 'Ticket saved' : `${tickets.length} tickets saved`,
        `Kept with ${currentTrip.name}. It's on the Trip tab, and on Today too.`,
      );
    })();
  }, [ready, hasShareIntent, shareIntent, resetShareIntent, currentTrip, update, data.owners.length]);

  return null;
}
