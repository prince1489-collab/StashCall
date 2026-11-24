import { Directory, File, Paths } from 'expo-file-system';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { AppData } from '../storage/store';
import { toDownload, toRemove, toUpload } from './ticketPlan';

/**
 * Ticket screenshots travel between the family's phones through a private
 * storage bucket, one file per ticket under the household's folder. Only
 * members of the household can read or write that folder. Insurance, visa
 * and item photos never leave the phone.
 */
const BUCKET = 'tickets';

const pathOf = (householdId: string, ticketId: string) => `${householdId}/${ticketId}`;

function ticketDir(): Directory {
  const dir = new Directory(Paths.document, 'tickets');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Sends new tickets, removes deleted ones, and fetches the others' tickets.
 * Returns the ids now in storage. Each ticket is tried on its own, so one
 * bad file never holds up the rest; failures are retried on the next sync.
 */
export async function syncTickets(
  sb: SupabaseClient,
  householdId: string,
  data: AppData,
  uploaded: string[],
  setUri: (tripId: string, ticketId: string, uri: string) => Promise<void>,
): Promise<string[]> {
  const bucket = sb.storage.from(BUCKET);
  let done = [...uploaded];

  for (const t of toUpload(data.trips, done)) {
    try {
      const body = await new File(t.uri).arrayBuffer();
      const { error } = await bucket.upload(pathOf(householdId, t.id), body, { contentType: 'image/jpeg', upsert: true });
      if (!error) done.push(t.id);
    } catch {
      // The file may be gone from this phone; nothing to send.
    }
  }

  const gone = toRemove(data.trips, done);
  if (gone.length > 0) {
    const { error } = await bucket.remove(gone.map((id) => pathOf(householdId, id)));
    if (!error) done = done.filter((id) => !gone.includes(id));
  }

  for (const t of toDownload(data.trips)) {
    try {
      const { data: signed, error } = await bucket.createSignedUrl(pathOf(householdId, t.id), 60);
      if (error || !signed) continue;
      const dest = new File(ticketDir(), `${t.id}.jpg`);
      if (dest.exists) dest.delete();
      const file = await File.downloadFileAsync(signed.signedUrl, dest);
      await setUri(t.tripId, t.id, file.uri);
      // Came from the household's storage, so it's there already.
      if (!done.includes(t.id)) done.push(t.id);
    } catch {
      // Not uploaded yet by the other phone, or no signal: try next time.
    }
  }
  return done;
}
