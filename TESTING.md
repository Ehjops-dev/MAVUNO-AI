# MavunoAI — System Test Report

**Date:** 16 July 2026 · **Environment:** Windows 11, Node.js v24.14.0 · **Method:** Automated (Node built-in test runner) + manual browser verification
**Result: 29 / 29 automated tests passed · 0 failures**

Run the suite yourself:

```bash
node --test tests/api.test.js
```

The suite spawns the real server on port 4599 with an isolated temporary database, so it never touches the demo data.

## Test case summary

| ID | Module | Test case | Expected result | Actual | Status |
|----|--------|-----------|-----------------|--------|--------|
| TC01 | Dashboard | Fetch farmer snapshot | Farmer profile, 7 seeded harvests, >10 t produce, >KES 400k revenue | As expected | ✅ Pass |
| TC02 | Score | Score within 300–850 with named tier | In band, valid tier | 733, Prime Harvester | ✅ Pass |
| TC03 | Weather | 5-day forecast sanity | 5 days, high > low, plausible highland temps | As expected | ✅ Pass |
| TC04 | Prices | Ticker covers all 5 crops | maize, beans, potatoes, tomatoes, cabbage, all > 0 | As expected | ✅ Pass |
| TC05 | Advisory | At least 2 seasonal tips | ≥2 tips with title + body | 3 tips | ✅ Pass |
| TC06 | Prices | 60-day series, 5 markets | 60 rows per market, positive prices | As expected | ✅ Pass |
| TC07 | Prices | Price floor realism (all crops) | No price below 55% of crop base | As expected | ✅ Pass |
| TC08 | Prices | Best-market ranking | Sorted descending by price | As expected | ✅ Pass |
| TC09 | Prices | Unknown crop rejected | HTTP 400 | 400 | ✅ Pass |
| TC10 | Prices | Default crop when omitted | Defaults to maize | maize | ✅ Pass |
| TC11 | Harvests | Ledger sorted newest-first | Descending harvest_date | As expected | ✅ Pass |
| TC12 | Harvests | Log harvest returns updated score | 201 + score in band, no drop on strong harvest | As expected | ✅ Pass |
| TC13 | Harvests | Missing-field validation (4 cases) | HTTP 400 each | 400 ×4 | ✅ Pass |
| TC14 | Harvests | Unsold harvest accepted | 201 without price/market | 201 | ✅ Pass |
| TC15 | API | Malformed JSON body | HTTP 400, server stays alive | 400, alive | ✅ Pass |
| TC16 | Score | 5 components, weights sum to 100 | 25+20+15+20+20 = 100 | 100 | ✅ Pass |
| TC17 | Score | New season never lowers consistency | Monotonic component | As expected | ✅ Pass |
| TC18 | Score | Tier ↔ offer rules consistent | Prime = 2 offers incl. KES 50,000 | As expected | ✅ Pass |
| TC19 | Loans | Apply for qualified offer | 201 approved, amount matches | As expected | ✅ Pass |
| TC20 | Loans | Apply for non-existent offer | HTTP 403 | 403 | ✅ Pass |
| TC21 | Loans | Loan record has full terms | rate, term, score at application | As expected | ✅ Pass |
| TC22 | Score | Active loan lowers repayment component | Value < 60 neutral baseline | 55 | ✅ Pass |
| TC23 | Diagnoses | Scan record round-trip | POST 201, GET returns record | As expected | ✅ Pass |
| TC24 | Static | SPA shell served at / | 200, text/html | As expected | ✅ Pass |
| TC25 | Static | CSS/JS MIME types | text/css, javascript | As expected | ✅ Pass |
| TC26 | Static | SPA fallback route | 200 app shell (not 404) | As expected | ✅ Pass |
| TC27 | Security | Path traversal (3 payloads) | Server source never leaks | As expected | ✅ Pass |
| TC28 | API | Unknown API route | JSON 404 | As expected | ✅ Pass |
| TC29 | Load | 50 concurrent dashboard requests | All 200, no errors | 50/50 in 283 ms | ✅ Pass |

## Manual browser verification (UAT walkthrough)

| # | Flow | Result |
|---|------|--------|
| M1 | Dashboard renders farmer, weather, prices, advice; zero console errors | ✅ |
| M2 | Crop Doctor: synthetic yellow-mottled maize leaf → Maize Streak Virus, 77% confidence, treatment plan shown, scan saved to history | ✅ |
| M3 | Markets: chart renders 5 market lines with axes/legend; best-market ranking (Kisumu 54.7 vs Nairobi 40.5 KES/kg spread visible) | ✅ |
| M4 | Log harvest via form (1,750 kg maize @ 52) → ledger updated, revenue KES 91,000, score toast shown | ✅ |
| M5 | Mavuno Score: gauge, 5-factor breakdown, one-tap loan → approved, appears under "Your loans", score dips realistically while loan active | ✅ |
| M6 | USSD simulator: menu in Swahili; option 1 returns live prices; session ends cleanly | ✅ |

## Defects found and fixed during testing

| ID | Defect | Severity | Fix |
|----|--------|----------|-----|
| D1 | Modals rendered on page load — CSS `display:grid` overrode the HTML `hidden` attribute | High | Global `[hidden] { display: none !important; }` rule |
| D2 | Harvest dates displayed one day early on machines west of UTC | Low | Format dates with `timeZone: 'UTC'` |
| D3 | Yield-trend component compared raw kg across different crops, so a small tomato harvest could lower the score set by heavy maize harvests | Medium | Per-crop yield trend (crops with one harvest are neutral); regression test TC12 added |
| D4 | Malformed JSON body returned HTTP 500 | Low | Now returns HTTP 400 with error message; server stays alive (TC15) |

## Non-functional observations

- **Performance:** 50 concurrent dashboard requests served in 283 ms total (TC29).
- **Portability:** zero npm dependencies; runs on any Node ≥ 22.5 with one command; frontend analysis runs fully on-device.
- **Reliability:** malformed input, unknown routes and unknown crops all fail safely without crashing the process.
- **Security:** static file server rejects path traversal; request bodies capped at 2 MB.
