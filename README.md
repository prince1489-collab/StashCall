# StashCall

A travel-day app that remembers your personal items and reminds you at the two moments that matter: the night before you leave home, and the hour before hotel checkout.

This is the phase 1 tester build. It runs entirely on the phone: no accounts, no server, no AI.

## Run it

```bash
npm install
npx expo start      # scan the QR code with Expo Go, or press i / a for a simulator
npm test            # timeline and time-zone tests
npm run typecheck
```

## Builds for testers

See [BUILDING.md](BUILDING.md).

## How it is organised

| Path | What it holds |
| --- | --- |
| `src/app/` | Screens (Expo Router): Today, Trip and Items tabs, and the trip form |
| `src/state/AppData.tsx` | App-wide data, loaded from and saved to the device |
| `src/ui/` | Shared form controls, timeline view and colours |
| `src/domain/types.ts` | Data model: Trip, FlightLeg, HotelCheckout, Item, Owner, TimelineStep |
| `src/domain/timeline.ts` | Works the day out backwards from departure and checkout times |
| `src/domain/time.ts` | Time-zone conversion for wall-clock times |
| `src/domain/household.ts` | Adding, editing and removing saved items and owners |
| `src/reminders/` | Turns the timeline into phone notifications and keeps them in sync |
| `src/storage/photos.ts` | Optional item photos, kept on the phone only |
| `src/domain/presets.ts` | The 10 preloaded high-regret items |
| `src/storage/store.ts` | On-device storage (AsyncStorage) |

## Timeline rules

From a flight departure, using defaults the user can change per trip:

| Step | Rule | Default |
| --- | --- | --- |
| Arrive at airport | departure minus buffer | 3 h international, 2 h domestic |
| Leave home | airport arrival minus travel time | 60 min |
| Last item check | leave home minus 10 min | |
| Wake up | leave home minus get-ready time | 60 min |
| Pack | evening before, never after wake-up | 20:00 |
| Sweep the room | hotel checkout minus sweep time, in the hotel's time zone | 60 min |

Only times the user typed (departure, checkout) are shown as confirmed. Everything else is labelled as an estimate.

## Reminders

Five local notifications per trip, scheduled on the phone (no server): pack the evening before, wake up, last item check, leave home, and sweep the room before checkout. Each lists the items it covers. They are rebuilt whenever a trip or item changes and whenever the app is opened. On Android, wake-up and leave-home use alarm-clock delivery so the system doesn't delay them; this needs the "Alarms and reminders" permission, which the app asks for.

## Out of scope for phase 1

Email or inbox import, WhatsApp or driver messages, live flight status and re-planning, check-in, accounts and sync, payments, AI.
