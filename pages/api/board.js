import { parseCountiesCsv, storeBoard, chartSeries } from '../../lib/metrics';
import stores from '../../data/stores.json';
import populations from '../../data/populations.json';
import sample from '../../data/sample-series.json';

const SOURCE = process.env.COUNTIES_CSV_URL || 'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties-recent.csv';
const TTL_MS = 30 * 60 * 1000;

// The upstream CSV is ~10 MB and updates once a day; parse it once per instance per TTL.
let cache = { at: 0, series: null, source: null };

async function loadSeries() {
  if (cache.series && Date.now() - cache.at < TTL_MS) return cache;
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const series = parseCountiesCsv(await res.text(), stores.map((s) => s.fips));
    cache = { at: Date.now(), series, source: 'nyt' };
  } catch (e) {
    // Keep serving yesterday's numbers (or the bundled sample) rather than an empty dashboard.
    if (!cache.series) cache = { at: Date.now(), series: sample, source: 'sample' };
    console.warn('covid data refresh failed:', e.message);
  }
  return cache;
}

export default async function handler(req, res) {
  const { series, source, at } = await loadSeries();
  const board = storeBoard(stores, series, populations);
  const fips = req.query.fips;
  const body = { source, updatedAt: new Date(at).toISOString(), stores: board };
  if (fips) body.chart = chartSeries(series[fips] || [], populations[fips]).slice(-60);
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).json(body);
}
