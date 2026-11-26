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
    // T1 is where it lands in Delhi, not where it leaves Pantnagar.
    expect(d.terminal).toBe('T1');
    expect(d.returnFlight?.terminal).toBeUndefined();
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

describe('IndiGo tables read column by column', () => {
  // What Mahiman's phone actually read from Bajrang's Delhi–Pantnagar
  // booking: each column of the table in turn, not row by row.
  const blocks: string[] = ["CONFIRMED", "Local Time.", "IndiGo Passenger - 1/2", "*Booking Date reflects in UTC (Universal Time Coordinated), all other timings mentioned are as per", "IndiGo Flight(s)", "Date", "06 Dec\n26", "Date", "08 Dec\n26", "From", "IndiGo Flight(s)", "(Terminal)", "Delhi (T1)", "Status", "From", "(Terminal)", "Pantnagar", "Passenger name", "Mr. Bajrang singh\nRathore", "CONFIRMED", "Seats and Additional Services", "Local Time.", "30 Oct 26 11:12:20 (UTC)", "IndiGo Flight(s)", "IndiGo Passenger - 2/2", "Remove", "6A", "Departs", "12:00", "13:20", "Mr. Bajrang singh Rathore", "Departs", "Flight", "Number", "(Aircraft", "type)", "6E7415", "(ATR)", "Flight", "Number", "(Aircraft", "type)", "Mr. Bajrang singh Rathore", "6E7414", "(ATR)", "DEL → PGH", "Check-in now", "Seat Services Purchased", "AGAI, Express Check\nIn,VCSW", "Date of Booking*", "Check-", "in/Bag", "drop", "closes", "11:00", "Check-", "in/Bag", "drop", "closes", "30 Oct 26 11:12:20 (UTC)", "12:20", "Approved", "PGH", "Check-in now", "To", "Flight Status", "(Terminal)", "Pantnagar", "To", "(Terminal)", "Delhi (T1)", "DEL", "Arrives Via", "13:00", "Approved", "*Booking Date reflects in UTC (Universal Time Coordinated), all other timings mentioned are as per", "Seat Services Purchased", "Arrives Via", "14:15", "Payment Status", "951", "Flight Status", "Close"];

  it('lines the columns back up into flights', () => {
    const d = parseTicketText(blocks, new Date('2026-11-25T04:00:00Z'));
    expect(d.departure).toBe('2026-12-06T12:00');
    expect(d.flightNumber).toBe('6E7415');
    expect(d.from?.code).toBe('DEL');
    expect(d.to?.code).toBe('PGH');
    expect(d.terminal).toBe('T1');
    expect(d.returnFlight?.departure).toBe('2026-12-08T13:20');
    expect(d.returnFlight?.flightNumber).toBe('6E7414');
    expect(d.returnFlight?.from?.code).toBe('PGH');
    expect(d.returnFlight?.to?.code).toBe('DEL');
    expect(d.returnFlight?.terminal).toBeUndefined();
    // Landing times, from the Arrives column.
    expect(d.arrival).toBe('2026-12-06T13:00');
    expect(d.returnFlight?.arrival).toBe('2026-12-08T14:15');
  });

  it("reads Bajrang's Udaipur booking, aircraft types and all", () => {
    // The email as his phone read it: "(A321)" is the aircraft, not a flight.
    const blocks: string[] = ["Status", "CONFIRMED", "IndiGo Passenger - 1/1", "Date", "IndiGo Flight(s)", "06 Dec\n26", "IndiGo 17:33", "Date", "to me v", "*Booking Date reflects in UTC (Universal Time Coordinated), all other timings mentioned are as per\nLocal Time.", "From", "08 Dec\n26", "(Terminal)", "IndiGo Flight(s)", "Udaipur", "From", "(Terminal)", "Delhi (T1)", "Date of Booking*", "Remove", "28 Oct 26 12:03:19 (UTC)", "Departs", "08:55", "Mr. Bajrang singh Rathore", "18:00", "Departs", "Flight", "Number", "(Aircraft", "type)", "6E2008", "(A321)", "Flight", "Number", "(Aircraft", "type)", "Check-in now", "Mr. Bajrang singh Rathore", "6E6228", "(A321)", "Check-", "in/Bag", "drop", "closes", "07:55", "Check-", "in/Bag", "drop", "closes", "17:00", "PNR/Booking Ref.: V9VH6P", "Payment Status", "Approved", "To", "(Terminal)", "Flight Status", "Delhi (T2)", "To", "(Terminal)", "Udaipur", "g48", "Arrives Via", "10:20", "Arrives Via", "19:20", "Close"];
    const d = parseTicketText(blocks, new Date('2026-11-25T04:00:00Z'));
    expect(d.departure).toBe('2026-12-06T08:55');
    expect(d.flightNumber).toBe('6E2008');
    expect(d.from?.code).toBe('UDR');
    expect(d.to?.code).toBe('DEL');
    expect(d.returnFlight?.departure).toBe('2026-12-08T18:00');
    expect(d.returnFlight?.flightNumber).toBe('6E6228');
    expect(d.returnFlight?.from?.code).toBe('DEL');
    expect(d.returnFlight?.terminal).toBe('T1');
    expect(d.returnFlight?.to?.code).toBe('UDR');
    expect(d.arrival).toBe('2026-12-06T10:20');
    expect(d.returnFlight?.arrival).toBe('2026-12-08T19:20');
  });

  it('leaves other layouts to the row reader', () => {
    const d = parseTicketText(
      ['Departure', '5 Feb 2027', 'LHR 09:40', 'Arrival', '5 Feb 2027', 'BOM 23:50', 'BA137', 'BA138', 'Departure', '19 Feb 2027', 'BOM 02:15', 'Arrival', '19 Feb 2027', 'LHR 07:05'],
      new Date('2026-11-25T04:00:00Z'),
    );
    expect(d.departure).toBe('2027-02-05T09:40');
    expect(d.returnFlight?.departure).toBe('2027-02-19T02:15');
  });
});

