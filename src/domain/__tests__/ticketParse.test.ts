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

describe('return flights', () => {
  it('reads an outbound and a return flight from one booking', () => {
    const blocks = [
      'Your booking',
      'BA137 London to Mumbai',
      'Departs: Friday, 5 February 2027',
      'Heathrow 09:40 LHR - Terminal 5',
      'Arrives: Saturday, 6 February 2027',
      'Mumbai 00:05 BOM - Terminal 2',
      'BA138 Mumbai to London',
      'Departs: Friday, 19 February 2027',
      'Chhatrapati Shivaji Maharaj Intl 02:15 BOM - Terminal 2',
      'Arrives: Friday, 19 February 2027',
      'Heathrow 07:05 LHR - Terminal 5',
    ];
    const d = parseTicketText(blocks, today);
    expect(d.flightNumber).toBe('BA137');
    expect(d.from?.code).toBe('LHR');
    expect(d.to?.code).toBe('BOM');
    expect(d.departure).toBe('2027-02-05T09:40');
    expect(d.returnFlight?.flightNumber).toBe('BA138');
    expect(d.returnFlight?.from?.code).toBe('BOM');
    expect(d.returnFlight?.departure).toBe('2027-02-19T02:15');
    expect(suggestTripName(d)).toBe('Mumbai in February');
  });

  it('keeps a single flight as the outbound', () => {
    const d = parseTicketText(['BA138', 'BOM LHR', '19 Feb 2027', 'Departs 02:15'], today);
    expect(d.returnFlight).toBeUndefined();
  });
});

describe('return flight drafts', () => {
  it('makes a return leg in the departure airport zone', async () => {
    const { draftFromTicket } = await import('../ticketDraft');
    const d = parseTicketText(
      ['BA137 LHR BOM', 'Departs 5 Feb 2027 09:40', 'BA138 BOM LHR', 'Departs 19 Feb 2027 02:15'],
      today,
    );
    const draft = draftFromTicket(d, 'Europe/London');
    expect(draft.flight?.timeZone).toBe('Europe/London');
    expect(draft.returnFlight?.timeZone).toBe('Asia/Kolkata');
    expect(draft.returnFlight?.departure).toBe('2027-02-19T02:15');
    expect(draft.returnFlight?.timeZoneConfirmed).toBe(true);
  });

  it('spots a separate screenshot of the flight home', async () => {
    const { flightLeg, isReturnOf } = await import('../ticketDraft');
    const out = parseTicketText(['BA137', 'LHR BOM', '5 Feb 2027', 'Departs 09:40'], today);
    const home = parseTicketText(['BA138', 'BOM LHR', '19 Feb 2027', 'Departs 02:15'], today);
    const outbound = flightLeg(out, 'Europe/London');
    expect(isReturnOf(outbound, home)).toBe(true);
    expect(isReturnOf(outbound, out)).toBe(false);
  });
});

describe('connecting flights', () => {
  it('reads a one-way connection as one journey, not a flight home', () => {
    const d = parseTicketText(
      ['BA107 LHR DXB', 'Departs 5 Feb 2027 09:40', 'EK500 DXB BOM', 'Departs 5 Feb 2027 22:10'],
      today,
    );
    expect(d.from?.code).toBe('LHR');
    expect(d.to?.code).toBe('BOM');
    expect(d.departure).toBe('2027-02-05T09:40');
    expect(d.returnFlight).toBeUndefined();
    expect(suggestTripName(d)).toBe('Mumbai in February');
  });

  it('takes the first flight after the stay as the flight home', () => {
    const d = parseTicketText(
      [
        'EK2 LHR DXB', 'Departs 5 Feb 2027 09:40',
        'EK500 DXB BOM', 'Departs 5 Feb 2027 22:10',
        'EK501 BOM DXB', 'Departs 19 Feb 2027 04:30',
        'EK1 DXB LHR', 'Departs 19 Feb 2027 08:00',
      ],
      today,
    );
    expect(d.to?.code).toBe('BOM');
    expect(d.returnFlight?.flightNumber).toBe('EK501');
    expect(d.returnFlight?.departure).toBe('2027-02-19T04:30');
  });

  it('skips a flight onward to somewhere else', () => {
    const d = parseTicketText(['BA137 LHR BOM', 'Departs 5 Feb 2027 09:40', 'AI101 BOM DEL', 'Departs 12 Feb 2027 10:00'], today);
    expect(d.returnFlight).toBeUndefined();
  });
});

