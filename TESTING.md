# MavunoAI — System Test Report

**Date:** 1 August 2026 · **Environment:** Linux, Node.js v22.22.1 · **Method:** Automated (Node built-in test runner) + manual browser verification in Chrome
**Result: 57 / 57 automated tests passed · 0 failures · ~2.6 s**

Run the suite yourself:

```bash
npm test
```

The suite spawns **two** real servers on isolated temporary databases, so it never touches the demo data:

- port **4599** — demo mode, generous rate limits, used by most cases
- port **4598** — `DEMO_MODE=0` and `RATE_LIMIT_AUTH=3`, used to test the strict auth path and throttling without starving the rest of the suite

Dates in the suite are computed relative to today rather than hard-coded, so the tests cannot rot the way the seeded price feed once did.

## Test case summary

| ID | Module | Test case | Expected result | Status |
|----|--------|-----------|-----------------|--------|
| TC01 | Health | `/api/health` reports a fresh price feed | `price_feed_fresh: true`, feed dated today | ✅ Pass |
| TC02 | Auth | Farmer-scoped endpoints reject an unauthenticated caller (5 routes) | HTTP 401 each | ✅ Pass |
| TC03 | Auth | The old `x-farmer-id` header no longer grants access | HTTP 401 | ✅ Pass |
| TC04 | Auth | Forged / tampered / expired tokens rejected (4 payloads) | HTTP 401 each | ✅ Pass |
| TC05 | Auth | Wrong PIN and unknown phone return the *same* error | Identical message, no user enumeration | ✅ Pass |
| TC06 | Auth | A session can only act as the farmer it was issued for | Header cannot override token identity | ✅ Pass |
| TC07 | Auth | PIN hashes never returned to a client | Absent from dashboard and roster | ✅ Pass |
| TC08 | Auth | Public farmer roster masks phone numbers | `•••••••••678` | ✅ Pass |
| TC09 | Auth | Demo login refused when `DEMO_MODE=0` | HTTP 403 | ✅ Pass |
| TC10 | Auth | PIN login still works when `DEMO_MODE=0` | HTTP 200 + token | ✅ Pass |
| TC11 | Security | Repeated sign-in attempts throttled | HTTP 429 within 6 tries | ✅ Pass |
| TC12 | Dashboard | Fetch farmer snapshot | 7 seeded harvests, >10 t produce, >KES 400k revenue | ✅ Pass |
| TC13 | Score | Score within 300–850 with named tier | In band, valid tier (732, Prime Harvester) | ✅ Pass |
| TC14 | Weather | 5-day forecast sanity | 5 days, high > low, plausible highland temps | ✅ Pass |
| TC15 | Prices | Ticker covers all 5 crops | All present, all > 0 | ✅ Pass |
| TC16 | Dashboard | Reports the day its prices are from | Equals today's date | ✅ Pass |
| TC17 | Advisory | At least 2 seasonal tips | 3 tips with title + body | ✅ Pass |
| TC18 | Prices | Rolling 60-day series, 5 markets | 60 rows per market, **last point is today** | ✅ Pass |
| TC19 | Prices | Price floor realism (all crops) | No price below 55% of crop base | ✅ Pass |
| TC20 | Prices | Best-market ranking | Sorted descending | ✅ Pass |
| TC21 | Prices | Unknown crop rejected | HTTP 400 | ✅ Pass |
| TC22 | Prices | Default crop when omitted | maize | ✅ Pass |
| TC23 | Harvests | Ledger sorted newest-first | Descending harvest_date | ✅ Pass |
| TC24 | Harvests | Log harvest returns updated score | 201 + score in band, no drop on strong harvest | ✅ Pass |
| TC25 | Harvests | Missing-field validation (4 cases) | HTTP 400 each | ✅ Pass |
| TC26 | Harvests | Junk values rejected (10 cases: negative / zero / non-numeric quantity, crop outside catalogue, future date, prehistoric date, malformed date, unknown market, markup in season, negative price) | HTTP 400 + explanatory error each | ✅ Pass |
| TC27 | Harvests | Unsold harvest accepted | 201 without price/market | ✅ Pass |
| TC28 | API | Malformed JSON body | HTTP 400, server stays alive | ✅ Pass |
| TC29 | API | Oversized body (400 KB) | Rejected cleanly, no hang, server still responds | ✅ Pass |
| TC30 | Score | 5 components, weights sum to 100 | 25+20+15+20+20 = 100 | ✅ Pass |
| TC31 | Score | Market timing judged on a live 30-day window | `price_window: "30d"` | ✅ Pass |
| TC32 | Score | New season never lowers consistency | Monotonic component | ✅ Pass |
| TC33 | Score | Tier ↔ offer rules consistent | Prime = 2 offers incl. KES 50,000 | ✅ Pass |
| TC34 | Loans | Apply for qualified offer | 201 approved, amount matches | ✅ Pass |
| TC35 | Loans | Apply for non-existent offer | HTTP 403 | ✅ Pass |
| TC36 | Loans | Second loan refused while one is active | HTTP 409, `code: active_loan` | ✅ Pass |
| TC37 | Loans | **Five rapid applications → exactly one disbursement** | 0 new approvals, loan count unchanged | ✅ Pass |
| TC38 | Loans | Disbursement targets the registered phone | Matches `2547XXXXXXXX`, client value ignored | ✅ Pass |
| TC39 | Loans | Loan record has full terms | rate, term, score at application | ✅ Pass |
| TC40 | Score | Active loan lowers repayment component | 55 (< 60 neutral baseline) | ✅ Pass |
| TC41 | Loans | Repayment writes a receipt and clears the loan | Receipt id, principal+interest, `simulated: true` | ✅ Pass |
| TC42 | Loans | Repaying the same loan twice refused | HTTP 409 | ✅ Pass |
| TC43 | Loans | Cannot repay another farmer's loan | HTTP 404 | ✅ Pass |
| TC44 | Diagnoses | Scan record round-trip | POST 201, GET returns record | ✅ Pass |
| TC45 | Diagnoses | Markup payload rejected, not stored | HTTP 400, absent from history | ✅ Pass |
| TC46 | Static | SPA shell served at / | 200, text/html | ✅ Pass |
| TC47 | Static | CSS/JS MIME types | text/css, javascript | ✅ Pass |
| TC48 | Static | Service worker + manifest served | 200 each, manifest `start_url: "/"` | ✅ Pass |
| TC49 | Static | SPA fallback route | 200 app shell (not 404) | ✅ Pass |
| TC50 | Security | Hardening headers present | CSP, nosniff, `X-Frame-Options: DENY` | ✅ Pass |
| TC51 | Security | Path traversal (4 payloads, incl. double-encoded) | Server source never leaks | ✅ Pass |
| TC52 | Security | Cross-origin caller refused | HTTP 403 | ✅ Pass |
| TC53 | API | Unknown API route | JSON 404 | ✅ Pass |
| TC54 | Harvests | Yield above agronomic ceiling rejected | HTTP 400 with explanation | ✅ Pass |
| TC55 | Farmers | Roster returns all seeded farmers | Exactly 3 | ✅ Pass |
| TC56 | Farmers | No duplicate profiles in the switcher | Unique names | ✅ Pass |
| TC57 | Load | 50 concurrent dashboard requests | All 200, no errors (~120 ms) | ✅ Pass |

