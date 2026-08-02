/* ================================================================
   MavunoAI — administrator console
   Loaded after app.js and reuses its primitives ($, esc, api, toast,
   openModal/closeModal). Nothing here decides whether the viewer is an
   administrator: the server answers /api/me and refuses every /api/admin/*
   call from a farmer session. This file only draws what it is given.
   ================================================================ */
'use strict';

const adminState = {
  view: 'overview',
  farmers: { q: '', status: 'all', sort: 'score' },
  loanStatus: 'all',
  paymentDirection: 'all',
  openFarmerId: null,
};

/* SQLite hands back "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, so make
   it explicit before the browser assumes local time and shifts every stamp. */
const asDate = v => new Date(String(v ?? '').includes('T') ? v : String(v ?? '').replace(' ', 'T') + 'Z');
const fmtDate = v => asDate(v).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = v => asDate(v).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtMonth = key => new Date(key + '-01T00:00:00Z')
  .toLocaleDateString('en-KE', { month: 'short', timeZone: 'UTC' });
const num = n => Math.round(Number(n) || 0).toLocaleString('en-KE');
const tonnes = kg => ((Number(kg) || 0) / 1000).toFixed(1) + ' t';

function relTime(v) {
  const diff = (Date.now() - asDate(v).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '—';
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return fmtDate(v);
}

const STATUS_CHIP = {
  approved: 'chip-info', repaid: 'chip-mint', written_off: 'chip-danger',
  cancelled: 'chip-neutral', disbursement_failed: 'chip-danger',
  active: 'chip-mint', suspended: 'chip-danger',
  success: 'chip-mint', queued: 'chip-info', simulated: 'chip-neutral',
  awaiting_confirmation: 'chip-warn', failed: 'chip-danger', timeout: 'chip-warn',
};
const chipFor = s => STATUS_CHIP[s] || 'chip-neutral';
const humanise = s => String(s ?? '—').replace(/_/g, ' ');

/* A key/value row, optionally with a proportion bar under it — the console's
   most repeated shape, so it is written once. */
function alRow({ key, sub, value, valueSub, tone = '', pct = null, barTone = '' }) {
  return `
    <div class="al-row">
      <div class="al-key">${esc(key)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      <div class="al-value ${tone}">${value}${valueSub ? `<small>${esc(valueSub)}</small>` : ''}</div>
      ${pct === null ? '' : `<div class="al-bar ${barTone}"><span data-w="${Math.max(0, Math.min(100, pct))}"></span></div>`}
    </div>`;
}

/* Bars animate from zero on the next frame, matching the score breakdown and
   KPI tracks in the farmer app. */
function growBars(scope) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$(`${scope} .al-bar span`).forEach(b => (b.style.width = b.dataset.w + '%'));
  }));
}

const emptyRow = (cols, message) =>
  `<tr><td colspan="${cols}" class="table-empty">${esc(message)}</td></tr>`;

/* ------------------------------------------------ navigation */
const ADMIN_TITLES = {
  overview: 'Overview', farmers: 'Farmers', credit: 'Credit book',
  payments: 'Payments', health: 'Crop health', markets: 'Market feed',
  notices: 'Announcements', audit: 'Audit trail', system: 'System',
};

const ADMIN_LOADERS = {
  overview: () => loadAdminOverview(),
  farmers: () => loadAdminFarmers(),
  credit: () => loadAdminCredit(),
  payments: () => loadAdminPayments(),
  health: () => loadAdminHealth(),
  markets: () => loadAdminMarkets(),
  notices: () => loadAdminNotices(),
  audit: () => loadAdminAudit(),
  system: () => loadAdminSystem(),
};

function showAdminView(view) {
  adminState.view = view;
  $$('#adminApp .nav-item').forEach(b => {
    const on = b.dataset.adminView === view;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $$('#adminApp .view').forEach(v => v.classList.remove('active'));
  $('#view-admin-' + view)?.classList.add('active');
  $('#adminTopbarTitle').textContent = ADMIN_TITLES[view] || '';
  closeAdminSidebar();
  ADMIN_LOADERS[view]?.();
}

$$('#adminApp .nav-item').forEach(btn =>
  btn.addEventListener('click', () => showAdminView(btn.dataset.adminView)));

const adminNarrow = () => window.matchMedia('(max-width: 860px)').matches;

/* Mirrors setDrawer() in app.js — rail, scrim and body scroll lock move
   together so the console's drawer behaves exactly like the farmer app's. */
function setAdminDrawer(open) {
  $('#adminSidebar')?.classList.toggle('open', open);
  const scrim = $('#adminNavScrim');
  if (scrim) scrim.hidden = !open;
  document.body.classList.toggle('nav-open', open);
  $('#adminMenuToggle')?.setAttribute('aria-expanded', String(open));
}

const closeAdminSidebar = () => {
  if (adminNarrow()) { setAdminDrawer(false); return; }
  $('#adminSidebar')?.classList.remove('open');
};

$('#adminNavScrim')?.addEventListener('click', () => setAdminDrawer(false));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#adminSidebar')?.classList.contains('open')) setAdminDrawer(false);
});

window.matchMedia('(max-width: 860px)').addEventListener('change', e => {
  if (!e.matches) setAdminDrawer(false);
});

$('#adminMenuToggle')?.addEventListener('click', () => {
  if (adminNarrow()) {
    setAdminDrawer(!$('#adminSidebar').classList.contains('open'));
    return;
  }
  const collapsed = $('#adminApp').classList.toggle('nav-collapsed');
  $('#adminMenuToggle').setAttribute('aria-expanded', String(!collapsed));
  $('#adminMenuToggle').setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
});

$('#adminRefresh')?.addEventListener('click', () => {
  ADMIN_LOADERS[adminState.view]?.();
  toast('Refreshed');
});

$('#adminSignOut')?.addEventListener('click', () => {
  clearSession();
  closeAdminSidebar();
  showLanding();
  toast('Signed out');
});

