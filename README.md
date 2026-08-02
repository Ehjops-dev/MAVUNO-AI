# 🌾 MavunoAI

**Turning harvests into credit history.**

An AI-powered farm intelligence and agri-credit platform for Kenya's 4.5 million smallholder farmers — built at the intersection of **agri-tech and fintech**.

---

## The problem

Smallholder farmers feed the country but are locked out of the financial system:

1. **They lose up to 40% of yield** to crop diseases they can't diagnose — the nearest agronomist may be 50 km away.
2. **They sell blind** — middlemen quote a price, and the farmer has no way to know what the same bag fetches in Nakuru or Nairobi that morning.
3. **They can't borrow** — no payslip, no title deed, no credit history → no loan, even after 20 successful seasons.

## The solution — one app, three superpowers

| Feature | What it does | Field |
|---|---|---|
| 🍃 **AI Crop Doctor** | Photograph a sick leaf → instant diagnosis, treatment plan and prevention advice. Analysis runs **on-device** (colour-signature model), so it works with no data bundle. | Agri-tech |
| 📈 **Market Intelligence** | Live 60-day price trends across 5 major markets, plus "best market today" ranking so farmers negotiate from strength. | Agri-tech |
| 💳 **Mavuno Score™** | Every harvest logged builds a 300–850 credit score from 5 signals: season consistency, yield trend, crop diversification, market timing and repayment record. Good scores unlock **collateral-free input loans**, disbursed to M-PESA. | Fintech |

**The insight that wins:** a harvest ledger is a financial identity. MavunoAI converts agronomic behaviour into bankable data — the same way M-PESA converted airtime behaviour into M-Shwari credit limits.

## Running it

Zero runtime dependencies. Node.js ≥ 22.5 only (uses built-in `node:sqlite`).

```bash
npm start
# → http://localhost:4500
```

No `npm install` and no API keys needed — the database is created and seeded on
first run.

**Getting in.** The landing page offers two doors:

- **Sign In** — phone plus PIN. The seeded farmers are `0712 345 678` (Amina),
  `0723 456 789` (John) and `0734 567 890` (Mary), all with PIN `1234`.
- **Get started** — self-registration. Name, phone, county, farm size and a
  4–8 digit PIN creates a real account and drops straight into the dashboard.

There is no profile switcher: a session belongs to exactly one farmer, and the
only way to become someone else is to sign out and sign in again.

A brand-new account has an empty ledger, so the dashboard shows a **"No
history"** tier and a *"log your first harvest"* prompt instead of a score of
zero — being new is not the same as being a bad risk. One logged harvest
activates the score, the credit offers and the market timing.

> For a demo, sign in as Amina — she has 7 harvests, a 754 score and
> KES 120,000 of eligible credit. Registration is worth showing, but it lands
> on a deliberately empty dashboard.

**Before a demo,** reset the database so rehearsal clicks don't show up on
stage as extra loans or a duplicated profile:

```bash
npm run db:reset   # backs up to backups/, then wipes; re-seeds on next start
```

**Offline.** The app shell is cached by a service worker (`public/sw.js`), so it
loads with no connection, and the last dashboard, price and score responses are
served from cache when the network is gone. Leaf analysis runs entirely
on-device — the photo is never uploaded. Live data (new harvests, loan
applications) still needs the server.

## Live PayHero setup

The app loads `.env` automatically on startup.

```bash
cp .env.example .env
```

Then fill either `PAYHERO_BASIC_AUTH` or `PAYHERO_USERNAME` + `PAYHERO_PASSWORD`, plus `PAYHERO_CHANNEL_ID`.

```bash
PAYHERO_BASIC_AUTH=your_rotated_basic_token_without_the_basic_prefix
PAYHERO_CHANNEL_ID=your_payment_wallet_channel_id
PAYHERO_CALLBACK_URL=https://your-public-domain.com/api/payhero/callback
```

Check config without exposing secrets:

```bash
curl http://localhost:4500/api/payhero/config
```

Expected live result includes `"mode":"live"`. If it says `"mode":"demo"`, the app will not send real money.

