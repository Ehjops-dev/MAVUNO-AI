/**
 * MavunoAI — hackathon pitch deck generator.
 * Run:  node docs/make_presentation.js
 * Output: docs/MavunoAI-Pitch.pptx  (12 slides, speaker notes with presenter assignments)
 */
'use strict';
const path = require('path');
const pptxgen = require('pptxgenjs');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5

/* palette — forest & harvest gold, matching the app */
const DARK = '12261A';      // deep forest (dark slides)
const PANEL = '1C3325';     // card on dark
const CREAM = 'F2ECD9';
const CREAM_DIM = 'BDB79F';
const GOLD = 'F0A828';
const GREEN = '2E7D46';
const WHITE = 'FFFFFF';
const INK = '1C2B21';       // text on light
const LIGHT_BG = 'FFFFFF';
const LIGHT_CARD = 'F1F4EE';

const W = 13.33, H = 7.5;
const HEAD = { fontFace: 'Bookman Old Style' };
const BODY = { fontFace: 'Calibri' };

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: DARK };
  return s;
}
function lightSlide(kicker, title, presenter) {
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.42, w: 9, h: 0.35, ...BODY, fontSize: 13, bold: true, color: GREEN, charSpacing: 3, margin: 0 });
  s.addText(title, { x: 0.6, y: 0.72, w: 12.1, h: 0.95, ...HEAD, fontSize: 34, bold: true, color: INK, margin: 0 });
  if (presenter) s.addText(presenter, { x: 10.6, y: 0.42, w: 2.15, h: 0.35, ...BODY, fontSize: 11, italic: true, color: CREAM_DIM, align: 'right', margin: 0 });
  return s;
}
function statCard(s, x, y, w, h, big, label, sub, dark = false) {
  s.addShape('roundRect', { x, y, w, h, rectRadius: 0.09, fill: { color: dark ? PANEL : LIGHT_CARD }, line: { type: 'none' } });
  s.addText(big, { x: x + 0.25, y: y + 0.22, w: w - 0.5, h: h * 0.44, ...HEAD, fontSize: 40, bold: true, color: GOLD, margin: 0 });
  s.addText(label, { x: x + 0.25, y: y + h * 0.52, w: w - 0.5, h: 0.4, ...BODY, fontSize: 15, bold: true, color: dark ? CREAM : INK, margin: 0 });
  s.addText(sub, { x: x + 0.25, y: y + h * 0.52 + 0.4, w: w - 0.5, h: h - (h * 0.52 + 0.55), ...BODY, fontSize: 11.5, color: dark ? CREAM_DIM : '5A6B5D', margin: 0 });
}
function iconRow(s, x, y, w, emoji, title, body, dark = false) {
  s.addShape('ellipse', { x, y, w: 0.62, h: 0.62, fill: { color: GOLD } });
  s.addText(emoji, { x: x - 0.06, y: y - 0.03, w: 0.75, h: 0.68, fontSize: 22, align: 'center', valign: 'middle', margin: 0 });
  s.addText(title, { x: x + 0.82, y: y - 0.06, w: w - 0.82, h: 0.36, ...BODY, fontSize: 16, bold: true, color: dark ? CREAM : INK, margin: 0 });
  s.addText(body, { x: x + 0.82, y: y + 0.30, w: w - 0.82, h: 0.75, ...BODY, fontSize: 12.5, color: dark ? CREAM_DIM : '4A584C', margin: 0 });
}