describe('IndiGo booking tables', () => {
  // What on-device OCR reads from Bajrang's IndiGo email: each flight is a
  // table row with the date, city and time before the flight number, and
  // the booking time at the top.
  const delhiPantnagar = [
    'IndiGo', 'PNR/Booking Ref.: S8HDWI',
    'Status Date of Booking* Payment Status', 'CONFIRMED 30 Oct 26 11:12:20 (UTC) Approved',
    '*Booking Date reflects in UTC (Universal Time Coordinated), all other timings mentioned are as per Local Time.',
    'IndiGo Passenger - 1/2', 'Check-in now', 'Flight Status', 'IndiGo Flight(s)', 'Mr. Bajrang singh Rathore',
    'Date', 'From (Terminal)', 'Departs', 'Flight Number (Aircraft type)', 'Check-in/Bag drop closes', 'To (Terminal)', 'Arrives', 'Via',
    '06 Dec 26', 'Delhi (T1)', '12:00', '6E7415 (ATR)', '11:00', 'Pantnagar', '13:00',
    'IndiGo Flight(s)', 'Mr. Bajrang singh Rathore',
    'Date', 'From (Terminal)', 'Departs', 'Flight Number (Aircraft type)', 'Check-in/Bag drop closes', 'To (Terminal)', 'Arrives', 'Via',
    '08 Dec 26', 'Pantnagar', '13:20', '6E7414 (ATR)', '12:20', 'Delhi (T1)', '14:15',
    'Seats and Additional Services', 'DEL → PGH', 'PGH → DEL', 'Passenger name Seat Services Purchased',
    'Mr. Bajrang singh Rathore 6A AGAI, Express Check In,VCSW',
  ];
  const now = new Date('2026-11-25T04:00:00Z');

  it('reads the flights, not the booking time', () => {
    const d = parseTicketText(delhiPantnagar, now);
    expect(d.departure).toBe('2026-12-06T12:00');
    expect(d.flightNumber).toBe('6E7415');
    expect(d.from?.code).toBe('DEL');
    expect(d.to?.code).toBe('PGH');
    expect(d.returnFlight?.departure).toBe('2026-12-08T13:20');
    expect(d.returnFlight?.flightNumber).toBe('6E7414');
    expect(d.returnFlight?.from?.code).toBe('PGH');
    expect(suggestTripName(d)).toBe('Pantnagar in December');
  });

  it('reads Udaipur to Delhi and back', () => {
    const d = parseTicketText(
      [
        'IndiGo', 'PNR/Booking Ref.: V9VH6P', 'CONFIRMED', '28 Oct 26 12:03:19 (UTC)', 'Approved',
        'IndiGo Flight(s)', 'Date', 'From (Terminal)', 'Departs', 'Flight Number (Aircraft type)', 'Check-in/Bag drop closes', 'To (Terminal)', 'Arrives',
        '06 Dec 26', 'Udaipur', '08:55', '6E2008 (A321)', '07:55', 'Delhi (T2)', '10:20',
        'IndiGo Flight(s)', 'Date', 'From (Terminal)', 'Departs', 'Flight Number (Aircraft type)', 'Check-in/Bag drop closes', 'To (Terminal)', 'Arrives',
        '08 Dec 26', 'Delhi (T1)', '18:00', '6E6228 (A321)', '17:00', 'Udaipur', '19:20',
      ],
      now,
    );
    expect(d.departure).toBe('2026-12-06T08:55');
    expect(d.from?.code).toBe('UDR');
    expect(d.to?.code).toBe('DEL');
    expect(d.returnFlight?.departure).toBe('2026-12-08T18:00');
  });
});

describe('two bookings for one journey', () => {
  it('keeps the first flight of the day each way', async () => {
    const { firstLegOfDay } = await import('../ticketDraft');
    const { defaultFlight } = await import('../timeline');
    const udaipur = defaultFlight('2026-12-06T08:55', 'Asia/Kolkata', false);
    const delhi = defaultFlight('2026-12-06T12:00', 'Asia/Kolkata', false);
    expect(firstLegOfDay(udaipur, delhi)).toBe(udaipur);
    expect(firstLegOfDay(delhi, udaipur)).toBe(udaipur);
    expect(firstLegOfDay(undefined, delhi)).toBe(delhi);
    // A different trip altogether: the new flight replaces it.
    const later = defaultFlight('2027-02-10T09:00', 'Asia/Kolkata', true);
    expect(firstLegOfDay(udaipur, later)).toBe(later);
  });
});
