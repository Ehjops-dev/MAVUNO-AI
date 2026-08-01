/* ================================================================
   MavunoAI frontend — vanilla JS, zero dependencies
   ================================================================ */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const KES = n => 'KES ' + Math.round(n).toLocaleString('en-KE');
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
var state = {
  doctorCrop: 'maize',
  marketCrop: 'maize',
  leafImage: null,
  selectedFarmerId: localStorage.getItem('mavuno_farmer_id') || ''
};

// Dynamic profile header interceptor (defined after state initialization to avoid TDZ ReferenceErrors)
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  if (state && state.selectedFarmerId) {
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      options.headers.set('X-Farmer-Id', state.selectedFarmerId);
    } else if (typeof options.headers === 'object') {
      options.headers['X-Farmer-Id'] = state.selectedFarmerId;
    }
  }
  return originalFetch(url, options);
};

/* ------------------------------------------------ navigation */
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + btn.dataset.view).classList.add('active');
  if (btn.dataset.view === 'markets') loadMarkets(state.marketCrop);
  if (btn.dataset.view === 'harvests') loadHarvests();
  if (btn.dataset.view === 'credit') loadCredit();
  if (btn.dataset.view === 'doctor') loadScanHistory();
}));

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

async function loadDashboard() {
  const d = await fetch('/api/dashboard').then(r => r.json());

  const hour = new Date().getHours();
  $('#greeting').textContent =
    (hour < 12 ? 'Habari ya asubuhi' : hour < 17 ? 'Habari ya mchana' : 'Habari ya jioni') +
    ', ' + d.farmer.name.split(' ')[0];

  $('#headScore .head-score-num').textContent = d.score;
  $('#weatherCounty').textContent = d.farmer.county;
  $('#sidebarFarmer .farmer-name').textContent = d.farmer.name;
  $('#sidebarFarmer .farmer-county').textContent = d.farmer.county + ' · ' + d.farmer.farm_size_acres + ' acres';
  $('#sidebarFarmer .avatar').textContent = d.farmer.name.split(' ').map(w => w[0]).join('').slice(0, 2);

  $('#statRow').innerHTML = `
    <div class="stat"><div class="stat-num">${d.harvestCount}</div><div class="stat-label">Harvests logged</div></div>
    <div class="stat"><div class="stat-num">${(d.totalKg / 1000).toFixed(1)}<small> t</small></div><div class="stat-label">Total produce</div></div>
    <div class="stat"><div class="stat-num">${Math.round(d.totalRevenue / 1000)}<small>K KES</small></div><div class="stat-label">Lifetime revenue</div></div>
    <div class="stat"><div class="stat-num" style="color:var(--gold)">${d.tier}</div><div class="stat-label">Credit tier</div></div>`;

  $('#weatherStrip').innerHTML = d.weather.map(w => `
    <div class="weather-day">
      <div class="wd-name">${w.day}</div>
      <div class="wd-icon">${WEATHER_EMOJI[w.icon]}</div>
      <div class="wd-temp">${w.high}° <span>/ ${w.low}°</span></div>
      <div class="wd-rain">${w.rain_mm ? w.rain_mm + ' mm' : ''}</div>
    </div>`).join('');

  $('#tickerList').innerHTML = d.prices.map(p => `
    <div class="ticker">
      <span class="t-crop">${p.crop}</span>
      <span class="t-price">${p.price.toFixed(1)}</span>
      <span class="badge ${p.change_pct >= 0 ? 'up' : 'down'}">${p.change_pct >= 0 ? '▲' : '▼'} ${Math.abs(p.change_pct)}%</span>
    </div>`).join('');

  $('#adviceGrid').innerHTML = d.advisory.map(a => `
    <div class="advice">
      <div class="a-icon">${ADVICE_EMOJI[a.icon] || '🌾'}</div>
      <div class="a-title">${a.title}</div>
      <div class="a-body">${a.body}</div>
    </div>`).join('');
}