/* ------------------------------------------------ overview */
async function loadAdminOverview() {
  let d;
  try {
    d = await api('/api/admin/overview');
  } catch (err) {
    if (err.status !== 401) renderError('#ovActivity', err, loadAdminOverview);
    return;
  }

  const t = d.totals, c = d.credit;
  $('#ovFarmers').textContent = num(t.farmers);
  const newChip = $('#ovNew');
  newChip.textContent = t.new_30d ? `+${t.new_30d} this month` : 'No new sign-ups';
  newChip.className = 'chip ' + (t.new_30d ? 'chip-mint' : 'chip-neutral');
  $('#ovFarmersNote').textContent = t.suspended
    ? `${num(t.active)} active · ${num(t.suspended)} suspended`
    : `${num(t.active)} active accounts`;

  $('#ovOutstanding').textContent = num(c.active_value);
  $('#ovOutstandingNote').textContent =
    `${c.active_count} live ${c.active_count === 1 ? 'facility' : 'facilities'} · ${KES(c.disbursed_30d)} disbursed in 30 days`;

  $('#ovRepayment').textContent = c.repayment_rate + '%';
  $('#ovRepaymentNote').textContent = `${c.repaid_count} repaid · ${c.overdue_count} past term`;
  const risk = $('#ovRiskChip');
  risk.textContent = c.overdue_count ? `${c.overdue_count} at risk` : 'No arrears';
  risk.className = 'chip ' + (c.overdue_count ? 'chip-warn' : 'chip-mint');

  $('#ovScore').innerHTML = (t.avg_score || '—') + '<span class="metric-of">/ 850</span>';
  $('#ovScoreNote').textContent = `Across ${t.rated} farmer${t.rated === 1 ? '' : 's'} with a harvest history`;

  drawSignupChart(d.signups);
  $('#ovSignupTotal').textContent =
    `${num(d.signups.reduce((s, m) => s + m.count, 0))} joined in the window`;

  $('#ovSubstats').innerHTML = [
    { v: num(t.harvests), l: 'Harvests logged' },
    { v: tonnes(t.tonnes * 1000), l: 'Produce recorded' },
    { v: KES(t.revenue), l: 'Farm revenue tracked' },
    { v: num(t.scans), l: 'Crop scans run' },
  ].map(s => `<div class="admin-substat"><div class="as-value">${esc(s.v)}</div><div class="as-label">${esc(s.l)}</div></div>`).join('');

  const book = c.active_value + c.repaid_value + c.written_off_value || 1;
  $('#ovPortfolio').innerHTML = [
    alRow({ key: 'Outstanding', sub: `${c.active_count} live facilities`, value: KES(c.active_value), pct: (c.active_value / book) * 100 }),
    alRow({ key: 'Repaid', sub: `${c.repaid_count} settled in full`, value: KES(c.repaid_value), tone: 'accent', pct: (c.repaid_value / book) * 100 }),
    alRow({ key: 'Past term', sub: 'Approved but open beyond its term', value: KES(c.overdue_value), tone: c.overdue_value ? 'danger' : '', pct: (c.overdue_value / book) * 100, barTone: 'risk' }),
    alRow({ key: 'Written off', sub: 'Closed without recovery', value: KES(c.written_off_value), pct: (c.written_off_value / book) * 100, barTone: 'warn' }),
    alRow({ key: 'Disbursed · 30 days', sub: `${c.disbursed_30d_count} disbursements`, value: KES(c.disbursed_30d) }),
  ].join('');
  growBars('#ovPortfolio');

  const maxBand = Math.max(1, ...d.score_distribution.map(b => b.count));
  $('#ovRated').textContent = `${t.rated} scored`;
  $('#ovBands').innerHTML = d.score_distribution.map(b => `
    <div class="bk-row">
      <div class="bk-head">
        <span><span class="bk-key">${esc(b.label)}</span> <span class="bk-hint">· ${esc(b.band)}</span></span>
        <strong>${b.count}</strong>
      </div>
      <div class="bk-bar" role="meter" aria-label="${esc(b.label)}" aria-valuenow="${b.count}" aria-valuemin="0" aria-valuemax="${maxBand}">
        <div class="bk-fill" data-w="${(b.count / maxBand) * 100}"></div>
      </div>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('#ovBands .bk-fill').forEach(f => (f.style.width = f.dataset.w + '%'));
  }));

  const actIcon = { harvest: '🌾', loan: '💳', scan: '🍃' };
  $('#ovActivity').innerHTML = d.recent.length ? d.recent.map(a => `
    <div class="activity">
      <span class="act-icon ${esc(a.type)}" aria-hidden="true">${actIcon[a.type] || '•'}</span>
      <div class="act-body">
        <div class="act-who">${esc(a.who)}</div>
        <div class="act-what">${esc(a.what)}</div>
      </div>
      <span class="act-when">${esc(relTime(a.at))}</span>
    </div>`).join('')
    : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🌱</span>
        <p class="empty-title">Nothing has happened yet</p>
        <p class="empty-hint">Harvests, facilities and crop scans appear here as farmers use the platform.</p></div>`;

  const maxCounty = Math.max(1, ...d.counties.map(c2 => c2.farmers));
  $('#ovCounties').innerHTML = d.counties.length
    ? d.counties.map(c2 => alRow({
        key: c2.county || 'Unknown', sub: `${tonnes(c2.kg)} recorded`,
        value: num(c2.farmers), valueSub: c2.farmers === 1 ? 'farmer' : 'farmers',
        pct: (c2.farmers / maxCounty) * 100,
      })).join('')
    : '<p class="muted">No counties on record yet.</p>';
  growBars('#ovCounties');

  const maxCrop = Math.max(1, ...d.crops.map(c2 => c2.kg));
  $('#ovCrops').innerHTML = d.crops.length
    ? d.crops.map(c2 => alRow({
        key: c2.crop, sub: `${c2.entries} ${c2.entries === 1 ? 'entry' : 'entries'} · ${KES(c2.revenue)}`,
        value: tonnes(c2.kg), pct: (c2.kg / maxCrop) * 100,
      })).join('')
    : '<p class="muted">No harvests logged yet.</p>';
  growBars('#ovCrops');

  const chip = $('#adminFeedChip');
  chip.textContent = d.price_feed.fresh ? 'Prices live' : 'Prices stale';
  chip.className = 'chip ' + (d.price_feed.fresh ? 'chip-ok' : 'chip-warn');
}

/* Twelve months of sign-ups. Bars rather than a line: the counts are small
   integers, and a line would imply a continuity that monthly totals do not
   have. */
function drawSignupChart(rows) {
  const svg = $('#ovSignupChart');
  const W = 720, H = 220, PAD = { l: 36, r: 14, t: 18, b: 30 };
  const max = Math.max(1, ...rows.map(r => r.count));
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const slot = plotW / rows.length;
  const bw = Math.min(38, slot * 0.62);
  // Sign-ups are whole people: with a peak of 1 or 2, quarter-way gridlines
  // would repeat the same rounded label three times.
  const ticks = Math.min(4, max);
  const step = max / ticks;

  let out = '';
  for (let g = 0; g <= ticks; g++) {
    const v = step * g;
    const y = PAD.t + plotH - (v / max) * plotH;
    out += `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W - PAD.r}" y2="${y.toFixed(1)}" stroke="rgba(15,23,42,.07)" stroke-width="1"/>`;
    out += `<text x="${PAD.l - 9}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#94a3b8">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
  }
  rows.forEach((r, i) => {
    const h = (r.count / max) * plotH;
    const x = PAD.l + slot * i + (slot - bw) / 2;
    const y = PAD.t + plotH - h;
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}"
             rx="5" fill="${r.count ? 'url(#barGrad)' : 'rgba(15,23,42,.06)'}"><title>${esc(fmtMonth(r.month))} · ${r.count}</title></rect>`;
    if (r.count) {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#065f46">${r.count}</text>`;
    }
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="#94a3b8">${esc(fmtMonth(r.month))}</text>`;
  });
  svg.innerHTML = `<defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#065f46"/>
    </linearGradient></defs>${out}`;
}

/* ------------------------------------------------ farmers */
let farmerSearchTimer;

$('#farmerSearch')?.addEventListener('input', e => {
  clearTimeout(farmerSearchTimer);
  adminState.farmers.q = e.target.value.trim();
  farmerSearchTimer = setTimeout(loadAdminFarmers, 220);
});
$('#farmerStatusFilter')?.addEventListener('change', e => {
  adminState.farmers.status = e.target.value;
  loadAdminFarmers();
});
$('#farmerSort')?.addEventListener('change', e => {
  adminState.farmers.sort = e.target.value;
  loadAdminFarmers();
});

async function loadAdminFarmers() {
  const body = $('#farmerTable tbody');
  body.setAttribute('aria-busy', 'true');
  const { q, status, sort } = adminState.farmers;
  let d;
  try {
    d = await api(`/api/admin/farmers?q=${encodeURIComponent(q)}&status=${status}&sort=${sort}`);
  } catch (err) {
    if (err.status !== 401) {
      body.innerHTML = `<tr><td colspan="9"><div class="load-error" role="alert">
        <span>${esc(err.message)}</span><button class="btn btn-ghost btn-retry" type="button">Retry</button></div></td></tr>`;
      $('.btn-retry', body).addEventListener('click', loadAdminFarmers);
    }
    return;
  } finally {
    body.setAttribute('aria-busy', 'false');
  }

  const rows = d.farmers;
  $('#farmerCount').textContent = `· ${rows.length} of ${d.total}`;

  const scored = rows.filter(r => r.score > 0);
  $('#farmerStats').innerHTML = [
    { icon: '👤', num: num(d.total), label: 'On the register' },
    { icon: '📈', num: scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : '—', label: 'Average score' },
    { icon: '🌾', num: tonnes(rows.reduce((s, r) => s + r.total_kg, 0)), label: 'Produce logged' },
    { icon: '💳', num: KES(rows.reduce((s, r) => s + r.borrowed, 0)), label: 'Lifetime borrowing' },
  ].map(s => `
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">${s.icon}</div>
      <div><div class="stat-num">${esc(String(s.num))}</div><div class="stat-label">${esc(s.label)}</div></div>
    </div>`).join('');

  body.innerHTML = rows.length ? rows.map(f => `
    <tr class="${f.status === 'suspended' ? 'is-suspended' : ''}">
      <td>
        <span class="cell-strong">${esc(f.name)}</span>
        <span class="cell-sub">${esc(f.phone || '—')} · joined ${esc(fmtDate(f.joined_at))}</span>
      </td>
      <td>${esc(f.county || '—')}<span class="cell-sub">${esc(f.farm_size_acres)} acres</span></td>
      <td><span class="score-pill">${f.score || '—'}<small>${esc(f.tier)}</small></span></td>
      <td class="num">${f.harvest_count}</td>
      <td class="num">${esc(tonnes(f.total_kg))}</td>
      <td class="num">${esc(KES(f.revenue))}</td>
      <td class="num">${esc(KES(f.borrowed))}${f.active_loans ? `<span class="cell-sub">${f.active_loans} active</span>` : ''}</td>
      <td><span class="chip ${chipFor(f.status)}">${esc(f.status)}</span></td>
      <td class="row-action"><button type="button" class="btn btn-ghost btn-sm" data-file="${esc(f.id)}">Open file</button></td>
    </tr>`).join('')
    : emptyRow(9, q || status !== 'all'
      ? 'No accounts match that filter.'
      : 'No farmers have registered yet.');

  $$('#farmerTable [data-file]').forEach(btn =>
    btn.addEventListener('click', () => openFarmerFile(btn.dataset.file)));
}

/* ------------------------------------------------ farmer file */
async function openFarmerFile(id) {
  adminState.openFarmerId = id;
  const body = $('#farmerModalBody');
  $('#farmerModalTitle').textContent = 'Farmer file';
  $('#farmerModalSub').textContent = 'Loading…';
  body.innerHTML = '';
  openModal('farmerModal');

  let d;
  try {
    d = await api('/api/admin/farmers/' + encodeURIComponent(id));
  } catch (err) {
    if (err.status !== 401) renderError('#farmerModalBody', err, () => openFarmerFile(id));
    return;
  }
  renderFarmerFile(d);
}

function renderFarmerFile(d) {
  const f = d.farmer;
  const suspended = f.status === 'suspended';
  $('#farmerModalTitle').textContent = f.name;
  $('#farmerModalSub').textContent =
    `${f.phone || 'no number on file'} · ${f.county || 'county unknown'} · ${f.farm_size_acres} acres · joined ${fmtDate(f.joined_at)}`;

  const cells = [
    { label: 'Mavuno Score', value: f.score || '—', sub: f.tier },
    { label: 'Harvests', value: f.harvest_count },
    { label: 'Produce', value: tonnes(f.total_kg) },
    { label: 'Revenue', value: KES(f.revenue) },
    { label: 'Borrowed', value: KES(f.borrowed) },
    { label: 'Scans', value: f.scan_count },
  ];

  $('#farmerModalBody').innerHTML = `
    <div class="file-grid">
      ${cells.map(c => `<div class="file-cell">
        <div class="file-label">${esc(c.label)}</div>
        <div class="file-value">${esc(String(c.value))}</div>
        ${c.sub ? `<div class="al-key"><small>${esc(c.sub)}</small></div>` : ''}
      </div>`).join('')}
    </div>

    ${d.score.components.length ? `
      <div class="file-section">
        <h3>Score breakdown</h3>
        <div class="breakdown">
          ${d.score.components.map(c => `
            <div class="bk-row">
              <div class="bk-head">
                <span><span class="bk-key">${esc(c.key)}</span> <span class="bk-hint">· ${esc(c.hint)}</span></span>
                <strong>${c.value}%</strong>
              </div>
              <div class="bk-bar"><div class="bk-fill" style="width:${c.value}%"></div></div>
            </div>`).join('')}
        </div>
      </div>` : ''}

    <div class="file-section">
      <h3>Harvest ledger · ${d.harvests.length}</h3>
      <div class="mini-scroll">
        <table class="mini-table">
          <thead><tr><th>Date</th><th>Crop</th><th>Season</th><th>Quantity</th><th>Sold @</th><th>Market</th></tr></thead>
          <tbody>${d.harvests.length ? d.harvests.map(h => `
            <tr>
              <td>${esc(fmtDate(h.harvest_date))}</td>
              <td class="crop-cell">${esc(h.crop)}</td>
              <td>${esc(h.season)}</td>
              <td class="num">${num(h.quantity_kg)} kg</td>
              <td class="num">${h.sold_price_per_kg ? esc(h.sold_price_per_kg) + ' /kg' : '—'}</td>
              <td>${esc(h.market || '—')}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="muted">Nothing logged yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="file-section">
      <h3>Facilities · ${d.loans.length}</h3>
      <div class="mini-scroll">
        <table class="mini-table">
          <thead><tr><th>Opened</th><th>Facility</th><th>Amount</th><th>Terms</th><th>Status</th></tr></thead>
          <tbody>${d.loans.length ? d.loans.map(l => `
            <tr>
              <td>${esc(fmtDate(l.created_at))}</td>
              <td>${esc(l.purpose)}</td>
              <td class="num">${esc(KES(l.amount))}</td>
              <td class="num">${esc(l.rate_pct_month)}%/mo × ${esc(l.term_months)} mo</td>
              <td><span class="chip ${chipFor(l.status)}">${esc(humanise(l.status))}</span></td>
            </tr>`).join('') : '<tr><td colspan="5" class="muted">No credit taken.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${d.diagnoses.length ? `
      <div class="file-section">
        <h3>Crop scans · ${d.diagnoses.length}</h3>
        <div class="mini-scroll">
          <table class="mini-table">
            <thead><tr><th>When</th><th>Crop</th><th>Finding</th><th>Confidence</th><th>Severity</th></tr></thead>
            <tbody>${d.diagnoses.map(s => `
              <tr>
                <td>${esc(fmtDate(s.created_at))}</td>
                <td class="crop-cell">${esc(s.crop || '—')}</td>
                <td>${esc(s.disease || '—')}</td>
                <td class="num">${s.confidence == null ? '—' : Math.round(s.confidence * (s.confidence <= 1 ? 100 : 1)) + '%'}</td>
                <td><span class="sev ${esc(s.severity || 'unknown')}">${esc(s.severity || 'unknown')}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

    <div id="filePinSlot"></div>

    <div class="file-actions">
      <button type="button" class="btn btn-ghost" id="fileResetPin">Reset PIN</button>
      <button type="button" class="btn ${suspended ? 'btn-primary' : 'btn-ghost'}" id="fileToggleStatus">
        ${suspended ? 'Restore access' : 'Suspend account'}
      </button>
      <button type="button" class="btn btn-danger" id="fileDelete" style="margin-left:auto">Delete account</button>
    </div>`;

  // The file is fetched after the modal opens, so refresh the focus trap with
  // the controls that have just been drawn.
  const modal = $('#farmerModal');
  modal._focusable = $$('button, input, select, textarea, [href]', modal).filter(el => !el.disabled);

  $('#fileResetPin').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Reset this farmer’s PIN?',
      body: `${f.name} will be signed out of the current PIN. A new four-digit PIN is generated once and shown to you here — read it to them over the phone.`,
      confirmLabel: 'Reset PIN',
    });
    if (!ok) return;
    try {
      const r = await api(`/api/admin/farmers/${encodeURIComponent(f.id)}/reset-pin`, { method: 'POST' });
      $('#filePinSlot').innerHTML = `
        <div class="temp-pin">
          <strong>${esc(r.temp_pin)}</strong>
          <span>Temporary PIN for ${esc(f.name)}. It is stored only as a hash — this is the one time it can be read.</span>
        </div>`;
      toast('PIN reset');
    } catch (err) {
      if (err.status !== 401) toast(err.message);
    }
  });

  $('#fileToggleStatus').addEventListener('click', async () => {
    const next = suspended ? 'active' : 'suspended';
    const ok = await confirmAction({
      title: suspended ? 'Restore this account?' : 'Suspend this account?',
      body: suspended
        ? `${f.name} will be able to sign in again immediately.`
        : `${f.name} will be signed out and refused at the login screen until the account is restored. Their records are kept.`,
      confirmLabel: suspended ? 'Restore access' : 'Suspend',
      danger: !suspended,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/farmers/${encodeURIComponent(f.id)}/status`, {
        method: 'POST', body: JSON.stringify({ status: next }),
      });
      toast(suspended ? 'Account restored' : 'Account suspended');
      openFarmerFile(f.id);
      loadAdminFarmers();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
    }
  });

  $('#fileDelete').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Delete this account permanently?',
      body: `${f.name}, ${f.harvest_count} harvest ${f.harvest_count === 1 ? 'entry' : 'entries'}, ${d.loans.length} facilit${d.loans.length === 1 ? 'y' : 'ies'} and every scan will be erased. This cannot be undone — suspend the account instead if you only need to block access.`,
      confirmLabel: 'Delete permanently',
    });
    if (!ok) return;
    try {
      await api('/api/admin/farmers/' + encodeURIComponent(f.id), { method: 'DELETE' });
      closeModal('farmerModal');
      toast(`${f.name}'s account was deleted`);
      loadAdminFarmers();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
    }
  });
}

$('#closeFarmerModal')?.addEventListener('click', () => closeModal('farmerModal'));
$('#farmerModal')?.addEventListener('click', e => { if (e.target.id === 'farmerModal') closeModal('farmerModal'); });

/* ------------------------------------------------ credit book */
async function loadAdminCredit() {
  const body = $('#loanTable tbody');
  body.setAttribute('aria-busy', 'true');
  let d;
  try {
    d = await api('/api/admin/loans?status=' + adminState.loanStatus);
  } catch (err) {
    if (err.status !== 401) {
      body.innerHTML = `<tr><td colspan="9"><div class="load-error" role="alert">
        <span>${esc(err.message)}</span><button class="btn btn-ghost btn-retry" type="button">Retry</button></div></td></tr>`;
      $('.btn-retry', body).addEventListener('click', loadAdminCredit);
    }
    return;
  } finally {
    body.setAttribute('aria-busy', 'false');
  }

  const all = d.loans;
  const outstanding = all.filter(l => l.status === 'approved');
  $('#loanStats').innerHTML = [
    { icon: '📁', num: d.total, label: 'Facilities on the book' },
    { icon: '💰', num: KES(outstanding.reduce((s, l) => s + l.amount, 0)), label: 'Currently outstanding' },
    { icon: '⏰', num: all.filter(l => l.overdue).length, label: 'Past their term' },
    { icon: '✅', num: d.counts.find(c => c.status === 'repaid')?.n ?? 0, label: 'Repaid in full' },
  ].map(s => `
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">${s.icon}</div>
      <div><div class="stat-num">${esc(String(s.num))}</div><div class="stat-label">${esc(s.label)}</div></div>
    </div>`).join('');

  $('#loanFilters').innerHTML = [{ status: 'all', n: d.total }, ...d.counts].map(c => `
    <button type="button" class="filter-pill ${adminState.loanStatus === c.status ? 'active' : ''}" data-loan-filter="${esc(c.status)}">
      ${esc(humanise(c.status))}<small>${c.n}</small>
    </button>`).join('');
  $$('#loanFilters [data-loan-filter]').forEach(btn => btn.addEventListener('click', () => {
    adminState.loanStatus = btn.dataset.loanFilter;
    loadAdminCredit();
  }));

  body.innerHTML = all.length ? all.map(l => `
    <tr>
      <td><span class="cell-strong">${esc(l.farmer_name)}</span><span class="cell-sub">${esc(l.farmer_county || '—')} · ${esc(l.farmer_phone || '')}</span></td>
      <td>${esc(l.purpose)}${l.payment_reference ? `<span class="cell-sub">${esc(l.payment_reference)} · ${esc(paymentStatusLabel(l.payment_status))}</span>` : ''}</td>
      <td class="num">${esc(KES(l.amount))}</td>
      <td class="num">${esc(KES(l.total_due))}</td>
      <td class="num">${esc(l.rate_pct_month)}%/mo × ${esc(l.term_months)} mo</td>
      <td class="num">${l.score_at_application || '—'}</td>
      <td>${esc(fmtDate(l.created_at))}<span class="cell-sub">${l.days_open} days open</span></td>
      <td>
        <span class="chip ${chipFor(l.status)}">${esc(humanise(l.status))}</span>
        ${l.overdue ? '<span class="chip chip-warn" style="margin-left:6px">past term</span>' : ''}
      </td>
      <td class="row-action">
        ${l.status === 'approved' ? `
          <button type="button" class="btn btn-ghost btn-sm" data-loan-repaid="${esc(l.id)}">Mark repaid</button>
          <button type="button" class="btn btn-ghost btn-sm" data-loan-writeoff="${esc(l.id)}">Write off</button>` : '—'}
      </td>
    </tr>`).join('')
    : emptyRow(9, adminState.loanStatus === 'all'
      ? 'No facilities have been drawn down yet.'
      : `No facilities with status "${humanise(adminState.loanStatus)}".`);

  const setStatus = async (id, status, label) => {
    const loan = all.find(l => l.id === id);
    const ok = await confirmAction({
      title: `${label} this facility?`,
      body: `${loan.farmer_name}'s ${loan.purpose} of ${KES(loan.amount)} will be marked ${humanise(status)}. It changes their repayment score and is written to the audit trail.`,
      confirmLabel: label,
      danger: status === 'written_off',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/loans/${encodeURIComponent(id)}/status`, {
        method: 'POST', body: JSON.stringify({ status }),
      });
      toast(`Facility marked ${humanise(status)}`);
      loadAdminCredit();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
    }
  };
  $$('#loanTable [data-loan-repaid]').forEach(b =>
    b.addEventListener('click', () => setStatus(b.dataset.loanRepaid, 'repaid', 'Mark repaid')));
  $$('#loanTable [data-loan-writeoff]').forEach(b =>
    b.addEventListener('click', () => setStatus(b.dataset.loanWriteoff, 'written_off', 'Write off')));
}

/* ------------------------------------------------ payments */
async function loadAdminPayments() {
  const body = $('#paymentTable tbody');
  body.setAttribute('aria-busy', 'true');
  let d;
  try {
    d = await api('/api/admin/transactions?direction=' + adminState.paymentDirection);
  } catch (err) {
    if (err.status !== 401) {
      body.innerHTML = `<tr><td colspan="8"><div class="load-error" role="alert">
        <span>${esc(err.message)}</span><button class="btn btn-ghost btn-retry" type="button">Retry</button></div></td></tr>`;
      $('.btn-retry', body).addEventListener('click', loadAdminPayments);
    }
    return;
  } finally {
    body.setAttribute('aria-busy', 'false');
  }

  const out = d.totals.find(t => t.direction === 'disbursement') || { n: 0, value: 0 };
  const back = d.totals.find(t => t.direction === 'repayment') || { n: 0, value: 0 };
  $('#paymentStats').innerHTML = [
    { icon: '📤', num: KES(out.value), label: `${out.n} disbursements out` },
    { icon: '📥', num: KES(back.value), label: `${back.n} repayments in` },
    { icon: '⚖️', num: KES(out.value - back.value), label: 'Net exposure' },
    { icon: '🔌', num: d.mode === 'live' ? 'Live' : 'Demo', label: 'PayHero rail' },
  ].map(s => `
    <div class="stat">
      <div class="stat-icon" aria-hidden="true">${s.icon}</div>
      <div><div class="stat-num">${esc(String(s.num))}</div><div class="stat-label">${esc(s.label)}</div></div>
    </div>`).join('');

  $('#paymentFilters').innerHTML = ['all', 'disbursement', 'repayment'].map(dir => `
    <button type="button" class="filter-pill ${adminState.paymentDirection === dir ? 'active' : ''}" data-pay-filter="${dir}">
      ${dir === 'all' ? 'All movement' : humanise(dir) + 's'}
    </button>`).join('');
  $$('#paymentFilters [data-pay-filter]').forEach(btn => btn.addEventListener('click', () => {
    adminState.paymentDirection = btn.dataset.payFilter;
    loadAdminPayments();
  }));

  body.innerHTML = d.transactions.length ? d.transactions.map(t => `
    <tr>
      <td>${esc(fmtDateTime(t.created_at))}</td>
      <td class="cell-strong">${esc(t.farmer_name || '—')}</td>
      <td><span class="chip ${t.direction === 'repayment' ? 'chip-mint' : 'chip-info'}">${esc(humanise(t.direction))}</span></td>
      <td class="num">${esc(KES(t.amount))}</td>
      <td>${esc(t.provider)}</td>
      <td>${esc(t.external_reference || '—')}${t.merchant_reference ? `<span class="cell-sub">${esc(t.merchant_reference)}</span>` : ''}</td>
      <td class="num">${esc(t.phone_number || '—')}</td>
      <td><span class="chip ${chipFor(t.status)}">${esc(humanise(t.status))}</span></td>
    </tr>`).join('')
    : emptyRow(8, 'No money has moved on this instance yet.');
}

/* ------------------------------------------------ crop health */
async function loadAdminHealth() {
  const body = $('#healthTable tbody');
  body.setAttribute('aria-busy', 'true');
  let d;
  try {
    d = await api('/api/admin/diagnoses');
  } catch (err) {
    if (err.status !== 401) renderError('#healthDiseases', err, loadAdminHealth);
    return;
  } finally {
    body.setAttribute('aria-busy', 'false');
  }

  const maxDisease = Math.max(1, ...d.by_disease.map(r => r.n));
  $('#healthDiseases').innerHTML = d.by_disease.length
    ? d.by_disease.map(r => alRow({
        key: r.disease, sub: `${r.crop || 'unknown crop'} · avg confidence ${Math.round((r.confidence || 0) * ((r.confidence || 0) <= 1 ? 100 : 1))}%`,
        value: r.n, valueSub: r.n === 1 ? 'report' : 'reports',
        pct: (r.n / maxDisease) * 100,
        barTone: r.severity === 'high' ? 'risk' : r.severity === 'medium' ? 'warn' : '',
      })).join('')
    : '<p class="muted">No scans have been run yet.</p>';
  growBars('#healthDiseases');

  const totalSev = d.by_severity.reduce((s, r) => s + r.n, 0) || 1;
  const sevOrder = { high: 0, medium: 1, low: 2, none: 3, unknown: 4 };
  $('#healthSeverity').innerHTML = [...d.by_severity]
    .sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9))
    .map(r => `
      <div class="bk-row">
        <div class="bk-head">
          <span><span class="bk-key">${esc(humanise(r.severity))}</span>
            <span class="bk-hint">· ${Math.round((r.n / totalSev) * 100)}% of scans</span></span>
          <strong>${r.n}</strong>
        </div>
        <div class="bk-bar"><div class="bk-fill" style="width:${(r.n / totalSev) * 100}%"></div></div>
      </div>`).join('') || '<p class="muted">Nothing scanned yet.</p>';

  const maxCounty = Math.max(1, ...d.by_county.map(r => r.n));
  $('#healthCounties').innerHTML = d.by_county.length
    ? d.by_county.map(r => alRow({ key: r.county, value: r.n, pct: (r.n / maxCounty) * 100 })).join('')
    : '<p class="muted">No scans on record.</p>';
  growBars('#healthCounties');

  body.innerHTML = d.recent.length ? d.recent.map(r => `
    <tr>
      <td>${esc(fmtDateTime(r.created_at))}</td>
      <td class="cell-strong">${esc(r.farmer_name || '—')}</td>
      <td>${esc(r.county || '—')}</td>
      <td class="crop-cell">${esc(r.crop || '—')}</td>
      <td>${esc(r.disease || '—')}</td>
      <td class="num">${r.confidence == null ? '—' : Math.round(r.confidence * (r.confidence <= 1 ? 100 : 1)) + '%'}</td>
      <td><span class="sev ${esc(r.severity || 'unknown')}">${esc(r.severity || 'unknown')}</span></td>
    </tr>`).join('')
    : emptyRow(7, 'No crop scans have been saved yet.');
}

/* ------------------------------------------------ market feed */
async function loadAdminMarkets() {
  let d;
  try {
    d = await api('/api/admin/prices');
  } catch (err) {
    if (err.status !== 401) renderError('#priceTable', err, loadAdminMarkets);
    return;
  }

  $('#priceDay').textContent = '· ' + fmtDate(d.day);
  const fresh = $('#priceFresh');
  fresh.textContent = d.fresh ? 'Feed current' : 'Feed stale';
  fresh.className = 'chip card-title-action ' + (d.fresh ? 'chip-ok' : 'chip-warn');

  $('#priceHead').innerHTML = '<th scope="col">Crop</th>' +
    d.markets.map(m => `<th scope="col">${esc(m)}</th>`).join('');

  $('#priceTable tbody').innerHTML = d.grid.map(row => `
    <tr>
      <td class="crop-cell">${esc(row.crop)}</td>
      ${row.cells.map(c => `
        <td>
          <button type="button" class="price-cell" data-crop="${esc(row.crop)}" data-market="${esc(c.market)}"
                  data-price="${c.price ?? ''}" title="Correct this quote">
            <span class="pc-price">${c.price == null ? '—' : c.price.toFixed(1)}</span>
            <span class="pc-drift ${c.drift > 0 ? 'up' : c.drift < 0 ? 'down' : ''}">
              ${c.week_avg == null ? 'no 7-day average' : `${c.drift > 0 ? '▲' : c.drift < 0 ? '▼' : '·'} ${Math.abs(c.drift)}% vs 7-day`}
            </span>
          </button>
        </td>`).join('')}
    </tr>`).join('');

  $$('#priceTable .price-cell').forEach(cell => cell.addEventListener('click', () => {
    $('#priceModalSub').textContent =
      `${cell.dataset.crop} · ${cell.dataset.market} · quote for ${fmtDate(d.day)}`;
    const input = $('#priceForm input[name=price_per_kg]');
    input.value = cell.dataset.price || '';
    $('#priceForm').dataset.crop = cell.dataset.crop;
    $('#priceForm').dataset.market = cell.dataset.market;
    $('#priceError').hidden = true;
    openModal('priceModal');
  }));
}

$('#cancelPrice')?.addEventListener('click', () => closeModal('priceModal'));
$('#priceModal')?.addEventListener('click', e => { if (e.target.id === 'priceModal') closeModal('priceModal'); });

$('#priceForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const submit = $('button[type=submit]', form);
  submit.disabled = true;
  submit.textContent = 'Saving…';
  try {
    await api('/api/admin/prices', {
      method: 'POST',
      body: JSON.stringify({
        crop: form.dataset.crop,
        market: form.dataset.market,
        price_per_kg: Number($('input[name=price_per_kg]', form).value),
      }),
    });
    closeModal('priceModal');
    toast('Quote updated — scores recalculated');
    loadAdminMarkets();
  } catch (err) {
    if (err.status !== 401) {
      $('#priceError').textContent = err.message;
      $('#priceError').hidden = false;
    }
  } finally {
    submit.disabled = false;
    submit.textContent = 'Save quote';
  }
});

/* ------------------------------------------------ announcements */
async function loadAdminNotices() {
  let rows;
  try {
    rows = await api('/api/admin/announcements');
  } catch (err) {
    if (err.status !== 401) renderError('#noticeList', err, loadAdminNotices);
    return;
  }

  $('#noticeList').innerHTML = rows.length ? rows.map(n => `
    <div class="notice level-${esc(n.level)} ${n.active ? '' : 'is-paused'}">
      <div class="notice-main">
        <div class="notice-title">${esc(n.title)}</div>
        <div class="notice-body">${esc(n.body)}</div>
        <div class="notice-meta">
          ${esc(n.county || 'All counties')} · ${esc(n.level)} · published ${esc(fmtDateTime(n.created_at))}
          ${n.created_by ? ' by ' + esc(n.created_by) : ''}
        </div>
      </div>
      <div class="notice-actions">
        <span class="chip ${n.active ? 'chip-mint' : 'chip-neutral'}">${n.active ? 'live' : 'paused'}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-notice-toggle="${esc(n.id)}" data-active="${n.active ? '1' : '0'}">
          ${n.active ? 'Pause' : 'Resume'}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" data-notice-delete="${esc(n.id)}">Delete</button>
      </div>
    </div>`).join('')
    : `<div class="empty-state">
         <span class="empty-icon" aria-hidden="true">📣</span>
         <p class="empty-title">No announcements published</p>
         <p class="empty-hint">Publish one to put a notice at the top of every targeted farmer's dashboard.</p>
       </div>`;

  $$('#noticeList [data-notice-toggle]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/api/admin/announcements/${encodeURIComponent(btn.dataset.noticeToggle)}/active`, {
        method: 'POST', body: JSON.stringify({ active: btn.dataset.active !== '1' }),
      });
      loadAdminNotices();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
    }
  }));

  $$('#noticeList [data-notice-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Delete this announcement?',
      body: 'It disappears from every farmer dashboard immediately. Pause it instead if you may want it back.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api('/api/admin/announcements/' + encodeURIComponent(btn.dataset.noticeDelete), { method: 'DELETE' });
      toast('Announcement deleted');
      loadAdminNotices();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
    }
  }));
}

