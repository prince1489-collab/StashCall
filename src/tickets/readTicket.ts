import { File } from 'expo-file-system';

import { parseTicketText, type TicketDetails } from '../domain/ticketParse';
import { pdfText } from './pdfText';

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
  /** The raw text found, for "Show what StashCall read". */
  text?: string;
  /** Read from a PDF's own text rather than a picture. */
  pdf?: boolean;
}

/**
 * Reads flight and hotel details from a kept ticket image. Runs on the phone
 * (Google ML Kit); the image is never uploaded.
 */
export async function readTicket(uri: string): Promise<TicketReading> {
  const ocr = extractor();
  if (!ocr) return { details: {}, blocks: 0, error: 'The text reader is missing from this build.' };
  const path = decodeURI(uri.replace(/^file:\/\//, ''));
  // The first time, Google Play services may still be downloading the
  // reader's model. Keep trying for about a minute before giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      const blocks = await ocr.extractTextFromImage(path);
      return { details: parseTicketText(blocks), blocks: blocks.length, text: blocks.join('\n\n') };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/download|unavailable/i.test(message) && attempt < 12) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      return { details: {}, blocks: 0, error: message };
    }
  }
}

/** A sentence for the user when reading went wrong, else undefined. */
export function readProblem(r: TicketReading): string | undefined {
  if (r.pdf && r.error === 'no text')
    return "That PDF has no text in it, so it's probably a scan. Take a screenshot of it and share that instead.";
  if (r.pdf && r.error) return `StashCall couldn't read that PDF (${r.error}).`;
  if (r.error && /download|unavailable/i.test(r.error))
    return "StashCall's text reader is still downloading. Check you're online, then try again in a few minutes.";
  if (r.error) return `StashCall couldn't read that screenshot (${r.error}).`;
  if (r.blocks === 0) return 'No text was found in that screenshot.';
  return undefined;
}

/**
 * Reads flight and hotel details from a PDF ticket or booking shared to
 * the app. The PDF's own text is used, so nothing is guessed from pixels.
 */
export async function readPdfTicket(path: string): Promise<TicketReading> {
  try {
    const bytes = await new File(path.includes('://') ? path : `file://${path}`).bytes();
    const pages = pdfText(bytes);
    if (pages.length === 0) return { details: {}, blocks: 0, error: 'no text', pdf: true };
    return { details: parseTicketText(pages), blocks: pages.length, text: pages.join('\n\n'), pdf: true };
  } catch (e) {
    return { details: {}, blocks: 0, error: e instanceof Error ? e.message : String(e), pdf: true };
  }
}
