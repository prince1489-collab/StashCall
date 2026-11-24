import type { Trip } from '../domain/types';

/** Which ticket screenshots to send, remove or fetch. Pure, so it can be tested. */

/** Every ticket id on any trip, with the local file when this phone has it. */
export function allTickets(trips: Trip[]): { tripId: string; id: string; uri: string }[] {
  return trips.flatMap((t) => (t.tickets ?? []).map((x) => ({ tripId: t.id, id: x.id, uri: x.uri })));
}

/** Tickets with a file here that the household doesn't have yet. */
export function toUpload(trips: Trip[], uploaded: string[]): { id: string; uri: string }[] {
  return allTickets(trips)
    .filter((t) => t.uri && !uploaded.includes(t.id))
    .map(({ id, uri }) => ({ id, uri }));
}

/** Uploaded tickets no trip has any more: removed on some phone. */
export function toRemove(trips: Trip[], uploaded: string[]): string[] {
  const live = new Set(allTickets(trips).map((t) => t.id));
  return uploaded.filter((id) => !live.has(id));
}

/** Tickets another phone added that this phone hasn't fetched yet. */
export function toDownload(trips: Trip[]): { tripId: string; id: string }[] {
  return allTickets(trips)
    .filter((t) => !t.uri)
    .map(({ tripId, id }) => ({ tripId, id }));
}
