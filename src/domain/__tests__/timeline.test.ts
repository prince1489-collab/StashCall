import { describe, expect, it } from 'vitest';

import { buildTimeline, defaultFlight } from '../timeline';
import { zonedToInstant, instantToZoned } from '../time';
import { itemsForMoment } from '../items';
import type { Item } from '../types';

const byKind = (steps: ReturnType<typeof buildTimeline>) =>
  Object.fromEntries(steps.map((s) => [s.kind, s]));

describe('time zones', () => {
  it('round-trips London wall-clock time in winter and summer', () => {
    for (const local of ['2026-11-27T10:00', '2026-07-01T10:00']) {
      expect(instantToZoned(zonedToInstant(local, 'Europe/London'), 'Europe/London')).toBe(local);
    }
  });

  it('converts Mumbai time correctly', () => {
    expect(zonedToInstant('2026-11-20T10:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-20T04:30:00.000Z',
    );
  });
});

describe('buildTimeline: flight', () => {
  it('works backwards from a 10:00 international departure', () => {
    const steps = byKind(
      buildTimeline({ flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true) }),
    );
    expect(steps.takeoff.localTime).toBe('10:00');
    expect(steps.airport.localTime).toBe('07:00');
    expect(steps.leave.localTime).toBe('06:00');
    expect(steps.leaveCheck.localTime).toBe('05:50');
    expect(steps.wake.localTime).toBe('05:00');
    expect(steps.pack.localTime).toBe('20:00');
    expect(instantToZoned(steps.pack.at, 'Europe/London').slice(0, 10)).toBe('2026-11-26');
  });

  it('uses a 2 hour buffer for domestic flights', () => {
    const steps = byKind(
      buildTimeline({ flight: defaultFlight('2026-11-27T10:00', 'Europe/London', false) }),
    );
    expect(steps.airport.localTime).toBe('08:00');
  });

  it('respects edited travel time and buffer', () => {
    const flight = { ...defaultFlight('2026-11-20T10:00', 'Asia/Kolkata', true), travelMinutes: 90 };
    const steps = byKind(buildTimeline({ flight }));
    expect(steps.leave.localTime).toBe('05:30');
    expect(steps.wake.localTime).toBe('04:30');
  });

  it('never schedules packing after wake-up for a very early flight', () => {
    const flight = { ...defaultFlight('2026-11-27T00:30', 'Europe/London', true) };
    const steps = byKind(buildTimeline({ flight }));
    expect(steps.pack.at.getTime()).toBeLessThan(steps.wake.at.getTime());
  });

  it('marks only the departure as a confirmed time', () => {
    const steps = buildTimeline({
      flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true),
    });
    expect(steps.filter((s) => !s.estimate).map((s) => s.kind)).toEqual(['takeoff']);
  });
});

describe('buildTimeline: hotel checkout', () => {
  it('sweeps the room an hour before checkout in the hotel time zone', () => {
    const steps = byKind(
      buildTimeline({
        checkout: { checkout: '2026-12-01T11:00', timeZone: 'Europe/Paris', sweepMinutesBefore: 60 },
      }),
    );
    expect(steps.sweep.localTime).toBe('10:00');
    expect(steps.sweep.at.toISOString()).toBe('2026-12-01T09:00:00.000Z');
    expect(steps.sweep.itemMoment).toBe('checkout');
  });

  it('allows a checkout-only trip and orders a combined trip by time', () => {
    const steps = buildTimeline({
      flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true),
      checkout: { checkout: '2026-12-01T11:00', timeZone: 'Europe/Paris', sweepMinutesBefore: 60 },
    });
    const times = steps.map((s) => s.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(steps.at(-1)?.kind).toBe('checkout');
  });
});

describe('itemsForMoment', () => {
  const item = (id: string, moment: Item['moment']): Item => ({
    id,
    name: id,
    moment,
    createdAt: '2026-11-19T00:00:00Z',
  });
  const items = [item('keys', 'home'), item('charger', 'both'), item('robe', 'checkout')];

  it('includes "both" items at each moment', () => {
    expect(itemsForMoment(items, 'home').map((i) => i.id)).toEqual(['keys', 'charger']);
    expect(itemsForMoment(items, 'checkout').map((i) => i.id)).toEqual(['charger', 'robe']);
  });
});

describe('clock changes', () => {
  it('moves a time inside a spring-forward gap forward, in every zone', () => {
    const ny = zonedToInstant('2026-03-08T02:30', 'America/New_York');
    expect(instantToZoned(ny, 'America/New_York')).toBe('2026-03-08T03:30');
    const ldn = zonedToInstant('2026-03-29T01:30', 'Europe/London');
    expect(instantToZoned(ldn, 'Europe/London')).toBe('2026-03-29T02:30');
    const akl = zonedToInstant('2026-09-27T02:30', 'Pacific/Auckland');
    expect(instantToZoned(akl, 'Pacific/Auckland')).toBe('2026-09-27T03:30');
  });

  it('handles far-east and far-west zones on ordinary days', () => {
    for (const [local, zone] of [
      ['2026-09-27T01:30', 'Pacific/Auckland'],
      ['2026-09-27T04:00', 'Pacific/Auckland'],
      ['2026-06-01T09:00', 'Pacific/Kiritimati'],
      ['2026-06-01T09:00', 'Pacific/Pago_Pago'],
    ]) {
      expect(instantToZoned(zonedToInstant(local, zone), zone)).toBe(local);
    }
  });

  it('uses the first occurrence of a time repeated when clocks go back', () => {
    const t = zonedToInstant('2026-10-25T01:30', 'Europe/London');
    expect(t.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('handles times next to a change normally', () => {
    const t = zonedToInstant('2026-03-29T03:00', 'Europe/London');
    expect(t.toISOString()).toBe('2026-03-29T02:00:00.000Z');
  });
});
