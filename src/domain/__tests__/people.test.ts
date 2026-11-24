import { describe, expect, it } from 'vitest';

import { planReminders } from '../../reminders/plan';
import { EMPTY_DATA } from '../../storage/store';
import type { AppData } from '../../storage/store';
import { addPerson, firstPassport, removePerson, setTravellers } from '../people';
import { prepTasks } from '../prep';
import { buildTimeline, defaultFlight } from '../timeline';
import { stepItemNames } from '../tripItems';
import type { Item, Person, Trip } from '../types';

const me: Person = { id: 'me', name: 'Mahi', passportExpires: '2031-01-01' };
const dad: Person = { id: 'dad', name: 'Dad', passportExpires: '2027-03-01' };
const kid: Person = { id: 'kid', name: 'Aarav', child: true };
const item = (id: string, name: string, ownerId?: string): Item => ({ id, name, moment: 'both', ownerId, createdAt: '2026-11-01T00:00:00Z' });
const items = [item('a', 'Phone charger'), item('b', 'Glasses', 'dad'), item('c', 'Laptop', 'me'), item('d', 'Toy', 'kid')];

function trip(travellerIds?: string[], international = false): Trip {
  return {
    id: 't1',
    name: 'Pantnagar',
    flight: defaultFlight('2026-12-06T09:40', 'Asia/Kolkata', international),
    itemIds: items.map((i) => i.id),
    travellerIds,
    ticked: {},
    createdAt: '2026-11-24T02:00:00Z',
  };
}
const pack = (t: Trip) => buildTimeline(t).find((s) => s.kind === 'pack')!;
const now = new Date('2026-11-24T03:00:00Z');

describe('people', () => {
  it('leaves out the items of people who are not going', () => {
    const t = trip(['me', 'dad']);
    expect(stepItemNames(t, items, pack(t), [me, dad, kid])).toEqual(['Phone charger', 'Glasses', 'Laptop']);
    expect(stepItemNames(trip(), items, pack(trip()), [me, dad, kid])).toHaveLength(4);
  });

  it("names everyone's items until they have the app, with whose they are", () => {
    const body = planReminders(trip(), items, now, [me, dad, kid], 'me').find((r) => r.kind === 'pack')!.body;
    expect(body).toBe("Don't forget: Phone charger, Glasses (Dad), Laptop and Toy (Aarav).");
  });

  it("stops naming Dad's items once he has his own phone", () => {
    const people = [me, { ...dad, ownPhone: true }, kid];
    const mine = planReminders(trip(), items, now, people, 'me').find((r) => r.kind === 'pack')!.body;
    expect(mine).toBe("Don't forget: Phone charger, Laptop and Toy (Aarav).");
    const his = planReminders(trip(), items, now, people, 'dad').find((r) => r.kind === 'pack')!.body;
    expect(his).toBe("Don't forget: Phone charger, Glasses, Laptop (Mahi) and Toy (Aarav).");
  });

  it("warns about the passport of whoever is going that runs out first", () => {
    expect(firstPassport(trip(), { owners: [me, dad] })).toEqual({ date: '2027-03-01', name: 'Dad', personId: 'dad' });
    expect(firstPassport(trip(['me']), { owners: [me, dad] })?.name).toBe('Mahi');
    const abroad = { ...trip(undefined, true), flight: defaultFlight('2027-02-05T09:40', 'Asia/Kolkata', true) };
    const passport = prepTasks(abroad, { owners: [me, dad], insurance: 'annual' }).find((x) => x.kind === 'passport')!;
    expect(passport).toMatchObject({ problem: 'passportShort', whose: 'Dad', whoseId: 'dad' });
  });

  it('makes the first person added "me" and tidies up on removal', () => {
    let d: AppData = { ...EMPTY_DATA, items, trips: [trip()] };
    d = addPerson(d, me);
    d = addPerson(d, dad);
    expect(d.meId).toBe('me');
    d = setTravellers(d, 't1', ['dad']);
    expect(d.trips[0].travellerIds).toEqual(['dad']);
    d = setTravellers(d, 't1', ['dad', 'me']);
    expect(d.trips[0].travellerIds).toBeUndefined();
    d = removePerson(setTravellers(d, 't1', ['dad']), 'dad');
    expect(d.trips[0].travellerIds).toBeUndefined();
    expect(d.items.find((i) => i.id === 'b')?.ownerId).toBeUndefined();
  });
});
