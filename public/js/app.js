/* ================================================================
   MavunoAI frontend — vanilla JS, zero dependencies
   ================================================================ */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const KES = n => 'KES ' + Math.round(n).toLocaleString('en-KE');

/* Activate the deferred Inter stylesheet. The markup ships it as media="print"
   so it never blocks first paint; an inline onload would be refused by the CSP. */
$('#interFont')?.setAttribute('media', 'all');

/* Every value that reaches innerHTML goes through esc(). Disease names,
   markets, seasons and farmer names all originate from user input at some
   point, and unescaped they are a stored-XSS route. */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
const paymentStatusLabel = s => ({
  success: 'paid',
  queued: 'queued',
  failed: 'failed',
  callback_received: 'updated',
})[s] || s || 'pending';

/* ------------------------------------------------ knowledge base */
/* Symptom-signature model: each disease carries a visual signature
   (chlorosis = yellowing, necrosis = browning/dead tissue, spotting =
   dark lesions). The analyser extracts those ratios from the photo
   and ranks diseases by signature distance. */
const DISEASE_KB = {
  maize: [
    { name: 'Maize Lethal Necrosis (MLN)', sci: 'MCMV + SCMV co-infection', sig: { chlorosis: .55, necrosis: .30, spotting: .10 },
      severity: 'high', symptoms: 'Yellow mottling from leaf base, dead heart, premature drying of whole plant.',
      treatment: ['Uproot and burn infected plants immediately — there is no cure', 'Control thrips & aphids (vectors) with imidacloprid', 'Plant certified MLN-free seed next season'],
      prevention: 'Rotate with non-cereal crops for 2 seasons; use tolerant varieties like H12ML.' },
    { name: 'Fall Armyworm damage', sci: 'Spodoptera frugiperda', sig: { chlorosis: .15, necrosis: .25, spotting: .45 },
      severity: 'high', symptoms: 'Ragged holes in leaves, sawdust-like frass in the funnel, windowpane feeding marks.',
      treatment: ['Apply Emamectin benzoate or Lufenuron late evening into the funnel', 'Hand-pick and crush egg masses', 'Apply ash or soil into funnels for light infestations (organic)'],
      prevention: 'Push-pull intercropping with Desmodium + Napier grass cuts infestation by up to 80%.' },
    { name: 'Gray Leaf Spot', sci: 'Cercospora zeae-maydis', sig: { chlorosis: .20, necrosis: .35, spotting: .35 },
      severity: 'medium', symptoms: 'Rectangular grey-brown lesions running parallel to leaf veins.',
      treatment: ['Spray azoxystrobin + propiconazole at first sign', 'Remove crop residue after harvest'],
      prevention: 'Rotate maize with beans or potatoes; avoid overhead irrigation late in the day.' },
    { name: 'Maize Streak Virus', sci: 'MSV, leafhopper-borne', sig: { chlorosis: .60, necrosis: .10, spotting: .15 },
      severity: 'medium', symptoms: 'Broken white-yellow streaks along veins, stunted plants.',
      treatment: ['No chemical cure — rogue out infected plants', 'Control leafhoppers with lambda-cyhalothrin'],
      prevention: 'Early planting at rains onset; use streak-resistant hybrids (DK series).' },
    { name: 'Healthy', sci: 'No pathogen detected', sig: { chlorosis: .05, necrosis: .05, spotting: .05 },
      severity: 'none', symptoms: 'Leaf tissue shows strong uniform green with no lesion pattern.',
      treatment: ['Keep scouting weekly — early detection is your best defence'],
      prevention: 'Maintain balanced NPK feeding and clean field edges.' },
  ],
  beans: [
    { name: 'Angular Leaf Spot', sci: 'Phaeoisariopsis griseola', sig: { chlorosis: .25, necrosis: .30, spotting: .40 },
      severity: 'medium', symptoms: 'Angular brown lesions bounded by veins, grey mould underneath.',
      treatment: ['Spray copper oxychloride or carbendazim weekly', 'Remove infected debris'],
      prevention: 'Use certified seed; rotate 2 seasons away from legumes.' },
    { name: 'Bean Rust', sci: 'Uromyces appendiculatus', sig: { chlorosis: .30, necrosis: .20, spotting: .45 },
      severity: 'medium', symptoms: 'Rusty red-brown pustules on lower leaf surface, yellow halos.',
      treatment: ['Apply triadimefon at first pustules', 'Avoid working fields when wet'],
      prevention: 'Plant resistant varieties (KAT B1); wider spacing improves airflow.' },
    { name: 'Healthy', sci: 'No pathogen detected', sig: { chlorosis: .05, necrosis: .05, spotting: .05 },
      severity: 'none', symptoms: 'Leaf tissue shows strong uniform green with no lesion pattern.',
      treatment: ['Keep scouting weekly'], prevention: 'Maintain field hygiene.' },
  ],
  potatoes: [
    { name: 'Late Blight', sci: 'Phytophthora infestans', sig: { chlorosis: .20, necrosis: .55, spotting: .20 },
      severity: 'high', symptoms: 'Water-soaked dark patches spreading fast, white mould on leaf underside in humid mornings.',
      treatment: ['Spray metalaxyl + mancozeb immediately, repeat every 7 days in wet weather', 'Destroy infected haulms before harvest'],
      prevention: 'Plant certified seed (Shangi is highly susceptible — consider Unica); ridge well.' },
    { name: 'Early Blight', sci: 'Alternaria solani', sig: { chlorosis: .30, necrosis: .30, spotting: .35 },
      severity: 'medium', symptoms: 'Dark concentric "target-board" rings on older leaves first.',
      treatment: ['Spray chlorothalonil or difenoconazole', 'Feed the crop — stressed plants suffer most'],
      prevention: 'Rotate away from tomato/potato fields for 2 seasons.' },
    { name: 'Healthy', sci: 'No pathogen detected', sig: { chlorosis: .05, necrosis: .05, spotting: .05 },
      severity: 'none', symptoms: 'Leaf tissue shows strong uniform green with no lesion pattern.',
      treatment: ['Keep scouting weekly'], prevention: 'Maintain ridging and balanced feeding.' },
  ],
  tomatoes: [
    { name: 'Late Blight', sci: 'Phytophthora infestans', sig: { chlorosis: .20, necrosis: .55, spotting: .20 },
      severity: 'high', symptoms: 'Greasy grey-green patches turning brown, fruits rot from the shoulder.',
      treatment: ['Spray metalaxyl-based fungicide now, alternate with copper', 'Remove and burn infected vines'],
      prevention: 'Stake and prune for airflow; drip irrigate instead of overhead.' },
    { name: 'Bacterial Wilt', sci: 'Ralstonia solanacearum', sig: { chlorosis: .35, necrosis: .30, spotting: .10 },
      severity: 'high', symptoms: 'Sudden wilting on sunny afternoons while leaves stay green; milky ooze from cut stem in water.',
      treatment: ['No chemical cure — uproot and burn, lime the planting hole', 'Do not replant solanaceous crops in that spot'],
      prevention: 'Graft onto resistant rootstock; solarise seedbeds.' },
    { name: 'Healthy', sci: 'No pathogen detected', sig: { chlorosis: .05, necrosis: .05, spotting: .05 },
      severity: 'none', symptoms: 'Leaf tissue shows strong uniform green with no lesion pattern.',
      treatment: ['Keep scouting weekly'], prevention: 'Maintain pruning and feeding schedule.' },
  ],
  cabbage: [
    { name: 'Black Rot', sci: 'Xanthomonas campestris', sig: { chlorosis: .45, necrosis: .30, spotting: .15 },
      severity: 'high', symptoms: 'V-shaped yellow lesions from leaf edges, blackened veins.',
      treatment: ['Spray copper hydroxide', 'Remove infected outer leaves and destroy'],
      prevention: 'Hot-water treat seed (50°C, 25 min); avoid overhead watering.' },
    { name: 'Diamondback Moth damage', sci: 'Plutella xylostella', sig: { chlorosis: .10, necrosis: .15, spotting: .50 },
      severity: 'medium', symptoms: 'Small windowpane holes; green caterpillars under leaves that wriggle when touched.',
      treatment: ['Spray Bacillus thuringiensis (Bt) — resistant to most synthetics', 'Release Diadegma parasitoids if available'],
      prevention: 'Intercrop with onions or tomatoes as repellents.' },
    { name: 'Healthy', sci: 'No pathogen detected', sig: { chlorosis: .05, necrosis: .05, spotting: .05 },
      severity: 'none', symptoms: 'Leaf tissue shows strong uniform green with no lesion pattern.',
      treatment: ['Keep scouting weekly'], prevention: 'Maintain field hygiene.' },
  ],
};

