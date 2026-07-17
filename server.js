/**
 * MavunoAI — AI-powered farm intelligence & agri-credit platform
 * Zero-dependency server: Node built-ins only (node:http + node:sqlite).
 * Run:  node server.js   →  http://localhost:4500
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 4500;
const PUBLIC_DIR = path.join(__dirname, 'public');
const db = new DatabaseSync(process.env.MAVUNO_DB || path.join(__dirname, 'mavuno.db'));

/* ---------------------------------------------------------------- schema */
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS farmers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    county TEXT,
    farm_size_acres REAL,
    joined_at TEXT
  );
  CREATE TABLE IF NOT EXISTS harvests (
    id TEXT PRIMARY KEY,
    farmer_id TEXT NOT NULL,
    crop TEXT NOT NULL,
    season TEXT NOT NULL,
    quantity_kg REAL NOT NULL,
    sold_price_per_kg REAL,
    market TEXT,
    harvest_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY,
    farmer_id TEXT,
    crop TEXT,
    disease TEXT,
    confidence REAL,
    severity TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    farmer_id TEXT NOT NULL,
    amount REAL NOT NULL,
    rate_pct_month REAL NOT NULL,
    term_months INTEGER NOT NULL,
    purpose TEXT,
    status TEXT DEFAULT 'approved',
    score_at_application INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS prices (
    crop TEXT NOT NULL,
    market TEXT NOT NULL,
    day TEXT NOT NULL,
    price_per_kg REAL NOT NULL,
    PRIMARY KEY (crop, market, day)
  );
`);

/* ------------------------------------------------------------- seed data */
const CROPS = ['maize', 'beans', 'potatoes', 'tomatoes', 'cabbage'];
const MARKETS = ['Wakulima (Nairobi)', 'Eldoret Main', 'Nakuru Top', 'Kibuye (Kisumu)', 'Kongowea (Mombasa)'];
const BASE_PRICE = { maize: 46, beans: 108, potatoes: 34, tomatoes: 62, cabbage: 24 };

function seedPrices() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM prices').get().c;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO prices (crop, market, day, price_per_kg) VALUES (?,?,?,?)');
  const today = new Date();
  for (const crop of CROPS) {
    for (const market of MARKETS) {
      // deterministic-ish random walk so every market has its own personality
      let price = BASE_PRICE[crop] * (0.9 + Math.random() * 0.25);
      const drift = (Math.random() - 0.42) * 0.15; // slight upward bias
      for (let d = 59; d >= 0; d--) {
        const day = new Date(today);
        day.setDate(day.getDate() - d);
        price = Math.max(BASE_PRICE[crop] * 0.55, price * (1 + drift / 60 + (Math.random() - 0.5) * 0.045));
        insert.run(crop, market, day.toISOString().slice(0, 10), Math.round(price * 100) / 100);
      }
    }
  }
}

const AMINA_ID = 'farmer-amina-chebet-0001';
const JOHN_ID = 'farmer-john-kiprop-0002';
const MARY_ID = 'farmer-mary-atieno-0003';

function seedFarmers() {
  const insertFarmer = db.prepare('INSERT OR IGNORE INTO farmers (id, name, phone, county, farm_size_acres, joined_at) VALUES (?,?,?,?,?,?)');
  const insertHarvest = db.prepare(`INSERT OR IGNORE INTO harvests
    (id, farmer_id, crop, season, quantity_kg, sold_price_per_kg, market, harvest_date)
    VALUES (?,?,?,?,?,?,?,?)`);
  const insertDiagnosis = db.prepare('INSERT OR IGNORE INTO diagnoses (id, farmer_id, crop, disease, confidence, severity) VALUES (?,?,?,?,?,?)');
  const insertLoan = db.prepare('INSERT OR IGNORE INTO loans (id, farmer_id, amount, rate_pct_month, term_months, purpose, score_at_application, status) VALUES (?,?,?,?,?,?,?,?)');

  // 1. Amina Chebet
  insertFarmer.run(AMINA_ID, 'Amina Chebet', '+254 712 345 678', 'Uasin Gishu', 3.5, '2024-03-11');
  const aminaHarvests = [
    ['h-amina-1', 'maize',    'Long Rains 2024',  1450, 41,  'Eldoret Main',      '2024-08-20'],
    ['h-amina-2', 'beans',    'Long Rains 2024',   380, 98,  'Eldoret Main',      '2024-08-28'],
    ['h-amina-3', 'potatoes', 'Short Rains 2024', 2100, 30,  'Nakuru Top',        '2025-01-15'],
    ['h-amina-4', 'maize',    'Short Rains 2024', 1620, 44,  'Eldoret Main',      '2025-01-30'],
    ['h-amina-5', 'maize',    'Long Rains 2025',  1880, 47,  'Wakulima (Nairobi)','2025-08-18'],
    ['h-amina-6', 'beans',    'Long Rains 2025',   460, 112, 'Eldoret Main',      '2025-08-25'],
    ['h-amina-7', 'potatoes', 'Short Rains 2025', 2400, 36,  'Nakuru Top',        '2026-01-20'],
  ];
  for (const [hid, crop, season, qty, price, market, date] of aminaHarvests) {
    insertHarvest.run(hid, AMINA_ID, crop, season, qty, price, market, date);
  }

  // 2. John Kiprop (Nakuru, 2.0 acres) - Moderate history
  insertFarmer.run(JOHN_ID, 'John Kiprop', '+254 723 456 789', 'Nakuru', 2.0, '2025-06-15');
  const johnHarvests = [
    ['h-john-1', 'maize', 'Long Rains 2025', 850, 45, 'Nakuru Top', '2025-08-22'],
    ['h-john-2', 'potatoes', 'Short Rains 2025', 1200, 32, 'Nakuru Top', '2026-01-18'],
  ];
  for (const [hid, crop, season, qty, price, market, date] of johnHarvests) {
    insertHarvest.run(hid, JOHN_ID, crop, season, qty, price, market, date);
  }

  // 3. Mary Atieno (Kisumu, 1.5 acres) - Low history, active loan, scan history
  insertFarmer.run(MARY_ID, 'Mary Atieno', '+254 734 567 890', 'Kisumu', 1.5, '2025-09-01');
  const maryHarvests = [
    ['h-mary-1', 'tomatoes', 'Short Rains 2025', 350, 58, 'Kibuye (Kisumu)', '2026-01-10'],
  ];
  for (const [hid, crop, season, qty, price, market, date] of maryHarvests) {
    insertHarvest.run(hid, MARY_ID, crop, season, qty, price, market, date);
  }
  insertDiagnosis.run('d-mary-1', MARY_ID, 'tomatoes', 'Late Blight', 0.89, 'high');
  insertLoan.run('l-mary-1', MARY_ID, 10000, 2.0, 3, 'Starter Advance', 495, 'approved');

  return AMINA_ID;
}

seedPrices();
const DEMO_FARMER_ID = seedFarmers();

/* --------------------------------------------------------------- weather */
/* Simulated forecast feed — swap generateWeather() for a live OpenWeather
   call in production; the response shape stays identical. */
function generateWeather() {
  const icons = ['sun', 'sun-cloud', 'cloud', 'rain', 'storm'];
  const labels = { sun: 'Sunny', 'sun-cloud': 'Partly cloudy', cloud: 'Overcast', rain: 'Rain showers', storm: 'Thunderstorms' };
  const days = [];
  const now = new Date();
  // July in Uasin Gishu: cool, wet-ish tail of long rains
  const pattern = ['sun-cloud', 'rain', 'rain', 'sun-cloud', 'sun'];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const icon = pattern[i % pattern.length];
    days.push({
      day: i === 0 ? 'Today' : d.toLocaleDateString('en-KE', { weekday: 'short' }),
      icon,
      label: labels[icon],
      high: 21 + Math.round(Math.sin(i * 1.3) * 2),
      low: 10 + Math.round(Math.cos(i) * 2),
      rain_mm: icon === 'rain' ? 8 + i * 3 : icon === 'storm' ? 22 : 0,
    });
  }
  return days;
}

/* --------------------------------------------------------- mavuno score  */
function computeScore(farmerId) {
  const harvests = db.prepare('SELECT * FROM harvests WHERE farmer_id = ? ORDER BY harvest_date').all(farmerId);
  const loans = db.prepare("SELECT * FROM loans WHERE farmer_id = ?").all(farmerId);

  if (harvests.length === 0) {
    return { score: 0, tier: 'No history', components: [], eligible: false, offers: [] };
  }

  // 1. Consistency (0–100): distinct seasons logged
  const seasons = new Set(harvests.map(h => h.season));
  const consistency = Math.min(100, seasons.size * 22);

  // 2. Yield trend (0–100): per-crop growth so a small tomato harvest is never
  // punished for weighing less than a maize harvest. Crops with a single
  // harvest are neutral; the rest compare later-half vs earlier-half averages.
  let yieldTrend = 50;
  const byCrop = {};
  for (const h of harvests) (byCrop[h.crop] ??= []).push(h.quantity_kg); // already date-ordered
  const growths = [];
  for (const qtys of Object.values(byCrop)) {
    if (qtys.length < 2) continue;
    const mid = Math.floor(qtys.length / 2);
    const early = qtys.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const late = qtys.slice(mid).reduce((a, b) => a + b, 0) / (qtys.length - mid);
    growths.push((late - early) / early);
  }
  if (growths.length) {
    const g = growths.reduce((a, b) => a + b, 0) / growths.length;
    yieldTrend = Math.max(0, Math.min(100, 50 + g * 160));
  }

  // 3. Diversification (0–100): distinct crops
  const cropSet = new Set(harvests.map(h => h.crop));
  const diversification = Math.min(100, cropSet.size * 32);

  // 4. Market timing (0–100): share of sales at/above that crop's current market median
  let timed = 0, priced = 0;
  for (const h of harvests) {
    if (!h.sold_price_per_kg) continue;
    priced++;
    const med = db.prepare(
      `SELECT AVG(price_per_kg) AS avg FROM prices WHERE crop = ?
       AND day >= date('now','-30 day')`).get(h.crop);
    if (med && med.avg && h.sold_price_per_kg >= med.avg * 0.9) timed++;
  }
  const timing = priced ? Math.round((timed / priced) * 100) : 50;

  // 5. Repayment (0–100): starts neutral, boosted by repaid loans
  const repaid = loans.filter(l => l.status === 'repaid').length;
  const active = loans.filter(l => l.status === 'approved').length;
  const repayment = Math.min(100, 60 + repaid * 20 - active * 5);

  const weighted =
    consistency * 0.25 + yieldTrend * 0.20 + diversification * 0.15 +
    timing * 0.20 + repayment * 0.20;

  const score = Math.round(300 + (weighted / 100) * 550); // 300–850 band

  let tier, offers = [];
  if (score >= 700) {
    tier = 'Prime Harvester';
    offers = [
      { name: 'Inputs Advance', amount: 50000, rate: 1.2, term: 6, desc: 'Certified seed + fertiliser for next season' },
      { name: 'Equipment Boost', amount: 120000, rate: 1.5, term: 12, desc: 'Water pump, drip lines or storage silo' },
    ];
  } else if (score >= 600) {
    tier = 'Growing Strong';
    offers = [
      { name: 'Inputs Advance', amount: 25000, rate: 1.6, term: 6, desc: 'Certified seed + fertiliser for next season' },
      { name: 'Harvest Bridge', amount: 40000, rate: 1.8, term: 4, desc: 'Cash now, repay after your next sale' },
    ];
  } else if (score >= 480) {
    tier = 'Seedling';
    offers = [{ name: 'Starter Advance', amount: 10000, rate: 2.0, term: 3, desc: 'Small inputs loan to build your record' }];
  } else {
    tier = 'Building History';
  }

  return {
    score, tier,
    eligible: offers.length > 0,
    offers,
    components: [
      { key: 'Season consistency', value: Math.round(consistency), weight: 25, hint: `${seasons.size} seasons logged` },
      { key: 'Yield trend', value: Math.round(yieldTrend), weight: 20, hint: yieldTrend >= 55 ? 'Yields improving' : 'Keep improving yields' },
      { key: 'Crop diversification', value: Math.round(diversification), weight: 15, hint: `${cropSet.size} crops grown` },
      { key: 'Market timing', value: timing, weight: 20, hint: `${timed}/${priced} sales at fair price` },
      { key: 'Repayment record', value: Math.round(repayment), weight: 20, hint: repaid ? `${repaid} loans repaid` : 'No defaults' },
    ],
  };
}

/* -------------------------------------------------------------- helpers */
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })); } });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json',
};

/* ---------------------------------------------------------------- routes */
async function handleApi(req, res, url) {
  const farmerId = req.headers['x-farmer-id'] || DEMO_FARMER_ID;

  if (req.method === 'GET' && url.pathname === '/api/farmers') {
    return json(res, 200, db.prepare('SELECT * FROM farmers ORDER BY name').all());
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const farmer = db.prepare('SELECT * FROM farmers WHERE id = ?').get(farmerId);
    const harvests = db.prepare('SELECT * FROM harvests WHERE farmer_id = ? ORDER BY harvest_date DESC').all(farmerId);
    const totalKg = harvests.reduce((s, h) => s + h.quantity_kg, 0);
    const totalRevenue = harvests.reduce((s, h) => s + h.quantity_kg * (h.sold_price_per_kg || 0), 0);
    const { score, tier } = computeScore(farmerId);
    const latestPrices = CROPS.map(crop => {
      const rows = db.prepare(
        `SELECT day, AVG(price_per_kg) AS p FROM prices WHERE crop = ? GROUP BY day ORDER BY day DESC LIMIT 8`
      ).all(crop);
      const today = rows[0]?.p || 0;
      const weekAgo = rows[rows.length - 1]?.p || today;
      return { crop, price: Math.round(today * 10) / 10, change_pct: weekAgo ? Math.round(((today - weekAgo) / weekAgo) * 1000) / 10 : 0 };
    });
    return json(res, 200, {
      farmer, score, tier, totalKg, totalRevenue,
      harvestCount: harvests.length,
      recentHarvests: harvests.slice(0, 3),
      weather: generateWeather(),
      prices: latestPrices,
      advisory: buildAdvisory(),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/prices') {
    const crop = (url.searchParams.get('crop') || 'maize').toLowerCase();
    if (!CROPS.includes(crop)) return json(res, 400, { error: 'unknown crop' });
    const series = {};
    for (const market of MARKETS) {
      series[market] = db.prepare(
        'SELECT day, price_per_kg FROM prices WHERE crop = ? AND market = ? ORDER BY day'
      ).all(crop, market);
    }
    const best = MARKETS.map(m => ({ market: m, price: series[m][series[m].length - 1].price_per_kg }))
      .sort((a, b) => b.price - a.price);
    return json(res, 200, { crop, series, best, crops: CROPS });
  }

  if (req.method === 'GET' && url.pathname === '/api/harvests') {
    const rows = db.prepare('SELECT * FROM harvests WHERE farmer_id = ? ORDER BY harvest_date DESC').all(farmerId);
    return json(res, 200, rows);
  }

  if (req.method === 'POST' && url.pathname === '/api/harvests') {
    const b = await readBody(req);
    if (!b.crop || !b.quantity_kg || !b.harvest_date || !b.season) {
      return json(res, 400, { error: 'crop, season, quantity_kg and harvest_date are required' });
    }

    const crop = String(b.crop).toLowerCase();
    const qty = Number(b.quantity_kg);

    // Yield validation ceiling check per acre
    const cropCeilings = {
      maize: 3600,
      beans: 1200,
      potatoes: 12000,
      tomatoes: 18000,
      cabbage: 20000,
    };

    if (cropCeilings[crop]) {
      const farmer = db.prepare('SELECT farm_size_acres FROM farmers WHERE id = ?').get(farmerId);
      if (farmer) {
        const yieldPerAcre = qty / farmer.farm_size_acres;
        if (yieldPerAcre > cropCeilings[crop]) {
          return json(res, 400, {
            error: `Yield quantity (${qty.toLocaleString()} kg) exceeds realistic agronomic capacity per acre for ${crop} (max ${cropCeilings[crop].toLocaleString()} kg/acre, total max ${(cropCeilings[crop] * farmer.farm_size_acres).toLocaleString()} kg for your ${farmer.farm_size_acres} acres).`
          });
        }
      }
    }

    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO harvests (id, farmer_id, crop, season, quantity_kg, sold_price_per_kg, market, harvest_date)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, farmerId, crop, b.season, qty,
           b.sold_price_per_kg ? Number(b.sold_price_per_kg) : null, b.market || null, b.harvest_date);
    return json(res, 201, { id, score: computeScore(farmerId).score });
  }

  if (req.method === 'GET' && url.pathname === '/api/score') {
    return json(res, 200, computeScore(farmerId));
  }

  if (req.method === 'POST' && url.pathname === '/api/loans') {
    const b = await readBody(req);
    const s = computeScore(farmerId);
    const offer = s.offers.find(o => o.name === b.offer);
    if (!offer) return json(res, 403, { error: 'Not eligible for this offer' });
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO loans (id, farmer_id, amount, rate_pct_month, term_months, purpose, score_at_application)
                VALUES (?,?,?,?,?,?,?)`)
      .run(id, farmerId, offer.amount, offer.rate, offer.term, offer.name, s.score);
    return json(res, 201, { id, ...offer, status: 'approved' });
  }

  if (req.method === 'POST' && url.pathname === '/api/loans/repay') {
    const b = await readBody(req);
    if (!b.loanId) return json(res, 400, { error: 'loanId is required' });
    const stmt = db.prepare('UPDATE loans SET status = ? WHERE id = ? AND farmer_id = ?');
    const result = stmt.run('repaid', b.loanId, farmerId);
    if (result.changes === 0) {
      return json(res, 404, { error: 'Loan not found or does not belong to this profile' });
    }
    return json(res, 200, { success: true, score: computeScore(farmerId).score });
  }

  if (req.method === 'GET' && url.pathname === '/api/loans') {
    return json(res, 200, db.prepare('SELECT * FROM loans WHERE farmer_id = ? ORDER BY created_at DESC').all(farmerId));
  }

  if (req.method === 'POST' && url.pathname === '/api/diagnoses') {
    const b = await readBody(req);
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO diagnoses (id, farmer_id, crop, disease, confidence, severity) VALUES (?,?,?,?,?,?)')
      .run(id, farmerId, b.crop || null, b.disease || null, b.confidence || null, b.severity || null);
    return json(res, 201, { id });
  }

  if (req.method === 'GET' && url.pathname === '/api/diagnoses') {
    return json(res, 200, db.prepare('SELECT * FROM diagnoses WHERE farmer_id = ? ORDER BY created_at DESC LIMIT 10').all(farmerId));
  }

  return json(res, 404, { error: 'Not found' });
}

