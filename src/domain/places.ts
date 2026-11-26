/**
 * Home and the hotel as points on the map, so a ride from the airport can
 * go straight there: Uber fills in "Where to?" and the driver gets a map
 * link. People paste a pin from Google Maps: the numbers shown when you
 * long-press a place ("29.0337, 79.4688"), or a link to the place.
 */
export interface Place {
  /** What to call it in a message: "Hotel Lakeview, Haldwani road". */
  name?: string;
  lat: number;
  lng: number;
}

/**
 * The pin in what someone pasted: plain numbers, or a Google Maps link
 * that carries them (…/@29.03,79.46,15z, ?q=29.03,79.46, !3d29.03!4d79.46).
 * Undefined when there are none, or they aren't a place on Earth.
 */
export function parsePin(text: string): { lat: number; lng: number } | undefined {
  let t = text.replace(/\+/g, ' ').trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    // Not URL-encoded after all: read it as it is.
  }
  // A place's own pin beats the map's centre in a link that has both.
  const exact = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  // Whole numbers only: "129.03" must not be read as 29.03.
  const m = exact ?? t.match(/(?:^|[^\d.-])(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?![\d.])/);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  // Whole numbers ("6, 2026") are far more likely a date than a pin.
  if (!exact && !(m[1].includes('.') && m[2].includes('.'))) return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

/** A short share link that has to be opened to find the pin. */
export const isShortMapsLink = (text: string) => /https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text);

/** A Google Maps link to the pin, for the driver. */
export const mapsLink = (p: { lat: number; lng: number }) => `https://maps.google.com/?q=${p.lat},${p.lng}`;

/** "29.033755, 79.468833". */
export const pinLabel = (p: { lat: number; lng: number }) => `${p.lat}, ${p.lng}`;
