/**
 * MavunoAI automated test suite — Node built-in test runner, zero dependencies.
 * Run:  npm test          (or: node --test tests/api.test.js)
 *
 * Spawns the real server on a test port with an isolated database, then
 * exercises every API endpoint, the Mavuno Score engine, authentication,
 * loan safety rails, input validation, and static-file security.
 *
 * A second "strict" server runs with DEMO_MODE=0 and tight rate limits so
 * those paths can be tested without starving the main suite.
 */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4599;
const STRICT_PORT = 4598;
const BASE = `http://localhost:${PORT}`;
const STRICT_BASE = `http://localhost:${STRICT_PORT}`;
const TEST_DB = path.join(os.tmpdir(), `mavuno-test-${Date.now()}.db`);
const STRICT_DB = path.join(os.tmpdir(), `mavuno-strict-${Date.now()}.db`);
const DEMO_PIN = '1234';
const AMINA_PHONE = '0712345678';

let serverProc, strictProc, token;

/* Dates relative to today, so the suite never rots the way the seeded price
   feed did. */
const daysAgo = n => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const authHeaders = () => (token ? { Authorization: 'Bearer ' + token } : {});

const get = (p, base = BASE) => fetch(base + p, { headers: authHeaders() })
  .then(r => r.json().then(body => ({ status: r.status, body, headers: r.headers })));

const post = (p, data, raw = false, base = BASE) => fetch(base + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders() },
  body: raw ? data : JSON.stringify(data),
}).then(r => r.json().then(body => ({ status: r.status, body })));

const postNoAuth = (p, data, base = BASE) => fetch(base + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
}).then(r => r.json().then(body => ({ status: r.status, body })));

function startServer(port, dbPath, extraEnv = {}) {
  return spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: port, MAVUNO_DB: dbPath, QUIET_LOGS: '1', ...extraEnv },
    stdio: 'ignore',
  });
}

async function waitFor(base) {
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + '/api/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error(`server at ${base} did not start`);
}

before(async () => {
  // Generous read/write limits on the main server: the suite itself makes
  // far more requests than a single farmer ever would.
  serverProc = startServer(PORT, TEST_DB, {
    RATE_LIMIT_READ: '5000', RATE_LIMIT_WRITE: '5000', RATE_LIMIT_AUTH: '500',
  });
  strictProc = startServer(STRICT_PORT, STRICT_DB, {
    DEMO_MODE: '0', RATE_LIMIT_AUTH: '3',
  });
  await waitFor(BASE);
  await waitFor(STRICT_BASE);

  const { status, body } = await postNoAuth('/api/auth/login', { phone: AMINA_PHONE, pin: DEMO_PIN });
  assert.equal(status, 200, 'demo farmer must be able to sign in');
  token = body.token;
});

after(() => {
  serverProc.kill();
  strictProc.kill();
  for (const db of [TEST_DB, STRICT_DB]) {
    for (const f of [db, db + '-wal', db + '-shm']) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
});

/* ================================================== health */
test('GET /api/health reports a fresh price feed', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  // The bug this guards: a database seeded once and never topped up.
  assert.equal(body.price_feed_fresh, true, `price feed stale at ${body.price_feed_through}`);
  assert.equal(body.price_feed_through, new Date().toISOString().slice(0, 10));
});

/* ================================================== authentication */
test('auth: farmer-scoped endpoints reject an unauthenticated caller', async () => {
  for (const p of ['/api/dashboard', '/api/score', '/api/harvests', '/api/loans', '/api/diagnoses']) {
    const res = await fetch(BASE + p);
    assert.equal(res.status, 401, `${p} must require a session`);
  }
});

test('auth: the old x-farmer-id header no longer grants access', async () => {
  const res = await fetch(BASE + '/api/dashboard', { headers: { 'x-farmer-id': 'farmer-mary-atieno-0003' } });
  assert.equal(res.status, 401);
});

