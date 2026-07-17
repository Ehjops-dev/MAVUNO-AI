/**
 * MavunoAI automated test suite — Node built-in test runner, zero dependencies.
 * Run:  node --test tests/
 *
 * Spawns the real server on a test port with an isolated database, then
 * exercises every API endpoint, the Mavuno Score engine, input validation,
 * and static-file security.
 */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4599;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = path.join(os.tmpdir(), `mavuno-test-${Date.now()}.db`);
let serverProc;

const get = p => fetch(BASE + p).then(r => r.json().then(body => ({ status: r.status, body, headers: r.headers })));
const post = (p, data, raw = false) => fetch(BASE + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: raw ? data : JSON.stringify(data),
}).then(r => r.json().then(body => ({ status: r.status, body })));

before(async () => {
  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, MAVUNO_DB: TEST_DB },
    stdio: 'ignore',
  });
  // wait until the server answers
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/score'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});

after(() => {
  serverProc.kill();
  for (const f of [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm']) {
    try { fs.unlinkSync(f); } catch {}
  }
});

/* ================================================== dashboard */
test('GET /api/dashboard returns full farmer snapshot', async () => {
  const { status, body } = await get('/api/dashboard');
  assert.equal(status, 200);
  assert.equal(body.farmer.name, 'Amina Chebet');
  assert.equal(body.farmer.county, 'Uasin Gishu');
  assert.equal(body.harvestCount, 7);
  assert.ok(body.totalKg > 10000, 'seeded produce should exceed 10 tonnes');
  assert.ok(body.totalRevenue > 400000, 'seeded revenue should exceed KES 400k');
});

test('dashboard score sits in the 300-850 band with a named tier', async () => {
  const { body } = await get('/api/dashboard');
  assert.ok(body.score >= 300 && body.score <= 850, `score ${body.score} out of band`);
  assert.ok(['Prime Harvester', 'Growing Strong', 'Seedling', 'Building History'].includes(body.tier));
});

test('dashboard weather has 5 days with sane temperatures', async () => {
  const { body } = await get('/api/dashboard');
  assert.equal(body.weather.length, 5);
  assert.equal(body.weather[0].day, 'Today');
  for (const d of body.weather) {
    assert.ok(d.high > d.low, `${d.day}: high must exceed low`);
    assert.ok(d.high > 5 && d.high < 40, 'temperature plausible for Kenya highlands');
    assert.ok(d.rain_mm >= 0);
  }
});

test('dashboard price ticker covers all five crops with positive prices', async () => {
  const { body } = await get('/api/dashboard');
  const crops = body.prices.map(p => p.crop).sort();
  assert.deepEqual(crops, ['beans', 'cabbage', 'maize', 'potatoes', 'tomatoes']);
  for (const p of body.prices) assert.ok(p.price > 0, `${p.crop} price must be positive`);
});

test('dashboard advisory always returns at least two tips', async () => {
  const { body } = await get('/api/dashboard');
  assert.ok(body.advisory.length >= 2);
  for (const t of body.advisory) { assert.ok(t.title); assert.ok(t.body); }
});

/* ================================================== prices */
test('GET /api/prices returns 60-day series for all 5 markets', async () => {
  const { status, body } = await get('/api/prices?crop=maize');
  assert.equal(status, 200);
  const markets = Object.keys(body.series);
  assert.equal(markets.length, 5);
  for (const m of markets) {
    assert.equal(body.series[m].length, 60, `${m} should have 60 days of prices`);
    for (const row of body.series[m]) assert.ok(row.price_per_kg > 0);
  }
});

test('prices: every crop is servable and never collapses below floor', async () => {
  const floors = { maize: 46 * 0.55, beans: 108 * 0.55, potatoes: 34 * 0.55, tomatoes: 62 * 0.55, cabbage: 24 * 0.55 };
  for (const crop of Object.keys(floors)) {
    const { status, body } = await get('/api/prices?crop=' + crop);
    assert.equal(status, 200, crop);
    for (const m of Object.keys(body.series)) {
      for (const row of body.series[m]) {
        assert.ok(row.price_per_kg >= floors[crop] - 0.01, `${crop}@${m} fell below realistic floor`);
      }
    }
  }
});

test('prices: best-market ranking is sorted descending', async () => {
  const { body } = await get('/api/prices?crop=beans');
  for (let i = 1; i < body.best.length; i++) {
    assert.ok(body.best[i - 1].price >= body.best[i].price, 'ranking must be descending');
  }
});

test('prices: unknown crop rejected with 400', async () => {
  const { status } = await get('/api/prices?crop=coffee');
  assert.equal(status, 400);
});

test('prices: defaults to maize when crop omitted', async () => {
  const { status, body } = await get('/api/prices');
  assert.equal(status, 200);
  assert.equal(body.crop, 'maize');
});

/* ================================================== harvests */
test('GET /api/harvests returns seeded ledger sorted newest first', async () => {
  const { status, body } = await get('/api/harvests');
  assert.equal(status, 200);
  assert.ok(body.length >= 7);
  for (let i = 1; i < body.length; i++) {
    assert.ok(body[i - 1].harvest_date >= body[i].harvest_date, 'ledger must be newest-first');
  }
});

test('POST /api/harvests logs a harvest and returns updated score', async () => {
  const before = (await get('/api/score')).body.score;
  const { status, body } = await post('/api/harvests', {
    crop: 'tomatoes', season: 'Long Rains 2026', quantity_kg: 800,
    sold_price_per_kg: 65, market: 'Wakulima (Nairobi)', harvest_date: '2026-07-15',
  });
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.ok(body.score >= 300 && body.score <= 850);
  // a 4th crop + new season + well-priced sale must not lower the score
  assert.ok(body.score >= before, `score should not drop after a strong harvest (${before} → ${body.score})`);
});

test('POST /api/harvests validation: missing fields rejected with 400', async () => {
  for (const bad of [
    {},                                              // everything missing
    { crop: 'maize' },                               // no quantity/date/season
    { crop: 'maize', quantity_kg: 100 },             // no date/season
    { crop: 'maize', quantity_kg: 100, harvest_date: '2026-01-01' }, // no season
  ]) {
    const { status } = await post('/api/harvests', bad);
    assert.equal(status, 400, JSON.stringify(bad));
  }
});

test('POST /api/harvests: unsold harvest (no price) is accepted', async () => {
  const { status } = await post('/api/harvests', {
    crop: 'cabbage', season: 'Long Rains 2026', quantity_kg: 300, harvest_date: '2026-07-14',
  });
  assert.equal(status, 201);
});

test('malformed JSON body rejected with 400, not a crash', async () => {
  const { status } = await post('/api/harvests', '{not json', true);
  assert.equal(status, 400);
  // server must still be alive afterwards
  const { status: ok } = await get('/api/score');
  assert.equal(ok, 200);
});

/* ================================================== score engine */
test('score: all 5 components present, weights sum to 100', async () => {
  const { body } = await get('/api/score');
  assert.equal(body.components.length, 5);
  const weightSum = body.components.reduce((s, c) => s + c.weight, 0);
  assert.equal(weightSum, 100);
  for (const c of body.components) {
    assert.ok(c.value >= 0 && c.value <= 100, `${c.key} out of 0-100`);
    assert.ok(c.hint, `${c.key} needs a human-readable hint`);
  }
});

test('score: logging harvests monotonically improves consistency component', async () => {
  const beforeC = (await get('/api/score')).body.components.find(c => c.key === 'Season consistency').value;
  await post('/api/harvests', {
    crop: 'beans', season: 'Short Rains 2026', quantity_kg: 500,
    sold_price_per_kg: 110, market: 'Eldoret Main', harvest_date: '2026-07-01',
  });
  const afterC = (await get('/api/score')).body.components.find(c => c.key === 'Season consistency').value;
  assert.ok(afterC >= beforeC, 'a new season must not reduce consistency');
});

test('score: eligibility and offers match the tier rules', async () => {
  const { body } = await get('/api/score');
  if (body.score >= 700) {
    assert.equal(body.tier, 'Prime Harvester');
    assert.equal(body.offers.length, 2);
    assert.ok(body.offers.some(o => o.amount === 50000));
  }
  if (body.score < 480) assert.equal(body.offers.length, 0);
  assert.equal(body.eligible, body.offers.length > 0);
});

/* ================================================== loans */
test('POST /api/loans approves an offer the farmer qualifies for', async () => {
  const score = (await get('/api/score')).body;
  assert.ok(score.eligible, 'demo farmer must be loan-eligible');
  const offer = score.offers[0];
  const { status, body } = await post('/api/loans', { offer: offer.name });
  assert.equal(status, 201);
  assert.equal(body.status, 'approved');
  assert.equal(body.amount, offer.amount);
});

test('POST /api/loans rejects an offer outside the farmer tier with 403', async () => {
  const { status } = await post('/api/loans', { offer: 'Yacht Financing' });
  assert.equal(status, 403);
});

test('GET /api/loans lists the approved loan with terms intact', async () => {
  const { body } = await get('/api/loans');
  assert.ok(body.length >= 1);
  assert.equal(body[0].status, 'approved');
  assert.ok(body[0].rate_pct_month > 0 && body[0].term_months > 0);
  assert.ok(body[0].score_at_application >= 300);
});

test('an active loan lowers the repayment component (risk realism)', async () => {
  const { body } = await get('/api/score');
  const repay = body.components.find(c => c.key === 'Repayment record');
  assert.ok(repay.value < 60, 'active loan should discount repayment below the 60 neutral baseline');
});

/* ================================================== diagnoses */
test('POST + GET /api/diagnoses round-trips a crop scan record', async () => {
  const { status } = await post('/api/diagnoses', {
    crop: 'maize', disease: 'Gray Leaf Spot', confidence: 84, severity: 'medium',
  });
  assert.equal(status, 201);
  const { body } = await get('/api/diagnoses');
  assert.equal(body[0].disease, 'Gray Leaf Spot');
  assert.equal(body[0].confidence, 84);
});

/* ================================================== static & security */
test('serves the SPA shell at /', async () => {
  const res = await fetch(BASE + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /MavunoAI/);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('serves CSS and JS assets with correct MIME types', async () => {
  const css = await fetch(BASE + '/css/style.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(BASE + '/js/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('SPA fallback: unknown routes return the app shell, not 404', async () => {
  const res = await fetch(BASE + '/some/deep/route');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /MavunoAI/);
});

test('security: path traversal cannot escape the public directory', async () => {
  for (const evil of ['/../server.js', '/..%2f..%2fserver.js', '/%2e%2e/server.js']) {
    const res = await fetch(BASE + evil);
    const text = await res.text();
    assert.ok(!text.includes('DatabaseSync'), `server source leaked via ${evil}`);
  }
});

test('unknown API route returns JSON 404', async () => {
  const { status, body } = await get('/api/nope');
  assert.equal(status, 404);
  assert.ok(body.error);
});

test('POST /api/harvests validation: yield exceeding ceiling is rejected with 400', async () => {
  // Ceiling for maize is 3600 kg/acre. Amina has 3.5 acres. Limit = 12600 kg.
  // We send 15000 kg, which exceeds it and should trigger HTTP 400.
  const { status, body } = await post('/api/harvests', {
    crop: 'maize', season: 'Long Rains 2026', quantity_kg: 15000,
    sold_price_per_kg: 48, market: 'Eldoret Main', harvest_date: '2026-07-16',
  });
  assert.equal(status, 400);
  assert.match(body.error, /exceeds realistic agronomic capacity/);
});

test('POST /api/loans/repay clears the active loan status', async () => {
  const scoreBefore = (await get('/api/score')).body;
  const initialRepayVal = scoreBefore.components.find(c => c.key === 'Repayment record').value;

  // Repay the first active loan
  const loans = (await get('/api/loans')).body;
  const activeLoan = loans.find(l => l.status === 'approved');
  assert.ok(activeLoan, 'must find an active loan to repay');

  const { status, body } = await post('/api/loans/repay', { loanId: activeLoan.id });
  assert.equal(status, 200);
  assert.ok(body.success);

  const scoreAfter = (await get('/api/score')).body;
  const afterRepayVal = scoreAfter.components.find(c => c.key === 'Repayment record').value;
  assert.ok(afterRepayVal > initialRepayVal, `repayment score should recover (${initialRepayVal} -> ${afterRepayVal})`);
});

test('GET /api/farmers returns all seeded farmers', async () => {
  const { status, body } = await get('/api/farmers');
  assert.equal(status, 200);
  assert.equal(body.length, 3);
  assert.ok(body.some(f => f.name === 'John Kiprop'));
  assert.ok(body.some(f => f.name === 'Mary Atieno'));
});

/* ================================================== load sanity */
test('handles 50 concurrent dashboard requests without error', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => get('/api/dashboard')));
  for (const r of results) assert.equal(r.status, 200);
});
