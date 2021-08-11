const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../lib/metrics');

// Build a cumulative series from daily counts.
function cumulative(daily, start = '2020-11-01') {
  let c = 0;
  const d0 = new Date(start + 'T00:00:00Z');
  return daily.map((n, i) => {
    c += n;
    const d = new Date(d0.getTime() + i * 86400000);
    return { date: d.toISOString().slice(0, 10), cases: c, deaths: 0 };
  });
}

test('dailyNew clamps negative revisions', () => {
  const s = [{ date: 'a', cases: 10, deaths: 1 }, { date: 'b', cases: 8, deaths: 1 }, { date: 'c', cases: 15, deaths: 2 }];
  assert.deepEqual(m.dailyNew(s).map((d) => d.cases), [10, 0, 7]);
});

test('rollingAverage is null until the window fills', () => {
  const r = m.rollingAverage([7, 7, 7, 7, 7, 7, 7, 14], 7);
  assert.deepEqual(r.slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(r[6], 7);
  assert.equal(r[7], 8);
});

test('classify bands and trends', () => {
  const pop = 100000;
  // ~20/day → 140/week per 100k → high; doubling week over week → rising
  const rising = cumulative([...Array(7).fill(10), ...Array(7).fill(20)]);
  assert.deepEqual(m.classify(rising, pop), { level: 'high', trend: 'rising', weeklyPer100k: 140, avg7: 20 });
  // ~1/day → 7/week per 100k → low; flat
  const low = cumulative(Array(14).fill(1));
  assert.equal(m.classify(low, pop).level, 'low');
  assert.equal(m.classify(low, pop).trend, 'flat');
  // falling from 10 to 5/day → 35/week → moderate, falling
  const falling = cumulative([...Array(7).fill(10), ...Array(7).fill(5)]);
  assert.deepEqual([m.classify(falling, pop).level, m.classify(falling, pop).trend], ['moderate', 'falling']);
});

test('classify with too little data or no population is unknown', () => {
  assert.equal(m.classify(cumulative([1, 2, 3]), 1000).level, 'unknown');
  assert.equal(m.classify(cumulative(Array(10).fill(5)), 0).level, 'unknown');
});

test('storeBoard ranks worst first and attaches guidance', () => {
  const series = {
    '48453': cumulative([...Array(7).fill(10), ...Array(7).fill(20)]), // high, rising
    '48029': cumulative(Array(14).fill(1)), // low
    '48201': cumulative([...Array(7).fill(30), ...Array(7).fill(20)]), // high, falling
  };
  const pops = { '48453': 100000, '48029': 100000, '48201': 100000 };
  const stores = [{ id: 'S3', fips: '48029' }, { id: 'S1', fips: '48201' }, { id: 'S2', fips: '48453' }, { id: 'S4', fips: '99999' }];
  const board = m.storeBoard(stores, series, pops);
  assert.deepEqual(board.map((s) => s.id), ['S2', 'S1', 'S4', 'S3']);
  assert.equal(board[0].guidance.capacity, 0.25);
  assert.equal(board[2].level, 'unknown');
});

test('parseCountiesCsv filters to wanted counties and sorts by date', () => {
  const csv = 'date,county,state,fips,cases,deaths\n2020-11-02,Travis,Texas,48453,10,1\n2020-11-01,Travis,Texas,48453,5,0\n2020-11-01,Kings,New York,36047,99,9\n';
  assert.deepEqual(m.parseCountiesCsv(csv, ['48453']), {
    '48453': [{ date: '2020-11-01', cases: 5, deaths: 0 }, { date: '2020-11-02', cases: 10, deaths: 1 }],
  });
});

test('chartSeries rows line up with dates', () => {
  const rows = m.chartSeries(cumulative(Array(8).fill(2)), 50000);
  assert.equal(rows.length, 8);
  assert.equal(rows[0].avg7, null);
  assert.deepEqual(rows[7], { date: '2020-11-08', cases: 2, avg7: 2, per100k: 28 });
});