## Manual browser verification (UAT walkthrough)

Performed in Chrome against `http://localhost:4500` on a freshly reset database.

| # | Flow | Result |
|---|------|--------|
| M1 | Demo mode auto-signs-in; dashboard renders farmer, weather, prices, advice; **zero console errors**; price card reads "updated today" | ✅ |
| M2 | `DEMO_MODE=0` shows the PIN login screen with the demo-profile hint | ✅ |
| M3 | Profile switcher lists exactly 3 farmers (no duplicate Amina), swaps profile without a reload; sidebar, greeting, score and tier all update | ✅ |
| M4 | Crop Doctor: green leaf → *Healthy*, 91% confidence, saved to scan history | ✅ |
| M5 | Crop Doctor: **non-leaf image (solid blue) → "Not recognised as a crop leaf", no diagnosis, not written to the farm record** | ✅ |
| M6 | Log harvest (1,750 kg maize @ 52 on 28 Jul) → ledger updated newest-first, revenue KES 91,000, score toast shown | ✅ |
| M7 | Mavuno Score: gauge animates, 5-factor breakdown, apply → approved, PayHero reference and destination number shown under "Your loans" | ✅ |
| M8 | **Second application blocked**: both offer buttons become "Repay your active loan first" and disable; repayment component drops 60 → 55 | ✅ |
| M9 | USSD simulator greets the **active** farmer ("Karibu John!" after switching to John); Escape closes the modal and restores focus | ✅ |

## Defects found and fixed during testing

