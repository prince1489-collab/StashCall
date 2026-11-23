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

export interface TicketReading {
  details: TicketDetails;
  /** Set when the text reader itself failed, as opposed to finding nothing. */
  error?: string;
  /** How many blocks of text were found, for "nothing readable" vs "no times". */
  blocks: number;
}

/**
 * Reads flight and hotel details from a kept ticket image. Runs on the phone
 * (Google ML Kit); the image is never uploaded.
 */
export async function readTicket(uri: string): Promise<TicketReading> {
  const ocr = extractor();
  if (!ocr) return { details: {}, blocks: 0, error: 'The text reader is missing from this build.' };
  try {
    const path = decodeURI(uri.replace(/^file:\/\//, ''));
    const blocks = await ocr.extractTextFromImage(path);
    return { details: parseTicketText(blocks), blocks: blocks.length };
  } catch (e) {
    return { details: {}, blocks: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A sentence for the user when reading went wrong, else undefined. */
export function readProblem(r: TicketReading): string | undefined {
  if (r.error) return `StashCall couldn't read that screenshot (${r.error}).`;
  if (r.blocks === 0) return 'No text was found in that screenshot.';
  return undefined;
}