/* The audience list is the same county list the sign-up form offers, so a
   notice can never be addressed to a county nobody can register in. */
function fillAnnouncementCounties() {
  const select = $('#announcementCounty');
  if (!select || select.dataset.filled) return;
  const counties = $$('#signupCounty option').map(o => o.value).filter(Boolean);
  select.insertAdjacentHTML('beforeend',
    counties.map(c => `<option value="${esc(c)}">${esc(c)} only</option>`).join(''));
  select.dataset.filled = '1';
}

$('#newAnnouncement')?.addEventListener('click', () => {
  fillAnnouncementCounties();
  $('#announcementForm').reset();
  $('#announcementError').hidden = true;
  openModal('announcementModal');
});
$('#cancelAnnouncement')?.addEventListener('click', () => closeModal('announcementModal'));
$('#announcementModal')?.addEventListener('click', e => { if (e.target.id === 'announcementModal') closeModal('announcementModal'); });

$('#announcementForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const submit = $('button[type=submit]', e.target);
  const body = Object.fromEntries(new FormData(e.target).entries());
  submit.disabled = true;
  submit.textContent = 'Publishing…';
  try {
    await api('/api/admin/announcements', { method: 'POST', body: JSON.stringify(body) });
    closeModal('announcementModal');
    e.target.reset();
    toast('Announcement published');
    loadAdminNotices();
  } catch (err) {
    if (err.status !== 401) {
      $('#announcementError').textContent = err.message;
      $('#announcementError').hidden = false;
    }
  } finally {
    submit.disabled = false;
    submit.textContent = 'Publish';
  }
});

