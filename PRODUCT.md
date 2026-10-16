# Line Watch Display

## Purpose

Line Watch Display is a standalone, read-only workplace transport board for a large shared touch screen. It helps staff decide whether current or upcoming public-transport conditions should change when or how they travel.

## Audience and scene

- Staff glance at the board from several metres away while moving through a shared office area.
- Staff may approach the touch screen to choose Metro or V/Line and inspect a specific route.
- The board is expected to remain open for long periods without a personal session or repeated setup.

## First-screen outcome

Within five seconds, a viewer should understand:

1. which lines across the selected network need attention;
2. whether each line has a change, cancellation, delay, live prediction or unconfirmed state;
3. when the evidence was last refreshed;
4. how to open detailed evidence for one route.

## Product boundaries

- This app is independently buildable and deployable from `apps/line-watch-display`.
- It uses official Transport Victoria schedule and realtime feeds and Melbourne weather from Open-Meteo.
- Transport Victoria credentials stay server-side.
- It is a public, read-only display surface; it does not include Okta, Auditron, website-quality tools, reminders, Telegram, or personal history.
- Metro provides current and upcoming notices. V/Line provides regional train predictions with explicit feed limitations; it does not imply that missing predictions mean normal service.
- User-facing dates and times use `Australia/Melbourne`.

## Display constraints

- Primary target: 1920x1080 landscape touch display.
- The useful first viewport must not require scrolling at the target size.
- Primary status remains legible at distance; supporting detail is available by touch.
- Touch targets are at least 56px and retain keyboard focus states.
- The interface must handle stale, unavailable, loading, no-notice, notice, major-change, and partial-coverage states without presenting uncertainty as an all-clear.
- The board refreshes data automatically and provides a large manual refresh control.

## Decision states

| Network | Evidence | Board verdict |
| --- | --- | --- |
| Metro | One or more current/upcoming service, station-access or parking notices | `Travel changes reported` / amber |
| Metro | No matching current or upcoming notices | `No listed service changes` / cyan, with an explicit official-feed caveat |
| V/Line | At least one cancellation | `Cancellation reported` / coral |
| V/Line | No cancellation and a supplied delay over five minutes | `Delays reported` / amber |
| V/Line | Current predictions without a material supplied delay | `Services reporting live` / cyan |
| V/Line | Feed older than five minutes | `Predictions are stale` / coral; predictions are hidden |
| Either | Request or catalog failure | `Live status unavailable` / coral with an official-source action |

Unmatched V/Line trips and feed scope are always disclosed as coverage limitations. Metro notices are intentionally broad because station access and parking can change an employee's commute decision even when trains are running.

## Operating defaults

- Metro opens on a complete all-lines overview; V/Line has an equivalent all-routes overview. Selecting a line opens its detailed evidence without losing the network switch.
- The selected network and optional route are reflected in `network` and `lineId` URL parameters so a display can be pinned to an overview or one route.
- Live transport and weather data refresh every ten minutes on Melbourne weekdays from 8 am to 5 pm and every 30 minutes after hours. Manual refresh remains immediate; weather stays independently cached upstream.
- Official-source links open in a new tab. A managed kiosk should permit that tab and return to the board after staff finish checking details.

## Success criteria

- All available lines, their compact status and freshness are understandable without interaction.
- Metro/V/Line and route selection are usable by touch without a keyboard.
- Long official notices remain readable without destabilising the screen.
- Failures remain visible and actionable while the rest of the board continues to function.
