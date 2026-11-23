import { describe, expect, it } from 'vitest';

import { describeTicket, findDates, findTimes, fixOcrDigits, hasTripDetails, parseTicketText, suggestTripName } from '../ticketParse';

const today = new Date(2026, 10, 23); // 23 Nov 2026

describe('parseTicketText', () => {
  it('reads a BA confirmation email screenshot', () => {
    // Roughly what on-device OCR returns for the BA138 email, status bar included.
    const blocks = [
      '1:34',
      'BA138 Mumbai to\nLondon',
      'Departs:',
      'Friday, 19 February\n2027',
      'Chhatrapati\nShivaji\nMaharaj Intl',
      '02:15',
      'BOM - Terminal 2',
      'Arrives:',
      'Friday, 19 February\n2027',
      'Heathrow',
      '07:05',
      'LHR - Terminal 5',
      'Cabin:',
      'Duration:',
      'World\nTraveller',
      '10 hours 20\nminutes',
      'Reply',
      'Forward',
    ];
    const d = parseTicketText(blocks, today);
    expect(d.flightNumber).toBe('BA138');
    expect(d.from?.code).toBe('BOM');
    expect(d.from?.timeZone).toBe('Asia/Kolkata');
    expect(d.to?.code).toBe('LHR');
    expect(d.departure).toBe('2027-02-19T02:15');
    expect(d.checkout).toBeUndefined();
    expect(suggestTripName(d)).toBe('London in February');
  });

  it('reads a boarding pass and skips the boarding time', () => {
    const blocks = ['BOARDING PASS', 'LGW → BCN', 'Flight EZY 8571', 'Date 05DEC', 'Boarding 06:10', 'Departure 06:50', 'Seat 12A'];
    const d = parseTicketText(blocks, today);
    expect(d.from?.code).toBe('LGW');
    expect(d.to?.code).toBe('BCN');
    expect(d.departure).toBe('2026-12-05T06:50');
  });

  it('puts a date with no year in the coming year once it has passed', () => {
    const d = parseTicketText(['Flight BA 117', 'LHR JFK', '14 Jan', 'Departs 11:20'], today);
    expect(d.departure).toBe('2027-01-14T11:20');
    expect(d.flightNumber).toBe('BA117');
  });

  it('reads a hotel booking checkout', () => {
    const blocks = ['Hotel Aurora', 'Check-in', 'Fri 19 Feb 2027', 'from 15:00', 'Check-out', 'Sun 21 Feb 2027', 'until 11:00'];
    const d = parseTicketText(blocks, today);
    expect(d.departure).toBeUndefined();
    expect(d.checkout).toBe('2027-02-21T11:00');
    expect(hasTripDetails(d)).toBe(true);
  });

  it('handles 12-hour times and month-first dates', () => {
    const d = parseTicketText(['United UA 901', 'SFO to LHR', 'March 3, 2027', 'Departs 4:45 PM'], today);
    expect(d.departure).toBe('2027-03-03T16:45');
  });

  it('finds nothing in a screenshot that is not a ticket', () => {
    const d = parseTicketText(['12:41', 'Messages', 'See you at 7:30 tomorrow!'], today);
    expect(hasTripDetails(d)).toBe(false);
  });
});

describe('helpers', () => {
  it('finds dates in common formats', () => {
    expect(findDates('2027-02-19').map((f) => f.value)).toEqual([{ y: 2027, m: 2, d: 19 }]);
    expect(findDates('19/02/2027').map((f) => f.value)).toEqual([{ y: 2027, m: 2, d: 19 }]);
    expect(findDates('19FEB').map((f) => f.value)).toEqual([{ y: undefined, m: 2, d: 19 }]);
  });

  it('finds times', () => {
    expect(findTimes('at 2.15 pm and 23:05').map((t) => t.value)).toEqual(['14:15', '23:05']);
  });

  it('describes what it found', () => {
    const d = parseTicketText(['BA138', 'BOM LHR', '19 Feb 2027', 'Departs 02:15'], today);
    expect(describeTicket(d, (l) => l.slice(0, 10))).toBe('BA138 · BOM → LHR · 2027-02-19, 02:15');
  });
});

describe('draftFromTicket', () => {
  it('uses the departure airport zone and spots an international flight', async () => {
    const { draftFromTicket } = await import('../ticketDraft');
    const d = parseTicketText(['BA138', 'BOM LHR', '19 Feb 2027', 'Departs 02:15'], today);
    const draft = draftFromTicket(d, 'Europe/London');
    expect(draft.name).toBe('London in February');
    expect(draft.flight?.timeZone).toBe('Asia/Kolkata');
    expect(draft.flight?.international).toBe(true);
    expect(draft.flight?.airport).toBe('BOM');
    expect(draft.checkout).toBeUndefined();
  });

  it('marks a domestic flight', async () => {
    const { draftFromTicket } = await import('../ticketDraft');
    const d = parseTicketText(['BA1442', 'LHR EDI', '5 Dec 2026', 'Departs 07:00'], today);
    expect(draftFromTicket(d, 'Europe/London').flight?.international).toBe(false);
  });
});

describe('dotted dates', () => {
  it('does not read 19.02.2027 as the time 19:02', () => {
    const d = parseTicketText(['BA138', 'BOM LHR', '19.02.2027', 'Departs 02:15'], today);
    expect(d.departure).toBe('2027-02-19T02:15');
  });
});

describe('OCR slips', () => {
  it('reads O2:15 as 02:15 instead of falling back to the arrival time', () => {
    const blocks = ['BA138 Mumbai to London', 'Departs:', 'Friday, 19 February 2027', 'Chhatrapati Shivaji Maharaj Intl', 'O2:15', 'BOM - Terminal 2', 'Arrives:', 'Friday, 19 February 2027', 'Heathrow', '07:05', 'LHR - Terminal 5'];
    expect(parseTicketText(blocks, today).departure).toBe('2027-02-19T02:15');
  });

  it('leaves words alone', () => {
    expect(fixOcrDigits('Hello OK:ok 1O:3O')).toBe('Hello OK:ok 10:30');
  });
});