/* ================================================== 1 · TITLE */
{
  const s = darkSlide();
  s.addText('🌾', { x: 0.65, y: 0.85, w: 1.2, h: 1.1, fontSize: 54, margin: 0 });
  s.addText('MavunoAI', { x: 0.6, y: 2.0, w: 12, h: 1.35, ...HEAD, fontSize: 72, bold: true, color: CREAM, margin: 0 });
  s.addText([
    { text: 'Turning harvests into ', options: { color: CREAM } },
    { text: 'credit history.', options: { color: GOLD, italic: true } },
  ], { x: 0.6, y: 3.35, w: 12, h: 0.7, ...HEAD, fontSize: 30, margin: 0 });
  s.addText('Farm intelligence + agricultural credit scoring for Kenya\'s 4.5 million smallholder farmers', {
    x: 0.6, y: 4.25, w: 9.5, h: 0.5, ...BODY, fontSize: 16, color: CREAM_DIM, margin: 0 });
  s.addText('AGRI-TECH  ×  FIN-TECH', { x: 0.6, y: 5.9, w: 5, h: 0.4, ...BODY, fontSize: 14, bold: true, color: GOLD, charSpacing: 4, margin: 0 });
  s.addText('[Team name] — [Member 1] · [Member 2] · [Member 3] · [Member 4]', {
    x: 0.6, y: 6.4, w: 12, h: 0.4, ...BODY, fontSize: 13, color: CREAM_DIM, margin: 0 });
  s.addNotes(
`PRESENTER 1 (opener) — ~40 seconds
"Good [morning], judges. Every one of us in this room ate something today that started on a farm smaller than a football pitch. Kenya has 4.5 million of those farms. They feed this country — and yet the farmer who grew your breakfast cannot borrow five thousand shillings from a bank. We are [team name], and we built MavunoAI to change that. Our one-line pitch: M-PESA turned airtime behaviour into credit history. We turn harvests into credit history."
TIP: Memorise the last two sentences — deliver them slowly, looking at the judges, not the screen.`);
}

/* ================================================== 2 · PROBLEM */
{
  const s = lightSlide('The problem', 'Three exclusions crush the smallholder farmer', 'Presenter 1');
  statCard(s, 0.6, 2.0, 3.95, 4.4, '20–40%', 'of yield lost to disease', 'Pests and disease destroy up to four bags in every ten (FAO). One extension officer serves ~1,000 farmers — help arrives after the field is gone.');
  statCard(s, 4.69, 2.0, 3.95, 4.4, '40–60%', 'of the price taken by middlemen', 'The farmer sells at whatever the broker quotes at the farm gate. Same-day maize prices differ 25%+ between Kisumu and Nairobi — the farmer never sees it.');
  statCard(s, 8.78, 2.0, 3.95, 4.4, '< 4%', 'of bank credit reaches agriculture', 'A fifth of Kenya\'s GDP receives one twenty-fifth of its credit (CBK). No payslip, no title deed, no credit history — no loan. Twenty good seasons count for nothing.');
  s.addText('Each problem feeds the next: unseen disease shrinks the harvest, blind selling shrinks the income, and the bank sees nothing at all.', {
    x: 0.6, y: 6.65, w: 12.1, h: 0.5, ...BODY, fontSize: 14, italic: true, color: GREEN, margin: 0 });
  s.addNotes(
`PRESENTER 1 — ~60 seconds
Walk the three cards left to right. Key line: "These are not three problems. They are one problem wearing three masks — the farmer is invisible: invisible to the agronomist, invisible to the market, invisible to the bank."
NUMBERS TO OWN IF ASKED: FAO estimates 20-40% of yields lost to pests/disease globally; Kenya's extension ratio ~1:1,000 vs FAO's recommended 1:400; CBK bank supervision reports put agricultural lending below 4% of gross loans while agriculture is ~21.8% of GDP (KNBS).`);
}