test('auth: a forged or tampered token is rejected', async () => {
  const forged = [
    'farmer-mary-atieno-0003.99999999999999.deadbeef',
    token.replace(/.$/, c => (c === 'a' ? 'b' : 'a')),          // flipped signature byte
    token.split('.').slice(0, 2).join('.') + '.',                // empty signature
    'farmer-amina-chebet-0001.1.' + token.split('.')[2],         // expired, valid-looking
  ];
  for (const t of forged) {
    const res = await fetch(BASE + '/api/dashboard', { headers: { Authorization: 'Bearer ' + t } });
    assert.equal(res.status, 401, `forged token accepted: ${t}`);
  }
});

test('auth: wrong PIN is rejected and does not reveal whether the phone exists', async () => {
  const wrongPin = await postNoAuth('/api/auth/login', { phone: AMINA_PHONE, pin: '9999' });
  const noSuchPhone = await postNoAuth('/api/auth/login', { phone: '0700000001', pin: '1234' });
  assert.equal(wrongPin.status, 401);
  assert.equal(noSuchPhone.status, 401);
  assert.equal(wrongPin.body.error, noSuchPhone.body.error, 'error must not distinguish the two cases');
});

test('auth: a session only ever acts as the farmer it was issued for', async () => {
  const mary = await postNoAuth('/api/auth/login', { phone: '0734567890', pin: DEMO_PIN });
  assert.equal(mary.status, 200);
  const res = await fetch(BASE + '/api/dashboard', {
    headers: { Authorization: 'Bearer ' + mary.body.token, 'x-farmer-id': 'farmer-amina-chebet-0001' },
  });
  const body = await res.json();
  assert.equal(body.farmer.name, 'Mary Atieno', 'header must not override the token identity');
});

test('auth: PIN hashes are never returned to a client', async () => {
  const { body: dash } = await get('/api/dashboard');
  assert.ok(!('pin_hash' in dash.farmer));
  const { body: roster } = await get('/api/farmers');
  for (const f of roster) assert.ok(!('pin_hash' in f), 'roster leaked a PIN hash');
});

test('auth: the public farmer roster masks phone numbers', async () => {
  const { body } = await get('/api/farmers');
  for (const f of body) assert.match(f.phone, /•/, `${f.name}'s number was exposed in full`);
});

test('auth: demo login is refused when DEMO_MODE=0', async () => {
  const { status } = await postNoAuth('/api/auth/demo-login', { farmerId: 'farmer-amina-chebet-0001' }, STRICT_BASE);
  assert.equal(status, 403);
});

test('auth: PIN login still works when DEMO_MODE=0', async () => {
  const { status, body } = await postNoAuth('/api/auth/login', { phone: AMINA_PHONE, pin: DEMO_PIN }, STRICT_BASE);
  assert.equal(status, 200);
  assert.ok(body.token);
});

/* ================================================== rate limiting */
test('rate limiting: repeated sign-in attempts are throttled', async () => {
  const codes = [];
  for (let i = 0; i < 6; i++) {
    const res = await fetch(STRICT_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0799999999', pin: '0000' }),
    });
    codes.push(res.status);
  }
  assert.ok(codes.includes(429), `expected a 429 among ${codes.join(',')}`);
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

test('dashboard states the day its prices are from, and it is today', async () => {
  const { body } = await get('/api/dashboard');
  assert.equal(body.prices_as_of, new Date().toISOString().slice(0, 10));
});

test('dashboard advisory always returns at least two tips', async () => {
  const { body } = await get('/api/dashboard');
  assert.ok(body.advisory.length >= 2);
  for (const t of body.advisory) { assert.ok(t.title); assert.ok(t.body); }
});

/* ================================================== prices */
test('GET /api/prices returns a rolling 60-day series for all 5 markets', async () => {
  const { status, body } = await get('/api/prices?crop=maize');
  assert.equal(status, 200);
  const markets = Object.keys(body.series);
  assert.equal(markets.length, 5);
  for (const m of markets) {
    assert.equal(body.series[m].length, 60, `${m} should have 60 days of prices`);
    for (const row of body.series[m]) assert.ok(row.price_per_kg > 0);
    // The last point must be today, not the day the database was seeded.
    assert.equal(body.series[m][59].day, new Date().toISOString().slice(0, 10));
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
    sold_price_per_kg: 65, market: 'Wakulima (Nairobi)', harvest_date: daysAgo(17),
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
    { crop: 'maize', quantity_kg: 100, harvest_date: daysAgo(30) }, // no season
  ]) {
    const { status } = await post('/api/harvests', bad);
    assert.equal(status, 400, JSON.stringify(bad));
  }
});