/* ------------------------------------------------ audit trail */
async function loadAdminAudit() {
  const body = $('#auditTable tbody');
  body.setAttribute('aria-busy', 'true');
  let rows;
  try {
    rows = await api('/api/admin/audit');
  } catch (err) {
    if (err.status !== 401) {
      body.innerHTML = `<tr><td colspan="5"><div class="load-error" role="alert">
        <span>${esc(err.message)}</span><button class="btn btn-ghost btn-retry" type="button">Retry</button></div></td></tr>`;
      $('.btn-retry', body).addEventListener('click', loadAdminAudit);
    }
    return;
  } finally {
    body.setAttribute('aria-busy', 'false');
  }

  const describe = detail => {
    if (!detail) return '—';
    let parsed;
    try { parsed = JSON.parse(detail); } catch { return detail; }
    if (parsed.from !== undefined && parsed.to !== undefined) {
      return `${humanise(parsed.from ?? 'none')} → ${humanise(parsed.to)}`;
    }
    return Object.entries(parsed).map(([k, v]) => `${humanise(k)}: ${v ?? 'all'}`).join(' · ');
  };

  body.innerHTML = rows.length ? rows.map(a => `
    <tr>
      <td>${esc(fmtDateTime(a.created_at))}<span class="cell-sub">${esc(relTime(a.created_at))}</span></td>
      <td class="cell-strong">${esc(a.admin_name || a.admin_id)}</td>
      <td><span class="chip ${a.action.includes('delete') || a.action.includes('suspend') ? 'chip-danger' : 'chip-info'}">${esc(humanise(a.action))}</span></td>
      <td>${esc(a.target_label || '—')}<span class="cell-sub">${esc(a.target_type || '')}</span></td>
      <td>${esc(describe(a.detail))}</td>
    </tr>`).join('')
    : emptyRow(5, 'No administrative actions recorded yet.');
}