/* ================================================== 3 · MEET AMINA */
{
  const s = lightSlide('The person behind the numbers', 'Meet Amina — 3.5 acres in Uasin Gishu', 'Presenter 2');
  s.addShape('roundRect', { x: 0.6, y: 2.0, w: 5.4, h: 4.6, rectRadius: 0.09, fill: { color: DARK }, line: { type: 'none' } });
  s.addText('👩🏾‍🌾', { x: 2.55, y: 2.35, w: 1.6, h: 1.5, fontSize: 72, align: 'center', margin: 0 });
  s.addText('Amina Chebet', { x: 0.9, y: 4.05, w: 4.8, h: 0.5, ...HEAD, fontSize: 24, bold: true, color: CREAM, align: 'center', margin: 0 });
  s.addText('Maize · beans · potatoes\n8 harvests over 5 seasons · 12 tonnes produced\nKES 548,000 lifetime revenue', {
    x: 0.9, y: 4.6, w: 4.8, h: 1.3, ...BODY, fontSize: 14, color: CREAM_DIM, align: 'center', margin: 0 });
  iconRow(s, 6.6, 2.25, 6.1, '🌽', 'Her maize yellowed last season', 'She sprayed the wrong chemical on a virus. The agrovet guessed. A third of the field was lost before anyone knew what it was.');
  iconRow(s, 6.6, 3.75, 6.1, '🚚', 'She sold at the farm gate for 41/kg', 'That same week, Kisumu wholesale paid 54. The broker knew. She didn\'t.');
  iconRow(s, 6.6, 5.25, 6.1, '🏦', 'The bank asked for a payslip', 'Five seasons of successful farming — and no document the bank would read. She borrowed from a shylock at 20% a month instead.');
  s.addNotes(
`PRESENTER 2 — ~45 seconds
Make it human. "Amina is real — she is the demo account you are about to see. Five seasons, twelve tonnes, half a million shillings of produce... and she is thin-file. The system has no file on the most productive thing she does." Pause. "Watch what happens when her farming itself becomes the file."
TRANSITION: hand straight into the solution slide.`);
}

/* ================================================== 4 · SOLUTION */
{
  const s = darkSlide();
  s.addText('THE SOLUTION', { x: 0.6, y: 0.42, w: 9, h: 0.35, ...BODY, fontSize: 13, bold: true, color: GOLD, charSpacing: 3, margin: 0 });
  s.addText('One platform. Three superpowers. One loop.', { x: 0.6, y: 0.72, w: 12.1, h: 0.95, ...HEAD, fontSize: 34, bold: true, color: CREAM, margin: 0 });
  const cards = [
    ['🍃', 'AI Crop Doctor', 'Photograph a sick leaf → instant diagnosis, treatment and prevention from a 14-disease Kenyan knowledge base. Runs on-device — works with no data bundle.'],
    ['📈', 'Market Intelligence', '60-day price trends across 5 major markets, plus the best market to sell in today. The farmer negotiates from knowledge, not desperation.'],
    ['💳', 'Mavuno Score™', 'Every harvest logged builds a 300–850 credit score from 5 farm signals — unlocking collateral-free input loans disbursed to M-PESA.'],
  ];
  cards.forEach(([emoji, title, body], i) => {
    const x = 0.6 + i * 4.09;
    pres; // no-op
    s.addShape('roundRect', { x, y: 2.0, w: 3.95, h: 3.6, rectRadius: 0.09, fill: { color: PANEL }, line: { type: 'none' } });
    s.addShape('ellipse', { x: x + 0.3, y: 2.3, w: 0.8, h: 0.8, fill: { color: GOLD } });
    s.addText(emoji, { x: x + 0.26, y: 2.28, w: 0.9, h: 0.85, fontSize: 30, align: 'center', valign: 'middle', margin: 0 });
    s.addText(title, { x: x + 0.3, y: 3.3, w: 3.35, h: 0.5, ...BODY, fontSize: 18, bold: true, color: CREAM, margin: 0 });
    s.addText(body, { x: x + 0.3, y: 3.8, w: 3.35, h: 1.7, ...BODY, fontSize: 12.5, color: CREAM_DIM, margin: 0 });
  });
  s.addText([
    { text: 'The loop:  ', options: { bold: true, color: GOLD } },
    { text: 'diagnosis protects the harvest → price intelligence raises its value → the record of both becomes her credit identity. Each use of the app makes the next loan cheaper.', options: { color: CREAM } },
  ], { x: 0.6, y: 5.95, w: 12.1, h: 0.85, ...BODY, fontSize: 15, margin: 0 });
  s.addText('📟  Plus a USSD channel (*384*626#) — full service on any feature phone, in Kiswahili.', {
    x: 0.6, y: 6.85, w: 12.1, h: 0.4, ...BODY, fontSize: 13, color: CREAM_DIM, margin: 0 });
  s.addNotes(
`PRESENTER 2 — ~60 seconds
Present the three pillars fast, then SLOW DOWN on "the loop" line — that is the architecture of the win. "Competitors built a diagnosis app OR a price app OR a lender. We built the loop that connects them: the better she farms, the more she can borrow. And the 40% of rural Kenya on feature phones? Same backend, over USSD."
TRANSITION: "Don't take our word for it — let us show you." → live demo.`);
}