Server health, including whether the price feed is current:

```bash
curl http://localhost:4500/api/health
```

## Security & trust model

The Mavuno Score decides who gets money, so the paths that touch it are locked
down rather than left open for the demo:

| Control | How it works |
|---|---|
| **Authentication** | Farmers sign in with phone + PIN. PINs are stored as scrypt hashes with a per-farmer salt, compared in constant time. Five wrong attempts locks that phone for 15 minutes. |
| **Registration** | `POST /api/auth/register` validates the name, Kenyan mobile format, county and farm size, and takes a 4–8 digit PIN. A phone number can be claimed once: uniqueness is checked on the *normalised* number, so `0745…`, `254745…` and `+254 745 …` all collide and a seeded demo account cannot be taken over. It shares the auth rate-limit bucket, so it is not an unmetered way around the login limit. |
| **Sessions** | `POST /api/auth/login` returns an HMAC-signed token (`farmerId.expiry.mac`) with a 2-hour TTL, held in `sessionStorage`. Every farmer-scoped endpoint requires it. A session can only ever act as the farmer it was issued for — there is no header a client can set to become someone else. |
| **One live loan** | A second application while a loan is `approved` returns 409. With live PayHero credentials, that guard is the difference between one disbursement and one per click. |
| **Daily cap** | `DAILY_DISBURSEMENT_CAP` (default KES 150,000) bounds what one farmer can receive in 24 hours regardless of tier. |
| **Disbursement target** | Always the phone on the farmer's record. A client-supplied number is ignored, so a session cannot redirect its own payout. |
| **Rate limiting** | Per-IP fixed windows: 10/min on auth, 60/min on writes, 600/min on reads. |
| **Input validation** | Crops and markets must match the catalogue; quantities must be finite and positive; harvest dates must be real and not in the future; text fields reject markup and control characters. |
| **Output escaping** | Every value interpolated into the DOM passes through `esc()`. |
| **Transport & headers** | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; same-origin only unless `ALLOWED_ORIGINS` is set. |
| **Data at rest** | Foreign keys enforced with `ON DELETE CASCADE`; PIN hashes never leave the server; the public farmer roster masks phone numbers. |

## Known limitations

Stated up front, because they are design choices for a prototype rather than
things we think are finished:

- **Weather is simulated.** `generateWeather()` is a deterministic pattern, not a forecast. Swap in OpenWeather with one function change.
- **Prices are a seeded random walk,** topped up to today on every boot. The API shape is ready for a live KAMIS / county-board ingest.
- **The Crop Doctor is a colour-signature heuristic, not a CNN.** It measures chlorosis, necrosis and lesion ratios and matches them against a 14-disease knowledge base. Images that match nothing return *"Not recognised as a crop leaf"* rather than a confident guess.
- **Repayment is simulated in demo mode.** It writes a labelled receipt for principal plus interest; production would only settle on an M-PESA C2B confirmation callback.
- **`node:sqlite` is synchronous,** so the server handles one query at a time. Fine for a demo and a few thousand farmers; a real deployment moves to Postgres.
- **Rate limiting is in-process.** One server, one wallet. Multiple instances would need a shared store.
- **Offline covers the app shell and last-known data,** not new writes.

## Architecture

```
├── server.js               # Node built-ins only: http server + SQLite + auth + scoring engine
├── mavuno.db               # SQLite (auto-created & seeded on first run, gitignored)
├── scripts/reset-db.js     # npm run db:reset — wipe and re-seed clean demo data
├── tests/api.test.js       # 63 automated tests, zero dependencies
├── docs/DESIGN.md          # "Verdant Calm" design system the CSS tokens come from
└── public/
    ├── index.html          # landing page + sign in + sign up + the app, one document
    ├── css/style.css       # hand-crafted design system
    ├── js/app.js           # vanilla JS: on-device leaf analysis, SVG charts, routing
    ├── img/                # landing photography (same-origin: the CSP blocks remote hosts)
    ├── sw.js               # service worker: offline app shell + last-known data
    └── manifest.webmanifest
```