const CROPS = Object.keys(DISEASE_KB);
const state = {
  doctorCrop: 'maize',
  marketCrop: 'maize',
  leafImage: null,
  token: sessionStorage.getItem('mavuno_token') || '',
  farmer: null,
  // 'farmer' or 'admin' — the server decides, and says so on every /api/me.
  role: 'farmer',
};

/* ------------------------------------------------ api client */
/* Identity now travels as a signed Bearer token the server issued, not as a
   client-asserted farmer id. api() attaches it, surfaces a real Error on
   failure so callers can show something useful, and bounces to the login
   screen when the session expires. */
class ApiError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (options.body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError(0, 'No connection to the MavunoAI server');
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    showLogin('Your session expired — sign in again.');
    throw new ApiError(401, body.error || 'Sign in to continue', body);
  }
  if (!res.ok) throw new ApiError(res.status, body.error || `Request failed (${res.status})`, body);
  return body;
}

function setSession(token, farmer, role = 'farmer') {
  state.token = token;
  state.farmer = farmer;
  state.role = role;
  // sessionStorage, not localStorage: the token dies with the tab.
  sessionStorage.setItem('mavuno_token', token);
}

function clearSession() {
  state.token = '';
  state.farmer = null;
  state.role = 'farmer';
  sessionStorage.removeItem('mavuno_token');
}

/* ------------------------------------------------ navigation */
const VIEW_TITLES = {
  dashboard: 'Dashboard', doctor: 'Crop Doctor', markets: 'Markets',
  harvests: 'My Harvests', credit: 'Mavuno Score',
};

function showView(view) {
  // Scoped to #app: the admin console reuses the same rail classes, and an
  // unscoped selector would drive both shells from one click.
  $$('#app .nav-item').forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $$('#app .view').forEach(v => v.classList.remove('active'));
  $('#view-' + view)?.classList.add('active');
  $('#topbarTitle').textContent = VIEW_TITLES[view] || '';
  closeSidebar();

  if (view === 'markets') loadMarkets(state.marketCrop);
  if (view === 'harvests') loadHarvests();
  if (view === 'credit') loadCredit();
  if (view === 'doctor') loadScanHistory();
}

$$('#app .nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
// Cards can deep-link into a view ("View Mavuno Score", "Full report").
$$('#app [data-goto]').forEach(el => el.addEventListener('click', () => showView(el.dataset.goto)));

/* Sidebar toggle. One control, two jobs: on a phone the rail is an overlay
   drawer, so it slides in and out; on a desktop it collapses to an icon rail
   and the choice is remembered for the session. */
const NARROW = () => window.matchMedia('(max-width: 860px)').matches;

const closeSidebar = () => {
  $('#sidebar')?.classList.remove('open');
  if (NARROW()) $('#menuToggle')?.setAttribute('aria-expanded', 'false');
};

function setRailCollapsed(collapsed) {
  $('#app').classList.toggle('nav-collapsed', collapsed);
  $('#menuToggle').setAttribute('aria-expanded', String(!collapsed));
  $('#menuToggle').setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
  sessionStorage.setItem('mavuno_nav_collapsed', collapsed ? '1' : '0');
}
setRailCollapsed(sessionStorage.getItem('mavuno_nav_collapsed') === '1');

$('#menuToggle').addEventListener('click', () => {
  if (NARROW()) {
    const open = $('#sidebar').classList.toggle('open');
    $('#menuToggle').setAttribute('aria-expanded', String(open));
    return;
  }
  setRailCollapsed(!$('#app').classList.contains('nav-collapsed'));
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2600);
}

/* ------------------------------------------------ dashboard */
const WEATHER_EMOJI = { sun: '☀️', 'sun-cloud': '⛅', cloud: '☁️', rain: '🌧️', storm: '⛈️' };
const ADVICE_EMOJI = { leaf: '🌿', shield: '🛡️', seed: '🌱', store: '🏪', rain: '🌧️' };

/* Renders an inline retry panel instead of leaving a half-drawn view with a
   console error, which is what every fetch here used to do on failure. */
function renderError(selector, err, retry) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = `<div class="load-error" role="alert">
      <span>${esc(err.message)}</span>
      <button class="btn btn-ghost btn-retry" type="button">Retry</button>
    </div>`;
  $('.btn-retry', el).addEventListener('click', retry);
}

const setBusy = (selector, on) => $(selector)?.setAttribute('aria-busy', on ? 'true' : 'false');

