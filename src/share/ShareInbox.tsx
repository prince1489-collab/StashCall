import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { hasTripDetails, type TicketDetails } from '../domain/ticketParse';
import { isReturnOf } from '../domain/ticketDraft';
import { addTickets } from '../domain/tickets';
import { buildTimeline } from '../domain/timeline';
import type { Ticket, Trip } from '../domain/types';
import { useAppData } from '../state/AppData';
import { keepTicket } from '../storage/photos';
import { newId } from '../storage/store';
import { readProblem, readTicket } from '../tickets/readTicket';

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
 * Receives images shared to StashCall from another app (Gallery, WhatsApp,
 * an airline app). Each is read on the phone: a ticket for a new flight or
 * stay opens a filled-in new trip; otherwise the images are kept with the
 * current trip. Renders nothing.
 */
export function ShareInbox() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { ready, currentTrip, update } = useAppData();

  useEffect(() => {
    if (!ready || !hasShareIntent) return;
    const images = (shareIntent.files ?? []).filter((f) => f.mimeType?.startsWith('image/'));
    resetShareIntent();

    if (images.length === 0) {
      Alert.alert('Share an image', 'StashCall can keep screenshots of tickets and bookings. Share a picture instead.');
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
      if (kept.length === 0) {
        Alert.alert("Couldn't save that", 'Try again, or add the screenshot from the Trip tab.');
        return;
      }

      let details: TicketDetails = {};
      let problem: string | undefined;
      let text: string | undefined;
      for (const t of kept) {
        const r = await readTicket(t.uri);
        details = r.details;
        problem = readProblem(r);
        text = r.text;
        if (hasTripDetails(details)) break;
      }

      // Just the flight home for the current trip: add it to that trip.
      if (
        currentTrip?.flight &&
        !currentTrip.returnFlight &&
        !details.returnFlight &&
        !details.checkout &&
        isReturnOf(currentTrip.flight, details)
      ) {
        router.push({
          pathname: '/trip/edit',
          params: { tickets: JSON.stringify(kept), details: JSON.stringify(details), ...(text && { text }) },
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
            tickets: JSON.stringify(kept),
            details: JSON.stringify(details),
            ...(problem && { problem }),
            ...(text && { text }),
          },
        });
        return;
      }

      await update((d) => addTickets(d, currentTrip.id, kept));
      router.navigate('/trip');
      Alert.alert(
        kept.length === 1 ? 'Ticket saved' : `${kept.length} tickets saved`,
        `Kept with ${currentTrip.name}. It's on the Trip tab, and on Today too.`,
      );
    })();
  }, [ready, hasShareIntent, shareIntent, resetShareIntent, currentTrip, update]);

  return null;
}
