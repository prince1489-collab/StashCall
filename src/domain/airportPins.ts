/**
 * Map pins for airport drop-offs, so Uber's "Where to?" fills in: its link
 * takes a point, not a place name. Checked by hand in Google Maps, one per
 * terminal where an airport has several, so a ride never goes to the wrong
 * one. An airport or terminal not listed simply opens Uber without a
 * destination.
 */
const PINS: Record<string, [number, number]> = {
  'BOM:T2': [19.097591, 72.874558],
  PGH: [29.033755, 79.468833],
  UDR: [24.61835, 73.89845],
};

/** The drop-off pin for an airport terminal, if we have one. */
export function terminalPin(code: string | undefined, terminal?: string): { lat: number; lng: number } | undefined {
  if (!code) return undefined;
  const t = terminal?.replace(/^T\s*/i, '');
  // Airports with several terminals are listed per terminal: no guessing which.
  const p = (t && PINS[`${code}:T${t}`]) || PINS[code];
  return p ? { lat: p[0], lng: p[1] } : undefined;
}

/**
 * Somewhere at the airport, for working out roughly how far away it is:
 * the terminal's pin, or any of its terminals' when we don't know which.
 */
export function airportPoint(code: string | undefined, terminal?: string): { lat: number; lng: number } | undefined {
  if (!code) return undefined;
  const p = terminalPin(code, terminal) ?? Object.entries(PINS).find(([k]) => k.split(':')[0] === code)?.[1];
  return Array.isArray(p) ? { lat: p[0], lng: p[1] } : p;
}