async function loadDashboard() {
  setBusy('#mScore', true);
  let d;
  try {
    d = await api('/api/dashboard');
  } catch (err) {
    if (err.status !== 401) renderError('#tickerList', err, loadDashboard);
    return;
  } finally {
    setBusy('#mScore', false);
  }

  state.farmer = d.farmer;
  renderAccount(d.farmer);

  const hour = new Date().getHours();
  $('#greeting').textContent =
    (hour < 12 ? 'Habari ya asubuhi' : hour < 17 ? 'Habari ya mchana' : 'Habari ya jioni') +
    ', ' + d.farmer.name.split(' ')[0];

  /* hero metrics. A farmer who has logged nothing yet gets an em-dash and an
     invitation rather than a score of 0 — being new is not a bad record. */
  const firstRun = d.harvestCount === 0;
  $('#mScore').innerHTML = (firstRun ? '<span class="metric-none">—</span>' : d.score) +
    '<span class="metric-of">/ 850</span>';
  $('#mTier').textContent = d.tier;
  // The band is 300–850, so fill the bar against that range rather than 0–850,
  // where every real score would start two thirds of the way along.
  $('#scoreBar').style.width =
    firstRun ? '0%' : Math.max(2, Math.min(100, ((d.score - 300) / 550) * 100)) + '%';
  $('#mRevenue').textContent = KES(d.totalRevenue);
  $('#mHarvests').textContent = d.harvestCount;
  $('#mProduce').textContent = (d.totalKg / 1000).toFixed(1) + ' t';
  $('#weatherCounty').textContent = d.farmer.county;

  // Headline credit number: the largest offer the farmer currently qualifies for.
  const score = await api('/api/score').catch(() => null);
  const best = score?.offers?.length ? Math.max(...score.offers.map(o => o.amount)) : 0;
  $('#mCredit').textContent = best ? best.toLocaleString('en-KE') : '0';
  $('#creditCalloutTitle').textContent = score && !firstRun ? score.tier : 'Your credit standing';
  $('#creditCalloutBody').textContent = best
    ? `You qualify for up to ${KES(best)} in collateral-free financing, priced from your harvest record.`
    : 'Log more seasons to unlock your first collateral-free facility — every harvest raises your score.';

  const advisory = d.advisory || [];
  $('.rec-label', $('#topAdvice')).textContent = firstRun ? 'Start here' : "Today's recommendation";
  $('#topAdviceBody').textContent = firstRun
    ? 'Log your first harvest — one entry activates your Mavuno Score, credit offers and market timing.'
    : advisory.length ? `${advisory[0].title} — ${advisory[0].body}` : '—';

  const rainTotal = d.weather.reduce((sum, w) => sum + (w.rain_mm || 0), 0);
  const wetDays = d.weather.filter(w => w.rain_mm > 0).length;
  $('#weatherFoot').textContent = rainTotal
    ? `≈ ${rainTotal} mm expected over ${wetDays} wet ${wetDays === 1 ? 'day' : 'days'} — plan spraying around it.`
    : 'No rain forecast this week — irrigate where you can.';

  $('#weatherStrip').innerHTML = d.weather.map(w => `
    <div class="weather-day">
      <div class="wd-name">${esc(w.day)}</div>
      <div class="wd-icon" role="img" aria-label="${esc(w.label)}">${WEATHER_EMOJI[w.icon] || '🌤️'}</div>
      <div class="wd-temp">${w.high}° <span>/ ${w.low}°</span></div>
      <div class="wd-rain">${w.rain_mm ? w.rain_mm + ' mm' : ''}</div>
    </div>`).join('');

  $('#tickerList').innerHTML = d.prices.map(p => `
    <div class="ticker">
      <span class="t-crop">${esc(p.crop)}</span>
      <span class="t-price">${p.price.toFixed(1)}</span>
      <span class="badge ${p.change_pct >= 0 ? 'up' : 'down'}">${p.change_pct >= 0 ? '▲' : '▼'} ${Math.abs(p.change_pct)}%</span>
    </div>`).join('');

  // Say which day the prices are from rather than implying they are always today's.
  if (d.prices_as_of) {
    const fresh = d.prices_as_of === new Date().toISOString().slice(0, 10);
    const label = fresh
      ? 'Updated today'
      : 'As of ' + new Date(d.prices_as_of + 'T00:00:00Z').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    $('#pricesAsOf').textContent = label + ' · average across five markets';
    const chip = $('#feedChip');
    chip.textContent = fresh ? 'Prices live' : 'Prices stale';
    chip.className = 'chip ' + (fresh ? 'chip-ok' : 'chip-warn');
  }

  renderNotices(d.announcements || []);

  $('#adviceGrid').innerHTML = advisory.slice(firstRun ? 0 : 1).map(a => `
    <div class="advice">
      <div class="a-icon" aria-hidden="true">${ADVICE_EMOJI[a.icon] || '🌾'}</div>
      <div class="a-title">${esc(a.title)}</div>
      <div class="a-body">${esc(a.body)}</div>
    </div>`).join('');
}

/* Notices published from the admin console. They sit at the head of the
   dashboard because an urgent one — a disease alert, a price collapse — is
   more time-critical than any metric below it. */
const NOTICE_ICON = { info: 'ℹ️', advisory: '⚠️', urgent: '🚨' };

function renderNotices(list) {
  const slot = $('#dashNotices');
  if (!slot) return;
  slot.hidden = !list.length;
  slot.innerHTML = list.map(n => `
    <div class="notice-banner level-${esc(n.level)}" role="note">
      <span class="nb-icon" aria-hidden="true">${NOTICE_ICON[n.level] || 'ℹ️'}</span>
      <div>
        <div class="nb-label">${n.level === 'urgent' ? 'Urgent notice' : n.level === 'advisory' ? 'Advisory' : 'From MavunoAI'}</div>
        <div class="nb-title">${esc(n.title)}</div>
        <div class="nb-body">${esc(n.body)}</div>
      </div>
    </div>`).join('');
}

/* Topbar identity + account menu. This replaces the old profile switcher:
   a session belongs to one farmer, and the only action is signing out. */
function renderAccount(farmer) {
  const initials = farmer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('#topAvatar').textContent = initials;
  $('#topFarmerName').textContent = farmer.name;
  $('#topFarmerMeta').textContent = `${farmer.county} · ${farmer.farm_size_acres} acres`;
}

/* ------------------------------------------------ crop doctor */
function renderCropPills(containerId, onPick, activeCrop) {
  $('#' + containerId).innerHTML = CROPS.map(c =>
    `<button type="button" class="pill ${c === activeCrop ? 'active' : ''}" data-crop="${esc(c)}"
             aria-pressed="${c === activeCrop}">${esc(c)}</button>`).join('');
  $$('#' + containerId + ' .pill').forEach(p => p.addEventListener('click', () => {
    $$('#' + containerId + ' .pill').forEach(x => {
      x.classList.remove('active');
      x.setAttribute('aria-pressed', 'false');
    });
    p.classList.add('active');
    p.setAttribute('aria-pressed', 'true');
    onPick(p.dataset.crop);
  }));
}

renderCropPills('cropPills', c => (state.doctorCrop = c), state.doctorCrop);

const dropzone = $('#dropzone');
const leafInput = $('#leafInput');
dropzone.addEventListener('click', () => leafInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  if (e.dataTransfer.files[0]) handleLeaf(e.dataTransfer.files[0]);
});
leafInput.addEventListener('change', () => leafInput.files[0] && handleLeaf(leafInput.files[0]));

function handleLeaf(file) {
  const url = URL.createObjectURL(file);
  $('#leafPreview').src = url;
  $('#previewWrap').hidden = false;
  state.leafImage = url;
  $('#diagnosisCard').hidden = true;
  $('#doctorEmpty').style.display = '';
}

