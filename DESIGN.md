# Line Watch Display design system

## Direction

**Creative North Star: Melbourne signal desk.** The board borrows the hierarchy and confidence of a live broadcast control wall: the default field scans the whole network, exceptions carry semantic colour, and touching a route promotes it into a focused evidence view.

This is not a conventional dashboard and not a scaled-up mobile transit app. The default surface is designed to be read at several metres; the touch layer is a secondary index that opens only on request.

## Palette

- CPA navy `#090D46`: the branded low-glare display ground.
- Raised navy `#11185C`: secondary controls, loading surfaces and the operational footer.
- Chalk `#F3F7F5`: primary information.
- Mist `#A8B8BA`: secondary evidence.
- Signal cyan `#6DE7E1`: live/available and focus.
- Service amber `#FFBE4A`: notices and material travel changes.
- Fault coral `#FF6B5F`: unavailable/cancelled only.
- Hairline `#303879`: structural rules that remain visible on CPA navy.

Source-supplied route colours identify individual lines but never replace semantic status labels.

## Typography

Archivo Variable is the display and reading face. IBM Plex Mono is reserved for live time, update timestamps, route codes and measured data. Status headings scale between 56px and 96px, stay within `-.035em` tracking, and use plain language rather than numeric hero metrics.

## Composition

- Target frame: 1920x1080 landscape, with a complete first viewport and no required scrolling.
- A 96px live header carries identity, current Melbourne time and weather.
- The default surface is a dense, alphabetical five-column line matrix at 1920px. It avoids card decoration and keeps every available route visible in the first viewport.
- A selected route/status occupies the left two-fifths of the detail field; current evidence occupies the remaining space.
- The evidence panel carries manual refresh and the relevant official-source link.
- A thin operational footer carries the route-change action, freshness and auto-refresh explanation.
- The overview matrix is the primary route index. Detail mode also retains a full-width touch sheet for switching directly between routes.
- Mobile/tablet layouts become vertically scrollable and preserve 56px touch targets.

## State grammar

Every status uses icon, wording and colour together. A horizontal signal trace is derived from the current state: steady for clear, stepped for notices, interrupted for unavailable. Loading, stale, partial, unavailable, clear and warning states all remain explicit. Metro detail shows every active notice in its scrollable evidence region; V/Line may show up to five compact train predictions.

## Motion

The only authored motion is the route index entering from the bottom and the live trace transitioning when the decision state changes. Both disable under reduced motion. No ambient animation competes with public information.
