import { isFlightNumber } from './ticketParse';

/**
 * Booking references (PNRs) read from tickets, so check-in can fill them in.
 * Kept on this phone only, with the flights each one was printed beside.
 */
export interface BookingRef {
  pnr: string;
  /** Flight numbers on the same ticket, like ["6E2008", "6E7415"]. */
  flights: string[];
  /** Whose booking it is, when known: a son and his dad on one flight can have their own PNRs. */
  person?: string;
}

/** What check-in fills in, kept on this phone only. */
export interface CheckInDetails {
  /** This phone's person's surname, as on their booking. */
  lastName?: string;
  /** Booking references by trip id. */
  refs?: Record<string, BookingRef[]>;
}

// "PNR: AB12CD", "Airline PNR AB12CD", "Booking Reference - AB12CD",
// "Confirmation code AB12CD". The label can be on the line above.
const LABEL =
  /\b(?:PNR|Booking\s*(?:Ref(?:erence)?|Code|ID)|Confirmation\s*(?:Code|Number|No\.?)|Reservation\s*(?:Code|Number|No\.?))(?:\s*(?:No\.?|Number|Code))?\s*[:#.\-]?\s*([A-Za-z0-9]{6})(?![A-Za-z0-9])/gi;

const FLIGHT = /\b([A-Z0-9]{2})\s?-?(\d{2,4})\b/g;

/** A PNR: six capitals and digits with at least one letter, so not a date or a word like "Status". */
export function isPnr(s: string): boolean {
  return /^[A-Z0-9]{6}$/.test(s) && /[A-Z]/.test(s) && !/^(?:STATUS|NUMBER|DETAIL)$/.test(s);
}

/** The flight numbers in some ticket text, in order, each once. */
export function flightNumbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(FLIGHT)) {
    const n = `${m[1]}${m[2]}`;
    if (isFlightNumber(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * The booking references in the text of one ticket or PDF, each with the
 * flights on that ticket. Several tickets read together are split on
 * `separator` first, so each PNR keeps only its own flights.
 */
export function findBookingRefs(text: string | null | undefined, separator = '\n\n—\n\n'): BookingRef[] {
  if (!text) return [];
  const out: BookingRef[] = [];
  for (const part of text.split(separator)) {
    const flights = flightNumbersIn(part);
    for (const m of part.matchAll(LABEL)) {
      const pnr = m[1];
      if (!isPnr(pnr)) continue;
      const had = out.find((r) => r.pnr === pnr);
      if (!had) out.push({ pnr, flights: [...flights] });
      else for (const f of flights) if (!had.flights.includes(f)) had.flights.push(f);
    }
  }
  return out;
}

/** Adds newly read references to those kept, newest flights winning. */
export function mergeRefs(had: BookingRef[] = [], read: BookingRef[]): BookingRef[] {
  const out = had.map((r) => ({ ...r, flights: [...r.flights] }));
  for (const r of read) {
    // A flight now on another of this person's bookings (rebooked) leaves the
    // old one. Someone else's booking on the same flight is theirs, and stays.
    for (const o of out) if (o.pnr !== r.pnr && o.person === r.person) o.flights = o.flights.filter((f) => !r.flights.includes(f));
    const same = out.find((o) => o.pnr === r.pnr && o.person === r.person);
    if (same) same.flights = [...new Set([...same.flights, ...r.flights])];
    else out.push({ ...r, flights: [...r.flights] });
  }
  return out;
}

/**
 * The PNR to check one person in with: their booking these flights are on,
 * or the trip's only booking. Bookings of unknown owner count as theirs;
 * their own come first.
 */
export function pnrFor(all: BookingRef[] | undefined, flightNumbers: string[], person?: string): string | undefined {
  // A phone that hasn't said whose it is can use any booking.
  const refs = (all ?? []).filter((r) => !person || !r.person || r.person === person);
  if (refs.length === 0) return undefined;
  const on = refs.filter((r) => r.flights.some((f) => flightNumbers.includes(f)));
  const best = on.find((r) => r.person === person) ?? on[0];
  if (best) return best.pnr;
  return refs.length === 1 && refs[0].flights.length === 0 ? refs[0].pnr : undefined;
}

/** Keeps a PNR typed on the check-in screen as this person's booking for these flights. */
export function withTypedPnr(refs: BookingRef[] | undefined, pnr: string, flightNumbers: string[], person?: string): BookingRef[] {
  return mergeRefs(refs, [{ pnr, flights: flightNumbers, ...(person && { person }) }]);
}

/**
 * A script for the airline's page that fills the PNR and surname boxes
 * once they appear, without touching anything the person has typed. It
 * finds boxes by their labels and placeholders, since each airline's page
 * differs, and tells the app what it filled.
 */
export function fillScript(v: { pnr?: string; lastName?: string }): string {
  return `(function () {
  if (window.__stashcallFill) return;
  window.__stashcallFill = true;
  var want = ${JSON.stringify({ pnr: v.pnr ?? '', last: v.lastName ?? '' })};
  var filled = {};
  function tell() {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ filled: Object.keys(filled) }));
  }
  function clean(parts) {
    return parts.filter(Boolean).join(' ').toLowerCase().replace(/\\s+/g, ' ');
  }
  /** The box's own name, placeholder and label. */
  function own(el) {
    var parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('formcontrolname'), el.getAttribute('autocomplete')];
    if (el.labels) for (var i = 0; i < el.labels.length; i++) parts.push(el.labels[i].textContent);
    var by = el.getAttribute('aria-labelledby');
    if (by) by.split(' ').forEach(function (id) { var l = document.getElementById(id); if (l) parts.push(l.textContent); });
    return clean(parts);
  }
  /** Text just around the box, for a floating label that isn't tied to it. */
  function near(el) {
    var parts = [];
    var p = el.parentElement;
    for (var up = 0; p && up < 2; up++, p = p.parentElement) {
      if ((p.textContent || '').length < 60) parts.push(p.textContent);
    }
    return clean(parts);
  }
  function kind(h) {
    if (want.pnr && !filled.pnr && /pnr|booking ref|booking code|booking id|confirmation|reservation/.test(h)) return 'pnr';
    if (want.last && !filled.lastName && /last ?name|surname|family name/.test(h)) return 'lastName';
    return null;
  }
  function put(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  function fill() {
    var boxes = document.querySelectorAll('input, textarea');
    for (var i = 0; i < boxes.length; i++) {
      var el = boxes[i];
      var type = (el.type || 'text').toLowerCase();
      if (['text', 'search', 'email', 'tel', ''].indexOf(type) < 0 || el.disabled || el.readOnly) continue;
      if (el.value || el.offsetParent === null || el.__stashcall) continue;
      var what = kind(own(el)) || kind(near(el));
      if (!what) continue;
      el.__stashcall = true;
      put(el, what === 'pnr' ? want.pnr : want.last);
      filled[what] = true;
      tell();
    }
    return (!want.pnr || filled.pnr) && (!want.last || filled.lastName);
  }
  if (fill()) return;
  // The boxes often appear later, after a page's scripts or a tap on "Check-in".
  var obs = new MutationObserver(function () { if (fill()) stop(); });
  var timer = setInterval(function () { if (fill()) stop(); }, 1000);
  function stop() { obs.disconnect(); clearInterval(timer); }
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(stop, 120000);
})();
true;`;
}

/** Keeps booking references read for a trip, on this phone, as `person`'s when known. */
export function keepRefs<D extends { checkIn?: CheckInDetails }>(data: D, tripId: string, read: BookingRef[], person?: string): D {
  if (read.length === 0) return data;
  const refs = data.checkIn?.refs ?? {};
  const theirs = person ? read.map((r) => ({ ...r, person })) : read;
  return { ...data, checkIn: { ...data.checkIn, refs: { ...refs, [tripId]: mergeRefs(refs[tripId], theirs) } } };
}
