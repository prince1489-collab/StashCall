import { describe, expect, it } from 'vitest';

import { isReturnOf, flightLeg } from '../ticketDraft';
import { parseTicketText } from '../ticketParse';

// A travel agent's IndiGo e-ticket, as read from its PDF (name and numbers made up).
const ticket = (route: string, date: string, flight: string, from: string, to: string, times: string, terminals: string) => [
  `${route}
Passenger E-Ticket
Booking Details
Passenger : Ms. Test Person Reservation : ABC123
Phone/Mobile : 9800000000 Ticket No : 100000001
Itinerary
Booked on : 18-Nov-2026 19:21 HRs Issued by : Example Travel Pvt Ltd IATA Code : 14000000
Travel Date Airline Flight From/Departure To/Arrival Class/Status Seat No
${date} ${flight} ${from} ${to} N / Confirm 11C
${times}
${terminals}
Fare Breakup
Ms. TEST ${route} Indigo 7857 453 - 1649 - 9959
Points to remember :
- Free checked Baggage allowance for travel to and from Dubai and Muscat is upto 30 kgs per adult.
- Tickets issued between 21 May 20 and 30 Sep 20 for travel upto 24 Nov 20 will be entitled to 20 kgs.`,
];

describe('corporate e-ticket PDFs', () => {
  const today = new Date('2026-11-26T12:00:00');
  const out = parseTicketText(ticket('BOM-KNU', '30-11-2026', '6E-6083', 'Mumbai', 'Kanpur', 'Monday 11:40 HRs 13:35 HRs', 'TERMINAL 2'), today);
  const back = parseTicketText(ticket('LKO-BOM', '01-12-2026', '6E-5242', 'Lucknow', 'Mumbai', 'Tuesday 20:45 HRs 23:05 HRs', 'TERMINAL 3 TERMINAL 1'), today);

  it('reads the flight, not the booking date or the small print', () => {
    expect(out).toMatchObject({ departure: '2026-11-30T11:40', arrival: '2026-11-30T13:35', flightNumber: '6E6083', terminal: 'T2' });
    expect(out.from?.code).toBe('BOM');
    expect(out.to?.code).toBe('KNU');
    expect(back).toMatchObject({ departure: '2026-12-01T20:45', arrival: '2026-12-01T23:05', flightNumber: '6E5242', terminal: 'T3' });
    expect(back.from?.code).toBe('LKO');
  });

  it('takes a flight home from another city as the way home', () => {
    expect(isReturnOf(flightLeg(out, 'Asia/Kolkata'), back)).toBe(true);
  });

  it('keeps a later itinerary after the small print', () => {
    const d = parseTicketText(['BA137 LHR BOM\nDeparts 5 Feb 2027 09:40\nTerms and conditions\nFare conditions apply\nBA138 BOM LHR\nDeparts 19 Feb 2027 02:15'], today);
    expect(d.departure).toBe('2027-02-05T09:40');
    expect(d.returnFlight?.departure).toBe('2027-02-19T02:15');
  });

  it('drops only the issue date, not a departure on the same line', () => {
    const d = parseTicketText(['BA138 BOM LHR\n19 Feb 2027 Issue date: 01 Feb 2027 Departure: 02:15'], today);
    expect(d.departure).toBe('2027-02-19T02:15');
  });
});
