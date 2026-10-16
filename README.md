# Line Watch Display

Standalone large-screen Melbourne transport board extracted from CPA Tools.

## Run locally

```powershell
Copy-Item .env.example .env.local
# Add TRANSPORT_VIC_API_KEY to .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The target display is 1920x1080 landscape; its default view shows all available lines at once, while tablet and mobile layouts remain usable.

Product intent is in `PRODUCT.md`, visual rules are in `DESIGN.md`, and runtime/data boundaries are in `ARCHITECTURE.md`.

## Deploy independently on Vercel

Create a separate Vercel project and set its Root Directory to `apps/line-watch-display`. Add `TRANSPORT_VIC_API_KEY` as a server-side environment variable. No Okta, OpenAI or Telegram variables are required.

## Data boundaries

- Metro: current and upcoming official service-alert notices.
- V/Line: realtime train predictions only. Coaches, replacement buses, works and disruption notices are not covered by that feed.
- Weather: Open-Meteo, cached for 15 minutes.

The board is read-only. It never exposes the Transport Victoria KeyID to the browser.