describe('Yatra e-tickets', () => {
  it('reads the flight and its departure terminal', () => {
    const d = parseTicketText(
      [
        'E-Ticket booked with', 'yatra', 'Booking Confirmed', 'Booking ID: 441179544014542062933',
        'Booked on: Mon, 23 Nov 2026 18:52:26', 'Departure Flight', 'New Delhi to Mumbai | Tue, 08 Dec 2026', 'PNR Number : DC9JFW',
        '17:45 | FLEXI PLUS', 'IndiGo 6E - 328', 'New Delhi DEL', 'Tue, 08 Dec 2026 17:45', 'Indira Gandhi Airport', 'Terminal: T-1',
        '— 2h 25m —', 'Economy', 'BOM Mumbai', 'Tue, 08 Dec 2026', '20:10', 'Chatrapati Shivaji Airport', 'Terminal: T-2',
        'Mr. Mahiman singh Rathore (ADT)', 'DEL-BOM',
      ],
      new Date('2026-11-25T04:00:00Z'),
    );
    expect(d.departure).toBe('2026-12-08T17:45');
    expect(d.from?.code).toBe('DEL');
    expect(d.to?.code).toBe('BOM');
    expect(d.terminal).toBe('T1');
    expect(d.flightNumber).toBe('6E328');
    expect(d.arrival).toBe('2026-12-08T20:10');
  });

  it('reads an Akasa flight number written with a dash', () => {
    const d = parseTicketText(
      ['E-Ticket booked with', 'yatra', 'Departure Flight', 'Mumbai to New Delhi | Sun, 06 Dec 2026', 'PNR Number : P43QHI',
        '07:00 | SAVER FARE', 'Akasa Air QP - 1111', 'Mumbai BOM', 'Sun, 06 Dec 2026 07:00', 'Chatrapati Shivaji Airport', 'Terminal: T-2',
        '— 2h 25m —', 'Economy', 'DEL New Delhi', 'Sun, 06 Dec 2026', '09:25', 'Indira Gandhi Airport', 'Terminal: T-1', 'Cabin Baggage: 7 Kgs', 'G57'],
      new Date('2026-11-25T04:00:00Z'),
    );
    expect(d.flightNumber).toBe('QP1111');
    expect(d.terminal).toBe('T2');
  });
});