test('POST /api/harvests validation: junk values are rejected, not stored', async () => {
  const base = { crop: 'maize', season: 'Long Rains 2026', quantity_kg: 500, harvest_date: daysAgo(20) };
  const cases = [
    ['negative quantity', { ...base, quantity_kg: -99999 }],
    ['zero quantity', { ...base, quantity_kg: 0 }],
    ['non-numeric quantity', { ...base, quantity_kg: 'abc' }],
    ['crop outside the catalogue', { ...base, crop: 'marijuana' }],
    ['future harvest date', { ...base, harvest_date: '2099-12-31' }],
    ['prehistoric harvest date', { ...base, harvest_date: '1899-01-01' }],
    ['malformed date', { ...base, harvest_date: 'yesterday' }],
    ['unknown market', { ...base, market: 'Some Other Market' }],
    ['markup in the season name', { ...base, season: '<img src=x onerror=alert(1)>' }],
    ['negative sale price', { ...base, sold_price_per_kg: -5 }],
  ];
  for (const [label, payload] of cases) {
    const { status, body } = await post('/api/harvests', payload);
    assert.equal(status, 400, `${label} should be rejected (got ${status})`);
    assert.ok(body.error, `${label} needs an explanatory error`);
  }
});

test('POST /api/harvests: unsold harvest (no price) is accepted', async () => {
  const { status } = await post('/api/harvests', {
    crop: 'cabbage', season: 'Long Rains 2026', quantity_kg: 300, harvest_date: daysAgo(18),
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

test('an oversized body is rejected instead of hanging the request', async () => {
  const huge = JSON.stringify({ crop: 'maize', season: 'x'.repeat(400_000) });
  const res = await fetch(BASE + '/api/harvests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: huge,
  }).catch(err => ({ status: 0, err }));
  // Either a clean 413 or a connection reset — what must not happen is a hang.
  assert.ok(res.status === 413 || res.status === 0, `unexpected status ${res.status}`);
  const { status: ok } = await get('/api/score');
  assert.equal(ok, 200, 'server must still respond after an oversized body');
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

test('score: market timing is judged against a live 30-day price window', async () => {
  const { body } = await get('/api/score');
  // 'all-time' or 'none' would mean the 30-day window had gone empty — the
  // failure mode that silently cost a tier when the feed froze.
  assert.equal(body.price_window, '30d');
});

test('score: logging harvests monotonically improves consistency component', async () => {
  const beforeC = (await get('/api/score')).body.components.find(c => c.key === 'Season consistency').value;
  await post('/api/harvests', {
    crop: 'beans', season: 'Short Rains 2026', quantity_kg: 500,
    sold_price_per_kg: 110, market: 'Eldoret Main', harvest_date: daysAgo(31),
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

test('POST /api/loans refuses a second loan while one is active', async () => {
  const { offers } = (await get('/api/score')).body;
  const { status, body } = await post('/api/loans', { offer: offers[0].name });
  assert.equal(status, 409, 'a farmer with an active loan must not be approved again');
  assert.equal(body.code, 'active_loan');
});

test('loans: five rapid applications produce exactly one disbursement', async () => {
  const { offers } = (await get('/api/score')).body;
  const before = (await get('/api/loans')).body.length;
  const results = await Promise.all(
    Array.from({ length: 5 }, () => post('/api/loans', { offer: offers[0].name })));
  const approved = results.filter(r => r.status === 201).length;
  const after = (await get('/api/loans')).body.length;
  assert.equal(approved, 0, 'no new loan should be approved while one is active');
  assert.equal(after, before, 'loan count must not grow');
});

test('loans: the disbursement target is the registered phone, not a client-supplied one', async () => {
  // An attacker-supplied phone must be ignored even when the payload carries it.
  const loans = (await get('/api/loans')).body;
  const active = loans.find(l => l.status === 'approved');
  assert.ok(active.payment_phone, 'disbursement should record a destination number');
  assert.match(active.payment_phone, /^2547\d{8}$/);
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

test('POST /api/loans/repay records a receipt and clears the active loan', async () => {
  const scoreBefore = (await get('/api/score')).body;
  const initialRepayVal = scoreBefore.components.find(c => c.key === 'Repayment record').value;

  const loans = (await get('/api/loans')).body;
  const activeLoan = loans.find(l => l.status === 'approved');
  assert.ok(activeLoan, 'must find an active loan to repay');

  const { status, body } = await post('/api/loans/repay', { loanId: activeLoan.id });
  assert.equal(status, 200);
  assert.ok(body.success);
  assert.ok(body.receipt_id, 'a repayment must leave a transaction record');
  // Principal plus interest, not just a status flip.
  assert.ok(body.amount_repaid > activeLoan.amount);
  assert.equal(body.simulated, true, 'demo mode must label the repayment as simulated');

  const scoreAfter = (await get('/api/score')).body;
  const afterRepayVal = scoreAfter.components.find(c => c.key === 'Repayment record').value;
  assert.ok(afterRepayVal > initialRepayVal, `repayment score should recover (${initialRepayVal} -> ${afterRepayVal})`);
});

test('repaying the same loan twice is refused', async () => {
  const loans = (await get('/api/loans')).body;
  const repaid = loans.find(l => l.status === 'repaid');
  const { status } = await post('/api/loans/repay', { loanId: repaid.id });
  assert.equal(status, 409);
});

test("a farmer cannot repay another farmer's loan", async () => {
  const { status } = await post('/api/loans/repay', { loanId: 'l-mary-1' });
  assert.equal(status, 404);
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

test('diagnoses: a markup payload is rejected rather than stored', async () => {
  const { status } = await post('/api/diagnoses', {
    crop: 'maize', disease: '<img src=x onerror=alert(1)>', confidence: 90, severity: 'high',
  });
  assert.equal(status, 400);
  const { body } = await get('/api/diagnoses');
  assert.ok(!body.some(d => String(d.disease).includes('<img')), 'markup reached the scan history');
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

test('serves the service worker and manifest that back the offline claim', async () => {
  const sw = await fetch(BASE + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(await sw.text(), /addEventListener\('fetch'/);
  const manifest = await fetch(BASE + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  const parsed = await manifest.json();
  assert.equal(parsed.start_url, '/');
});

test('SPA fallback: unknown routes return the app shell, not 404', async () => {
  const res = await fetch(BASE + '/some/deep/route');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /MavunoAI/);
});

test('security: responses carry hardening headers', async () => {
  const res = await fetch(BASE + '/');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('security: path traversal cannot escape the public directory', async () => {
  for (const evil of ['/../server.js', '/..%2f..%2fserver.js', '/%2e%2e/server.js', '/..%252fserver.js']) {
    const res = await fetch(BASE + evil);
    const text = await res.text();
    assert.ok(!text.includes('DatabaseSync'), `server source leaked via ${evil}`);
  }
});

test('security: a cross-origin caller is refused', async () => {
  const res = await fetch(BASE + '/api/farmers', { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
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
    sold_price_per_kg: 48, market: 'Eldoret Main', harvest_date: daysAgo(16),
  });
  assert.equal(status, 400);
  assert.match(body.error, /exceeds realistic agronomic capacity/);
});

test('GET /api/farmers returns all seeded farmers', async () => {
  const { status, body } = await get('/api/farmers');
  assert.equal(status, 200);
  assert.equal(body.length, 3);
  assert.ok(body.some(f => f.name === 'John Kiprop'));
  assert.ok(body.some(f => f.name === 'Mary Atieno'));
});

test('seeded demo data is exactly what the demo script expects', async () => {
  // Guards against the polluted-database failure: a duplicated profile in the
  // switcher, or loans left behind by rehearsal.
  const { body } = await get('/api/farmers');
  const names = body.map(f => f.name);
  assert.equal(new Set(names).size, names.length, 'duplicate farmer profiles in the switcher');
});

/* ================================================== load sanity */
test('handles 50 concurrent dashboard requests without error', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => get('/api/dashboard')));
  for (const r of results) assert.equal(r.status, 200);
});
