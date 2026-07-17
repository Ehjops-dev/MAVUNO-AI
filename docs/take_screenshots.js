/**
 * Captures documentation screenshots of every MavunoAI module.
 * Requires the server running on :4500.  Run:  node docs/take_screenshots.js
 * Output: docs/figures/shot_*.png
 */
'use strict';
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, 'figures');
const BASE = 'http://localhost:4500';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: [
      '--no-first-run', '--disable-extensions', '--hide-scrollbars',
      '--no-default-browser-check', '--disable-gpu',
      '--user-data-dir=' + path.join(require('os').tmpdir(), 'mavuno-shots-' + Date.now()),
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  const shot = async name => {
    await sleep(350); // let entrance animations settle
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('captured', name);
  };
  const nav = async view => {
    await page.click(`.nav-item[data-view="${view}"]`);
    await sleep(600);
  };

  /* 1 — dashboard */
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#statRow .stat');
  await sleep(700); // web fonts + stagger animation
  await shot('shot_dashboard.png');

  /* 2 — crop doctor with a live diagnosis */
  await nav('doctor');
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 220;
    const x = c.getContext('2d');
    x.fillStyle = '#3a7d2c'; x.fillRect(0, 0, 220, 220);
    for (let i = 0; i < 300; i++) { x.fillStyle = '#d9c034'; x.beginPath(); x.arc(Math.random() * 220, Math.random() * 220, 4 + Math.random() * 11, 0, 7); x.fill(); }
    for (let i = 0; i < 50; i++) { x.fillStyle = '#6e4a1f'; x.beginPath(); x.arc(Math.random() * 220, Math.random() * 220, 2 + Math.random() * 5, 0, 7); x.fill(); }
    const img = document.getElementById('leafPreview');
    img.src = c.toDataURL();
    await new Promise(r => (img.complete ? r() : (img.onload = r)));
    document.getElementById('previewWrap').hidden = false;
    state.leafImage = img.src;
    document.getElementById('analyzeBtn').click();
  });
  await page.waitForSelector('#diagnosisCard .diag-name');
  await sleep(1200); // confidence bar animation
  await shot('shot_doctor.png');

  /* 3 — markets */
  await nav('markets');
  await page.waitForSelector('#priceChart polyline');
  await shot('shot_markets.png');

  /* 4 — harvest ledger */
  await nav('harvests');
  await page.waitForSelector('#ledgerTable tbody tr');
  await shot('shot_harvests.png');

  /* 5 — credit / Mavuno Score */
  await nav('credit');
  await page.waitForSelector('#scoreGauge path');
  await sleep(1100); // breakdown bar animation
  await shot('shot_credit.png');

  /* 6 — USSD simulator with live price reply */
  await page.click('#ussdBtn');
  await sleep(900);
  await page.evaluate(async () => {
    document.getElementById('ussdInput').value = '1';
    document.getElementById('ussdSend').click();
  });
  await sleep(900);
  await shot('shot_ussd.png');

  await browser.close();
  console.log('ALL SCREENSHOTS DONE');
})().catch(e => { console.error(e); process.exit(1); });
