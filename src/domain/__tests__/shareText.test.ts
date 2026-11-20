import { describe, expect, it } from 'vitest';

import { tripChecklistText } from '../shareText';
import { defaultFlight } from '../timeline';
import type { Item, Trip } from '../types';

const item = (id: string, name: string, moment: Item['moment'], ownerId?: string): Item => ({
  id,
  name,
  moment,
  ownerId,
  createdAt: '',
});

describe('tripChecklistText', () => {
  const items = [item('p', 'Passports', 'home'), item('g', 'Glasses', 'both', 'o1'), item('x', 'Kite', 'home')];
  const trip: Trip = {
    id: 't',
    name: 'London',
    flight: defaultFlight('2026-11-21T10:00', 'Europe/London', true),
    itemIds: ['p', 'g'],
    ticked: { pack: ['p'] },
    createdAt: '',
  };

  it('lists each item reminder with ticks and owners, skipping items not on the trip', () => {
    const text = tripChecklistText(trip, items, [{ id: 'o1', name: 'Ellie' }], (d) => d.slice(0, 10));
    expect(text).toContain('London: what not to forget');
    expect(text).toContain('2026-11-20 20:00');
    expect(text).toContain('✅ Passports');
    expect(text).toContain('⬜ Glasses (Ellie)');
    expect(text).not.toContain('Kite');
  });

  it('says so when the trip has no items', () => {
    expect(tripChecklistText({ ...trip, itemIds: [] }, items, [], (d) => d)).toBe('London: no items on this trip yet.');
  });
});
