import { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

const fetcher = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

const LEVEL_COLORS = { high: '#c62828', substantial: '#ef6c00', moderate: '#f9a825', low: '#2e7d32', unknown: '#78909c' };
const TREND_ARROWS = { rising: '▲', flat: '▬', falling: '▼' };

function StoreRow({ s, selected, onSelect }) {
  return (
    <tr className={selected ? 'selected' : ''} onClick={() => onSelect(s)}>
      <td>{s.id}</td>
      <td>{s.name}<div className="muted">{s.county}</div></td>
      <td><span className="pill" style={{ background: LEVEL_COLORS[s.level] }}>{s.level}</span></td>
      <td className={`trend ${s.trend}`}>{TREND_ARROWS[s.trend]} {s.trend}</td>
      <td className="num">{s.weeklyPer100k ?? '–'}</td>
      <td className="num">{Math.round(s.guidance.capacity * 100)}%</td>
    </tr>
  );
}

function CountyChart({ store }) {
  // Second SWR key: chart data for the selected county only; the board itself is shared & cached.
  const { data, error } = useSWR(`/api/board?fips=${store.fips}`, fetcher);
  if (error) return <p className="error">Could not load chart.</p>;
  if (!data) return <p className="muted">Loading {store.county}…</p>;
  return (
    <section className="chart">
      <h2>{store.county} — new cases</h2>
      <p className="muted">{store.guidance.note}</p>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data.chart}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="cases" name="daily cases" fill="#90a4ae" />
          <Line dataKey="avg7" name="7-day avg" stroke="#c62828" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}

export default function Home() {
  // Refresh every 10 minutes and when the tab regains focus (store managers leave this open all day).
  const { data, error } = useSWR('/api/board', fetcher, { refreshInterval: 600000 });
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  const stores = (data?.stores || []).filter((s) => filter === 'all' || s.level === filter);

  return (
    <main>
      <Head><title>CovidPulse — store operations</title></Head>
      <header>
        <h1>CovidPulse</h1>
        {data && <span className="muted">data: {data.source} · updated {new Date(data.updatedAt).toLocaleString()}</span>}
      </header>
      <nav>
        {['all', 'high', 'substantial', 'moderate', 'low'].map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </nav>
      {error && <p className="error">Failed to load: {error.message}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        <table>
          <thead><tr><th>Store</th><th>Location</th><th>Level</th><th>Trend</th><th>7-day / 100k</th><th>Capacity</th></tr></thead>
          <tbody>{stores.map((s) => <StoreRow key={s.id} s={s} selected={selected?.id === s.id} onSelect={setSelected} />)}</tbody>
        </table>
      )}
      {selected && <CountyChart store={selected} />}
      <style jsx global>{`
        body { font-family: system-ui, sans-serif; margin: 0; color: #1d2330; background: #f6f7f9; }
        main { max-width: 1000px; margin: 0 auto; padding: 16px; }
        header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .muted { color: #6b7280; font-size: 13px; }
        nav button { margin-right: 6px; border: 1px solid #cfd4dc; background: #fff; padding: 4px 10px; border-radius: 14px; cursor: pointer; text-transform: capitalize; }
        nav button.active { background: #1d2330; color: #fff; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; background: #fff; }
        th, td { padding: 8px; border-bottom: 1px solid #eceff3; text-align: left; font-size: 14px; }
        tr { cursor: pointer; } tr.selected { background: #eef4ff; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .pill { color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 12px; text-transform: capitalize; }
        .trend.rising { color: #c62828; } .trend.falling { color: #2e7d32; }
        .chart { background: #fff; margin-top: 16px; padding: 12px; }
        .error { color: #c62828; }
        @media (max-width: 640px) { th:nth-child(2), td:nth-child(2) { display: none; } }
      `}</style>
    </main>
  );
}