function buildAdvisory() {
  const month = new Date().getMonth(); // 0-based
  const tips = [];
  if (month >= 5 && month <= 8) { // Jun–Sep: long-rains growing/harvest window in Rift Valley
    tips.push({ icon: 'leaf', title: 'Top-dress your maize', body: 'Long-rains maize is at knee height — apply CAN 26% at 50kg/acre before the next rain.' });
    tips.push({ icon: 'shield', title: 'Scout for fall armyworm', body: 'Check funnels of 20 plants per acre at dawn, twice a week. Early detection cuts losses by 60%.' });
  } else if (month >= 1 && month <= 3) {
    tips.push({ icon: 'seed', title: 'Prepare for long rains', body: 'Buy certified seed early — H6213 and DK8031 do well in Uasin Gishu. Dry-plant before onset.' });
  } else {
    tips.push({ icon: 'store', title: 'Store smart, sell later', body: 'Prices typically rise 15–25% within 3 months of harvest. Use hermetic bags to avoid weevils.' });
  }
  tips.push({ icon: 'rain', title: 'Rain expected this week', body: 'Hold off spraying fungicide until a 6-hour dry window is forecast.' });
  return tips;
}

/* ---------------------------------------------------------------- server */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    // static files
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC_DIR, filePath);
    if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(full, (err, data) => {
      if (err) {
        // SPA fallback
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (err) {
    if (err.statusCode === 400) return json(res, 400, { error: err.message });
    console.error(err);
    json(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  🌾 MavunoAI running →  http://localhost:${PORT}\n`);
});
