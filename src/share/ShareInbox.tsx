import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { addTickets } from '../domain/tickets';
import type { Ticket } from '../domain/types';
import { useAppData } from '../state/AppData';
import { keepTicket } from '../storage/photos';
import { newId } from '../storage/store';

/**
 * Receives images shared to StashCall from another app (Gallery, WhatsApp,
 * an airline app) and keeps them as tickets on the current trip.
 * Renders nothing.
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
    if (!currentTrip) {
      Alert.alert('Add a trip first', 'Then share your ticket again and StashCall will keep it with the trip.');
      return;
    }

    const kept: Ticket[] = [];
    for (const f of images) {
      try {
        kept.push({ id: newId(), uri: keepTicket(f.path), addedAt: new Date().toISOString() });
      } catch {
        // Skip a file we couldn't read; keep the rest.
      }
    }
    if (kept.length === 0) {
      Alert.alert("Couldn't save that", 'Try again, or add the screenshot from the Trip tab.');
      return;
    }
    update((d) => addTickets(d, currentTrip.id, kept)).then(() => {
      router.navigate('/trip');
      Alert.alert(
        kept.length === 1 ? 'Ticket saved' : `${kept.length} tickets saved`,
        `Kept with ${currentTrip.name}. It's on the Trip tab, and on Today too.`,
      );
    });
  }, [ready, hasShareIntent, shareIntent, resetShareIntent, currentTrip, update]);

  return null;
}
