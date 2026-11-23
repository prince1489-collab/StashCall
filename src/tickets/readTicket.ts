import { parseTicketText, type TicketDetails } from '../domain/ticketParse';

type Extractor = { isSupported: boolean; extractTextFromImage: (path: string) => Promise<string[]> };

/** The on-device text reader, or null in a build that doesn't include it. */
function extractor(): Extractor | null {
  try {
    const mod = require('expo-text-extractor') as Extractor;
    return mod.isSupported ? mod : null;
  } catch {
    return null;
  }
}

/**
 * Reads flight and hotel details from a kept ticket image. Runs on the phone
 * (Google ML Kit); the image is never uploaded. Returns empty details when
 * nothing could be read.
 */
export async function readTicket(uri: string): Promise<TicketDetails> {
  const ocr = extractor();
  if (!ocr) return {};
  try {
    const path = decodeURI(uri.replace(/^file:\/\//, ''));
    return parseTicketText(await ocr.extractTextFromImage(path));
  } catch {
    return {};
  }
}