/* ------------------------------------------------ system */
async function loadAdminSystem() {
  let d;
  try {
    d = await api('/api/admin/system');
  } catch (err) {
    if (err.status !== 401) renderError('#sysRuntime', err, loadAdminSystem);
    return;
  }

  const uptime = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  };
  const mb = b => (b / 1048576).toFixed(2) + ' MB';

  $('#sysRuntime').innerHTML = [
    alRow({ key: 'Uptime', value: esc(uptime(d.uptime_s)) }),
    alRow({ key: 'Started', value: esc(fmtDateTime(d.started_at)) }),
    alRow({ key: 'Node.js', value: esc(d.node) }),
    alRow({ key: 'Price feed', sub: `${num(d.price_feed.rows)} quotes stored`, value: esc(fmtDate(d.price_feed.through)), tone: d.price_feed.fresh ? 'accent' : 'danger' }),
    alRow({ key: 'Accounts locked out now', value: d.locked_out_now, tone: d.locked_out_now ? 'danger' : '' }),
  ].join('');

  const p = d.policy;
  $('#sysPolicy').innerHTML = [
    alRow({ key: 'Session lifetime', value: p.session_ttl_minutes + ' min' }),
    alRow({ key: 'Daily disbursement cap', sub: 'Per farmer, rolling 24 hours', value: KES(p.daily_disbursement_cap) }),
    alRow({ key: 'PIN lockout', value: `${p.lockout_threshold} tries`, valueSub: `${p.lockout_minutes} min lock` }),
    alRow({ key: 'Rate limits', sub: 'auth · write · read, per minute', value: `${p.rate_limits.auth.limit} · ${p.rate_limits.write.limit} · ${p.rate_limits.read.limit}` }),
    alRow({ key: 'Maximum farm size', value: num(p.max_farm_acres) + ' acres' }),
    alRow({ key: 'Payment gateway timeout', value: p.payhero_timeout_ms + ' ms' }),
  ].join('');

  $('#sysDatabase').innerHTML = [
    alRow({ key: 'On disk', sub: esc(d.database.path), value: esc(mb(d.database.size_bytes)) }),
    ...d.database.tables.map(t => alRow({ key: t.table, value: num(t.rows) })),
  ].join('');

  $('#sysAdmins').innerHTML = d.administrators.map(a => alRow({
    key: a.name, sub: `${a.phone || 'no number'} · since ${fmtDate(a.joined_at)}`,
    value: `<span class="chip ${chipFor(a.status)}">${esc(a.status)}</span>`,
  })).join('');

  const ph = d.payhero;
  $('#sysPayhero').innerHTML = [
    alRow({ key: 'Mode', sub: ph.mode === 'live' ? 'Real M-PESA disbursements' : 'Simulated — no funds move', value: `<span class="chip ${ph.mode === 'live' ? 'chip-mint' : 'chip-neutral'}">${esc(ph.mode)}</span>` }),
    alRow({ key: 'API credentials', value: ph.has_auth ? '✓ configured' : '— missing', tone: ph.has_auth ? 'accent' : '' }),
    alRow({ key: 'Channel ID', value: ph.has_channel_id ? '✓ configured' : '— missing', tone: ph.has_channel_id ? 'accent' : '' }),
    alRow({ key: 'Callback URL', sub: ph.callback_url || 'not set', value: ph.has_callback_url ? '✓ set' : '— missing', tone: ph.has_callback_url ? 'accent' : '' }),
  ].join('');
}

