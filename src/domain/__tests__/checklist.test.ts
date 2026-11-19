import { describe, expect, it } from 'vitest';

import type { AppData } from '../../storage/store';
import { openChecklistStep, toggleTick } from '../checklist';
import { buildTimeline, defaultFlight } from '../timeline';

const steps = buildTimeline({
  flight: defaultFlight('2026-11-27T10:00', 'Europe/London', true),
  checkout: { checkout: '2026-12-01T11:00', timeZone: 'Europe/Paris', sweepMinutesBefore: 60 },
});
const at = (iso: string) => openChecklistStep(steps, new Date(iso))?.kind;

describe('openChecklistStep', () => {
  it('opens the packing list from 20:00 for up to 4 hours', () => {
    expect(at('2026-11-26T19:59:00Z')).toBeUndefined();
    expect(at('2026-11-26T20:00:00Z')).toBe('pack');
    expect(at('2026-11-26T23:59:00Z')).toBe('pack');
    expect(at('2026-11-27T00:01:00Z')).toBeUndefined();
  });

  it('shows the last check until it is time to leave', () => {
    expect(at('2026-11-27T05:55:00Z')).toBe('leaveCheck');
    expect(at('2026-11-27T06:00:00Z')).toBeUndefined();
  });

  it('shows the room sweep until checkout', () => {
    expect(at('2026-12-01T09:30:00Z')).toBe('sweep');
    expect(at('2026-12-01T10:00:00Z')).toBeUndefined();
  });
});

describe('toggleTick', () => {
  it('ticks and unticks an item for a step', () => {
    const data: AppData = {
      version: 1,
      owners: [],
      items: [],
      trips: [{ id: 't', name: 'T', itemIds: ['a'], ticked: {}, createdAt: '' }],
    };
    const once = toggleTick(data, 't', 'pack', 'a');
    expect(once.trips[0].ticked.pack).toEqual(['a']);
    expect(toggleTick(once, 't', 'pack', 'a').trips[0].ticked.pack).toEqual([]);
  });
});
