# MavunoAI

[![Node](https://img.shields.io/badge/node-%E2%89%A522.5-3c873a)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](package.json)
[![Tests](https://img.shields.io/badge/tests-86%20passing-brightgreen)](tests/api.test.js)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Farm intelligence and agri-credit platform for smallholder farmers in Kenya. Farmers diagnose
crop disease from a photo, compare market prices, and log harvests — and that harvest history
becomes a credit score that unlocks collateral-free input loans paid out to M-PESA.

## Features

- **Crop Doctor** — leaf photo in, diagnosis and treatment plan out. Runs entirely in the browser, so it works offline and the image is never uploaded. Four gates decide whether the photo is a leaf at all; anything else is declined rather than diagnosed.
- **Market prices** — 60-day price history for 5 crops across 5 markets, ranked by best price today.
- **Harvest ledger** — record crop, quantity, price and market for every harvest.
- **Mavuno Score** — a 300–850 credit score built from season consistency, yield trend, crop diversification, market timing and repayment history.
- **Loans** — score tiers map to loan limits, disbursed over PayHero M-PESA.
- **Admin console** — portfolio analytics, farmer register, credit book and audit trail.
- **Works offline** — service worker caches the app shell and the last known data.

## Quick start

```bash
git clone https://github.com/Ehjops-dev/MAVUNO-AI.git
cd MAVUNO-AI
npm start                 # http://localhost:4500
```

Node.js 22.5 or later is the only requirement, and there is no install or build step before
`npm start` — the server runs entirely on Node built-ins, including `node:sqlite`. Run
`npm install` only if you want to regenerate the documents in `docs/`, which is the sole
reason the project has any packages at all.

The database is created and seeded on first run.

Farmers and administrators sign in at the same form; the role stored on the account decides
which interface loads. Seeded accounts:

| Account | Phone | PIN |
|---|---|---|
| Amina (farmer) | 0712 345 678 | 1234 |
| John (farmer) | 0723 456 789 | 1234 |
| Mary (farmer) | 0734 567 890 | 1234 |
| Administrator | 0700 000 000 | 2468 |

To start over from clean seed data:

```bash
npm run db:reset          # back up to backups/, wipe, re-seed on next start
```

## Testing

```bash
npm test
```

86 tests on Node's built-in runner, covering the API surface, the scoring engine and the
security boundaries — session scoping, role enforcement, lockout and the disbursement caps.
The suite spawns two real servers on isolated temporary databases, so it never touches the
demo data, and its dates are computed relative to today rather than hard-coded so the cases
cannot rot. `TESTING.md` records the full case-by-case report.

## Admin console

The administrator lands in a control centre rather than a farm record. It covers portfolio
overview and score distribution; the farmer register, where an account can be suspended,
restored, PIN-reset or deleted; the credit book, where a facility can be marked repaid or
written off; the payment ledger; disease surveillance; a price board where any quote can be
corrected; announcements targeted at all farmers or one county; an audit trail of every
administrative write; and system health.

Self-registration always produces a farmer — the console cannot be reached by signing up.

## Configuration

Copy `.env.example` to `.env` — it is loaded automatically at startup and documents every
option. The ones that matter most:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4500` | HTTP port |
| `SESSION_SECRET` | random per boot | Token signing key. Set it so sessions survive a restart. |
| `ADMIN_PHONE` / `ADMIN_PIN` | `+254 700 000 000` / `2468` | Seeded administrator. Change before any real deployment. |
| `DAILY_DISBURSEMENT_CAP` | `150000` | Maximum KES to one farmer per 24 hours |
| `PAYHERO_BASIC_AUTH` | — | PayHero token, or use `PAYHERO_USERNAME` + `PAYHERO_PASSWORD` |
| `PAYHERO_CHANNEL_ID` | — | Required for live disbursement |

Without PayHero credentials the app runs in demo mode and records a queued reference instead
of moving money. Check which mode is active with `GET /api/payhero/config`.

## API

Public: `GET /api/health`, `GET /api/prices`, `GET /api/payhero/config`,
`POST /api/auth/login`, `POST /api/auth/register`, `POST /api/payhero/callback`.

Authenticated with `Authorization: Bearer <token>`, scoped to the farmer the token was issued
for:

| Endpoint | Description |
|---|---|
| `GET /api/me` | Session identity and role |
| `GET /api/dashboard` | Summary, score, weather, prices, advisory |
| `GET` `POST /api/harvests` | List or log harvests |
| `GET /api/score` | Score and five-factor breakdown |
| `GET` `POST /api/loans` | List loans, or apply and disburse |
| `POST /api/loans/repay` | Record a repayment |
| `GET` `POST /api/diagnoses` | List or store Crop Doctor results |

Administrator only — every route returns 403 for a farmer session:

| Endpoint | Description |
|---|---|
| `GET /api/admin/overview` | Portfolio, growth and distribution analytics |
| `GET /api/admin/farmers[/<id>]` | Register, or one farmer's full file |
| `POST /api/admin/farmers/<id>/status` | Suspend or restore |
| `POST /api/admin/farmers/<id>/reset-pin` | Issue a one-time PIN |
| `DELETE /api/admin/farmers/<id>` | Delete a farmer and all attached records |
| `GET /api/admin/loans` | Credit book |
| `POST /api/admin/loans/<id>/status` | Mark repaid or write off |
| `GET /api/admin/transactions` | Disbursement and repayment ledger |
| `GET /api/admin/diagnoses` | Platform-wide disease surveillance |
| `GET` `POST /api/admin/prices` | Price board, and quote corrections |
| `GET` `POST /api/admin/announcements` | Publish notices to all farmers or one county |
| `GET /api/admin/audit` | Administrative audit trail |
| `GET /api/admin/system` | Uptime, data volumes and active safety rails |

## Project structure

```
MAVUNO-AI/
├── server.js                  HTTP server, SQLite, auth, scoring and admin API
├── mavuno.db                  SQLite database — created and seeded on first run
├── .env.example               Every configuration option, documented
├── public/                    Single-page client
│   ├── index.html             Landing, auth, farmer app and admin console
│   ├── css/style.css          Design tokens and components
│   ├── css/admin.css          Console-only styling
│   ├── js/app.js              On-device leaf analysis, SVG charts, routing
│   ├── js/admin.js            Console: analytics, register, credit book, audit
│   ├── sw.js                  Service worker — offline shell and cached data
│   └── manifest.webmanifest   PWA manifest and icons
├── scripts/reset-db.js        Database backup, wipe and re-seed
├── tests/api.test.js          API and security test suite
├── TESTING.md                 Case-by-case system test report
└── docs/
    ├── DESIGN.md              Design system and interface rationale
    ├── PRESENTER-GUIDE.md     Demo script
    ├── figures/               Architecture diagrams and screenshots
    └── make_*.js              Generators for the documentation and pitch deck
```

## Security

PINs are stored as salted scrypt hashes and lock out after five failed attempts. Sessions are
HMAC-signed tokens with a two-hour expiry, and a token can only ever act as the account it was
issued for. Roles are read from the database on every request rather than taken from the
token, so a demotion or suspension takes effect on the next call instead of at the end of a
session. Loan disbursement always targets the phone number on the farmer's record, is capped
daily, and refuses a second application while one is still active. Requests are rate-limited
per IP, input is validated against a fixed catalogue of crops and markets, output is escaped
before it reaches the DOM, and every administrative write is recorded with its before and
after value.

## Status

A working prototype. Weather and market prices are simulated, the Crop Doctor is a
colour-signature heuristic rather than a trained CNN, and repayment settlement is stubbed in
demo mode. See `docs/` for the full project documentation.

## License

MIT — see [LICENSE](LICENSE).