| ID | Defect | Severity | Fix |
|----|--------|----------|-----|
| D1 | Modals rendered on page load — CSS `display:grid` overrode the HTML `hidden` attribute | High | Global `[hidden] { display: none !important; }` rule |
| D2 | Harvest dates displayed one day early on machines west of UTC | Low | Format dates with `timeZone: 'UTC'` |
| D3 | Yield-trend component compared raw kg across different crops, so a small tomato harvest could lower a score set by heavy maize harvests | Medium | Per-crop yield trend (crops with one harvest are neutral) |
| D4 | Malformed JSON body returned HTTP 500 | Low | Now returns HTTP 400; server stays alive (TC28) |
| D5 | **Price feed froze on the day the database was seeded.** `seedPrices()` returned early if any rows existed, so "Today's prices" showed stale data and, once prices aged past 30 days, the market-timing window emptied and silently cost a whole credit tier | **Critical** | Feed tops up to today on every boot from each market's last stored price; scoring falls back to all-time averages if the window is ever empty; TC01/TC16/TC18/TC31 guard it |
| D6 | **No authentication.** `x-farmer-id` was self-asserted, so any client could read or act as any farmer, including applying for their loans | **Critical** | scrypt-hashed PINs, HMAC-signed expiring session tokens, Bearer auth on every farmer-scoped route (TC02–TC10) |
| D7 | **Unlimited loan applications.** Five rapid requests produced five approvals — five real M-PESA disbursements with live credentials | **Critical** | One active loan per farmer, rolling 24 h cap, registered phone is authoritative (TC36–TC38) |
| D8 | Stored XSS: disease names, markets and seasons were rendered through `innerHTML` unescaped | High | `esc()` on every interpolated value; server rejects markup in text fields (TC26, TC45) |
| D9 | Validation holes: negative quantities, crops outside the catalogue, and year-2099 dates were all accepted; a non-numeric quantity returned HTTP 500 | High | Whitelists, finite/positive checks, date bounds (TC26) |
| D10 | `readBody` called `req.destroy()` on oversized input but never settled its promise, leaving the request pending forever | Medium | Promise now rejects with HTTP 413 (TC29) |
| D11 | No timeout on the PayHero call — a hung provider would hang the request, and with synchronous SQLite, the server | Medium | `AbortSignal.timeout`, failure recorded as a transaction |
| D12 | Orphan loans pointed at a farmer that no longer existed; the profile switcher showed "Amina Chebet" twice | High | `PRAGMA foreign_keys = ON`, FK constraints, boot-time orphan sweep, `npm run db:reset` (TC55, TC56) |
| D13 | **Crop Doctor floored confidence at 58%,** so a photo of anything returned a confident diagnosis | High | Two gates: signature distance *and* plant-tissue coverage. Non-leaf images return "Not recognised" (M5) |
| D14 | **Tissue gate missed on first attempt.** A solid blue image scored zero on all three damage ratios — identical to the "Healthy" signature — and came back "✓ Healthy, 91%" | High | Added a `tissue` feature measuring what share of the frame is plant-coloured at all; caught only by the manual browser pass, not by the API suite |
| D15 | **CORS check rejected the app's own writes.** Chrome sends an `Origin` header on same-origin POSTs, so login, harvest logging and loan applications would all have returned 403 in a real browser while every automated test passed | **Critical** | Same-origin requests compared by host before consulting the allowlist (M1, M6, M7) |
| D16 | Service worker used a cache-first shell strategy, serving the previous build on the first load after any change | Medium | Network-first with cache fallback — always current online, still fully offline-capable |
| D17 | `maskPhone` used a digit-lookahead that never matched across the spaces in `+254 712 345 678`, so the public roster leaked full phone numbers | High | Normalise to digits before masking (TC08) |
| D18 | USSD menu hard-coded "Karibu Amina!" for every farmer — on the last screen of the demo | Medium | Greeting reads the active farmer (M9) |

D14, D15 and D16 are worth noting: **all three passed the full API suite and were only caught by driving a real browser.** The automated tests never send an `Origin` header, never run a service worker, and never rasterise an image to a canvas.

## Non-functional observations

- **Performance:** 50 concurrent dashboard requests served in ~120 ms total (TC57), down from 283 ms — the score engine's per-harvest price lookup (N+1) is now a single grouped query, results are memoised hourly per farmer, and `farmer_id` indexes replace full table scans.
- **Portability:** zero runtime npm dependencies; runs on any Node ≥ 22.5 with one command; leaf analysis runs fully on-device.
- **Reliability:** malformed input, oversized bodies, unknown routes, unknown crops and a hung payment provider all fail safely without crashing the process. SIGINT/SIGTERM checkpoint the WAL and close the database cleanly.
- **Security:** authenticated sessions, per-IP rate limiting, PIN lockout, CSP and hardening headers, path-traversal protection, request bodies capped at 256 KB.
- **Accessibility:** icon-only controls labelled, modals trap focus and close on Escape, live regions on the toast and USSD screen, `prefers-reduced-motion` respected.
- **Known gaps:** weather and prices are simulated; the Crop Doctor is a colour heuristic, not a CNN; repayment is simulated in demo mode; rate limiting is in-process. All documented in the README.