$('#analyzeBtn').addEventListener('click', async () => {
  if (!state.leafImage) return;
  const btn = $('#analyzeBtn');
  btn.textContent = 'Analysing leaf tissue…';
  btn.disabled = true;
  await new Promise(r => setTimeout(r, 900)); // let the moment breathe
  const features = extractLeafFeatures($('#leafPreview'));
  const result = rankDiseases(state.doctorCrop, features);
  renderDiagnosis(result);
  btn.textContent = 'Diagnose now';
  btn.disabled = false;

  // An unrecognised image is not a finding — don't write it to the farm record.
  if (!result.recognised) return;
  try {
    await api('/api/diagnoses', {
      method: 'POST',
      body: JSON.stringify({
        crop: state.doctorCrop, disease: result.disease.name,
        confidence: result.confidence, severity: result.disease.severity,
      }),
    });
    loadScanHistory();
  } catch (err) {
    if (err.status !== 401) toast('Scan saved locally but not to your record: ' + err.message);
  }
});

/* Colour-signature feature extraction: samples the photo and measures
   chlorosis (yellowing), necrosis (browning) and spotting (dark lesions)
   as fractions of leaf tissue. */
function extractLeafFeatures(img) {
  const canvas = $('#leafCanvas');
  const size = 96;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let green = 0, yellow = 0, brown = 0, dark = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (r + g + b) / 3;
    if (lum > 235) continue; // skip background/glare
    total++;
    if (lum < 55) dark++;
    else if (g > r * 1.12 && g > b * 1.12) green++;
    else if (r > 120 && g > 95 && b < g * 0.75 && r >= g) yellow++;
    else if (r > g && g >= b && r < 160) brown++;
  }
  if (!total) return { chlorosis: 0, necrosis: 0, spotting: 0, tissue: 0 };
  return {
    chlorosis: yellow / total,
    necrosis: brown / total,
    spotting: dark / total,
    // Share of the frame that looks like plant tissue at all — green, yellow,
    // browned or lesioned. A photo of a shoe or the sky matches none of those
    // buckets, so tissue lands near zero. Without this, an image with no
    // damage signal is indistinguishable from a perfectly healthy leaf.
    tissue: (green + yellow + brown + dark) / total,
  };
}

/* Beyond this signature distance the photo does not resemble any leaf in the
   knowledge base. The old code floored confidence at 58%, so a photo of a
   shoe came back as a confident diagnosis — the single most damaging thing
   a judge could stumble into. */
const MAX_SIGNATURE_DISTANCE = 0.42;
/* At least this much of the frame must read as plant tissue before we are
   willing to name a disease. */
const MIN_TISSUE_COVERAGE = 0.35;