describe('two bookings for one journey', () => {
  it('joins them into one journey with a connection', async () => {
    const { joinLegs } = await import('../ticketDraft');
    const { defaultFlight } = await import('../timeline');
    const udaipur = { ...defaultFlight('2026-12-06T08:55', 'Asia/Kolkata', false), airport: 'UDR', destination: 'DEL', flightNumber: '6E2008' };
    const delhi = { ...defaultFlight('2026-12-06T12:00', 'Asia/Kolkata', false), airport: 'DEL', destination: 'PGH', flightNumber: '6E7415', terminal: 'T1' };
    for (const j of [joinLegs(udaipur, delhi), joinLegs(delhi, udaipur)]) {
      expect(j.departure).toBe('2026-12-06T08:55');
      expect(j.airport).toBe('UDR');
      expect(j.destination).toBe('PGH');
      expect(j.connections).toEqual([
        { departure: '2026-12-06T12:00', timeZone: 'Asia/Kolkata', flightNumber: '6E7415', airport: 'DEL', destination: 'PGH', terminal: 'T1' },
      ]);
    }
    // A whole journey joining a flight before it keeps each flight's own stop.
    const toPgh = { ...delhi, destination: 'DXB', connections: [{ departure: '2026-12-06T18:00', timeZone: 'Asia/Kolkata', airport: 'PGH', destination: 'DXB' }] };
    expect(joinLegs(udaipur, toPgh).connections?.map((c) => [c.airport, c.destination])).toEqual([['DEL', 'PGH'], ['PGH', 'DXB']]);
    // Sharing the same booking twice adds nothing.
    expect(joinLegs(joinLegs(udaipur, delhi), delhi).connections).toHaveLength(1);
    expect(joinLegs(undefined, delhi)).toBe(delhi);
    // A different trip altogether: the new flight replaces it.
    const later = defaultFlight('2027-02-10T09:00', 'Asia/Kolkata', true);
    expect(joinLegs(udaipur, later)).toBe(later);
    // Reading a booking again updates what was saved: a fixed flight number
    // replaces "G57", on the first flight and on a connection.
    const saved = joinLegs({ ...udaipur, flightNumber: 'G57', bufferMinutes: 150 }, { ...delhi, flightNumber: undefined });
    const again = joinLegs(joinLegs(saved, { ...udaipur }), delhi);
    expect(again.flightNumber).toBe('6E2008');
    expect(again.bufferMinutes).toBe(150);
    expect(again.connections?.map((c) => c.flightNumber)).toEqual(['6E7415']);
    // A reading that misses the number ("QP -11n" in the OCR) still clears a
    // saved one that was never a flight, and keeps a real one.
    const akasa = { ...defaultFlight('2026-12-06T07:00', 'Asia/Kolkata', false), airport: 'BOM', destination: 'DEL' };
    expect(joinLegs({ ...akasa, flightNumber: 'G57' }, akasa).flightNumber).toBeUndefined();
    expect(joinLegs({ ...akasa, flightNumber: 'QP1111' }, akasa).flightNumber).toBe('QP1111');
    // A connection read again without its terminal keeps the saved one.
    const noTerminal = joinLegs(udaipur, { ...delhi, terminal: undefined });
    expect(joinLegs(joinLegs(udaipur, delhi), { ...delhi, terminal: undefined, flightNumber: '6E7416' }).connections).toEqual([
      expect.objectContaining({ flightNumber: '6E7416', terminal: 'T1' }),
    ]);
    expect(noTerminal.connections?.[0].terminal).toBeUndefined();
    // A flight with no airports (the form's made-up one) is replaced, not joined.
    const blank = defaultFlight('2026-12-06T17:33', 'Asia/Kolkata', true);
    const bom = { ...defaultFlight('2026-12-06T07:00', 'Asia/Kolkata', false), airport: 'BOM', destination: 'DEL' };
    expect(joinLegs(blank, bom)).toBe(bom);
    // Nor are two flights that don't meet: Udaipur → Delhi, then Mumbai → Goa.
    const goa = { ...defaultFlight('2026-12-06T15:00', 'Asia/Kolkata', false), airport: 'BOM', destination: 'GOI' };
    expect(joinLegs(udaipur, goa)).toBe(goa);
  });
});

