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

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = process.env.PORT || 4500;
const PUBLIC_DIR = path.join(__dirname, 'public');

/* Signing key for session tokens. Ephemeral unless SESSION_SECRET is set,
   which is the safe default: restarting the server invalidates old tokens. */
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MINUTES || 120) * 60_000;
const PAYHERO_TIMEOUT_MS = Number(process.env.PAYHERO_TIMEOUT_MS || 15_000);
/* Ceiling on what one farmer can be disbursed in a rolling 24 h, whatever
   their tier. Guards against a bug or an attacker draining the wallet. */
const DAILY_DISBURSEMENT_CAP = Number(process.env.DAILY_DISBURSEMENT_CAP || 150_000);
const PRICE_HISTORY_DAYS = 60;

const db = new DatabaseSync(process.env.MAVUNO_DB || path.join(__dirname, 'mavuno.db'));

/* ---------------------------------------------------------------- schema */
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS farmers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    county TEXT,
    farm_size_acres REAL,
    joined_at TEXT,
    pin_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS harvests (
    id TEXT PRIMARY KEY,
    farmer_id TEXT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
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
    farmer_id TEXT REFERENCES farmers(id) ON DELETE CASCADE,
    crop TEXT,
    disease TEXT,
    confidence REAL,
    severity TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    farmer_id TEXT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    rate_pct_month REAL NOT NULL,
    term_months INTEGER NOT NULL,
    purpose TEXT,
    status TEXT DEFAULT 'approved',
    score_at_application INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    loan_id TEXT,
    farmer_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'disbursement',
    external_reference TEXT NOT NULL,
    phone_number TEXT,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    merchant_reference TEXT,
    checkout_request_id TEXT,
    conversation_id TEXT,
    response_payload TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS prices (
    crop TEXT NOT NULL,
    market TEXT NOT NULL,
    day TEXT NOT NULL,
    price_per_kg REAL NOT NULL,
    PRIMARY KEY (crop, market, day)
  );
  /* Every state-changing thing an administrator does lands here. No foreign
     key on admin_id: the trail has to outlive the account that wrote it. */
  CREATE TABLE IF NOT EXISTS admin_actions (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    admin_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    target_label TEXT,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  /* Advisories an administrator broadcasts to farmers. county NULL = everyone. */
  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    county TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_harvests_farmer ON harvests(farmer_id, harvest_date DESC);
  CREATE INDEX IF NOT EXISTS idx_loans_farmer ON loans(farmer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_diagnoses_farmer ON diagnoses(farmer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_loan ON payment_transactions(loan_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_farmer ON payment_transactions(farmer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_reference ON payment_transactions(external_reference);
  CREATE INDEX IF NOT EXISTS idx_prices_crop_day ON prices(crop, day);
  CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, created_at DESC);
`);

/* Databases created before these columns existed still need them. */
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing('farmers', 'pin_hash', 'TEXT');
addColumnIfMissing('payment_transactions', 'direction', "TEXT NOT NULL DEFAULT 'disbursement'");
/* One accounts table, two kinds of account. Everything a farmer sees is scoped
   to their own id; role = 'admin' is what unlocks the platform-wide views. */
addColumnIfMissing('farmers', 'role', "TEXT NOT NULL DEFAULT 'farmer'");
addColumnIfMissing('farmers', 'status', "TEXT NOT NULL DEFAULT 'active'");

/* Orphan rows can only exist in databases written before foreign keys were
   enforced — they are what made loans point at a farmer nobody could see. */
function sweepOrphans() {
  const swept = {};
  for (const table of ['harvests', 'loans', 'diagnoses']) {
    const { changes } = db.prepare(
      `DELETE FROM ${table} WHERE farmer_id IS NOT NULL
       AND farmer_id NOT IN (SELECT id FROM farmers)`).run();
    if (changes) swept[table] = changes;
  }
  if (Object.keys(swept).length) console.warn('  ⚠ removed orphan rows:', swept);
}
sweepOrphans();

/* ------------------------------------------------------------- seed data */
const CROPS = ['maize', 'beans', 'potatoes', 'tomatoes', 'cabbage'];
const MARKETS = ['Wakulima (Nairobi)', 'Eldoret Main', 'Nakuru Top', 'Kibuye (Kisumu)', 'Kongowea (Mombasa)'];
const BASE_PRICE = { maize: 46, beans: 108, potatoes: 34, tomatoes: 62, cabbage: 24 };

const isoDay = d => d.toISOString().slice(0, 10);
const dayString = offsetDays => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return isoDay(d);
};

/* Tops the price feed up to today on every boot, continuing each market's
   own random walk from its last stored price. The old all-or-nothing guard
   (`if (count > 0) return`) meant a database seeded once stayed frozen on
   that day forever — which silently emptied the 30-day market-timing window
   in computeScore and froze the "Today's prices" card in the past. */
function seedPrices() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO prices (crop, market, day, price_per_kg) VALUES (?,?,?,?)');
  const lastRow = db.prepare('SELECT crop, market, MAX(day) AS day, price_per_kg FROM prices GROUP BY crop, market');
  const known = new Map(lastRow.all().map(r => [`${r.crop}|${r.market}`, r]));
  const today = isoDay(new Date());
  let added = 0;

  for (const crop of CROPS) {
    for (const market of MARKETS) {
      const last = known.get(`${crop}|${market}`);
      // Each market keeps its own personality: a starting level and a drift.
      let price = last ? last.price_per_kg : BASE_PRICE[crop] * (0.9 + Math.random() * 0.25);
      const drift = (Math.random() - 0.42) * 0.15; // slight upward bias

      // Days still missing: everything after the last stored day, or a full
      // history window on a fresh database.
      const startOffset = last
        ? Math.min(PRICE_HISTORY_DAYS, Math.round((Date.parse(today) - Date.parse(last.day)) / 86_400_000)) - 1
        : PRICE_HISTORY_DAYS - 1;

      for (let d = startOffset; d >= 0; d--) {
        const day = dayString(-d);
        if (day > today) continue;
        price = Math.max(BASE_PRICE[crop] * 0.55, price * (1 + drift / PRICE_HISTORY_DAYS + (Math.random() - 0.5) * 0.045));
        const { changes } = insert.run(crop, market, day, Math.round(price * 100) / 100);
        added += changes;
      }
    }
  }

  // Keep the table bounded — the UI only ever shows a 60-day window.
  db.prepare("DELETE FROM prices WHERE day < ?").run(dayString(-(PRICE_HISTORY_DAYS * 3)));
  if (added) console.log(`  📈 price feed topped up to ${today} (+${added} rows)`);
}

const AMINA_ID = 'farmer-amina-chebet-0001';
const JOHN_ID = 'farmer-john-kiprop-0002';
const MARY_ID = 'farmer-mary-atieno-0003';

/* --------------------------------------------------------------- pin auth */
/* PINs are stored as scrypt hashes with a per-farmer salt — never in clear.
   Four digits is what a feature-phone user will actually type, so the
   defence is the KDF cost plus per-phone lockout, not PIN entropy. */
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPin(pin, stored) {
  if (!stored) return false;
  const [scheme, salt, expected] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const DEMO_PIN = process.env.DEMO_PIN || '1234';

/* Upper bound on a self-registered holding. Smallholder plots are measured in
   single-digit acres; the cap keeps a typo from inflating the yield ceiling
   that harvest validation derives from farm size. */
const MAX_FARM_ACRES = 500;

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

  // Every seeded farmer gets the demo PIN so the switcher works out of the box.
  const setPin = db.prepare('UPDATE farmers SET pin_hash = ? WHERE id = ? AND pin_hash IS NULL');
  for (const id of [AMINA_ID, JOHN_ID, MARY_ID]) setPin.run(hashPin(DEMO_PIN), id);

  return AMINA_ID;
}

/* The platform administrator. Same accounts table, same login form, same PIN
   rules — only the role differs, and the role is what the API checks. There is
   deliberately no way to register one from the public sign-up form: an admin
   exists because the operator seeded it, or because another admin promoted a
   farmer from the console. */
const ADMIN_ID = 'admin-mavuno-hq-0001';
const ADMIN_PIN = process.env.ADMIN_PIN || '2468';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+254 700 000 000';

function seedAdmin() {
  const existing = db.prepare("SELECT id FROM farmers WHERE role = 'admin' ORDER BY joined_at LIMIT 1").get();
  if (existing) return existing.id;
  db.prepare(`INSERT OR IGNORE INTO farmers
    (id, name, phone, county, farm_size_acres, joined_at, pin_hash, role, status)
    VALUES (?,?,?,?,?,?,?,'admin','active')`)
    .run(ADMIN_ID, 'MavunoAI Administrator', ADMIN_PHONE, 'HQ · Nairobi', 0, dayString(0), hashPin(ADMIN_PIN));
  return ADMIN_ID;
}

seedPrices();
const DEMO_FARMER_ID = seedFarmers();
const PLATFORM_ADMIN_ID = seedAdmin();

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
/* Reference price per crop, used to judge whether a sale was well timed.
   One grouped query instead of the previous per-harvest lookup (N+1). The
   30-day window is the intent; if it is empty — a database restored from a
   backup, a price feed outage — we fall back to whatever history exists
   rather than silently scoring every sale as badly timed. */
function currentCropAverages() {
  const rows = db.prepare(
    `SELECT crop, AVG(price_per_kg) AS avg FROM prices
     WHERE day >= date('now','-30 day') GROUP BY crop`).all();
  if (rows.length) return { averages: new Map(rows.map(r => [r.crop, r.avg])), window: '30d' };

  const fallback = db.prepare('SELECT crop, AVG(price_per_kg) AS avg FROM prices GROUP BY crop').all();
  return { averages: new Map(fallback.map(r => [r.crop, r.avg])), window: fallback.length ? 'all-time' : 'none' };
}

/* Scores are pure functions of a farmer's rows plus today's prices, and the
   dashboard asks for one on every request — so memoise per farmer and clear
   the entry whenever that farmer's data changes. */
const scoreCache = new Map();
const invalidateScore = farmerId => scoreCache.delete(farmerId);

function computeScore(farmerId) {
  const stamp = new Date().toISOString().slice(0, 13); // hourly, so prices stay fresh
  const cached = scoreCache.get(farmerId);
  if (cached && cached.stamp === stamp) return cached.value;
  const value = computeScoreUncached(farmerId);
  scoreCache.set(farmerId, { stamp, value });
  return value;
}

function computeScoreUncached(farmerId) {
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
  const { averages, window: priceWindow } = currentCropAverages();
  let timed = 0, priced = 0;
  for (const h of harvests) {
    if (!h.sold_price_per_kg) continue;
    priced++;
    const avg = averages.get(h.crop);
    // No reference price for this crop → give the farmer the benefit of the doubt.
    if (!avg || h.sold_price_per_kg >= avg * 0.9) timed++;
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
    price_window: priceWindow,
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
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), payment=()',
  // The leaf photo never leaves the device, so blob: is needed for previews.
  // Google Fonts is the only external origin the app talks to.
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function json(res, code, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(body);
}

const MAX_BODY_BYTES = 256 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    let settled = false;
    const fail = (message, statusCode) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error(message), { statusCode }));
    };
    req.on('data', c => {
      bytes += c.length;
      // The old version called req.destroy() but never settled the promise,
      // leaving the request handler pending forever.
      if (bytes > MAX_BODY_BYTES) { req.destroy(); return fail('Request body too large', 413); }
      data += c;
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })); }
    });
    req.on('aborted', () => fail('Request aborted', 400));
    req.on('error', err => fail(err.message, 400));
  });
}

/* ----------------------------------------------------------- validation */
class HttpError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
const bad = message => { throw new HttpError(400, message); };

function requireOneOf(value, allowed, field) {
  const v = String(value ?? '').trim();
  const match = allowed.find(a => a.toLowerCase() === v.toLowerCase());
  if (!match) bad(`${field} must be one of: ${allowed.join(', ')}`);
  return match;
}

function requirePositiveNumber(value, field, max) {
  const n = Number(value);
  // Number('') is 0 and Number(null) is 0, so reject empties explicitly.
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) {
    bad(`${field} must be a number`);
  }
  if (n <= 0) bad(`${field} must be greater than zero`);
  if (max !== undefined && n > max) bad(`${field} must not exceed ${max.toLocaleString()}`);
  return n;
}

function requireText(value, field, maxLength = 120) {
  const s = String(value ?? '').trim();
  if (!s) bad(`${field} is required`);
  if (s.length > maxLength) bad(`${field} must be ${maxLength} characters or fewer`);
  // No field in this app legitimately contains markup or control characters.
  // Output is escaped too — this is the second layer, not the only one.
  if (/[<>]/.test(s) || /[\x00-\x1f\x7f]/.test(s)) bad(`${field} contains invalid characters`);
  return s;
}

/* Harvest dates must be real, not in the future, and not older than the
   platform itself — a typo like 2099-12-31 or 1899 corrupts the score. */
function requireHarvestDate(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) bad('harvest_date must be in YYYY-MM-DD format');
  const t = Date.parse(s + 'T00:00:00Z');
  if (Number.isNaN(t)) bad('harvest_date is not a real date');
  if (s > dayString(0)) bad('harvest_date cannot be in the future');
  if (s < '2015-01-01') bad('harvest_date is too far in the past');
  return s;
}

/* -------------------------------------------------------- rate limiting */
/* Fixed-window counter per IP per bucket. In-process by design: one server,
   one wallet. A multi-instance deployment would move this to Redis. */
const RATE_LIMITS = {
  auth: { limit: Number(process.env.RATE_LIMIT_AUTH || 10), windowMs: 60_000 },
  write: { limit: Number(process.env.RATE_LIMIT_WRITE || 60), windowMs: 60_000 },
  read: { limit: Number(process.env.RATE_LIMIT_READ || 600), windowMs: 60_000 },
};
const rateBuckets = new Map();

function rateLimit(bucket, key) {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const now = Date.now();
  const id = `${bucket}:${key}`;
  const entry = rateBuckets.get(id);
  if (!entry || now >= entry.resetAt) {
    rateBuckets.set(id, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  entry.count++;
  if (entry.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - entry.count, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of rateBuckets) if (now >= entry.resetAt) rateBuckets.delete(id);
}, 60_000).unref();

const clientIp = req =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

/* ------------------------------------------------------------- sessions */
/* Stateless signed tokens: farmerId.expiry.HMAC. The client cannot forge or
   extend one without SESSION_SECRET, which replaces the old model where
   `x-farmer-id: <anything>` was accepted as proof of identity. */
function signToken(farmerId, ttlMs = SESSION_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${farmerId}.${expiresAt}`;
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [farmerId, expiresAt, mac] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${farmerId}.${expiresAt}`).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!Number(expiresAt) || Date.now() > Number(expiresAt)) return null;
  return farmerId;
}

/* Failed-PIN lockout, per phone number. */
const loginFailures = new Map();
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60_000;

function isLockedOut(key) {
  const f = loginFailures.get(key);
  if (!f) return false;
  if (Date.now() > f.until) { loginFailures.delete(key); return false; }
  return f.count >= LOCKOUT_THRESHOLD;
}

function noteLoginFailure(key) {
  const f = loginFailures.get(key) || { count: 0, until: 0 };
  f.count++;
  f.until = Date.now() + LOCKOUT_MS;
  loginFailures.set(key, f);
}

function normalizeKenyanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if (digits.startsWith('7') && digits.length === 9) return '254' + digits;
  return digits;
}

function getPayHeroAuthHeader() {
  if (process.env.PAYHERO_BASIC_AUTH) return 'Basic ' + process.env.PAYHERO_BASIC_AUTH;
  if (process.env.PAYHERO_USERNAME && process.env.PAYHERO_PASSWORD) {
    return 'Basic ' + Buffer.from(`${process.env.PAYHERO_USERNAME}:${process.env.PAYHERO_PASSWORD}`).toString('base64');
  }
  return '';
}

function getPayHeroConfigStatus() {
  const hasAuth = Boolean(getPayHeroAuthHeader());
  const hasChannel = Boolean(process.env.PAYHERO_CHANNEL_ID);
  return {
    mode: hasAuth && hasChannel ? 'live' : 'demo',
    has_auth: hasAuth,
    has_channel_id: hasChannel,
    has_callback_url: Boolean(process.env.PAYHERO_CALLBACK_URL || process.env.PUBLIC_URL),
    callback_url: process.env.PAYHERO_CALLBACK_URL ||
      (process.env.PUBLIC_URL ? `${String(process.env.PUBLIC_URL).replace(/\/$/, '')}/api/payhero/callback` : null),
  };
}

async function initiatePayHeroDisbursement({ farmerId, loanId, amount, phoneNumber }) {
  const externalReference = `MAV-${loanId.slice(0, 8).toUpperCase()}`;
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  const authHeader = getPayHeroAuthHeader();
  const callbackUrl = process.env.PAYHERO_CALLBACK_URL ||
    (process.env.PUBLIC_URL ? `${String(process.env.PUBLIC_URL).replace(/\/$/, '')}/api/payhero/callback` : '');

  const baseTransaction = {
    id: crypto.randomUUID(),
    loan_id: loanId,
    farmer_id: farmerId,
    provider: 'payhero',
    external_reference: externalReference,
    phone_number: phoneNumber,
    amount,
  };

  if (!authHeader || !channelId) {
    const demoPayload = {
      mode: 'demo',
      status: 'QUEUED',
      merchant_reference: 'DEMO-' + externalReference,
      checkout_request_id: crypto.randomUUID(),
      conversation_id: crypto.randomUUID(),
      message: 'PayHero credentials not configured; simulated M-PESA disbursement for demo.',
    };
    db.prepare(`INSERT INTO payment_transactions
      (id, loan_id, farmer_id, provider, direction, external_reference, phone_number, amount, status,
       merchant_reference, checkout_request_id, conversation_id, response_payload)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(baseTransaction.id, loanId, farmerId, 'payhero-demo', 'disbursement', externalReference, phoneNumber, amount, 'queued',
        demoPayload.merchant_reference, demoPayload.checkout_request_id, demoPayload.conversation_id, JSON.stringify(demoPayload));
    return { ...demoPayload, transaction_id: baseTransaction.id };
  }

  const payload = {
    external_reference: externalReference,
    amount: Math.round(amount),
    phone_number: phoneNumber,
    network_code: '63902',
    callback_url: callbackUrl,
    channel: 'mobile',
    channel_id: Number(channelId),
    payment_service: 'b2c',
  };

  let response, data;
  try {
    // Without a timeout a hung PayHero call hangs the request — and because
    // node:sqlite is synchronous, a pile of them hangs the whole server.
    response = await fetch('https://backend.payhero.co.ke/api/v2/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PAYHERO_TIMEOUT_MS),
    });
    data = await response.json().catch(() => ({ raw: 'Non-JSON PayHero response' }));
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    const failure = { error: timedOut ? `PayHero did not respond within ${PAYHERO_TIMEOUT_MS} ms` : err.message };
    db.prepare(`INSERT INTO payment_transactions
      (id, loan_id, farmer_id, provider, direction, external_reference, phone_number, amount, status, response_payload)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(baseTransaction.id, loanId, farmerId, 'payhero', 'disbursement', externalReference, phoneNumber, amount,
        timedOut ? 'timeout' : 'failed', JSON.stringify(failure));
    throw Object.assign(new Error(failure.error), { statusCode: 504, payhero: failure });
  }

  const queued = response.ok && String(data.status || '').toUpperCase() !== 'FAILED';

  db.prepare(`INSERT INTO payment_transactions
    (id, loan_id, farmer_id, provider, direction, external_reference, phone_number, amount, status,
     merchant_reference, checkout_request_id, conversation_id, response_payload)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(baseTransaction.id, loanId, farmerId, 'payhero', 'disbursement', externalReference, phoneNumber, amount,
      queued ? 'queued' : 'failed', data.merchant_reference || null, data.checkout_request_id || null,
      data.conversation_id || null, JSON.stringify(data));

  if (!queued) {
    const err = new Error(data.error || data.message || 'PayHero disbursement failed');
    err.statusCode = response.status >= 400 ? response.status : 502;
    err.payhero = data;
    throw err;
  }

  return { ...data, transaction_id: baseTransaction.id };
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  // Without these the landing photos are served as octet-stream, which
  // X-Content-Type-Options: nosniff then refuses to render.
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/* ---------------------------------------------------------------- routes */
/* Endpoints that answer without a session. Everything else is scoped to a
   farmer and needs a valid Bearer token. */
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/payhero/config',
  'GET /api/prices',
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/payhero/callback',
]);

function publicFarmer(row) {
  if (!row) return null;
  const { pin_hash, ...rest } = row;   // never ship a PIN hash to a client
  return rest;
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/health') {
    const priceDay = db.prepare('SELECT MAX(day) AS day FROM prices').get().day;
    return json(res, 200, {
      status: 'ok',
      uptime_s: Math.round(process.uptime()),
      payhero: getPayHeroConfigStatus().mode,
      price_feed_through: priceDay,
      price_feed_fresh: priceDay === dayString(0),
    });
  }

  /* -- rate limiting ---------------------------------------------------- */
  const bucket = url.pathname.startsWith('/api/auth/') ? 'auth'
    : req.method === 'GET' ? 'read' : 'write';
  const limit = rateLimit(bucket, clientIp(req));
  if (!limit.ok) {
    return json(res, 429, { error: 'Too many requests — slow down.' },
      { 'Retry-After': String(limit.retryAfter) });
  }

  /* -- authentication --------------------------------------------------- */
  if (route === 'POST /api/auth/login') {
    const b = await readBody(req);
    const phone = normalizeKenyanPhone(b.phone);
    const pin = String(b.pin ?? '');
    if (!phone || !pin) return json(res, 400, { error: 'phone and pin are required' });
    if (isLockedOut(phone)) {
      return json(res, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    const farmer = db.prepare('SELECT * FROM farmers').all()
      .find(f => normalizeKenyanPhone(f.phone) === phone);
    if (!farmer || !verifyPin(pin, farmer.pin_hash)) {
      noteLoginFailure(phone);
      // Same message either way — do not reveal which phones are registered.
      return json(res, 401, { error: 'Incorrect phone number or PIN' });
    }
    // Checked after the PIN, so a suspended account is not disclosed to
    // someone guessing numbers.
    if (farmer.status === 'suspended') {
      return json(res, 403, {
        error: 'This account is suspended. Contact MavunoAI support to restore access.',
        code: 'suspended',
      });
    }
    loginFailures.delete(phone);
    // role travels in the body, not the token: it is read from the row on
    // every request, so a demotion takes effect immediately rather than at
    // the end of a two-hour session.
    return json(res, 200, {
      token: signToken(farmer.id),
      expires_in_s: SESSION_TTL_MS / 1000,
      role: farmer.role || 'farmer',
      farmer: publicFarmer(farmer),
    });
  }

  /* Self-registration. A new farmer starts with an empty ledger, which the
     score endpoint already reports as "No history" rather than a low score —
     nobody is penalised for being new. */
  if (route === 'POST /api/auth/register') {
    const b = await readBody(req);
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
    const phone = normalizeKenyanPhone(b.phone);
    const county = String(b.county ?? '').trim();
    const acres = Number(b.farm_size_acres);
    const pin = String(b.pin ?? '');

    if (name.length < 2 || name.length > 80) {
      return json(res, 400, { error: 'Enter your full name' });
    }
    if (!/^254[17]\d{8}$/.test(phone)) {
      return json(res, 400, { error: 'Enter a valid Kenyan mobile number, e.g. 0712 345 678' });
    }
    if (county.length < 2 || county.length > 60) {
      return json(res, 400, { error: 'Select the county you farm in' });
    }
    if (!Number.isFinite(acres) || acres <= 0 || acres > MAX_FARM_ACRES) {
      return json(res, 400, { error: `Farm size must be between 0 and ${MAX_FARM_ACRES} acres` });
    }
    // Length only: a stricter policy would lock out the demo PIN, and the real
    // defence here is the KDF cost plus the per-phone lockout on login.
    if (!/^\d{4,8}$/.test(pin)) {
      return json(res, 400, { error: 'PIN must be 4 to 8 digits' });
    }

    // Seeded phones are stored pretty-printed ("+254 712 345 678"), so the
    // uniqueness check has to compare normalised forms, exactly like login.
    const taken = db.prepare('SELECT phone FROM farmers').all()
      .some(f => normalizeKenyanPhone(f.phone) === phone);
    if (taken) {
      return json(res, 409, { error: 'That number is already registered — sign in instead.' });
    }

    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO farmers (id, name, phone, county, farm_size_acres, joined_at, pin_hash)
      VALUES (?,?,?,?,?,?,?)`)
      .run(id, name, '+' + phone, county, acres, dayString(0), hashPin(pin));

    const farmer = db.prepare('SELECT * FROM farmers WHERE id = ?').get(id);
    return json(res, 201, {
      token: signToken(id),
      expires_in_s: SESSION_TTL_MS / 1000,
      role: 'farmer',   // self-registration never mints an administrator
      farmer: publicFarmer(farmer),
    });
  }

  if (route === 'GET /api/payhero/config') {
    return json(res, 200, getPayHeroConfigStatus());
  }

  if (route === 'GET /api/prices') {
    const crop = String(url.searchParams.get('crop') || 'maize').toLowerCase();
    if (!CROPS.includes(crop)) return json(res, 400, { error: 'unknown crop' });
    const since = dayString(-(PRICE_HISTORY_DAYS - 1));
    const series = {};
    for (const market of MARKETS) {
      series[market] = db.prepare(
        'SELECT day, price_per_kg FROM prices WHERE crop = ? AND market = ? AND day >= ? ORDER BY day'
      ).all(crop, market, since);
    }
    const best = MARKETS
      .filter(m => series[m].length)
      .map(m => ({ market: m, price: series[m][series[m].length - 1].price_per_kg }))
      .sort((a, b) => b.price - a.price);
    return json(res, 200, { crop, series, best, crops: CROPS, through: dayString(0) });
  }

  if (route === 'POST /api/payhero/callback') {
    const b = await readBody(req);
    const response = b.response || b;
    const externalRef = response.ExternalReference || response.external_reference || b.external_reference;
    const status = String(response.Status || b.status || '').toLowerCase();
    const mapped = status === 'success' || response.ResultCode === 0 ? 'success' : status || 'callback_received';
    if (externalRef) {
      db.prepare(`UPDATE payment_transactions
        SET status = ?, response_payload = ?, updated_at = datetime('now')
        WHERE external_reference = ?`)
        .run(mapped, JSON.stringify(b), String(externalRef));
    }
    return json(res, 200, { received: true });
  }

  /* -- everything past this point requires a session -------------------- */
  if (!PUBLIC_ROUTES.has(route)) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const authedId = verifyToken(token);
    if (!authedId) {
      return json(res, 401, { error: 'Sign in to continue', code: 'unauthenticated' });
    }
    // A token can only ever act as the farmer it was issued for — the old
    // `x-farmer-id` header let any client claim any identity.
    const account = db.prepare('SELECT id, name, role, status FROM farmers WHERE id = ?').get(authedId);
    if (!account) {
      return json(res, 401, { error: 'Session no longer valid', code: 'unauthenticated' });
    }
    // Suspending an account has to cut off the sessions it already has, not
    // just future sign-ins.
    if (account.status === 'suspended') {
      return json(res, 403, { error: 'This account is suspended.', code: 'suspended' });
    }
    req.farmerId = authedId;
    req.account = account;
  }
  const farmerId = req.farmerId;

  /* Who am I? Lets the client restore the right shell after a reload without
     guessing from a value it stored itself. */
  if (route === 'GET /api/me') {
    return json(res, 200, {
      role: req.account.role || 'farmer',
      farmer: publicFarmer(db.prepare('SELECT * FROM farmers WHERE id = ?').get(farmerId)),
    });
  }

  /* Everything under /api/admin/ is gated on the role stored against the
     account, re-read on every request. */
  if (url.pathname.startsWith('/api/admin/')) {
    if (req.account.role !== 'admin') {
      return json(res, 403, { error: 'Administrator access required', code: 'forbidden' });
    }
    return handleAdminApi(req, res, url);
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const farmer = publicFarmer(db.prepare('SELECT * FROM farmers WHERE id = ?').get(farmerId));
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
      prices_as_of: db.prepare('SELECT MAX(day) AS day FROM prices').get().day,
      advisory: buildAdvisory(),
      // Notices an administrator has broadcast, narrowed to this farmer's
      // county plus the platform-wide ones.
      announcements: db.prepare(
        `SELECT id, title, body, level, created_at FROM announcements
         WHERE active = 1 AND (county IS NULL OR county = ?)
         ORDER BY created_at DESC LIMIT 3`).all(farmer?.county ?? null),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/harvests') {
    const rows = db.prepare('SELECT * FROM harvests WHERE farmer_id = ? ORDER BY harvest_date DESC').all(farmerId);
    return json(res, 200, rows);
  }

  if (req.method === 'POST' && url.pathname === '/api/harvests') {
    const b = await readBody(req);
    if (b.crop == null || b.quantity_kg == null || b.harvest_date == null || b.season == null) {
      return json(res, 400, { error: 'crop, season, quantity_kg and harvest_date are required' });
    }

    // Everything below throws HttpError(400) with a message the UI can show.
    const crop = requireOneOf(b.crop, CROPS, 'crop').toLowerCase();
    const season = requireText(b.season, 'season', 60);
    const qty = requirePositiveNumber(b.quantity_kg, 'quantity_kg', 1_000_000);
    const harvestDate = requireHarvestDate(b.harvest_date);
    const soldPrice = b.sold_price_per_kg === '' || b.sold_price_per_kg == null
      ? null
      : requirePositiveNumber(b.sold_price_per_kg, 'sold_price_per_kg', 10_000);
    const market = b.market === '' || b.market == null ? null : requireOneOf(b.market, MARKETS, 'market');

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
      if (farmer?.farm_size_acres > 0) {
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
      .run(id, farmerId, crop, season, qty, soldPrice, market, harvestDate);
    invalidateScore(farmerId);
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

    // One live loan at a time. Without this the same offer could be claimed
    // repeatedly — with live PayHero credentials that is one real M-PESA
    // disbursement per click.
    const active = db.prepare(
      "SELECT id, purpose, amount FROM loans WHERE farmer_id = ? AND status = 'approved' LIMIT 1").get(farmerId);
    if (active) {
      return json(res, 409, {
        error: `You already have an active ${active.purpose} of KES ${active.amount.toLocaleString()}. Repay it before applying again.`,
        code: 'active_loan',
        active_loan_id: active.id,
      });
    }

    // Rolling 24 h ceiling, independent of tier — a backstop if the tier
    // logic itself is ever wrong.
    const disbursedToday = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM loans
       WHERE farmer_id = ? AND status IN ('approved','repaid')
       AND created_at >= datetime('now','-1 day')`).get(farmerId).total;
    if (disbursedToday + offer.amount > DAILY_DISBURSEMENT_CAP) {
      return json(res, 429, {
        error: `Daily disbursement limit of KES ${DAILY_DISBURSEMENT_CAP.toLocaleString()} reached for this farmer.`,
        code: 'daily_cap',
      });
    }

    const farmer = db.prepare('SELECT phone FROM farmers WHERE id = ?').get(farmerId);
    // The registered phone is authoritative; a client-supplied number would
    // let a session divert its own disbursement to an arbitrary wallet.
    const phoneNumber = normalizeKenyanPhone(farmer?.phone);
    if (!/^2547\d{8}$/.test(phoneNumber)) {
      return json(res, 400, { error: 'This profile has no valid M-PESA number on file' });
    }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO loans (id, farmer_id, amount, rate_pct_month, term_months, purpose, score_at_application)
                VALUES (?,?,?,?,?,?,?)`)
      .run(id, farmerId, offer.amount, offer.rate, offer.term, offer.name, s.score);
    invalidateScore(farmerId);
    try {
      const disbursement = await initiatePayHeroDisbursement({
        farmerId,
        loanId: id,
        amount: offer.amount,
        phoneNumber,
      });
      return json(res, 201, { id, ...offer, status: 'approved', disbursement });
    } catch (err) {
      db.prepare('UPDATE loans SET status = ? WHERE id = ?').run('disbursement_failed', id);
      invalidateScore(farmerId);
      return json(res, err.statusCode || 502, {
        error: err.message || 'PayHero disbursement failed',
        payhero: err.payhero || null,
      });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/loans/repay') {
    const b = await readBody(req);
    if (!b.loanId) return json(res, 400, { error: 'loanId is required' });
    const loan = db.prepare('SELECT * FROM loans WHERE id = ? AND farmer_id = ?').get(String(b.loanId), farmerId);
    if (!loan) return json(res, 404, { error: 'Loan not found or does not belong to this profile' });
    if (loan.status !== 'approved') {
      return json(res, 409, { error: `Loan is already ${loan.status}` });
    }

    // Repayment is recorded as a transaction, not a bare status flip, so the
    // ledger shows what was paid and by which rail. In demo mode the receipt
    // is simulated and labelled as such; production would only settle here
    // after an M-PESA C2B confirmation callback.
    const totalDue = Math.round(loan.amount * (1 + (loan.rate_pct_month / 100) * loan.term_months));
    const receiptId = crypto.randomUUID();
    const live = getPayHeroConfigStatus().mode === 'live';
    db.prepare(`INSERT INTO payment_transactions
      (id, loan_id, farmer_id, provider, direction, external_reference, phone_number, amount, status, response_payload)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(receiptId, loan.id, farmerId, live ? 'payhero' : 'payhero-demo', 'repayment',
        `RPY-${loan.id.slice(0, 8).toUpperCase()}`,
        db.prepare('SELECT phone FROM farmers WHERE id = ?').get(farmerId)?.phone || null,
        totalDue, live ? 'awaiting_confirmation' : 'simulated',
        JSON.stringify({ simulated: !live, note: 'Demo repayment — no funds were collected.' }));

    db.prepare("UPDATE loans SET status = 'repaid' WHERE id = ?").run(loan.id);
    invalidateScore(farmerId);
    return json(res, 200, {
      success: true,
      amount_repaid: totalDue,
      receipt_id: receiptId,
      simulated: !live,
      score: computeScore(farmerId).score,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/loans') {
    return json(res, 200, db.prepare(`
      SELECT l.*,
             pt.provider AS payment_provider,
             pt.status AS payment_status,
             pt.external_reference AS payment_reference,
             pt.merchant_reference,
             pt.checkout_request_id,
             pt.phone_number AS payment_phone,
             pt.created_at AS payment_created_at
      FROM loans l
      LEFT JOIN payment_transactions pt ON pt.id = (
        SELECT id FROM payment_transactions
        WHERE loan_id = l.id
        ORDER BY created_at DESC
        LIMIT 1
      )
      WHERE l.farmer_id = ?
      ORDER BY l.created_at DESC
    `).all(farmerId));
  }

  if (req.method === 'POST' && url.pathname === '/api/diagnoses') {
    const b = await readBody(req);
    const confidence = b.confidence == null ? null : Math.max(0, Math.min(100, Number(b.confidence) || 0));
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO diagnoses (id, farmer_id, crop, disease, confidence, severity) VALUES (?,?,?,?,?,?)')
      .run(id, farmerId,
        b.crop == null ? null : requireOneOf(b.crop, CROPS, 'crop').toLowerCase(),
        b.disease == null ? null : requireText(b.disease, 'disease', 80),
        confidence,
        b.severity == null ? null : requireOneOf(b.severity, ['none', 'low', 'medium', 'high', 'unknown'], 'severity'));
    return json(res, 201, { id });
  }

  if (req.method === 'GET' && url.pathname === '/api/diagnoses') {
    return json(res, 200, db.prepare('SELECT * FROM diagnoses WHERE farmer_id = ? ORDER BY created_at DESC LIMIT 10').all(farmerId));
  }

  return json(res, 404, { error: 'Not found' });
}

/* ================================================================== admin */
/* Everything below answers only to a session whose account row carries
   role = 'admin'; handleApi() has already proved that before dispatching
   here. Admin reads are platform-wide by design — that is the whole point of
   the console — but every write is recorded in admin_actions with the
   administrator who made it. */

function audit(req, action, { targetType = null, targetId = null, targetLabel = null, detail = null } = {}) {
  db.prepare(`INSERT INTO admin_actions
    (id, admin_id, admin_name, action, target_type, target_id, target_label, detail)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), req.account.id, req.account.name, action,
      targetType, targetId, targetLabel, detail ? JSON.stringify(detail) : null);
}

/* One row per farmer with the aggregates the console lists: harvest count,
   tonnage, revenue and borrowing. Correlated subqueries rather than five
   joins, so a farmer with no harvests still appears with zeros. */
const FARMER_ROW_SQL = `
  SELECT f.id, f.name, f.phone, f.county, f.farm_size_acres, f.joined_at, f.role, f.status,
         (SELECT COUNT(*) FROM harvests h WHERE h.farmer_id = f.id) AS harvest_count,
         (SELECT COALESCE(SUM(h.quantity_kg), 0) FROM harvests h WHERE h.farmer_id = f.id) AS total_kg,
         (SELECT COALESCE(SUM(h.quantity_kg * COALESCE(h.sold_price_per_kg, 0)), 0)
            FROM harvests h WHERE h.farmer_id = f.id) AS revenue,
         (SELECT COUNT(*) FROM loans l WHERE l.farmer_id = f.id) AS loan_count,
         (SELECT COUNT(*) FROM loans l WHERE l.farmer_id = f.id AND l.status = 'approved') AS active_loans,
         (SELECT COALESCE(SUM(l.amount), 0) FROM loans l WHERE l.farmer_id = f.id
            AND l.status IN ('approved','repaid')) AS borrowed,
         (SELECT COUNT(*) FROM diagnoses d WHERE d.farmer_id = f.id) AS scan_count
  FROM farmers f`;

const withScore = row => {
  const { score, tier } = computeScore(row.id);
  return { ...row, score, tier };
};

/* A month key list ending on the current month, so a sparse signup history
   still draws a continuous 12-month axis instead of three lonely bars. */
function monthSeries(count, rows) {
  const found = new Map(rows.map(r => [r.month, r.count]));
  const out = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const key = m.toISOString().slice(0, 7);
    out.push({ month: key, count: found.get(key) || 0 });
  }
  return out;
}

const SCORE_BANDS = [
  { band: '300–479', label: 'Building History', min: 300, max: 479 },
  { band: '480–599', label: 'Seedling', min: 480, max: 599 },
  { band: '600–699', label: 'Growing Strong', min: 600, max: 699 },
  { band: '700–850', label: 'Prime Harvester', min: 700, max: 850 },
];

function adminOverview() {
  const farmers = db.prepare(
    "SELECT id, county, status, joined_at FROM farmers WHERE role = 'farmer'").all();
  const scored = farmers.map(f => ({ ...f, ...computeScore(f.id) }));
  const rated = scored.filter(f => f.score > 0);

  const harvestTotals = db.prepare(
    `SELECT COUNT(*) AS entries, COALESCE(SUM(quantity_kg), 0) AS kg,
            COALESCE(SUM(quantity_kg * COALESCE(sold_price_per_kg, 0)), 0) AS revenue
     FROM harvests`).get();

  const loanRows = db.prepare(
    'SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS value FROM loans GROUP BY status').all();
  const byStatus = Object.fromEntries(loanRows.map(r => [r.status, r]));
  const pick = (s, k) => byStatus[s]?.[k] || 0;

  // A facility still open past its own term is the closest thing this ledger
  // has to an arrears signal — surface it rather than a flattering total.
  const overdue = db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS value FROM loans
     WHERE status = 'approved' AND julianday('now') - julianday(created_at) > term_months * 30`).get();

  const disbursed30 = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS value, COUNT(*) AS n FROM loans
     WHERE status IN ('approved','repaid') AND created_at >= datetime('now','-30 day')`).get();

  const settled = pick('repaid', 'n') + pick('approved', 'n');
  const recent = [
    ...db.prepare(
      `SELECT h.created_at AS at, f.name AS who, h.crop AS a, h.quantity_kg AS b
       FROM harvests h JOIN farmers f ON f.id = h.farmer_id ORDER BY h.created_at DESC LIMIT 8`)
      .all().map(r => ({ type: 'harvest', at: r.at, who: r.who, what: `${r.a} · ${Math.round(r.b).toLocaleString()} kg` })),
    ...db.prepare(
      `SELECT l.created_at AS at, f.name AS who, l.purpose AS a, l.amount AS b, l.status AS c
       FROM loans l JOIN farmers f ON f.id = l.farmer_id ORDER BY l.created_at DESC LIMIT 8`)
      .all().map(r => ({ type: 'loan', at: r.at, who: r.who, what: `${r.a} · KES ${Math.round(r.b).toLocaleString()} (${r.c})` })),
    ...db.prepare(
      `SELECT d.created_at AS at, f.name AS who, d.disease AS a, d.crop AS b
       FROM diagnoses d JOIN farmers f ON f.id = d.farmer_id ORDER BY d.created_at DESC LIMIT 8`)
      .all().map(r => ({ type: 'scan', at: r.at, who: r.who, what: `${r.a || 'scan'} · ${r.b || '—'}` })),
  ].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 12);

  const priceDay = db.prepare('SELECT MAX(day) AS day FROM prices').get().day;

  return {
    totals: {
      farmers: farmers.length,
      active: farmers.filter(f => f.status !== 'suspended').length,
      suspended: farmers.filter(f => f.status === 'suspended').length,
      new_30d: db.prepare(
        "SELECT COUNT(*) AS n FROM farmers WHERE role = 'farmer' AND joined_at >= date('now','-30 day')").get().n,
      harvests: harvestTotals.entries,
      tonnes: Math.round((harvestTotals.kg / 1000) * 10) / 10,
      revenue: Math.round(harvestTotals.revenue),
      scans: db.prepare('SELECT COUNT(*) AS n FROM diagnoses').get().n,
      avg_score: rated.length ? Math.round(rated.reduce((s, f) => s + f.score, 0) / rated.length) : 0,
      rated: rated.length,
    },
    credit: {
      active_count: pick('approved', 'n'),
      active_value: Math.round(pick('approved', 'value')),
      repaid_count: pick('repaid', 'n'),
      repaid_value: Math.round(pick('repaid', 'value')),
      failed_count: pick('disbursement_failed', 'n') + pick('cancelled', 'n') + pick('written_off', 'n'),
      written_off_value: Math.round(pick('written_off', 'value')),
      overdue_count: overdue.n,
      overdue_value: Math.round(overdue.value),
      disbursed_30d: Math.round(disbursed30.value),
      disbursed_30d_count: disbursed30.n,
      // Share of everything actually put in a farmer's hands that has come back.
      repayment_rate: settled ? Math.round((pick('repaid', 'n') / settled) * 100) : 0,
    },
    score_distribution: SCORE_BANDS.map(b => ({
      ...b, count: rated.filter(f => f.score >= b.min && f.score <= b.max).length,
    })),
    signups: monthSeries(12, db.prepare(
      `SELECT substr(joined_at, 1, 7) AS month, COUNT(*) AS count FROM farmers
       WHERE role = 'farmer' AND joined_at IS NOT NULL GROUP BY month`).all()),
    counties: db.prepare(
      `SELECT f.county AS county, COUNT(DISTINCT f.id) AS farmers,
              COALESCE(SUM(h.quantity_kg), 0) AS kg
       FROM farmers f LEFT JOIN harvests h ON h.farmer_id = f.id
       WHERE f.role = 'farmer' GROUP BY f.county ORDER BY farmers DESC, kg DESC LIMIT 8`).all(),
    crops: db.prepare(
      `SELECT crop, COUNT(*) AS entries, COALESCE(SUM(quantity_kg), 0) AS kg,
              COALESCE(SUM(quantity_kg * COALESCE(sold_price_per_kg, 0)), 0) AS revenue
       FROM harvests GROUP BY crop ORDER BY kg DESC`).all(),
    recent,
    price_feed: { through: priceDay, fresh: priceDay === dayString(0) },
    payhero: getPayHeroConfigStatus(),
    announcements_active: db.prepare('SELECT COUNT(*) AS n FROM announcements WHERE active = 1').get().n,
  };
}

const LOAN_STATUSES = ['approved', 'repaid', 'written_off', 'cancelled', 'disbursement_failed'];
const ANNOUNCEMENT_LEVELS = ['info', 'advisory', 'urgent'];

async function handleAdminApi(req, res, url) {
  // /api/admin/farmers/<id>/status → resource "farmers", id, action "status"
  const parts = url.pathname.split('/').filter(Boolean);
  const resource = parts[2] || '';
  const id = parts[3] ? decodeURIComponent(parts[3]) : null;
  const action = parts[4] || null;
  const method = req.method;
  const limitParam = (fallback, max = 500) =>
    Math.min(max, Math.max(1, Number(url.searchParams.get('limit')) || fallback));

  /* ---------------------------------------------------------- overview */
  if (method === 'GET' && resource === 'overview' && !id) {
    return json(res, 200, adminOverview());
  }

  /* ----------------------------------------------------------- farmers */
  if (method === 'GET' && resource === 'farmers' && !id) {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const status = String(url.searchParams.get('status') || 'all');
    const sort = String(url.searchParams.get('sort') || 'score');

    let rows = db.prepare(`${FARMER_ROW_SQL} WHERE f.role = 'farmer'`).all().map(withScore);
    if (q) {
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        String(r.county || '').toLowerCase().includes(q) ||
        normalizeKenyanPhone(r.phone).includes(normalizeKenyanPhone(q) || q));
    }
    if (status !== 'all') rows = rows.filter(r => (r.status || 'active') === status);

    const sorters = {
      score: (a, b) => b.score - a.score,
      name: (a, b) => a.name.localeCompare(b.name),
      joined: (a, b) => String(b.joined_at).localeCompare(String(a.joined_at)),
      revenue: (a, b) => b.revenue - a.revenue,
      borrowed: (a, b) => b.borrowed - a.borrowed,
    };
    rows.sort(sorters[sort] || sorters.score);
    return json(res, 200, { farmers: rows.slice(0, limitParam(200)), total: rows.length });
  }

  if (method === 'GET' && resource === 'farmers' && id && !action) {
    const farmer = db.prepare(`${FARMER_ROW_SQL} WHERE f.id = ?`).get(id);
    if (!farmer) return json(res, 404, { error: 'No such account' });
    return json(res, 200, {
      farmer: withScore(farmer),
      score: computeScore(id),
      harvests: db.prepare('SELECT * FROM harvests WHERE farmer_id = ? ORDER BY harvest_date DESC').all(id),
      loans: db.prepare('SELECT * FROM loans WHERE farmer_id = ? ORDER BY created_at DESC').all(id),
      diagnoses: db.prepare('SELECT * FROM diagnoses WHERE farmer_id = ? ORDER BY created_at DESC LIMIT 20').all(id),
      transactions: db.prepare(
        'SELECT * FROM payment_transactions WHERE farmer_id = ? ORDER BY created_at DESC LIMIT 20').all(id),
    });
  }

  /* Suspend / restore. Administrators are out of scope on purpose: locking the
     console out of itself is not a mistake worth allowing at 2 a.m. */
  if (method === 'POST' && resource === 'farmers' && id && action === 'status') {
    const b = await readBody(req);
    const status = requireOneOf(b.status, ['active', 'suspended'], 'status');
    const target = db.prepare('SELECT id, name, role, status FROM farmers WHERE id = ?').get(id);
    if (!target) return json(res, 404, { error: 'No such account' });
    if (target.role === 'admin') {
      return json(res, 403, { error: 'Administrator accounts cannot be suspended from the console' });
    }
    db.prepare('UPDATE farmers SET status = ? WHERE id = ?').run(status, id);
    audit(req, status === 'suspended' ? 'farmer.suspend' : 'farmer.restore',
      { targetType: 'farmer', targetId: id, targetLabel: target.name, detail: { from: target.status, to: status } });
    return json(res, 200, { id, status });
  }

  /* Issues a fresh random PIN and hands it back exactly once — the hash is all
     that is stored, so there is no way to read it again afterwards. */
  if (method === 'POST' && resource === 'farmers' && id && action === 'reset-pin') {
    const target = db.prepare('SELECT id, name, role FROM farmers WHERE id = ?').get(id);
    if (!target) return json(res, 404, { error: 'No such account' });
    if (target.role === 'admin' && target.id !== req.account.id) {
      return json(res, 403, { error: 'You cannot reset another administrator’s PIN' });
    }
    const tempPin = String(crypto.randomInt(1000, 10000));
    db.prepare('UPDATE farmers SET pin_hash = ? WHERE id = ?').run(hashPin(tempPin), id);
    loginFailures.delete(normalizeKenyanPhone(
      db.prepare('SELECT phone FROM farmers WHERE id = ?').get(id)?.phone));
    audit(req, 'farmer.reset_pin', { targetType: 'farmer', targetId: id, targetLabel: target.name });
    return json(res, 200, { id, temp_pin: tempPin, note: 'Read this to the farmer once — it is not stored in clear.' });
  }

  if (method === 'DELETE' && resource === 'farmers' && id && !action) {
    const target = db.prepare('SELECT id, name, role FROM farmers WHERE id = ?').get(id);
    if (!target) return json(res, 404, { error: 'No such account' });
    if (target.role === 'admin') return json(res, 403, { error: 'Administrator accounts cannot be deleted here' });
    // Harvests, loans and diagnoses cascade; the payments ledger has no foreign
    // key precisely so it survives, so clear it explicitly.
    db.prepare('DELETE FROM payment_transactions WHERE farmer_id = ?').run(id);
    db.prepare('DELETE FROM farmers WHERE id = ?').run(id);
    invalidateScore(id);
    audit(req, 'farmer.delete', { targetType: 'farmer', targetId: id, targetLabel: target.name });
    return json(res, 200, { id, deleted: true });
  }

  /* ------------------------------------------------------------- loans */
  if (method === 'GET' && resource === 'loans' && !id) {
    const status = String(url.searchParams.get('status') || 'all');
    const rows = db.prepare(`
      SELECT l.*, f.name AS farmer_name, f.phone AS farmer_phone, f.county AS farmer_county,
             pt.status AS payment_status, pt.provider AS payment_provider,
             pt.external_reference AS payment_reference, pt.phone_number AS payment_phone
      FROM loans l
      JOIN farmers f ON f.id = l.farmer_id
      LEFT JOIN payment_transactions pt ON pt.id = (
        SELECT id FROM payment_transactions
        WHERE loan_id = l.id AND direction = 'disbursement'
        ORDER BY created_at DESC LIMIT 1)
      ORDER BY l.created_at DESC`).all()
      .map(l => ({
        ...l,
        total_due: Math.round(l.amount * (1 + (l.rate_pct_month / 100) * l.term_months)),
        days_open: Math.floor((Date.now() - Date.parse(l.created_at + 'Z')) / 86_400_000),
      }))
      .map(l => ({ ...l, overdue: l.status === 'approved' && l.days_open > l.term_months * 30 }));
    return json(res, 200, {
      loans: status === 'all' ? rows : rows.filter(l => l.status === status),
      counts: LOAN_STATUSES.map(s => ({ status: s, n: rows.filter(l => l.status === s).length })),
      total: rows.length,
    });
  }

  if (method === 'POST' && resource === 'loans' && id && action === 'status') {
    const b = await readBody(req);
    const status = requireOneOf(b.status, LOAN_STATUSES, 'status');
    const loan = db.prepare(
      'SELECT l.*, f.name AS farmer_name FROM loans l JOIN farmers f ON f.id = l.farmer_id WHERE l.id = ?').get(id);
    if (!loan) return json(res, 404, { error: 'No such facility' });
    db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(status, id);
    invalidateScore(loan.farmer_id);
    audit(req, 'loan.status', {
      targetType: 'loan', targetId: id, targetLabel: `${loan.purpose} · ${loan.farmer_name}`,
      detail: { from: loan.status, to: status, amount: loan.amount },
    });
    return json(res, 200, { id, status, score: computeScore(loan.farmer_id).score });
  }

  /* ------------------------------------------------------- payments */
  if (method === 'GET' && resource === 'transactions' && !id) {
    const direction = String(url.searchParams.get('direction') || 'all');
    const rows = db.prepare(`
      SELECT pt.id, pt.loan_id, pt.farmer_id, pt.provider, pt.direction, pt.external_reference,
             pt.phone_number, pt.amount, pt.status, pt.merchant_reference, pt.created_at,
             f.name AS farmer_name
      FROM payment_transactions pt
      LEFT JOIN farmers f ON f.id = pt.farmer_id
      ORDER BY pt.created_at DESC LIMIT ?`).all(limitParam(150));
    const totals = db.prepare(
      `SELECT direction, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS value
       FROM payment_transactions GROUP BY direction`).all();
    return json(res, 200, {
      transactions: direction === 'all' ? rows : rows.filter(r => r.direction === direction),
      totals,
      mode: getPayHeroConfigStatus().mode,
    });
  }

  /* --------------------------------------------------- crop health */
  if (method === 'GET' && resource === 'diagnoses' && !id) {
    return json(res, 200, {
      recent: db.prepare(`
        SELECT d.*, f.name AS farmer_name, f.county AS county
        FROM diagnoses d LEFT JOIN farmers f ON f.id = d.farmer_id
        ORDER BY d.created_at DESC LIMIT ?`).all(limitParam(60)),
      by_disease: db.prepare(`
        SELECT d.disease, d.crop, COUNT(*) AS n, AVG(d.confidence) AS confidence,
               (SELECT d2.severity FROM diagnoses d2
                 WHERE d2.disease = d.disease AND d2.crop IS d.crop
                 ORDER BY d2.created_at DESC LIMIT 1) AS severity
        FROM diagnoses d WHERE d.disease IS NOT NULL
        GROUP BY d.disease, d.crop ORDER BY n DESC LIMIT 12`).all(),
      by_severity: db.prepare(
        'SELECT COALESCE(severity, \'unknown\') AS severity, COUNT(*) AS n FROM diagnoses GROUP BY severity').all(),
      by_county: db.prepare(`
        SELECT COALESCE(f.county, 'Unknown') AS county, COUNT(*) AS n
        FROM diagnoses d LEFT JOIN farmers f ON f.id = d.farmer_id
        GROUP BY county ORDER BY n DESC LIMIT 8`).all(),
    });
  }

  /* ------------------------------------------------------------ prices */
  if (method === 'GET' && resource === 'prices' && !id) {
    const today = db.prepare('SELECT MAX(day) AS day FROM prices').get().day;
    const rows = db.prepare('SELECT crop, market, price_per_kg FROM prices WHERE day = ?').all(today);
    const week = db.prepare(
      `SELECT crop, market, AVG(price_per_kg) AS avg FROM prices
       WHERE day >= date('now','-7 day') GROUP BY crop, market`).all();
    const avgOf = (c, m) => week.find(w => w.crop === c && w.market === m)?.avg ?? null;
    return json(res, 200, {
      day: today,
      fresh: today === dayString(0),
      crops: CROPS,
      markets: MARKETS,
      grid: CROPS.map(crop => ({
        crop,
        cells: MARKETS.map(market => {
          const price = rows.find(r => r.crop === crop && r.market === market)?.price_per_kg ?? null;
          const avg = avgOf(crop, market);
          return {
            market, price, week_avg: avg == null ? null : Math.round(avg * 100) / 100,
            drift: price != null && avg ? Math.round(((price - avg) / avg) * 1000) / 10 : 0,
          };
        }),
      })),
    });
  }

  /* Manual override for the day's quote — what an operator needs when the feed
     is stale or a market reports a correction. It writes into the same table
     the score reads from, so the effect is immediate and auditable. */
  if (method === 'POST' && resource === 'prices' && !id) {
    const b = await readBody(req);
    const crop = requireOneOf(b.crop, CROPS, 'crop').toLowerCase();
    const market = requireOneOf(b.market, MARKETS, 'market');
    const price = requirePositiveNumber(b.price_per_kg, 'price_per_kg', 10_000);
    const day = dayString(0);
    const previous = db.prepare(
      'SELECT price_per_kg FROM prices WHERE crop = ? AND market = ? AND day = ?').get(crop, market, day);
    db.prepare(`INSERT INTO prices (crop, market, day, price_per_kg) VALUES (?,?,?,?)
      ON CONFLICT(crop, market, day) DO UPDATE SET price_per_kg = excluded.price_per_kg`)
      .run(crop, market, day, Math.round(price * 100) / 100);
    scoreCache.clear();   // market timing is scored against these prices
    audit(req, 'price.override', {
      targetType: 'price', targetId: `${crop}|${market}|${day}`, targetLabel: `${crop} · ${market}`,
      detail: { from: previous?.price_per_kg ?? null, to: price },
    });
    return json(res, 200, { crop, market, day, price_per_kg: price });
  }

  /* ----------------------------------------------------- announcements */
  if (method === 'GET' && resource === 'announcements' && !id) {
    return json(res, 200, db.prepare(
      'SELECT * FROM announcements ORDER BY active DESC, created_at DESC LIMIT 100').all());
  }

  if (method === 'POST' && resource === 'announcements' && !id) {
    const b = await readBody(req);
    const title = requireText(b.title, 'title', 90);
    const body = requireText(b.body, 'message', 400);
    const level = requireOneOf(b.level ?? 'info', ANNOUNCEMENT_LEVELS, 'level');
    const county = b.county === '' || b.county == null ? null : requireText(b.county, 'county', 60);
    const newId = crypto.randomUUID();
    db.prepare(`INSERT INTO announcements (id, title, body, level, county, active, created_by)
      VALUES (?,?,?,?,?,1,?)`).run(newId, title, body, level, county, req.account.name);
    audit(req, 'announcement.publish', { targetType: 'announcement', targetId: newId, targetLabel: title, detail: { level, county } });
    return json(res, 201, db.prepare('SELECT * FROM announcements WHERE id = ?').get(newId));
  }

  if (method === 'POST' && resource === 'announcements' && id && action === 'active') {
    const b = await readBody(req);
    const active = b.active ? 1 : 0;
    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!row) return json(res, 404, { error: 'No such announcement' });
    db.prepare('UPDATE announcements SET active = ? WHERE id = ?').run(active, id);
    audit(req, active ? 'announcement.resume' : 'announcement.pause',
      { targetType: 'announcement', targetId: id, targetLabel: row.title });
    return json(res, 200, { id, active: Boolean(active) });
  }

  if (method === 'DELETE' && resource === 'announcements' && id && !action) {
    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!row) return json(res, 404, { error: 'No such announcement' });
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    audit(req, 'announcement.delete', { targetType: 'announcement', targetId: id, targetLabel: row.title });
    return json(res, 200, { id, deleted: true });
  }

  /* -------------------------------------------------------- audit log */
  if (method === 'GET' && resource === 'audit' && !id) {
    // rowid breaks ties: several actions inside the same second are common
    // when an operator works through a list, and they should read in order.
    return json(res, 200, db.prepare(
      'SELECT * FROM admin_actions ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limitParam(120)));
  }

  /* ------------------------------------------------------------ system */
  if (method === 'GET' && resource === 'system' && !id) {
    const dbPath = process.env.MAVUNO_DB || path.join(__dirname, 'mavuno.db');
    const sizeOf = f => { try { return fs.statSync(f).size; } catch { return 0; } };
    const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    return json(res, 200, {
      uptime_s: Math.round(process.uptime()),
      node: process.version,
      started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      payhero: getPayHeroConfigStatus(),
      price_feed: {
        through: db.prepare('SELECT MAX(day) AS day FROM prices').get().day,
        fresh: db.prepare('SELECT MAX(day) AS day FROM prices').get().day === dayString(0),
        rows: count('prices'),
      },
      database: {
        path: dbPath,
        size_bytes: sizeOf(dbPath) + sizeOf(dbPath + '-wal'),
        tables: ['farmers', 'harvests', 'loans', 'diagnoses', 'payment_transactions', 'prices', 'announcements', 'admin_actions']
          .map(t => ({ table: t, rows: count(t) })),
      },
      policy: {
        session_ttl_minutes: SESSION_TTL_MS / 60_000,
        daily_disbursement_cap: DAILY_DISBURSEMENT_CAP,
        rate_limits: RATE_LIMITS,
        lockout_threshold: LOCKOUT_THRESHOLD,
        lockout_minutes: LOCKOUT_MS / 60_000,
        max_farm_acres: MAX_FARM_ACRES,
        payhero_timeout_ms: PAYHERO_TIMEOUT_MS,
      },
      administrators: db.prepare(
        "SELECT id, name, phone, joined_at, status FROM farmers WHERE role = 'admin' ORDER BY joined_at").all(),
      locked_out_now: [...loginFailures.values()].filter(f => f.count >= LOCKOUT_THRESHOLD && Date.now() < f.until).length,
    });
  }

  return json(res, 404, { error: 'Unknown admin endpoint' });
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
/* Same-origin only. The SPA is served by this process, so no cross-origin
   caller has a legitimate reason to reach the API; set ALLOWED_ORIGINS to a
   comma-separated list if you ever host the frontend elsewhere. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;                       // no Origin header (e.g. curl)
  // Chrome sends Origin on same-origin POSTs too, so compare hosts before
  // consulting the allowlist — otherwise the app blocks its own writes.
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch { return false; }                       // unparseable Origin
  if (!ALLOWED_ORIGINS.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  return true;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Bad request');
  }

  res.on('finish', () => {
    // One line per request: method, path, status, duration. Enough to debug
    // a demo gone wrong without a logging dependency.
    if (process.env.QUIET_LOGS !== '1') {
      console.log(`  ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });

  if (!applyCors(req, res)) return json(res, 403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') { res.writeHead(204, SECURITY_HEADERS); return res.end(); }

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
      return res.end();
    }

    // static files
    let filePath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC_DIR, filePath);
    if (!full.startsWith(PUBLIC_DIR + path.sep) && full !== PUBLIC_DIR) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end();
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        // SPA fallback
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404, SECURITY_HEADERS); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
          res.end(html);
        });
        return;
      }
      const ext = path.extname(full);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // The service worker must never be served stale, or a bad version
        // pins itself in the browser.
        'Cache-Control': ext === '.html' || full.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
        ...SECURITY_HEADERS,
      });
      res.end(data);
    });
  } catch (err) {
    if (err.statusCode) return json(res, err.statusCode, { error: err.message });
    console.error(err);
    json(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  🌾 MavunoAI running →  http://localhost:${PORT}`);
  console.log(`     auth: phone + PIN`);
  console.log(`     payhero: ${getPayHeroConfigStatus().mode}\n`);
});

/* Close cleanly so SQLite checkpoints its WAL instead of leaving a 4 MB
   sidecar behind. */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${signal} received — shutting down`);
  server.close(() => {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch {}
    process.exit(0);
  });
  // Don't hang forever on a stuck keep-alive connection.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