function rankDiseases(crop, f) {
  const kb = DISEASE_KB[crop];
  let best = null, bestDist = Infinity;
  for (const d of kb) {
    const dist = Math.hypot(f.chlorosis - d.sig.chlorosis, f.necrosis - d.sig.necrosis, f.spotting - d.sig.spotting);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  // Two independent gates: the frame must look like a leaf, and its damage
  // signature must actually be close to something in the knowledge base.
  const recognised = f.tissue >= MIN_TISSUE_COVERAGE && bestDist <= MAX_SIGNATURE_DISTANCE;
  const confidence = Math.round(Math.max(40, Math.min(96, (1 - bestDist) * 100)));
  return { disease: best, confidence, features: f, recognised, distance: bestDist };
}

function renderUnrecognised(features) {
  $('#doctorEmpty').style.display = 'none';
  const card = $('#diagnosisCard');
  card.hidden = false;
  card.innerHTML = `
    <div class="diag-head">
      <div class="diag-name">🔍 Not recognised as a crop leaf</div>
      <span class="sev unknown">no diagnosis</span>
    </div>
    <div class="diag-sci">The colour signature of this image does not match any leaf in the knowledge base.</div>
    <div class="diag-section"><h4>Try again</h4>
      <ul>
        <li>Fill the frame with a single leaf, front-lit and in focus</li>
        <li>Avoid deep shadow, flash glare and busy backgrounds</li>
        <li>Check you picked the right crop above</li>
      </ul></div>
    <div class="diag-section"><h4>What the scan saw</h4>
      <p>Only ${(features.tissue * 100).toFixed(0)}% of the frame reads as plant tissue
         (yellowing ${(features.chlorosis * 100).toFixed(0)}% · browning ${(features.necrosis * 100).toFixed(0)}% ·
         dark lesions ${(features.spotting * 100).toFixed(0)}%).</p></div>`;
}

function renderDiagnosis({ disease, confidence, features, recognised }) {
  if (!recognised) return renderUnrecognised(features);
  $('#doctorEmpty').style.display = 'none';
  const card = $('#diagnosisCard');
  const healthy = disease.severity === 'none';
  card.hidden = false;
  card.innerHTML = `
    <div class="diag-head">
      <div class="diag-name ${healthy ? 'healthy' : ''}">${healthy ? '✓ ' : '⚠ '}${esc(disease.name)}</div>
      <span class="sev ${esc(disease.severity)}">${healthy ? 'healthy' : esc(disease.severity) + ' risk'}</span>
    </div>
    <div class="diag-sci">${esc(disease.sci)}</div>
    <div class="conf-row"><span>Model confidence</span><span>${confidence}%</span></div>
    <div class="conf-bar"><div class="conf-fill" style="width:0%"></div></div>
    <div class="diag-section"><h4>What the scan saw</h4>
      <p>Yellowing ${(features.chlorosis * 100).toFixed(0)}% · Browning ${(features.necrosis * 100).toFixed(0)}% · Dark lesions ${(features.spotting * 100).toFixed(0)}% of leaf tissue.</p>
      <div class="tissue-bar">
        ${features.chlorosis > 0.01 ? `<div style="width:${(features.chlorosis * 100).toFixed(0)}%;background:#eab308" title="Yellowing"></div>` : ''}
        ${features.necrosis > 0.01 ? `<div style="width:${(features.necrosis * 100).toFixed(0)}%;background:#b45309" title="Browning"></div>` : ''}
        ${features.spotting > 0.01 ? `<div style="width:${(features.spotting * 100).toFixed(0)}%;background:#475569" title="Dark lesions"></div>` : ''}
        ${(1 - features.chlorosis - features.necrosis - features.spotting) > 0.01 ? `<div style="width:${((1 - features.chlorosis - features.necrosis - features.spotting) * 100).toFixed(0)}%;background:var(--primary)" title="Healthy green"></div>` : ''}
      </div>
    </div>
    <div class="diag-section"><h4>Typical symptoms</h4><p>${esc(disease.symptoms)}</p></div>
    <div class="diag-section"><h4>${healthy ? 'Keep it that way' : 'Act now'}</h4>
      <ul>${disease.treatment.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <div class="diag-section"><h4>Prevention</h4><p>${esc(disease.prevention)}</p></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('.conf-fill', card).style.width = confidence + '%';
  }));
}

async function loadScanHistory() {
  let rows;
  try {
    rows = await api('/api/diagnoses');
  } catch (err) {
    if (err.status !== 401) renderError('#scanHistory', err, loadScanHistory);
    return;
  }
  $('#scanHistory').innerHTML = rows.length
    ? rows.map(r => `
        <div class="scan-row">
          <span class="s-disease">${esc(r.disease)}</span>
          <span class="s-meta">${esc(r.crop)} · ${Math.round(r.confidence)}% · ${esc(new Date(r.created_at + 'Z').toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }))}</span>
        </div>`).join('')
    : `<div class="empty-state">
         <span class="empty-icon" aria-hidden="true">🔍</span>
         <p class="empty-title">No scans yet</p>
         <p class="empty-hint">Every leaf you photograph is saved here, building a health record for the farm.</p>
       </div>`;
}

/* ------------------------------------------------ markets */
/* Emerald-led series palette: the primary market reads first, the rest stay
   distinguishable without competing. */
const CHART_COLORS = ['#16a34a', '#065f46', '#0891b2', '#c2410c', '#7c3aed'];

renderCropPills('marketCropPills', c => { state.marketCrop = c; loadMarkets(c); }, state.marketCrop);

async function loadMarkets(crop) {
  let d;
  try {
    d = await api('/api/prices?crop=' + encodeURIComponent(crop));
  } catch (err) {
    if (err.status !== 401) renderError('#bestMarkets', err, () => loadMarkets(crop));
    return;
  }
  $('#chartCropLabel').textContent = crop;
  drawPriceChart(d.series);

  const top = d.best[0];
  const bottom = d.best[d.best.length - 1];
  if (top) {
    $('#bestMarketName').textContent = top.market;
    $('#bestMarketPrice').textContent = top.price.toFixed(1);
  }

  /* The gap between the best and worst market is the number that actually
     changes behaviour, so state it in shillings per kg and then in the money a
     typical load would gain — the abstract spread means little on its own. */
  if (top && bottom && d.best.length > 1) {
    const gap = top.price - bottom.price;
    const pct = (gap / bottom.price) * 100;
    const perTonne = gap * 1000;
    $('#spreadValue').textContent = gap.toFixed(1);
    $('#spreadNote').textContent =
      `${esc(top.market)} is paying ${pct.toFixed(0)}% more than ${esc(bottom.market)} for ${esc(crop)} today.`;
    $('#spreadFoot').textContent = `≈ ${KES(perTonne)} on every tonne you move`;
  } else {
    $('#spreadValue').textContent = '—';
    $('#spreadNote').textContent = 'Not enough markets reporting today to compare.';
    $('#spreadFoot').textContent = '';
  }

  $('#bestMarkets').innerHTML = d.best.map((b, i) => `
    <div class="best-row ${i === 0 ? 'top' : ''}">
      <div>
        <div class="b-market">${esc(b.market)}</div>
        <div class="b-rank">${i === 0 ? 'Best price today' : 'Rank #' + (i + 1)}</div>
      </div>
      <div class="b-price">${b.price.toFixed(1)}<small> /kg</small></div>
    </div>`).join('');
}

function drawPriceChart(series) {
  const svg = $('#priceChart');
  const W = 720, H = 300, PAD = { l: 42, r: 30, t: 14, b: 26 };
  const markets = Object.keys(series);
  const all = markets.flatMap(m => series[m].map(p => p.price_per_kg));
  const min = Math.min(...all) * 0.96, max = Math.max(...all) * 1.04;
  const n = series[markets[0]].length;
  const x = i => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = v => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);

  let out = '';
  // gridlines + y labels
  for (let g = 0; g <= 4; g++) {
    const v = min + (g / 4) * (max - min);
    out += `<line x1="${PAD.l}" y1="${y(v)}" x2="${W - PAD.r}" y2="${y(v)}" stroke="rgba(15,23,42,.07)" stroke-width="1"/>`;
    out += `<text x="${PAD.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${v.toFixed(0)}</text>`;
  }
  // x labels: first, middle, last dates
  const days = series[markets[0]];
  [0, Math.floor(n / 2), n - 1].forEach(i => {
    const dt = new Date(days[i].day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    out += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#94a3b8">${dt}</text>`;
  });
  // lines
  markets.forEach((m, mi) => {
    const pts = series[m].map((p, i) => `${x(i).toFixed(1)},${y(p.price_per_kg).toFixed(1)}`).join(' ');
    out += `<polyline points="${pts}" fill="none" stroke="${CHART_COLORS[mi]}" stroke-width="2.2"
             stroke-linejoin="round" stroke-linecap="round" opacity="${mi === 0 ? 1 : .8}"/>`;
  });

  // hover guides
  out += `<g class="hover-group" style="display:none;">`;
  out += `<line class="hover-line" x1="0" y1="${PAD.t}" x2="0" y2="${H - PAD.b}" stroke="rgba(22,163,74,.45)" stroke-width="1.5" stroke-dasharray="4 4" />`;
  markets.forEach((m, mi) => {
    out += `<circle class="hover-dot-${mi}" r="5" fill="${CHART_COLORS[mi]}" stroke="#ffffff" stroke-width="2" />`;
  });
  out += `</g>`;

  // overlay for mouse interactions
  out += `<rect class="chart-overlay" width="${W}" height="${H}" fill="transparent" style="cursor:crosshair;pointer-events:all;" />`;

  svg.innerHTML = out;

  $('#chartLegend').innerHTML = markets.map((m, i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${CHART_COLORS[i]}"></span>${esc(m)}</span>`).join('');

  // Wire up event listeners
  const overlay = $('.chart-overlay', svg);
  const hoverGroup = $('.hover-group', svg);
  const hoverLine = $('.hover-line', svg);
  
  let tooltip = $('.chart-tooltip', svg.parentNode);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.style.cssText = 'display:none;position:absolute;background:#ffffff;border:1px solid rgba(15,23,42,.10);padding:12px 14px;border-radius:12px;font-size:12.5px;pointer-events:none;box-shadow:0 12px 28px -8px rgba(6,95,70,.22);min-width:206px;color:#1e293b;font-family:var(--sans);z-index:100;';
    svg.parentNode.style.position = 'relative';
    svg.parentNode.appendChild(tooltip);
  }

  function handleHover(e) {
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const index = Math.round(((mx - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    
    if (index >= 0 && index < n) {
      const xVal = x(index);
      
      hoverLine.setAttribute('x1', xVal);
      hoverLine.setAttribute('x2', xVal);
      
      markets.forEach((m, mi) => {
        const dot = $(`.hover-dot-${mi}`, svg);
        if (dot) {
          const yVal = y(series[m][index].price_per_kg);
          dot.setAttribute('cx', xVal);
          dot.setAttribute('cy', yVal);
        }
      });
      
      hoverGroup.style.display = '';
      
      const dateStr = new Date(days[index].day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
      let tooltipHtml = `<div style="font-weight:700;margin-bottom:8px;border-bottom:1px solid rgba(15,23,42,.08);padding-bottom:6px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#16a34a;">${dateStr}</div>`;
      
      markets.forEach((m, mi) => {
        const val = series[m][index].price_per_kg.toFixed(1);
        tooltipHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3.5px;font-size:12px;">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${CHART_COLORS[mi]}"></span>
              ${esc(m.split(' ')[0])}
            </span>
            <strong>${val} KES</strong>
          </div>`;
      });
      
      tooltip.innerHTML = tooltipHtml;
      
      const posX = (e.clientX - rect.left) + 15;
      const posY = (e.clientY - rect.top) - 15;
      
      // Keep tooltip bounded inside container width
      tooltip.style.left = (posX + 210 > rect.width ? posX - 230 : posX) + 'px';
      tooltip.style.top = Math.max(0, Math.min(rect.height - 120, posY)) + 'px';
      tooltip.style.display = 'block';
    }
  }

  overlay.addEventListener('mousemove', handleHover);
  overlay.addEventListener('mouseleave', () => {
    hoverGroup.style.display = 'none';
    tooltip.style.display = 'none';
  });
}

/* ------------------------------------------------ harvests */
async function loadHarvests() {
  const body = $('#ledgerTable tbody');
  body.setAttribute('aria-busy', 'true');
  let rows;
  try {
    rows = await api('/api/harvests');
  } catch (err) {
    if (err.status !== 401) {
      body.innerHTML = `<tr><td colspan="7"><div class="load-error" role="alert">
        <span>${esc(err.message)}</span><button class="btn btn-ghost btn-retry" type="button">Retry</button></div></td></tr>`;
      $('.btn-retry', body).addEventListener('click', loadHarvests);
    }
    return;
  } finally {
    body.setAttribute('aria-busy', 'false');
  }

  body.innerHTML = rows.length ? rows.map(h => `
    <tr>
      <td class="crop-cell">${esc(h.crop)}</td>
      <td>${esc(h.season)}</td>
      <td class="num">${h.quantity_kg.toLocaleString()} kg</td>
      <td class="num">${h.sold_price_per_kg ? esc(h.sold_price_per_kg) + ' /kg' : '<span class="muted">—</span>'}</td>
      <td>${esc(h.market || '—')}</td>
      <td>${esc(new Date(h.harvest_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</td>
      <td class="rev">${h.sold_price_per_kg ? KES(h.quantity_kg * h.sold_price_per_kg) : '—'}</td>
      <td><span class="chip ${h.sold_price_per_kg ? 'chip-mint' : 'chip-info'}">${h.sold_price_per_kg ? 'Sold' : 'In storage'}</span></td>
    </tr>`).join('')
    : '<tr><td colspan="8" class="muted" style="padding:26px 14px">No harvests logged yet — every bag you record builds your credit file.</td></tr>';

  renderHarvestStats(rows);
}

/* Summary tiles above the ledger, computed from the rows already fetched. */
function renderHarvestStats(rows) {
  const totalKg = rows.reduce((s, h) => s + h.quantity_kg, 0);
  const revenue = rows.reduce((s, h) => s + h.quantity_kg * (h.sold_price_per_kg || 0), 0);
  const sold = rows.filter(h => h.sold_price_per_kg).length;
  const seasons = new Set(rows.map(h => h.season)).size;

  $('#statRow').innerHTML = `
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">📦</div>
      <div>
        <div class="stat-num">${(totalKg / 1000).toFixed(1)}<small> t</small></div>
        <div class="stat-label">Total produce</div>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">💰</div>
      <div>
        <div class="stat-num">${KES(revenue)}</div>
        <div class="stat-label">Lifetime revenue</div>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">🧾</div>
      <div>
        <div class="stat-num">${rows.length}<small> entries</small></div>
        <div class="stat-label">${sold} sold · ${rows.length - sold} in storage</div>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">🌦️</div>
      <div>
        <div class="stat-num">${seasons}</div>
        <div class="stat-label">Seasons on record</div>
      </div>
    </div>`;
}

/* ------------------------------------------------ modals */
/* Shared open/close so every modal traps focus, restores it on close and
   responds to Escape — none of them did before. */
let lastFocused = null;

function openModal(id) {
  const modal = $('#' + id);
  lastFocused = document.activeElement;
  modal.hidden = false;
  const focusable = $$('button, input, select, textarea, [href]', modal).filter(el => !el.disabled);
  focusable[0]?.focus();
  modal._focusable = focusable;
}

function closeModal(id) {
  const modal = $('#' + id);
  if (modal.hidden) return;
  modal.hidden = true;
  lastFocused?.focus();
}

document.addEventListener('keydown', e => {
  // The last open one is the top-most: the admin console stacks a confirm
  // dialog over the farmer file, and Escape must dismiss the confirm.
  const modal = $$('.modal-backdrop').filter(m => !m.hidden).pop();
  if (!modal) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(modal.id); return; }
  if (e.key !== 'Tab') return;
  const items = (modal._focusable || []).filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

$('#cancelHarvest').addEventListener('click', () => closeModal('harvestModal'));
$('#harvestModal').addEventListener('click', e => { if (e.target.id === 'harvestModal') closeModal('harvestModal'); });

$('#harvestForm').addEventListener('submit', async e => {
  e.preventDefault();
  const submit = $('button[type=submit]', e.target);
  const body = Object.fromEntries(new FormData(e.target).entries());
  submit.disabled = true;
  submit.textContent = 'Saving…';
  try {
    const { score } = await api('/api/harvests', { method: 'POST', body: JSON.stringify(body) });
    closeModal('harvestModal');
    e.target.reset();
    loadHarvests();
    loadDashboard();
    toast(`Harvest logged — Mavuno Score is now ${score} 🎉`);
  } catch (err) {
    // Show the server's actual complaint instead of a generic guess.
    if (err.status !== 401) toast(err.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Save to ledger';
  }
});

/* ------------------------------------------------ credit */
async function loadCredit() {
  let s;
  try {
    s = await api('/api/score');
  } catch (err) {
    if (err.status !== 401) renderError('#scoreBreakdown', err, loadCredit);
    return;
  }
  drawGauge(s.score);
  $('#gaugeTier').textContent = s.tier;

  $('#gaugeNote').textContent = s.eligible
    ? `You qualify for up to ${KES(Math.max(...s.offers.map(o => o.amount)))} in collateral-free financing.`
    : 'Log more seasons to reach your first credit tier.';

  $('#scoreBreakdown').innerHTML = s.components.map(c => `
    <div class="bk-row">
      <div class="bk-head">
        <span><span class="bk-key">${esc(c.key)}</span> <span class="bk-hint">· ${esc(c.hint)}</span></span>
        <strong>${c.value}%</strong>
      </div>
      <div class="bk-bar" role="meter" aria-label="${esc(c.key)}" aria-valuenow="${c.value}" aria-valuemin="0" aria-valuemax="100">
        <div class="bk-fill" data-w="${c.value}"></div></div>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('#scoreBreakdown .bk-fill').forEach(f => (f.style.width = f.dataset.w + '%'));
  }));

  const loans = await api('/api/loans').catch(err => {
    if (err.status !== 401) renderError('#loanList', err, loadCredit);
    return null;
  });
  if (!loans) return;
  const hasActiveLoan = loans.some(l => l.status === 'approved');

  $('#loanOffers').innerHTML = !s.offers.length
    ? `<div class="no-offers">Log more harvests to unlock loan offers — every season you record raises your score.</div>`
    : s.offers.map((o, i) => `
        <div class="offer">
          <span class="chip chip-mint">${i === 0 ? 'Fast approval' : 'Harvest priority'}</span>
          <div class="o-name">${esc(o.name)}</div>
          <div class="o-desc">${esc(o.desc)}</div>
          <div class="o-amount">${KES(o.amount)}</div>
          <div class="o-terms">
            <div><div class="o-term-label">Repayment term</div><div class="o-term-value">${esc(o.term)} months</div></div>
            <div><div class="o-term-label">Service fee</div><div class="o-term-value">${esc(o.rate)}% / month</div></div>
          </div>
          <div class="payhero-note">Disbursed by PayHero to your registered M-PESA number</div>
          <button type="button" class="btn btn-primary btn-block" data-offer="${esc(o.name)}" ${hasActiveLoan ? 'disabled' : ''}>
            ${hasActiveLoan ? 'Repay your active loan first' : 'Apply &amp; disburse'}</button>
        </div>`).join('');

  $$('#loanOffers [data-offer]').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = 'Sending to PayHero…';
    btn.disabled = true;
    try {
      const loan = await api('/api/loans', { method: 'POST', body: JSON.stringify({ offer: btn.dataset.offer }) });
      const mode = loan.disbursement?.mode === 'demo' ? 'demo queued' : 'queued';
      toast(`${KES(loan.amount)} approved — PayHero ${mode} to M-PESA`);
      loadCredit();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
      btn.textContent = 'Apply & disburse';
      btn.disabled = false;
    }
  }));

  const statusChip = status => status === 'repaid' ? 'chip-mint'
    : status === 'approved' ? 'chip-info' : 'chip-danger';

  $('#loanList').innerHTML = loans.length
    ? loans.map(l => `
        <div class="loan-row">
          <div class="loan-main">
            <span class="loan-title"><strong>${esc(l.purpose)}</strong> · ${KES(l.amount)} · ${esc(l.rate_pct_month)}%/mo × ${esc(l.term_months)} mo</span>
            ${l.payment_reference ? `<span class="payment-meta">PayHero ${esc(paymentStatusLabel(l.payment_status))} · ${esc(l.payment_reference)} · ${esc(l.payment_phone)}</span>` : ''}
          </div>
          <div class="loan-actions">
            <span class="chip ${statusChip(l.status)}">${esc(l.status.replace(/_/g, ' '))}</span>
            ${l.status === 'approved' ? `<button type="button" class="btn btn-ghost btn-sm btn-repay" data-id="${esc(l.id)}">Repay</button>` : ''}
          </div>
        </div>`).join('')
    : `<div class="empty-state">
         <span class="empty-icon" aria-hidden="true">📄</span>
         <p class="empty-title">No facilities yet</p>
         <p class="empty-hint">Approved loans and their repayments appear here once you draw one down.</p>
       </div>`;

  $$('#loanList .btn-repay').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = 'Repaying…';
    btn.disabled = true;
    try {
      const r = await api('/api/loans/repay', { method: 'POST', body: JSON.stringify({ loanId: btn.dataset.id }) });
      toast(r.simulated
        ? `✅ ${KES(r.amount_repaid)} repayment recorded (simulated — no funds collected)`
        : `✅ ${KES(r.amount_repaid)} repayment sent for M-PESA confirmation`);
      loadCredit();
      loadDashboard();
    } catch (err) {
      if (err.status !== 401) toast('❌ ' + err.message);
      btn.textContent = 'Repay';
      btn.disabled = false;
    }
  }));
}

function drawGauge(score) {
  const svg = $('#scoreGauge');
  const cx = 130, cy = 150, r = 105;
  const angle = t => Math.PI * (1 - t); // 0..1 → π..0
  const point = (t, rad) => [cx + rad * Math.cos(angle(t)), cy - rad * Math.sin(angle(t))];
  const arc = (t0, t1, rad) => {
    const [x0, y0] = point(t0, rad), [x1, y1] = point(t1, rad);
    return `M ${x0} ${y0} A ${rad} ${rad} 0 0 1 ${x1} ${y1}`;
  };

  const startScore = 300;
  const targetScore = Math.max(300, Math.min(850, score));
  const startTime = performance.now();
  const duration = 900; // ms

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 3); // outCubic easing
    const currentScore = Math.round(startScore + (targetScore - startScore) * ease);
    const frac = Math.max(0, Math.min(1, (currentScore - 300) / 550));
    const [nx, ny] = point(frac, r - 26);

    svg.innerHTML = `
      <path d="${arc(0, 1, r)}" stroke="#eef2f6" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="${arc(0, Math.max(.02, frac), r)}" stroke="url(#gaugeGrad)" stroke-width="18" fill="none" stroke-linecap="round"/>
      <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#dc2626"/><stop offset=".5" stop-color="#eab308"/><stop offset="1" stop-color="#16a34a"/>
      </linearGradient></defs>
      <circle cx="${nx}" cy="${ny}" r="6" fill="#ffffff" stroke="#16a34a" stroke-width="2.5"/>
      <text x="${cx}" y="${cy - 26}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="54" font-weight="700" letter-spacing="-2" fill="#0f172a">${currentScore}</text>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.6" fill="#94a3b8">MAVUNO SCORE · 300–850</text>
      <text x="${cx - r}" y="${cy + 24}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" font-weight="600" fill="#94a3b8">300</text>
      <text x="${cx + r}" y="${cy + 24}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" font-weight="600" fill="#94a3b8">850</text>`;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

/* ================================================================
   Routing: landing → sign in → dashboard
   There is no profile switcher. A session belongs to exactly one
   farmer, and the only way to become a different one is to sign out
   and sign in again.
   ================================================================ */
const screens = {
  landing: () => $('#landing'),
  login: () => $('#loginScreen'),
  signup: () => $('#signupScreen'),
  app: () => $('#app'),
  admin: () => $('#adminApp'),
};

function showScreen(name) {
  // Don't leave focus inside the subtree we are about to hide — browsers cope,
  // but a keyboard or screen-reader user is left on a node that no longer
  // exists visually.
  document.activeElement?.blur();
  for (const [key, el] of Object.entries(screens)) el().hidden = key !== name;
  window.scrollTo(0, 0);
}

function showLanding() {
  showScreen('landing');
  syncLandingChrome();
  history.replaceState({ screen: 'landing' }, '', '/');
}

/* Landing chrome: condense the sticky header once the hero scrolls past and
   underline the nav link for whichever section is in view. */
const lpNavLinks = $$('.lp-nav a');
const lpSections = lpNavLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);

function syncLandingChrome() {
  const header = $('.lp-header');
  if (!header || $('#landing').hidden) return;
  header.classList.toggle('is-scrolled', window.scrollY > 20);

  const line = window.scrollY + 160;
  let current = -1;
  lpSections.forEach((section, i) => { if (section.offsetTop <= line) current = i; });
  lpNavLinks.forEach((link, i) => link.classList.toggle('is-active', i === current));
}
window.addEventListener('scroll', syncLandingChrome, { passive: true });

/* Last line of defence against autofill. Chrome will still populate a form it
   has decided is a sign-in form, and it can do so after first paint, so the
   fields are blanked when the screen opens and again a beat later — skipping
   anything the farmer has already typed into. */
function clearAuthFields(formSel) {
  const fields = $$(`${formSel} input, ${formSel} select`);
  fields.forEach(el => { el.value = ''; delete el.dataset.touched; });
  setTimeout(() => fields.forEach(el => { if (!el.dataset.touched) el.value = ''; }), 300);
}
$$('#loginForm input, #signupForm input, #signupForm select').forEach(el =>
  el.addEventListener('input', () => { el.dataset.touched = '1'; }));

/* A PIN is digits, so refuse the other characters at the keystroke rather than
   at submit. type="password" happily accepts letters, inputmode only steers a
   phone keypad, and pattern="[0-9]*" fires too late to be useful — the farmer
   has already typed the wrong thing before anything tells them. Filtering the
   value also covers paste and drag-and-drop, which no keydown handler would. */
function restrictChars(el, disallowed) {
  el.addEventListener('input', () => {
    const before = el.value;
    const cleaned = before.replace(disallowed, '');
    if (cleaned === before) return;
    // Put the caret back where the farmer was, less whatever was dropped
    // ahead of it — otherwise a mid-string edit throws them to the end.
    const caret = el.selectionStart ?? before.length;
    const head = before.slice(0, caret);
    const pos = caret - (head.length - head.replace(disallowed, '').length);
    el.value = cleaned;
    el.setSelectionRange(pos, pos);
  });
}
['#loginPin', '#signupPin', '#signupPin2'].forEach(sel => restrictChars($(sel), /\D/g));
// Phone keeps the separators people actually type; the server strips them.
['#loginPhone', '#signupPhone'].forEach(sel => restrictChars($(sel), /[^\d+\s()-]/g));

function showLogin(message = '') {
  showScreen('login');
  clearAuthFields('#loginForm');
  $('#loginError').textContent = message;
  $('#loginError').hidden = !message;
  $('#loginPhone').focus();
  history.replaceState({ screen: 'login' }, '', '/signin');
}

function showSignup(message = '') {
  showScreen('signup');
  clearAuthFields('#signupForm');
  $('#signupError').textContent = message;
  $('#signupError').hidden = !message;
  $('#signupName').focus();
  history.replaceState({ screen: 'signup' }, '', '/signup');
}

function showApp() {
  showScreen('app');
  history.replaceState({ screen: 'app' }, '', '/dashboard');
}

/* Administrators sign in through the same form and land in the console
   instead of a farm record. startAdmin() lives in admin.js. */
function showAdmin() {
  showScreen('admin');
  history.replaceState({ screen: 'admin' }, '', '/admin');
}

/* One entry point for both roles, so login, registration and boot all agree on
   where a session belongs. */
async function enterSession(role) {
  if (role === 'admin') {
    showAdmin();
    await startAdmin();
  } else {
    showApp();
    await startApp();
  }
}

/* "Sign in" goes to the login card; "Get started" goes to registration. */
['#headerSignIn', '#ctaSignIn'].forEach(sel =>
  $(sel)?.addEventListener('click', () => showLogin()));
$('#heroSignIn')?.addEventListener('click', () => showSignup());
$('#goToSignup')?.addEventListener('click', () => showSignup());
$('#goToLogin')?.addEventListener('click', () => showLogin());
$('#backToLanding')?.addEventListener('click', () => showLanding());
$('#signupBackToLanding')?.addEventListener('click', () => showLanding());
$('#loginBackHome')?.addEventListener('click', e => { e.preventDefault(); showLanding(); });
$('#signupBackHome')?.addEventListener('click', e => { e.preventDefault(); showLanding(); });

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const submit = $('button[type=submit]', e.target);
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  $('#loginError').hidden = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: $('#loginPhone').value, pin: $('#loginPin').value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Sign-in failed');
    setSession(body.token, body.farmer, body.role);
    // Clear the credentials before the screen goes away, so a shared handset
    // keeps neither the number nor the PIN. Registration does the same.
    e.target.reset();
    await enterSession(body.role);
    toast(body.role === 'admin'
      ? `Signed in as administrator · ${body.farmer.name}`
      : `Karibu, ${body.farmer.name.split(' ')[0]}`);
  } catch (err) {
    $('#loginError').textContent = err.message;
    $('#loginError').hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in';
    $('#loginPin').value = '';
  }
});