The whole product is one HTML document with four screens — landing, sign in,
sign up and the app — swapped by `showScreen()` in `app.js`. No router, no
build step, no framework.

- **Mavuno Score engine** (`server.js → computeScore`): weighted 5-factor model over the harvest ledger, mapped to a 300–850 band with loan tiers.
- **PayHero disbursement demo** (`POST /api/loans`): approving a loan creates a PayHero M-PESA mobile disbursement record. Without credentials it runs in demo mode and shows a queued transaction reference; with credentials set `PAYHERO_USERNAME`, `PAYHERO_PASSWORD`, `PAYHERO_CHANNEL_ID`, and optionally `PAYHERO_CALLBACK_URL`.
- **Crop Doctor** (`app.js → extractLeafFeatures`): canvas-based colour-signature extraction (chlorosis / necrosis / lesion ratios) matched against a knowledge base of 14 common Kenyan crop diseases with localised treatment advice. Designed to swap in a TensorFlow Lite CNN without changing the UX.
- **Price feed**: seeded 60-day series per crop per market; the API shape is ready for a live ingest (e.g. KAMIS / county market boards).
- **Weather**: simulated 5-day feed; swap `generateWeather()` for OpenWeather with one function change.

## 3-minute demo script

> Run `npm run db:reset` and restart the server before you go on — a clean
> database is 3 farmers, 10 harvests, 1 loan and 1 scan.

1. **Dashboard** — "Meet Amina, 3.5 acres in Uasin Gishu. Weather, today's prices and this week's agronomy advice in one glance."
2. **Crop Doctor** — upload a leaf photo → diagnosis + treatment in seconds. "This scan also just became a data point in her farm record."
3. **Markets** — flip between crops; point at the spread between markets. "That gap is money the middleman keeps today."
4. **My Harvests** — log a new harvest live → watch the toast announce her new score. "Every bag she logs is a line in her credit file."
5. **Mavuno Score** — the gauge, the 5-factor breakdown, then **tap "Apply & disburse"** → loan approved to M-PESA. *"No payslip. No title deed. Just her harvests."* Tap it a second time to show the active-loan guard: one live loan per farmer, one disbursement.
6. **Finale — a farmer from scratch.** Sign out, tap **Get started**, register in
   about twenty seconds. The dashboard says *"No history"* and asks for a first
   harvest: *"Everyone starts here. She isn't a bad risk — she's an unwritten
   one."* Log one harvest and the score comes alive on stage.

## Testing

63 automated tests, all passing.

```bash
npm test
```

The suite spawns two real servers on isolated databases — one with generous
limits, one throttled to 3 auth calls a minute — and covers authentication,
registration (duplicate numbers in every format, malformed input, seeded-account
takeover), token forgery, the loan-safety rails, input validation, price
freshness, security headers and path traversal.

The manual UAT report in [TESTING.md](TESTING.md) is from the 57-test run and
has not been re-run since registration was added.

## Documentation & presentation

- `docs/MavunoAI-Documentation.docx` — full project documentation (Kabarak research-project format, chapters 1–5)
- `docs/MavunoAI-Pitch.pptx` — 12-slide pitch deck with per-slide speaker notes and presenter assignments
- `docs/PRESENTER-GUIDE.md` — group roles, timing, demo checklist and judge Q&A prep
- `docs/DESIGN.md` — the "Verdant Calm" design system (colour ramp, type scale, radii, component specs) that the tokens at the top of `public/css/style.css` were transcribed from
- (`docx`/`pptxgenjs` in package.json are dev-only, used to regenerate the documents; the app itself has zero runtime dependencies)

## What we'd build next

- Real CNN disease model (PlantVillage dataset, TFLite, still on-device)
- Live KAMIS market-price ingestion + SMS price alerts
- Partner API for SACCOs & MFIs to underwrite against the Mavuno Score
- Crop insurance priced by the same score
- Postgres + a shared rate-limit store so the platform scales past one process
- Real M-PESA C2B settlement for repayments, replacing the simulated receipt
- USSD access (`*384*626#`) so the 60% of rural Kenya on feature phones get prices, score and loans without a smartphone