/* ------------------------------------------------ confirm dialog */
/* A promise-returning modal instead of window.confirm(): it can name what is
   about to happen, and it does not freeze the page while it waits. */
function confirmAction({ title, body, confirmLabel = 'Confirm', danger = true }) {
  return new Promise(resolve => {
    $('#confirmTitle').textContent = title;
    $('#confirmBody').textContent = body;
    const ok = $('#confirmOk');
    ok.textContent = confirmLabel;
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    openModal('confirmModal');

    const finish = answer => {
      ok.removeEventListener('click', onOk);
      $('#confirmCancel').removeEventListener('click', onCancel);
      $('#confirmModal').removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      closeModal('confirmModal');
      resolve(answer);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = e => { if (e.target.id === 'confirmModal') finish(false); };
    // The shared Escape handler closes the dialog; this settles the promise
    // that was waiting on it, rather than leaving the caller hanging.
    const onKey = e => { if (e.key === 'Escape') finish(false); };

    ok.addEventListener('click', onOk);
    $('#confirmCancel').addEventListener('click', onCancel);
    $('#confirmModal').addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

/* ------------------------------------------------ boot */
/* Called by app.js once the server has confirmed the session is an
   administrator's — never from this file's own judgement. */
async function startAdmin() {
  const me = state.farmer || (await api('/api/me')).farmer;
  state.farmer = me;
  const initials = me.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('#adminAvatar').textContent = initials;
  $('#adminName').textContent = me.name;
  $('#adminMeta').textContent = me.phone || 'Administrator';
  // The account is an institution, not a person, so it gets a room name rather
  // than "Habari, MavunoAI" — who is signed in belongs in the sub-line.
  $('#adminSubline').textContent =
    `Signed in as ${me.name}. Every farmer, facility and shilling on MavunoAI, as of this moment.`;
  showAdminView(adminState.view);
}
