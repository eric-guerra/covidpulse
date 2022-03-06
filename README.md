# CovidPulse

Portfolio reference implementation of a 2020 project, built to show an internal dashboard that helped store operations set occupancy and curbside policy per store from local COVID-19 case trends.

**Stack:** Next.js 9.5 (pages and API routes), React 16, SWR, Recharts. Data comes from the NYT county series.

## Features
- **Store board:** each store is joined to its county.
  - Stores are classified into CDC-style community levels from 7-day cases per 100k (low, moderate, substantial, high).
  - Each store gets a trend from week-over-week change: rising (>15% up), flat, or falling (>15% down).
  - The table is sorted worst first and shows the agreed operating guidance for each level (capacity %, protocols).
- **County drill-down:** daily cases as bars with a 7-day average line, via Recharts `ComposedChart`.
- **SWR:**
  - Shared cache and focus revalidation.
  - Auto-refresh every 10 minutes, since managers leave the page open all day.
  - A separate SWR key per county chart.
- **API route** `/api/board`:
  - Fetches the ~10 MB upstream CSV, parses only the counties that have stores, and caches the result per instance for 30 minutes, with CDN `s-maxage` plus `stale-while-revalidate`.
  - If the upstream is down it keeps serving the last good data, or a bundled sample, instead of an empty page.
- **Data quality:**
  - Cumulative counts are converted to daily counts, and negative revisions are clamped to 0.
  - Averages stay `null` until the 7-day window is full, so charts don't show a fake ramp.
  - Counties with too little data or no population figure are marked `unknown` and get conservative guidance.

## Run
```bash
npm install
npm run dev            # http://localhost:3000
npm test               # metrics: daily/rolling math, banding, trends, ranking, CSV parsing
npm run build          # on Node ≥17 prefix NODE_OPTIONS=--openssl-legacy-provider (webpack 4)
```
Set `COUNTIES_CSV_URL` to point at a mirror. `data/sample-series.json` is a synthetic fallback.
