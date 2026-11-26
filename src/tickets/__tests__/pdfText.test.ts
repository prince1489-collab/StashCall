import { describe, expect, it } from 'vitest';

import { parseTicketText } from '../../domain/ticketParse';
import { pdfText } from '../pdfText';

// Node's own modules, typed by hand: the app's types are React Native's.
const { readFileSync } = require('fs') as { readFileSync: (path: string) => Uint8Array };
const fixture = (name: string) => new Uint8Array(readFileSync(`${__dirname}/fixtures/${name}`));
declare const __dirname: string;
const today = new Date('2026-11-26T10:00:00Z');

describe('PDF tickets', () => {
  it('reads a PDF made by a browser: embedded fonts, compressed, a table', () => {
    const pages = pdfText(fixture('chrome-ticket.pdf'));
    expect(pages[0]).toContain('6E 2008 Udaipur (UDR) 06 Dec 2026, 08:55 Delhi (DEL) T2 06 Dec 2026, 10:25');
    const d = parseTicketText(pages, today);
    expect(d.flightNumber).toBe('6E2008');
    expect(d.departure).toBe('2026-12-06T08:55');
  });

  it('reads a PDF with standard fonts and ASCII85 streams', () => {
    const pages = pdfText(fixture('helvetica-ticket.pdf'));
    expect(pages).toEqual(['Akasa Air E-Ticket\nFlight From Departure To\nQP 1111 Mumbai (BOM) T2 06 Dec 2026 07:00 Delhi (DEL) T1']);
    const d = parseTicketText(pages, today);
    expect(d.flightNumber).toBe('QP1111');
    expect(d.departure).toBe('2026-12-06T07:00');
  });

  it('finds nothing in something that is not a PDF', () => {
    expect(pdfText(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});
