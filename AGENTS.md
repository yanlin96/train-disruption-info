# Line Watch Display Guide

This directory is an independently deployable, read-only workplace display. It coexists with the original CPA Tools application while the display is validated; do not remove or redirect the original train experience without a separate product decision.

## Read first

1. `PRODUCT.md` for the display outcome and scope.
2. `DESIGN.md` for the large-screen visual system.
3. `README.md` for local setup and deployment.

## Constraints

- Design first for a 1920 x 1080 shared display viewed from several metres away, then preserve usable tablet and mobile fallbacks.
- Keep the default board glanceable without scrolling. Route selection may use a touch-friendly overlay.
- Use official Transport Victoria data and `Australia/Melbourne` for user-facing transport times.
- Keep API keys server-side. Public browser responses must never expose credentials.
- Missing, stale, or failed evidence is uncertainty—not proof of normal service.
- Keep this package independently installable, testable, buildable, and deployable.

## Verification

Run:

```powershell
npm run typecheck
npm test
npm run build
npm run verify:ui
```

The visual check covers 1920 x 1080, a compact desktop viewport, the route picker, V/Line, and a mobile fallback.
