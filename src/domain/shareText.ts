import { instantToZoned } from './time';
import { buildTimeline } from './timeline';
import { stepItems } from './tripItems';
import type { Item, LocalDateTime, Owner, Trip } from './types';

/**
 * The trip's checklist as plain text for WhatsApp, SMS or email: one block
 * per item reminder, each item ticked or not, with its owner if set.
 * `formatDay` turns "2026-11-20T21:00" into a short date for the reader.
 */
export function tripChecklistText(
  trip: Trip,
  items: Item[],
  owners: Owner[],
  formatDay: (local: LocalDateTime) => string,
): string {
  const ownerName = (id?: string) => owners.find((o) => o.id === id)?.name;
  const blocks = buildTimeline(trip)
    .filter((s) => s.itemMoment)
    .map((s) => {
      const list = stepItems(trip, items, s, owners);
      if (list.length === 0) return null;
      const done = new Set(trip.ticked[s.kind] ?? []);
      const lines = list.map((i) => {
        const owner = ownerName(i.ownerId);
        return `${done.has(i.id) ? '✅' : '⬜'} ${i.name}${owner ? ` (${owner})` : ''}`;
      });
      const when = `${formatDay(instantToZoned(s.at, s.timeZone))} ${s.localTime}`;
      return `*${s.title}* · ${when}\n${lines.join('\n')}`;
    })
    .filter((b): b is string => b !== null);
  if (blocks.length === 0) return `${trip.name}: no items on this trip yet.`;
  return `${trip.name}: what not to forget\n\n${blocks.join('\n\n')}\n\nSent from StashCall`;
}
