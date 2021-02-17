// Pure data shaping for the dashboard. Input is the NYT-style county series
// (cumulative cases/deaths per day); everything else is derived here so it can be unit tested.

/** Cumulative → daily new counts. Negative corrections (data revisions) clamp to 0. */
function dailyNew(series) {
  return series.map((d, i) => {
    const prev = i === 0 ? { cases: 0, deaths: 0 } : series[i - 1];
    return { date: d.date, cases: Math.max(0, d.cases - prev.cases), deaths: Math.max(0, d.deaths - prev.deaths) };
  });
}

/** Trailing N-day average; null until the window is full so charts don't show a fake ramp. */
function rollingAverage(values, window = 7) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

function per100k(value, population) {
  if (!population) return null;
  return (value / population) * 100000;
}

/**
 * CDC-style community transmission bands on 7-day cases per 100k (weekly total), plus a trend from
 * comparing this week's average with last week's.
 */
function classify(series, population) {
  const daily = dailyNew(series);
  const avg = rollingAverage(daily.map((d) => d.cases));
  const last = avg[avg.length - 1];
  const weekAgo = avg[avg.length - 8];
  const weekly = last == null ? null : per100k(last * 7, population);
  let level = 'unknown';
  if (weekly != null) {
    level = weekly >= 100 ? 'high' : weekly >= 50 ? 'substantial' : weekly >= 10 ? 'moderate' : 'low';
  }
  let trend = 'flat';
  if (last != null && weekAgo != null && weekAgo > 0) {
    const change = (last - weekAgo) / weekAgo;
    trend = change > 0.15 ? 'rising' : change < -0.15 ? 'falling' : 'flat';
  } else if (last > 0 && weekAgo === 0) {
    trend = 'rising';
  }
  return {
    level,
    trend,
    weeklyPer100k: weekly == null ? null : Math.round(weekly * 10) / 10,
    avg7: last == null ? null : Math.round(last * 10) / 10,
  };
}

/** Store operating guidance the ops team agreed with each band (shown next to each store). */
const GUIDANCE = {
  high: { capacity: 0.25, curbsideOnly: false, note: 'Limit occupancy to 25%; promote curbside; extra cleaning shifts.' },
  substantial: { capacity: 0.5, curbsideOnly: false, note: 'Occupancy 50%; masks required; stagger associate breaks.' },
  moderate: { capacity: 0.75, curbsideOnly: false, note: 'Occupancy 75%; standard protocols.' },
  low: { capacity: 1, curbsideOnly: false, note: 'Normal operations.' },
  unknown: { capacity: 0.5, curbsideOnly: false, note: 'No recent data; use substantial-level protocols.' },
};

/** Join stores to their county series and rank: worst level first, rising before flat/falling. */
function storeBoard(stores, countySeries, populations) {
  const levelRank = { high: 0, substantial: 1, moderate: 2, unknown: 3, low: 4 };
  const trendRank = { rising: 0, flat: 1, falling: 2 };
  return stores
    .map((s) => {
      const series = countySeries[s.fips] || [];
      const c = classify(series, populations[s.fips]);
      return { ...s, ...c, guidance: GUIDANCE[c.level] };
    })
    .sort((a, b) => levelRank[a.level] - levelRank[b.level] || trendRank[a.trend] - trendRank[b.trend] || a.id.localeCompare(b.id));
}

/** Chart-ready rows for one county. */
function chartSeries(series, population) {
  const daily = dailyNew(series);
  const avg = rollingAverage(daily.map((d) => d.cases));
  return daily.map((d, i) => ({
    date: d.date,
    cases: d.cases,
    avg7: avg[i] == null ? null : Math.round(avg[i] * 10) / 10,
    per100k: avg[i] == null ? null : Math.round(per100k(avg[i] * 7, population) * 10) / 10,
  }));
}

/** Parse the NYT us-counties CSV, keeping only the FIPS codes we have stores in. */
function parseCountiesCsv(csv, wantedFips) {
  const wanted = new Set(wantedFips);
  const out = {};
  const lines = csv.split('\n');
  const header = lines[0].split(',');
  const idx = (k) => header.indexOf(k);
  const [iDate, iFips, iCases, iDeaths] = [idx('date'), idx('fips'), idx('cases'), idx('deaths')];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(',');
    const fips = cols[iFips];
    if (!wanted.has(fips)) continue;
    (out[fips] = out[fips] || []).push({ date: cols[iDate], cases: Number(cols[iCases]) || 0, deaths: Number(cols[iDeaths]) || 0 });
  }
  for (const f of Object.keys(out)) out[f].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

module.exports = { dailyNew, rollingAverage, per100k, classify, storeBoard, chartSeries, parseCountiesCsv, GUIDANCE };
