/**
 * Captures documentation screenshots of every MavunoAI module.
 * Requires the server running on :4500.  Run:  node docs/take_screenshots.js
 * Output: docs/figures/shot_*.png
 *
 * Set CHROME_PATH to pick a specific browser; otherwise the first of the
 * candidates below that exists is used.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, 'figures');
const BASE = 'http://localhost:4500';

/* The original hard-coded a Windows Edge path, so the script only ran on one
   machine. Probe instead, and let CHROME_PATH override. */
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const EXEC = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!EXEC) {
  console.error('No browser found. Set CHROME_PATH to a Chrome or Edge binary.');
  process.exit(1);
}

/* Demo credentials. Both sides of the platform sign in at the same form. */
const FARMER = { phone: '0712 345 678', pin: '1234' };
const ADMIN = { phone: '0700 000 000', pin: '2468' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXEC,
    headless: 'new',
    args: [
      '--no-sandbox', '--no-first-run', '--disable-extensions', '--hide-scrollbars',
      '--no-default-browser-check', '--disable-gpu',
      '--user-data-dir=' + path.join(os.tmpdir(), 'mavuno-shots-' + Date.now()),
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  const shot = async name => {
    await sleep(400); // let entrance animations settle
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('captured', name);
  };

  /* The app no longer auto-signs-in — it opens on the landing page — so the
     screenshots have to go through the real form like anyone else. */
  const signIn = async ({ phone, pin }) => {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.click('#headerSignIn');
    await page.waitForSelector('#loginPhone', { visible: true });
    await page.type('#loginPhone', phone);
    await page.type('#loginPin', pin);
    await Promise.all([
      page.click('#loginForm button[type=submit]'),
      page.waitForSelector('#app:not([hidden]), #adminApp:not([hidden])', { timeout: 15000 }),
    ]);
    await sleep(900); // web fonts + stagger animation
    /* The welcome toast lives 2.6s and sits over the weather panel. Wait it
       out rather than capturing a transient greeting into the documentation. */
    await page.waitForFunction(
      () => { const t = document.getElementById('toast'); return !t || t.hidden; },
      { timeout: 6000 }).catch(() => {});
    await sleep(250);
  };
  const nav = async view => {
    await page.click(`#app .nav-item[data-view="${view}"]`);
    await sleep(700);
  };

  /* 0 — landing page, above the fold */
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(900);
  await shot('shot_landing.png');

  await signIn(FARMER);

  /* 1 — dashboard. Waits on the hero score, not #statRow — that belongs to the
     harvest ledger, so the original wait could never have fired here. */
  await page.waitForFunction(() =>
    document.querySelector('#mScore') && document.querySelector('#mScore').textContent.trim() !== '');
  await shot('shot_dashboard.png');

  /* 2 — crop doctor with a live diagnosis.
     Uploaded through the file input rather than by poking `state`, which is a
     module-level const and not reachable from here. The leaf is textured, not
     flat: the analyser now requires local contrast, so a plain green fill is
     declined as "not a photograph of a leaf" — correctly. */
  await nav('doctor');
  const leafFile = path.join(os.tmpdir(), 'mavuno-leaf-' + Date.now() + '.png');
  const dataUrl = await page.evaluate(() => {
    /* A drawn leaf rather than green noise: full-bleed blade, midrib, lateral
       veins, chlorotic mottling and necrotic lesions.

       The geometry is calibrated, not decorative. Every ratio the analyser
       reports is a share of the whole frame, so a tastefully small leaf on a
       big background dilutes them — an earlier version filled 22% of the frame
       and was correctly declined for "too little plant tissue". This one fills
       it the way a farmer's close-up would, and the damage is tuned to land on
       a real signature: the panel reads Maize Streak Virus, which is what a
       leaf mottled like this should read. Picture and verdict agree. */
    const S = 320;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');

    x.fillStyle = '#e8e3d8'; x.fillRect(0, 0, S, S);           // soil at the margins
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(120,108,88,${Math.random() * .22})`;
      x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }

    x.save(); x.translate(S / 2, S / 2); x.rotate(-0.22);
    const blade = new Path2D();
    blade.moveTo(0, -260); blade.bezierCurveTo(200, -130, 200, 130, 0, 262);
    blade.bezierCurveTo(-200, 130, -200, -130, 0, -260);
    const g = x.createLinearGradient(-190, 0, 190, 0);
    g.addColorStop(0, '#2f7a2a'); g.addColorStop(.5, '#4a9b34'); g.addColorStop(1, '#2c6f26');
    x.fillStyle = g; x.fill(blade);

    x.save(); x.clip(blade);
    for (let i = 0; i < 9000; i++) {                            // blade texture
      x.fillStyle = `rgba(${20 + Math.random() * 60},${90 + Math.random() * 70},${20 + Math.random() * 40},.30)`;
      x.fillRect(-200 + Math.random() * 400, -260 + Math.random() * 520, 2, 2);
    }
    x.strokeStyle = 'rgba(226,236,200,.85)'; x.lineWidth = 3.4;  // midrib
    x.beginPath(); x.moveTo(0, -250); x.lineTo(0, 250); x.stroke();
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(210,228,180,.62)';  // lateral veins
    for (let i = -18; i <= 18; i++) {
      const y = i * 13.5;
      x.beginPath(); x.moveTo(0, y); x.quadraticCurveTo(80, y + 16, 190, y + 46); x.stroke();
      x.beginPath(); x.moveTo(0, y); x.quadraticCurveTo(-80, y + 16, -190, y + 46); x.stroke();
    }
    x.fillStyle = 'rgba(198,182,80,0.30)';                       // chlorotic wash
    x.beginPath(); x.ellipse(0, 0, 200, 260, 0, 0, 7); x.fill();
    for (let k = 0; k < 210; k++) {                              // necrotic lesions
      const a = (Math.random() - .5) * 330, b = (Math.random() - .5) * 330;
      const r = 8 + Math.random() * 8;
      x.fillStyle = 'rgba(206,190,84,.88)';
      x.beginPath(); x.ellipse(a, b, r * 1.35, r * 1.05, Math.random(), 0, 7); x.fill();
      x.fillStyle = 'rgba(122,82,34,.94)';
      x.beginPath(); x.ellipse(a, b, r, r * .72, Math.random(), 0, 7); x.fill();
      x.fillStyle = 'rgba(44,32,15,.92)';
      x.beginPath(); x.ellipse(a, b, r * .68, r * .68 * .70, Math.random(), 0, 7); x.fill();
    }
    x.restore();
    x.strokeStyle = 'rgba(24,58,20,.55)'; x.lineWidth = 2; x.stroke(blade);
    x.restore();
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(leafFile, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await (await page.$('#leafInput')).uploadFile(leafFile);
  await sleep(500);
  await page.click('#analyzeBtn');
  await page.waitForSelector('#diagnosisCard .diag-name');
  await sleep(1300); // confidence bar animation
  // Analysing scrolls the result into view; come back up so the verdict and
  // confidence are in frame rather than cropped above it.
  await page.evaluate(() => { document.querySelector('#app .main').scrollTop = 0; window.scrollTo(0, 0); });
  await sleep(500);
  await shot('shot_doctor.png');
  fs.unlinkSync(leafFile);

  /* 3 — markets */
  await nav('markets');
  await page.waitForSelector('#priceChart polyline');
  await shot('shot_markets.png');

  /* 4 — harvest ledger */
  await nav('harvests');
  await page.waitForSelector('#ledgerTable tbody tr');
  await page.waitForSelector('#statRow .stat');
  await shot('shot_harvests.png');

  /* 5 — credit / Mavuno Score */
  await nav('credit');
  await page.waitForSelector('#scoreGauge path');
  await sleep(1200); // breakdown bar animation
  await shot('shot_credit.png');

  /* 6 — administrator console. Replaces the USSD simulator, which was removed
     from the product; the console is the feature that took its place. */
  await signIn(ADMIN);
  await page.waitForSelector('#adminApp:not([hidden])');
  await sleep(1000);
  await shot('shot_admin.png');

  await browser.close();
  console.log('ALL SCREENSHOTS DONE');
})().catch(e => { console.error(e); process.exit(1); });