$('#signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const submit = $('button[type=submit]', e.target);
  const fail = message => {
    $('#signupError').textContent = message;
    $('#signupError').hidden = false;
  };

  const pin = $('#signupPin').value;
  if (pin !== $('#signupPin2').value) return fail('The two PINs do not match');

  submit.disabled = true;
  submit.textContent = 'Creating account…';
  $('#signupError').hidden = true;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#signupName').value,
        phone: $('#signupPhone').value,
        county: $('#signupCounty').value,
        farm_size_acres: Number($('#signupAcres').value),
        pin,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not create the account');
    setSession(body.token, body.farmer, body.role || 'farmer');
    // Wipe the details so the next person on a shared handset does not find
    // them waiting in the form.
    e.target.reset();
    showApp();
    await startApp();
    toast(`Karibu MavunoAI, ${body.farmer.name.split(' ')[0]}`);
  } catch (err) {
    fail(err.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Create account';
    $('#signupPin').value = '';
    $('#signupPin2').value = '';
  }
});

/* ------------------------------------------------ sign out */
$('#signOutBtn').addEventListener('click', () => {
  clearSession();
  closeSidebar();
  showLanding();
  toast('Signed out');
});

/* ------------------------------------------------ log-harvest entry points */
$('#topLogHarvest').addEventListener('click', () => openModal('harvestModal'));


/* ------------------------------------------------ boot */
function refreshActiveView() {
  const view = $('#app .nav-item.active')?.dataset.view;
  if (view === 'markets') loadMarkets(state.marketCrop);
  else if (view === 'harvests') loadHarvests();
  else if (view === 'credit') loadCredit();
  else if (view === 'doctor') loadScanHistory();
}

async function startApp() {
  await loadDashboard();
  refreshActiveView();
}

/* Deferred to DOMContentLoaded so admin.js — loaded after this file — has
   defined startAdmin() before a restored administrator session needs it. */
document.addEventListener('DOMContentLoaded', async function boot() {
  // A token in sessionStorage survives a reload, so a signed-in farmer lands
  // straight back on their dashboard instead of the marketing page. The server
  // is asked which shell that is: the client never decides its own role.
  if (state.token) {
    try {
      const me = await api('/api/me');
      state.farmer = me.farmer;
      state.role = me.role;
      await enterSession(me.role);
      return;
    } catch {
      clearSession();   // token rejected — fall through to the landing page
    }
  }
  showLanding();
});

/* Registering the service worker is what makes the offline claim real: the
   app shell keeps loading with no connection. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
