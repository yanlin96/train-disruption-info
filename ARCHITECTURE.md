# Line Watch Display architecture

## Runtime flow

```text
Transport Victoria schedule ----> /api/lines -----------+
Metro + V/Line live feeds ------> /api/overview --------+
Metro realtime alerts ----------> /api/disruptions -----+--> CommuteBoard
V/Line schedule + trip updates -> /api/vline-trips -----+
Open-Meteo ----------------------> /api/weather ---------+
```

All four endpoints are read-only. Credentials and protobuf decoding stay in server-only modules; the client receives only display-ready JSON.

## API and cache boundaries

- `/api/lines`: official Metro or V/Line route catalog; CDN cache target one hour, stale-while-revalidate one day.
- `/api/overview`: decodes each selected network feed once and groups the evidence across every line; Metro caches for one minute and V/Line for 30 seconds.
- `/api/disruptions`: current/upcoming Metro notices for one route; CDN cache target one minute.
- `/api/vline-trips`: schedule/realtime join for one regional route; CDN cache target 30 seconds. A feed older than five minutes is stale and hides predictions. A trip measurement older than ten minutes is excluded.
- `/api/weather`: current Melbourne weather and daily range; CDN cache target 15 minutes.

All transport times presented by the UI use `Australia/Melbourne`. Failures return bounded user-facing errors and never expose the Transport Victoria KeyID.

## Client behavior

`app/commute-board.tsx` owns network overview, route drill-down, adaptive refresh, URL state, display state classification, keyboard-complete route selection, and the responsive presentation. A one-minute client scheduler refreshes no more than every ten minutes on Melbourne weekdays from 8 am to 5 pm and every 30 minutes after hours; manual refresh remains immediate. Both networks default to an all-lines matrix; selecting a line replaces the matrix with detailed evidence, and `View all lines` returns to it.

The default 1920 x 1080 view does not scroll. Smaller screens deliberately become a vertical document. The full-width route sheet is modal: background regions become inert, focus is trapped, Escape closes it, and focus returns to its opener.

## Parallel extraction boundary

This package is independently installed, built, tested and deployed. It currently duplicates a small set of transport-domain modules from CPA Tools so deployment does not depend on the root package. The old CPA Tools implementation remains authoritative for its own signed-in train pages, reminders and Telegram behavior. Changes to shared transport semantics must be reviewed in both locations until a later decision introduces a shared package or retires one implementation.