/* ------------------------------------------------ crop doctor */
function renderCropPills(containerId, onPick, activeCrop) {
  $('#' + containerId).innerHTML = CROPS.map(c =>
    `<button class="pill ${c === activeCrop ? 'active' : ''}" data-crop="${c}">${c}</button>`).join('');
  $$('#' + containerId + ' .pill').forEach(p => p.addEventListener('click', () => {
    $$('#' + containerId + ' .pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
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
  fetch('/api/diagnoses', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crop: state.doctorCrop, disease: result.disease.name, confidence: result.confidence, severity: result.disease.severity }),
  }).then(loadScanHistory);
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
  if (!total) return { chlorosis: 0, necrosis: 0, spotting: 0 };
  return {
    chlorosis: yellow / total,
    necrosis: brown / total,
    spotting: dark / total,
  };
}

function rankDiseases(crop, f) {
  const kb = DISEASE_KB[crop];
  let best = null, bestDist = Infinity;
  for (const d of kb) {
    const dist = Math.hypot(f.chlorosis - d.sig.chlorosis, f.necrosis - d.sig.necrosis, f.spotting - d.sig.spotting);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  const confidence = Math.round(Math.max(58, Math.min(96, (1 - bestDist) * 100)));
  return { disease: best, confidence, features: f };
}

function renderDiagnosis({ disease, confidence, features }) {
  $('#doctorEmpty').style.display = 'none';
  const card = $('#diagnosisCard');
  const healthy = disease.severity === 'none';
  card.hidden = false;
  card.innerHTML = `
    <div class="diag-head">
      <div class="diag-name ${healthy ? 'healthy' : ''}">${healthy ? '✓ ' : '⚠ '}${disease.name}</div>
      <span class="sev ${disease.severity}">${healthy ? 'healthy' : disease.severity + ' risk'}</span>
    </div>
    <div class="diag-sci">${disease.sci}</div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--cream-dim)">
      <span>Model confidence</span><span>${confidence}%</span>
    </div>
    <div class="conf-bar"><div class="conf-fill" style="width:0%"></div></div>
    <div class="diag-section"><h4>What the scan saw</h4>
      <p>Yellowing ${(features.chlorosis * 100).toFixed(0)}% · Browning ${(features.necrosis * 100).toFixed(0)}% · Dark lesions ${(features.spotting * 100).toFixed(0)}% of leaf tissue.</p>
      <div style="display:flex;height:10px;border-radius:99px;overflow:hidden;background:rgba(242,236,217,.08);margin-top:8px;border:1px solid rgba(242,236,217,.05);">
        ${features.chlorosis > 0.01 ? `<div style="width:${(features.chlorosis * 100).toFixed(0)}%;background:var(--gold);" title="Yellowing"></div>` : ''}
        ${features.necrosis > 0.01 ? `<div style="width:${(features.necrosis * 100).toFixed(0)}%;background:var(--red);" title="Browning"></div>` : ''}
        ${features.spotting > 0.01 ? `<div style="width:${(features.spotting * 100).toFixed(0)}%;background:var(--cream-dim);" title="Dark lesions"></div>` : ''}
        ${(1 - features.chlorosis - features.necrosis - features.spotting) > 0.01 ? `<div style="width:${((1 - features.chlorosis - features.necrosis - features.spotting) * 100).toFixed(0)}%;background:var(--green);" title="Healthy green"></div>` : ''}
      </div>
    </div>
    <div class="diag-section"><h4>Typical symptoms</h4><p>${disease.symptoms}</p></div>
    <div class="diag-section"><h4>${healthy ? 'Keep it that way' : 'Act now'}</h4>
      <ul>${disease.treatment.map(t => `<li>${t}</li>`).join('')}</ul></div>
    <div class="diag-section"><h4>Prevention</h4><p>${disease.prevention}</p></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('.conf-fill', card).style.width = confidence + '%';
  }));
}

async function loadScanHistory() {
  const rows = await fetch('/api/diagnoses').then(r => r.json());
  $('#scanHistory').innerHTML = rows.length
    ? rows.map(r => `
        <div class="scan-row">
          <span class="s-disease">${r.disease}</span>
          <span class="s-meta">${r.crop} · ${Math.round(r.confidence)}% · ${new Date(r.created_at + 'Z').toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
        </div>`).join('')
    : '<div class="scan-row"><span class="s-meta">No scans yet — your scan history builds your farm health record.</span></div>';
}

/* ------------------------------------------------ markets */
const CHART_COLORS = ['#f0a828', '#4cbf6b', '#6fc2e8', '#e5604c', '#c9a0f5'];

renderCropPills('marketCropPills', c => { state.marketCrop = c; loadMarkets(c); }, state.marketCrop);

async function loadMarkets(crop) {
  const d = await fetch('/api/prices?crop=' + crop).then(r => r.json());
  $('#chartCropLabel').textContent = crop;
  drawPriceChart(d.series);
  $('#bestMarkets').innerHTML = d.best.map((b, i) => `
    <div class="best-row">
      <div><div class="b-market">${b.market}</div><div class="b-rank">${i === 0 ? '🏆 best price today' : '#' + (i + 1)}</div></div>
      <div class="b-price">${b.price.toFixed(1)}<small> /kg</small></div>
    </div>`).join('');
}

function drawPriceChart(series) {
  const svg = $('#priceChart');
  const W = 720, H = 300, PAD = { l: 42, r: 12, t: 14, b: 26 };
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
    out += `<line x1="${PAD.l}" y1="${y(v)}" x2="${W - PAD.r}" y2="${y(v)}" stroke="rgba(242,236,217,.07)" stroke-width="1"/>`;
    out += `<text x="${PAD.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="rgba(242,236,217,.45)">${v.toFixed(0)}</text>`;
  }
  // x labels: first, middle, last dates
  const days = series[markets[0]];
  [0, Math.floor(n / 2), n - 1].forEach(i => {
    const dt = new Date(days[i].day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    out += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="rgba(242,236,217,.45)">${dt}</text>`;
  });
  // lines
  markets.forEach((m, mi) => {
    const pts = series[m].map((p, i) => `${x(i).toFixed(1)},${y(p.price_per_kg).toFixed(1)}`).join(' ');
    out += `<polyline points="${pts}" fill="none" stroke="${CHART_COLORS[mi]}" stroke-width="2.2"
             stroke-linejoin="round" stroke-linecap="round" opacity="${mi === 0 ? 1 : .8}"/>`;
  });

  // hover guides
  out += `<g class="hover-group" style="display:none;">`;
  out += `<line class="hover-line" x1="0" y1="${PAD.t}" x2="0" y2="${H - PAD.b}" stroke="rgba(240, 168, 40, 0.35)" stroke-width="1.5" stroke-dasharray="4 4" />`;
  markets.forEach((m, mi) => {
    out += `<circle class="hover-dot-${mi}" r="5" fill="${CHART_COLORS[mi]}" stroke="#122619" stroke-width="1.5" />`;
  });
  out += `</g>`;

  // overlay for mouse interactions
  out += `<rect class="chart-overlay" width="${W}" height="${H}" fill="transparent" style="cursor:crosshair;pointer-events:all;" />`;

  svg.innerHTML = out;

  $('#chartLegend').innerHTML = markets.map((m, i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${CHART_COLORS[i]}"></span>${m}</span>`).join('');

  // Wire up event listeners
  const overlay = $('.chart-overlay', svg);
  const hoverGroup = $('.hover-group', svg);
  const hoverLine = $('.hover-line', svg);
  
  let tooltip = $('.chart-tooltip', svg.parentNode);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.style.cssText = 'display:none;position:absolute;background:rgba(18,38,25,.95);border:1px solid rgba(240,168,40,.45);padding:10px 12px;border-radius:10px;font-size:12.5px;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.65);min-width:200px;color:var(--cream);font-family:var(--sans);z-index:100;';
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
      let tooltipHtml = `<div style="font-weight:700;margin-bottom:6px;border-bottom:1px solid rgba(242,236,217,.1);padding-bottom:4px;font-size:11px;text-transform:uppercase;color:var(--gold);">${dateStr}</div>`;
      
      markets.forEach((m, mi) => {
        const val = series[m][index].price_per_kg.toFixed(1);
        tooltipHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3.5px;font-size:12px;">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${CHART_COLORS[mi]}"></span>
              ${m.split(' ')[0]}
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
  const rows = await fetch('/api/harvests').then(r => r.json());
  $('#ledgerTable tbody').innerHTML = rows.map(h => `
    <tr>
      <td class="crop-cell">${h.crop}</td>
      <td>${h.season}</td>
      <td>${h.quantity_kg.toLocaleString()} kg</td>
      <td>${h.sold_price_per_kg ? h.sold_price_per_kg + ' /kg' : '<span style="color:var(--cream-dim)">unsold</span>'}</td>
      <td>${h.market || '—'}</td>
      <td>${new Date(h.harvest_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
      <td class="rev">${h.sold_price_per_kg ? KES(h.quantity_kg * h.sold_price_per_kg) : '—'}</td>
    </tr>`).join('');
}

$('#addHarvestBtn').addEventListener('click', () => { $('#harvestModal').hidden = false; });
$('#cancelHarvest').addEventListener('click', () => { $('#harvestModal').hidden = true; });
$('#harvestModal').addEventListener('click', e => { if (e.target.id === 'harvestModal') e.target.hidden = true; });

$('#harvestForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const res = await fetch('/api/harvests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.ok) {
    const { score } = await res.json();
    $('#harvestModal').hidden = true;
    e.target.reset();
    loadHarvests();
    loadDashboard();
    toast(`Harvest logged — Mavuno Score is now ${score} 🎉`);
  } else {
    toast('Please fill in all required fields');
  }
});

/* ------------------------------------------------ credit */
async function loadCredit() {
  const s = await fetch('/api/score').then(r => r.json());
  drawGauge(s.score);
  $('#gaugeTier').textContent = s.tier;

  $('#scoreBreakdown').innerHTML = s.components.map(c => `
    <div class="bk-row">
      <div class="bk-head"><span>${c.key} <span class="bk-hint">· ${c.hint}</span></span><strong>${c.value}/100</strong></div>
      <div class="bk-bar"><div class="bk-fill" data-w="${c.value}"></div></div>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('#scoreBreakdown .bk-fill').forEach(f => (f.style.width = f.dataset.w + '%'));
  }));

  $('#loanOffers').innerHTML = s.offers.length
    ? s.offers.map(o => `
        <div class="offer">
          <div class="o-name">${o.name}</div>
          <div class="o-amount">${KES(o.amount)}</div>
          <div class="o-terms">${o.rate}% per month · ${o.term} months · no collateral</div>
          <div class="o-desc">${o.desc}</div>
          <div class="payhero-note">PayHero M-PESA disbursement to your registered phone</div>
          <button class="btn btn-gold" data-offer="${o.name}">Apply & disburse</button>
        </div>`).join('')
    : `<div class="no-offers">Log more harvests to unlock loan offers — every season you record raises your score.</div>`;

  $$('#loanOffers [data-offer]').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = 'Sending to PayHero…';
    btn.disabled = true;
    const res = await fetch('/api/loans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: btn.dataset.offer }),
    });
    if (res.ok) {
      const loan = await res.json();
      const mode = loan.disbursement?.mode === 'demo' ? 'demo queued' : 'queued';
      toast(`${KES(loan.amount)} approved — PayHero ${mode} to M-PESA`);
      loadCredit();
    } else {
      const err = await res.json().catch(() => ({}));
      toast(err.error || 'PayHero disbursement failed');
      btn.textContent = 'Apply & disburse';
      btn.disabled = false;
    }
  }));

  const loans = await fetch('/api/loans').then(r => r.json());
  $('#loanList').innerHTML = loans.length
    ? loans.map(l => `
        <div class="loan-row">
          <div class="loan-main">
            <span><strong>${l.purpose}</strong> · ${KES(l.amount)} · ${l.rate_pct_month}%/mo × ${l.term_months} mo</span>
            ${l.payment_reference ? `<span class="payment-meta">PayHero ${paymentStatusLabel(l.payment_status)} · ${l.payment_reference} · ${l.payment_phone}</span>` : ''}
          </div>
          <div class="loan-actions">
            ${l.payment_status ? `<span class="payment-status ${l.payment_status}">PayHero ${paymentStatusLabel(l.payment_status)}</span>` : ''}
            <span class="loan-status" style="background:${l.status === 'repaid' ? 'var(--green-soft)' : 'var(--gold-soft)'};color:${l.status === 'repaid' ? 'var(--green)' : 'var(--gold)'}">${l.status}</span>
            ${l.status === 'approved' ? `<button class="btn btn-gold btn-repay" data-id="${l.id}" style="padding:4px 10px;font-size:11.5px;border-radius:6px;">Repay</button>` : ''}
          </div>
        </div>`).join('')
    : '<div class="no-offers">No loans yet.</div>';

  $$('#loanList .btn-repay').forEach(btn => btn.addEventListener('click', async () => {
    const loanId = btn.dataset.id;
    btn.textContent = 'Repaying…';
    btn.disabled = true;
    const res = await fetch('/api/loans/repay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loanId }),
    });
    if (res.ok) {
      toast('✅ Loan repaid in full! Your credit history has been updated.');
      loadCredit();
      loadDashboard();
    } else {
      toast('❌ Repayment failed');
      btn.textContent = 'Repay';
      btn.disabled = false;
    }
  }));
}

function drawGauge(score) {
  const svg = $('#scoreGauge');
  const cx = 130, cy = 140, r = 105;
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
      <path d="${arc(0, 1, r)}" stroke="rgba(242,236,217,.1)" stroke-width="16" fill="none" stroke-linecap="round"/>
      <path d="${arc(0, Math.max(.02, frac), r)}" stroke="url(#gaugeGrad)" stroke-width="16" fill="none" stroke-linecap="round"/>
      <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e5604c"/><stop offset=".55" stop-color="#f0a828"/><stop offset="1" stop-color="#4cbf6b"/>
      </linearGradient></defs>
      <circle cx="${nx}" cy="${ny}" r="5" fill="#f2ecd9"/>
      <text x="${cx}" y="${cy - 22}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="52" font-weight="700" fill="#f0a828">${currentScore}</text>
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="11" letter-spacing="2" fill="rgba(242,236,217,.5)">MAVUNO SCORE · 300–850</text>
      <text x="${cx - r}" y="${cy + 18}" text-anchor="middle" font-size="10" fill="rgba(242,236,217,.4)">300</text>
      <text x="${cx + r}" y="${cy + 18}" text-anchor="middle" font-size="10" fill="rgba(242,236,217,.4)">850</text>`;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

/* ------------------------------------------------ USSD simulator */
const ussdModal = $('#ussdModal');
const ussdScreen = $('#ussdScreen');
let ussdState = 'menu';

const USSD_MENU = `MavunoAI  *384*626#
Karibu Amina!

1. Bei za soko (prices)
2. Mavuno Score yangu
3. Angalia hali ya hewa
4. Omba mkopo (loan)
0. Ondoka (exit)`;

$('#ussdBtn').addEventListener('click', async () => {
  ussdModal.hidden = false;
  ussdState = 'menu';
  ussdScreen.textContent = 'Connecting…';
  await new Promise(r => setTimeout(r, 600));
  ussdScreen.textContent = USSD_MENU;
  $('#ussdInput').focus();
});
$('#ussdClose').addEventListener('click', () => { ussdModal.hidden = true; });

async function ussdReply(input) {
  if (ussdState === 'menu') {
    if (input === '1') {
      const d = await fetch('/api/dashboard').then(r => r.json());
      return 'BEI ZA LEO (KES/kg)\n\n' +
        d.prices.map(p => `${p.crop.toUpperCase()}: ${p.price.toFixed(0)} ${p.change_pct >= 0 ? '(+' : '('}${p.change_pct}%)`).join('\n') +
        '\n\n0. Rudi (back)';
    }
    if (input === '2') {
      const s = await fetch('/api/score').then(r => r.json());
      return `MAVUNO SCORE\n\nScore: ${s.score} / 850\nDaraja: ${s.tier}\n${s.eligible ? 'Unastahili mkopo hadi ' + Math.max(...s.offers.map(o => o.amount)).toLocaleString() + ' KES' : 'Weka rekodi zaidi za mavuno'}\n\n0. Rudi (back)`;
    }
    if (input === '3') {
      const d = await fetch('/api/dashboard').then(r => r.json());
      return 'HALI YA HEWA — ' + d.farmer.county.toUpperCase() + '\n\n' +
        d.weather.slice(0, 3).map(w => `${w.day}: ${w.label}, ${w.high}°C${w.rain_mm ? ', mvua ' + w.rain_mm + 'mm' : ''}`).join('\n') +
        '\n\n0. Rudi (back)';
    }
    if (input === '4') {
      const s = await fetch('/api/score').then(r => r.json());
      return s.eligible
        ? `MKOPO\n\nUnastahili:\n${s.offers.map((o, i) => `${i + 1}. ${o.name} — ${o.amount.toLocaleString()} KES`).join('\n')}\n\nTuma nambari kuomba.\n(demo: apply on the web app)\n\n0. Rudi`
        : 'Bado hujafikia kiwango cha mkopo.\nWeka rekodi za mavuno kila msimu.\n\n0. Rudi (back)';
    }
    if (input === '0') { ussdModal.hidden = true; return ''; }
  }
  return USSD_MENU;
}

$('#ussdSend').addEventListener('click', sendUssd);
$('#ussdInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendUssd(); });
async function sendUssd() {
  const v = $('#ussdInput').value.trim();
  if (!v) return;
  $('#ussdInput').value = '';
  ussdScreen.textContent = '…';
  const reply = await ussdReply(v);
  if (reply) ussdScreen.textContent = reply;
}

/* ------------------------------------------------ boot */
initProfileSwitcher().finally(() => {
  loadDashboard();
});

async function initProfileSwitcher() {
  const switcher = $('#profileSwitcher');
  if (!switcher) return;

  try {
    const profiles = await fetch('/api/farmers').then(r => r.json());

    // Prevent stale localStorage IDs from causing crashes
    const isValid = profiles.some(p => p.id === state.selectedFarmerId);
    if (!isValid && profiles.length > 0) {
      state.selectedFarmerId = profiles[0].id;
      localStorage.setItem('mavuno_farmer_id', state.selectedFarmerId);
    }

    switcher.innerHTML = profiles.map(p => 
      `<option value="${p.id}" ${p.id === state.selectedFarmerId ? 'selected' : ''}>${p.name} (${p.county})</option>`
    ).join('');

    switcher.value = state.selectedFarmerId;

    switcher.addEventListener('change', (e) => {
      state.selectedFarmerId = e.target.value;
      localStorage.setItem('mavuno_farmer_id', state.selectedFarmerId);
      loadDashboard();
      const activeNav = $('.nav-item.active');
      if (activeNav) {
        const view = activeNav.dataset.view;
        if (view === 'markets') loadMarkets(state.marketCrop);
        else if (view === 'harvests') loadHarvests();
        else if (view === 'credit') loadCredit();
        else if (view === 'doctor') loadScanHistory();
      }
      toast("Switched farmer profile successfully");
    });
  } catch (err) {
    console.error("Error loading profiles:", err);
  }
}