/* ================================================== 5 · DEMO MAP */
{
  const s = lightSlide('Live demonstration', 'What you are about to see (3 minutes)', 'Presenter 3 drives · Presenter 2 narrates');
  const steps = [
    ['1', 'Dashboard', 'Amina\'s shamba at a glance: weather, prices, agronomy advice, score 733'],
    ['2', 'Crop Doctor', 'Upload a diseased maize leaf → diagnosis + treatment in seconds'],
    ['3', 'Markets', 'Maize: 54.7/kg in Kisumu vs 40.5 in Nairobi today — the middleman\'s secret, exposed'],
    ['4', 'Log a harvest', 'Watch her Mavuno Score rise live as the bag enters the ledger'],
    ['5', 'One-tap loan', 'KES 50,000 input advance approved against her score. No payslip. No title deed.'],
    ['6', 'USSD finale', 'The same power on a feature phone, in Kiswahili'],
  ];
  steps.forEach(([n, t, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.25, y = 2.0 + row * 1.55;
    s.addShape('ellipse', { x, y: y + 0.12, w: 0.55, h: 0.55, fill: { color: GREEN } });
    s.addText(n, { x, y: y + 0.12, w: 0.55, h: 0.55, ...BODY, fontSize: 18, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0 });
    s.addText(t, { x: x + 0.75, y, w: 5.3, h: 0.4, ...BODY, fontSize: 16, bold: true, color: INK, margin: 0 });
    s.addText(b, { x: x + 0.75, y: y + 0.38, w: 5.3, h: 0.75, ...BODY, fontSize: 12, color: '4A584C', margin: 0 });
  });
  s.addText('Everything is live software — one command, zero dependencies, no internet required.', {
    x: 0.6, y: 6.75, w: 12.1, h: 0.4, ...BODY, fontSize: 13.5, italic: true, color: GREEN, margin: 0 });
  s.addNotes(
`PRESENTER 3 drives the laptop; PRESENTER 2 narrates — ~3 minutes total, rehearse to 2:30.
DEMO CHECKLIST (before you go on stage):
1. Delete mavuno.db to reset Amina to the clean seeded state, then run: node server.js
2. Open http://localhost:4500 and leave it on the dashboard.
3. Have 2-3 real diseased-leaf photos saved on the desktop.
KEY MOMENTS: after the loan approval say NOTHING for two seconds — let the "approved" toast sit on screen. Then: "No payslip. No title deed. Just her harvests."
IF WIFI DIES: nothing changes — the entire system runs locally. Say so out loud; it lands well.`);
}

/* ================================================== 6 · SCORE ENGINE */
{
  const s = lightSlide('The fintech core', 'Inside the Mavuno Score™', 'Presenter 3');
  const factors = [
    ['Season consistency', '25%', 'Distinct seasons logged — shows discipline, the #1 repayment predictor'],
    ['Yield trend (per crop)', '20%', 'Is she getting better at farming? Compared within each crop, fairly'],
    ['Market timing', '20%', 'Does she sell at fair prices? Proof she uses information well'],
    ['Repayment record', '20%', 'Neutral start; repaid loans raise it, active loans discount it'],
    ['Crop diversification', '15%', 'More crops = lower covariate risk for the lender'],
  ];
  factors.forEach(([name, wt, desc], i) => {
    const y = 2.0 + i * 0.88;
    s.addShape('roundRect', { x: 0.6, y, w: 7.4, h: 0.74, rectRadius: 0.07, fill: { color: LIGHT_CARD }, line: { type: 'none' } });
    s.addText(wt, { x: 0.85, y: y + 0.08, w: 0.95, h: 0.55, ...HEAD, fontSize: 20, bold: true, color: GOLD, valign: 'middle', margin: 0 });
    s.addText([
      { text: name + '  —  ', options: { bold: true, color: INK } },
      { text: desc, options: { color: '4A584C' } },
    ], { x: 1.85, y: y + 0.08, w: 6.0, h: 0.58, ...BODY, fontSize: 12.5, valign: 'middle', margin: 0 });
  });
  s.addShape('roundRect', { x: 8.35, y: 2.0, w: 4.38, h: 4.28, rectRadius: 0.09, fill: { color: DARK }, line: { type: 'none' } });
  s.addText('733', { x: 8.35, y: 2.5, w: 4.38, h: 1.1, ...HEAD, fontSize: 64, bold: true, color: GOLD, align: 'center', margin: 0 });
  s.addText('AMINA\'S SCORE · BAND 300–850', { x: 8.35, y: 3.7, w: 4.38, h: 0.35, ...BODY, fontSize: 11, color: CREAM_DIM, align: 'center', charSpacing: 2, margin: 0 });
  s.addText('Prime Harvester tier\n→ KES 50,000 inputs advance @ 1.2%/mo\n→ KES 120,000 equipment loan @ 1.5%/mo', {
    x: 8.65, y: 4.25, w: 3.8, h: 1.4, ...BODY, fontSize: 13, color: CREAM, align: 'center', margin: 0 });
  s.addText('Transparent by design: the farmer sees every factor and how to improve it — unlike satellite or telco black-box scoring.', {
    x: 0.6, y: 6.6, w: 12.1, h: 0.55, ...BODY, fontSize: 14, italic: true, color: GREEN, margin: 0 });
  s.addNotes(
`PRESENTER 3 — ~60 seconds
This is the slide that wins the fintech track. Explain: "Five signals, all from data the farmer creates by using the app. The score starts at 300 and is EARNED. And unlike Apollo Agriculture's satellite scoring or telco black boxes, Amina can see exactly why she scores 733 and exactly what raises it. A transparent score changes farmer behaviour — that is the flywheel."
IF ASKED "can't farmers fake harvests?": phase 2 counter-verifies via cooperative delivery records and buyer confirmations; self-reported data is discounted until verified; and lending starts small and grows with repayment — the same trust-laddering M-Shwari used.`);
}

/* ================================================== 7 · WHY KENYA, WHY NOW */
{
  const s = lightSlide('Why Kenya, why now', 'Four forces converge on this moment', 'Presenter 4');
  iconRow(s, 0.6, 2.1, 6.0, '🏦', 'The credit gap is national policy', 'Agriculture: ~21.8% of GDP, under 4% of bank credit. Closing this gap is explicit in the Bottom-Up Economic Transformation Agenda.');
  iconRow(s, 0.6, 3.75, 6.0, '📱', 'Behavioural scoring is already normal', 'M-Shwari, Fuliza and the Hustler Fund bank tens of millions on behavioural data. A harvest-based score extends a proven Kenyan model.');
  iconRow(s, 6.9, 2.1, 6.0, '🛰️', 'The rails are already laid', '30M+ M-PESA users for instant disbursement; USSD reaches every feature phone; KAMIS price data exists and needs a farmer-facing layer.');
  iconRow(s, 6.9, 3.75, 6.0, '🌾', 'Food security is urgent', 'After the worst drought in 40 years, every percentage point of yield saved by early diagnosis is national food supply.');
  s.addShape('roundRect', { x: 0.6, y: 5.5, w: 12.15, h: 1.45, rectRadius: 0.09, fill: { color: DARK }, line: { type: 'none' } });
  s.addText([
    { text: 'The market: ', options: { bold: true, color: GOLD } },
    { text: '4.5 million smallholder households. If MavunoAI reaches 5% of them with an average loan book of KES 15,000, that is a ', options: { color: CREAM } },
    { text: 'KES 3.4 billion lending market', options: { bold: true, color: GOLD } },
    { text: ' — before a single shilling of input-supplier commission or insurance premium.', options: { color: CREAM } },
  ], { x: 0.95, y: 5.7, w: 11.5, h: 1.05, ...BODY, fontSize: 15, valign: 'middle', margin: 0 });
  s.addNotes(
`PRESENTER 4 — ~60 seconds
This is the "investability" slide. Land the four forces quickly, then the market math slowly. "We are not asking Kenya to believe something new. Kenya already believes in behavioural credit — it invented it at scale. We are pointing that belief at the largest under-served sector in the economy."
IF ASKED about regulation: digital credit providers are licensed under CBK's Digital Credit Providers Regulations 2022 — our model is to partner with licensed SACCOs/MFIs via API rather than lend off our own balance sheet at first.`);
}

/* ================================================== 8 · GDP vs CREDIT CHART */
{
  const s = lightSlide('The gap in one picture', 'A fifth of the economy, a fortieth of the credit', 'Presenter 4');
  s.addChart(pres.ChartType.bar, [{
    name: 'Share (%)',
    labels: ['Share of GDP (direct)', 'Share of employment', 'Share of bank credit'],
    values: [21.8, 40, 3.7],
  }], {
    x: 1.4, y: 2.0, w: 10.5, h: 4.3,
    barDir: 'col',
    chartColors: [GREEN, GOLD, 'B85042'],
    varyColors: true,
    showTitle: false,
    showLegend: false,
    showValue: true,
    dataLabelPosition: 'outEnd',
    dataLabelColor: INK,
    dataLabelFontSize: 16,
    dataLabelFontBold: true,
    dataLabelFormatCode: '0.#"%"',
    catAxisLabelColor: INK,
    catAxisLabelFontSize: 13,
    valAxisLabelColor: '8A9A8D',
    valAxisLabelFontSize: 11,
    valAxisMaxVal: 45,
    valGridLine: { color: 'E2E8E0', size: 1 },
    catGridLine: { style: 'none' },
  });
  s.addText('Sources: KNBS Economic Survey; Central Bank of Kenya Bank Supervision Annual Report.', {
    x: 1.4, y: 6.5, w: 10.5, h: 0.35, ...BODY, fontSize: 10.5, color: '8A9A8D', margin: 0 });
  s.addNotes(
`PRESENTER 4 — ~25 seconds
One sentence, then silence: "Agriculture employs four in ten Kenyans, produces a fifth of GDP — and receives under four percent of bank credit. That red bar is the business we are in." Let the chart breathe. Move on.`);
}

/* ================================================== 9 · ENGINEERING */
{
  const s = darkSlide();
  s.addText('ENGINEERING RIGOUR', { x: 0.6, y: 0.42, w: 9, h: 0.35, ...BODY, fontSize: 13, bold: true, color: GOLD, charSpacing: 3, margin: 0 });
  s.addText('Built like production software, not a demo', { x: 0.6, y: 0.72, w: 12.1, h: 0.95, ...HEAD, fontSize: 34, bold: true, color: CREAM, margin: 0 });
  statCard(s, 0.6, 2.0, 3.95, 2.2, '29 / 29', 'automated tests passing', 'Every endpoint, the scoring engine, validation, security and concurrency — reproducible with one command.', true);
  statCard(s, 4.69, 2.0, 3.95, 2.2, '0', 'runtime dependencies', 'Pure Node.js built-ins + SQLite. One command to run. Immune to conference wifi.', true);
  statCard(s, 8.78, 2.0, 3.95, 2.2, '4', 'defects found & fixed by our tests', 'Including a scoring-model bias our suite caught before any judge could.', true);
  const rows = [
    ['🔒', 'Security tested', 'Path traversal blocked, input validation on every endpoint, malformed JSON handled safely'],
    ['⚡', 'Performance tested', '50 concurrent requests served in 283 ms'],
    ['🔁', 'Swap-ready interfaces', 'Diagnosis → TensorFlow Lite CNN · prices → live KAMIS feed · loans → M-PESA Daraja, all without architectural change'],
  ];
  rows.forEach(([e, t, b], i) => iconRow(s, 0.6, 4.5 + i * 0.98, 12.1, e, t, b, true));
  s.addNotes(
`PRESENTER 3 — ~40 seconds
Judges see a hundred demos held together with tape. Differentiate: "We wrote 29 automated tests. They caught four real defects — including a bias in our own credit model that under-scored farmers who grow high-value, low-weight crops like tomatoes. We fixed it and regression-tested it. That is the engineering culture we would bring to your accelerator."
IF ASKED "why no framework?": deliberate — zero dependencies means zero supply-chain risk, instant setup, and it proves we understand what the frameworks do under the hood.`);
}

/* ================================================== 10 · BUSINESS MODEL */
{
  const s = lightSlide('Business model', 'Aligned with the farmer, paid by the ecosystem', 'Presenter 4');
  const cols = [
    ['🤝', 'Lender API fees', 'SACCOs & MFIs pay per score-backed underwriting decision. We are the credit bureau of the shamba — we never lend off our own balance sheet at first.', 'Launch'],
    ['🌱', 'Input-supplier commission', 'Seed & fertiliser firms pay for qualified demand: loans disbursed as inputs, not cash — which also cuts diversion risk for the lender.', 'Launch'],
    ['🛡️', 'Micro-insurance', 'Crop cover priced by the same score and weather data, sold at the moment of loan acceptance.', 'Phase 2'],
    ['📊', 'Anonymised market analytics', 'Aggregated yield & price intelligence for county governments, processors and NGOs.', 'Phase 2'],
  ];
  cols.forEach(([e, t, b, tag], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.25, y = 2.0 + row * 2.3;
    s.addShape('roundRect', { x, y, w: 6.05, h: 2.1, rectRadius: 0.09, fill: { color: LIGHT_CARD }, line: { type: 'none' } });
    s.addShape('ellipse', { x: x + 0.25, y: y + 0.25, w: 0.6, h: 0.6, fill: { color: GOLD } });
    s.addText(e, { x: x + 0.21, y: y + 0.23, w: 0.68, h: 0.64, fontSize: 22, align: 'center', valign: 'middle', margin: 0 });
    s.addText(t, { x: x + 1.05, y: y + 0.22, w: 3.9, h: 0.4, ...BODY, fontSize: 15.5, bold: true, color: INK, margin: 0 });
    s.addText(tag, { x: x + 4.85, y: y + 0.26, w: 1.0, h: 0.32, ...BODY, fontSize: 10.5, bold: true, color: WHITE, align: 'center', valign: 'middle', fill: { color: tag === 'Launch' ? GREEN : '8A9A8D' }, margin: 0 });
    s.addText(b, { x: x + 1.05, y: y + 0.68, w: 4.75, h: 1.3, ...BODY, fontSize: 11.5, color: '4A584C', margin: 0 });
  });
  s.addText('The farmer pays nothing. The score is hers. Our incentive is her success — a defaulting farmer earns us zero.', {
    x: 0.6, y: 6.65, w: 12.1, h: 0.45, ...BODY, fontSize: 14, italic: true, color: GREEN, margin: 0 });
  s.addNotes(
`PRESENTER 4 — ~45 seconds
Answer the judges' unspoken question — "how does this make money without exploiting farmers?" — before they ask it. Emphasise: free for the farmer; revenue comes from lenders, input suppliers and insurers who all profit when the farmer succeeds. "Our incentives point the same direction as Amina's harvest."`);
}

/* ================================================== 11 · ROADMAP */
{
  const s = lightSlide('Roadmap', 'From prototype to pilot in two seasons', 'Presenter 2');
  const phases = [
    ['NOW', 'Working prototype', 'Everything you saw today: diagnosis, markets, ledger, score, loans, USSD — 29/29 tests passing', GREEN],
    ['3 MONTHS', 'Data partnerships', 'Live KAMIS price feed · OpenWeather · PlantVillage-trained TFLite CNN on-device', GOLD],
    ['6 MONTHS', 'Cooperative pilot', '500 farmers in one maize county · co-op records counter-verify harvests · first SACCO underwriting partner', GOLD],
    ['12 MONTHS', 'Scale', 'M-PESA Daraja disbursement · micro-insurance · 10,000 farmers · Series-seed raise', '8A9A8D'],
  ];
  phases.forEach(([tag, t, b, c], i) => {
    const x = 0.6 + i * 3.12;
    s.addShape('ellipse', { x: x + 1.21, y: 2.25, w: 0.5, h: 0.5, fill: { color: c } });
    if (i < 3) s.addShape('line', { x: x + 1.9, y: 2.5, w: 2.5, h: 0, line: { color: 'C9D2C6', width: 2, dashType: 'dash' } });
    s.addText(tag, { x, y: 2.95, w: 2.92, h: 0.35, ...BODY, fontSize: 12, bold: true, color: c === '8A9A8D' ? '6A7A6D' : c, align: 'center', charSpacing: 2, margin: 0 });
    s.addText(t, { x, y: 3.32, w: 2.92, h: 0.65, ...BODY, fontSize: 15.5, bold: true, color: INK, align: 'center', margin: 0 });
    s.addText(b, { x: x + 0.1, y: 3.95, w: 2.72, h: 2.2, ...BODY, fontSize: 11.5, color: '4A584C', align: 'center', margin: 0 });
  });
  s.addNotes(
`PRESENTER 2 — ~30 seconds
Keep it brisk. The message is sequencing discipline: "Nothing on this roadmap requires invention — every phase is integration of things that already exist. The prototype is done. The next step is one cooperative, one county, one SACCO."`);
}

/* ================================================== 12 · CLOSE */
{
  const s = darkSlide();
  s.addText('🌾', { x: 0.65, y: 0.9, w: 1.2, h: 1.1, fontSize: 44, margin: 0 });
  s.addText('Amina fed Kenya for five seasons.', { x: 0.6, y: 2.15, w: 12.1, h: 0.85, ...HEAD, fontSize: 40, bold: true, color: CREAM, margin: 0 });
  s.addText([
    { text: 'Starting today, Kenya can ', options: { color: CREAM } },
    { text: 'bank on her.', options: { color: GOLD, italic: true } },
  ], { x: 0.6, y: 3.05, w: 12.1, h: 0.85, ...HEAD, fontSize: 40, bold: true, margin: 0 });
  s.addText('MavunoAI — turning harvests into credit history.', {
    x: 0.6, y: 4.35, w: 12.1, h: 0.5, ...BODY, fontSize: 18, color: CREAM_DIM, margin: 0 });
  s.addText('THE ASK', { x: 0.6, y: 5.35, w: 3, h: 0.35, ...BODY, fontSize: 12, bold: true, color: GOLD, charSpacing: 3, margin: 0 });
  s.addText('A pilot introduction to one farmers\' cooperative and one SACCO — we will do the rest.', {
    x: 0.6, y: 5.7, w: 12.1, h: 0.5, ...BODY, fontSize: 16, color: CREAM, margin: 0 });
  s.addText('Asante sana. Questions karibu.', { x: 0.6, y: 6.6, w: 12.1, h: 0.45, ...BODY, fontSize: 14, italic: true, color: CREAM_DIM, margin: 0 });
  s.addNotes(
`PRESENTER 1 (closer — same person who opened, for symmetry) — ~30 seconds
Slow, direct, eyes up: "Amina fed Kenya for five seasons. Starting today, Kenya can bank on her. We are MavunoAI — we turn harvests into credit history. Our ask is simple: one cooperative, one SACCO, one season. Asante sana."
Then the WHOLE TEAM stands for Q&A. Presenter assignments for likely questions are in the presenter guide (PRESENTER-GUIDE.md).`);
}

pres.writeFile({ fileName: path.join(__dirname, 'MavunoAI-Pitch.pptx') })
  .then(f => console.log('WROTE', f));
