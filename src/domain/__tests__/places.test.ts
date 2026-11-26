import { describe, expect, it } from 'vitest';

import { isShortMapsLink, mapsLink, parsePin } from '../places';

describe('parsePin', () => {
  it('reads the numbers Google Maps shows on a long press', () => {
    expect(parsePin('29.033755, 79.468833')).toEqual({ lat: 29.033755, lng: 79.468833 });
    expect(parsePin(' 19.097591,72.874558 ')).toEqual({ lat: 19.097591, lng: 72.874558 });
  });

  it('reads Google Maps links', () => {
    expect(parsePin('https://www.google.com/maps/@29.2,79.5,15z')).toEqual({ lat: 29.2, lng: 79.5 });
    expect(parsePin('https://maps.google.com/?q=29.2%2C79.5')).toEqual({ lat: 29.2, lng: 79.5 });
    // The place's own pin, not where the map was centred.
    expect(parsePin('https://www.google.com/maps/place/Hotel/@29.1,79.4,17z/data=!3m1!4b1!4m6!3d29.3945!4d79.4521')).toEqual({
      lat: 29.3945,
      lng: 79.4521,
    });
  });

  it('ignores text that is not a pin', () => {
    expect(parsePin('Hotel Lakeview')).toBeUndefined();
    expect(parsePin('Sun 6, 2026')).toBeUndefined();
    expect(parsePin('95.1, 72.8')).toBeUndefined();
    expect(parsePin('100%')).toBeUndefined();
  });

  it('knows a share link has to be opened first', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/AbC123')).toBe(true);
    expect(isShortMapsLink('29.03, 79.46')).toBe(false);
  });

  it('links the driver to the pin', () => {
    expect(mapsLink({ lat: 29.03, lng: 79.46 })).toBe('https://maps.google.com/?q=29.03,79.46');
  });
});
