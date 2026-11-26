import { describe, expect, it } from 'vitest';
import { defaultFlight } from '../timeline';
import { EMPTY_DATA } from '../../storage/store';
import { newStatuses, setStatus, showStatus, statusOn } from '../status';
import type { Person, Trip } from '../types';

const now = new Date('2026-12-06T04:00:00Z');
const people: Person[] = [
  { id: 'm', name: 'Mahiman' },
  { id: 'b', name: 'Bajrang' },
];

describe('family status', () => {
  it("sets one person's update and reads it back while fresh", () => {
    const d = setStatus({ ...EMPTY_DATA, owners: people }, 'b', 't1', 'landed', now);
    const b = d.owners.find((p) => p.id === 'b')!;
    expect(statusOn(b, 't1', now)?.label).toBe('Landed');
    expect(statusOn(b, 'other-trip', now)).toBeUndefined();
    expect(statusOn(b, 't1', new Date(now.getTime() + 19 * 3600 * 1000))).toBeUndefined();
    expect(d.owners.find((p) => p.id === 'm')!.status).toBeUndefined();
  });

  it("tells this phone about others' new updates, not its own or old ones", () => {
    const after = setStatus(setStatus({ ...EMPTY_DATA, owners: people }, 'b', 't1', 'left', now), 'm', 't1', 'left', now).owners;
    expect(newStatuses(people, after, 'm', now)).toEqual(['Bajrang has left for the airport']);
    // The same update again says nothing.
    expect(newStatuses(after, after, 'm', now)).toEqual([]);
  });
});

describe('when the card shows', () => {
  it("covers each traveller's own flights", () => {
    const trip = {
      id: 't1', name: 'x', createdAt: '', travellerIds: ['m', 'b'],
      flight: defaultFlight('2026-12-06T07:00', 'Asia/Kolkata', false),
      personFlights: { b: { flight: defaultFlight('2026-12-12T07:00', 'Asia/Kolkata', false) } },
    } as unknown as Trip;
    const on = new Date('2026-12-12T00:00:00Z');
    expect(showStatus(trip, [], on)).toBe(false);
    expect(showStatus(trip, people, on)).toBe(true);
  });
});