describe('misread flight numbers', () => {
  it('reads "QP -11n" next to the airline as QP1111', () => {
    // The phone's own reading of Mahiman's Yatra ticket.
    const d = parseTicketText(
      ['yatra', 'Departure Flight', 'Mumbai to New Delhi | Sun, 06 Dec 2026 PNR Number: P43QHI', '07:00 | SAVER FARE',
        'Akasa Air QP -11n', 'Mumbai BOM', 'Sun, 06 Dec 2026 07:00', 'Chatrapati Shivaji Airport', 'Terminal: T-2',
        '-2h 25m-', 'Economy', '951', 'l G57', 'DEL New Delhi', 'Sun, 06 Dec 2026', '09:25', 'Indira Gandhi', 'Airport', 'Terminal: T-1'],
      today,
    );
    expect(d.flightNumber).toBe('QP1111');
    expect(d.terminal).toBe('T2');
    expect(d.departure).toBe('2026-12-06T07:00');
    expect(d.arrival).toBe('2026-12-06T09:25');
  });
});

describe('cities and codes', () => {
  it('keeps the airport code a ticket gives for a city', () => {
    const d = parseTicketText(['London (LGW) to Paris (ORY)', 'Flight AF1234', '5 Feb 2027', 'Departs 09:40'], today);
    expect(d.from?.code).toBe('LGW');
    expect(d.to?.code).toBe('ORY');
  });
});

describe('connections', () => {
  it('keeps the connecting flights each way, with terminals', () => {
    const d = parseTicketText(
      [
        'EK2 LHR DXB', 'Departs 5 Feb 2027 09:40 Terminal 3',
        'EK500 DXB BOM', 'Departs 5 Feb 2027 22:10',
        'EK501 BOM DXB', 'Departs 19 Feb 2027 04:30',
        'EK1 DXB LHR', 'Departs 19 Feb 2027 08:00',
      ],
      today,
    );
    expect(d.terminal).toBe('T3');
    expect(d.connections?.map((c) => [c.flightNumber, c.from?.code, c.to?.code, c.departure])).toEqual([['EK500', 'DXB', 'BOM', '2027-02-05T22:10']]);
    expect(d.returnFlight?.to?.code).toBe('LHR');
    expect(d.returnFlight?.connections?.map((c) => c.flightNumber)).toEqual(['EK1']);
  });

  it('plans a reminder before each connection', async () => {
    const { draftFromTicket } = await import('../ticketDraft');
    const { buildTimeline } = await import('../timeline');
    const { planReminders } = await import('../../reminders/plan');
    const d = parseTicketText(['6E2008 UDR DEL', 'Departs 6 Dec 2026 08:55', '6E7415 DEL PGH (T1)', 'Departs 6 Dec 2026 12:00'], today);
    const flight = draftFromTicket(d, 'Asia/Kolkata').flight!;
    expect(flight.destination).toBe('PGH');
    const steps = buildTimeline({ flight });
    const next = steps.find((s) => s.kind === 'connection')!;
    expect(next.localTime).toBe('12:00');
    expect(next.detail).toBe('6E7415 to Pantnagar from T1');
    const trip = { id: 't', name: 'Pantnagar', flight, itemIds: [], ticked: {}, createdAt: '' };
    const r = planReminders(trip, [], new Date('2026-12-01T00:00:00Z')).find((x) => x.kind === 'connection')!;
    expect(r.title).toBe('Next flight at 12:00');
    expect(r.body).toContain('6E7415 to Pantnagar from T1');
    // 90 minutes before: 10:30 India time.
    expect(r.at.toISOString()).toBe('2026-12-06T05:00:00.000Z');
  });
});
