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
| 📟 **USSD mode** | Dial `*384*626#` on any feature phone — prices, score, weather and loans with zero smartphone required. (Simulated in-app.) | Inclusion |

**The insight that wins:** a harvest ledger is a financial identity. MavunoAI converts agronomic behaviour into bankable data — the same way M-PESA converted airtime behaviour into M-Shwari credit limits.

## Running it

Zero dependencies. Node.js ≥ 22.5 only (uses built-in `node:sqlite`).

```bash
node server.js
# → http://localhost:4500
```

No `npm install`, no API keys, no internet required.

## Architecture

```
├── server.js          # Node built-ins only: http server + SQLite + scoring engine
├── mavuno.db          # SQLite (auto-created & seeded on first run)
└── public/
    ├── index.html     # single-page app
    ├── css/style.css  # hand-crafted design system
    └── js/app.js      # vanilla JS: on-device leaf analysis, SVG charts, USSD sim
```

- **Mavuno Score engine** (`server.js → computeScore`): weighted 5-factor model over the harvest ledger, mapped to a 300–850 band with loan tiers.
- **Crop Doctor** (`app.js → extractLeafFeatures`): canvas-based colour-signature extraction (chlorosis / necrosis / lesion ratios) matched against a knowledge base of 14 common Kenyan crop diseases with localised treatment advice. Designed to swap in a TensorFlow Lite CNN without changing the UX.
- **Price feed**: seeded 60-day series per crop per market; the API shape is ready for a live ingest (e.g. KAMIS / county market boards).
- **Weather**: simulated 5-day feed; swap `generateWeather()` for OpenWeather with one function change.

## 3-minute demo script

1. **Dashboard** — "Meet Amina, 3.5 acres in Uasin Gishu. Weather, today's prices and this week's agronomy advice in one glance."
2. **Crop Doctor** — upload a leaf photo → diagnosis + treatment in seconds. "This scan also just became a data point in her farm record."
3. **Markets** — flip between crops; point at the spread between markets. "That gap is money the middleman keeps today."
4. **My Harvests** — log a new harvest live → watch the toast announce her new score. "Every bag she logs is a line in her credit file."
5. **Mavuno Score** — the gauge, the 5-factor breakdown, then **tap "Apply in one tap"** → loan approved to M-PESA. *"No payslip. No title deed. Just her harvests."*
6. **Finale** — open the USSD simulator: "And for the 60% of rural Kenya on feature phones — same power, no smartphone."

## Testing

29 automated tests (all passing) + 6-flow manual UAT — full report in [TESTING.md](TESTING.md).

```bash
node --test tests/api.test.js
```

## Documentation & presentation

- `docs/MavunoAI-Documentation.docx` — full project documentation (Kabarak research-project format, chapters 1–5)
- `docs/MavunoAI-Pitch.pptx` — 12-slide pitch deck with per-slide speaker notes and presenter assignments
- `docs/PRESENTER-GUIDE.md` — group roles, timing, demo checklist and judge Q&A prep
- (`docx`/`pptxgenjs` in package.json are dev-only, used to regenerate the documents; the app itself has zero runtime dependencies)

## What we'd build next

- Real CNN disease model (PlantVillage dataset, TFLite, still on-device)
- Live KAMIS market-price ingestion + SMS price alerts
- Partner API for SACCOs & MFIs to underwrite against the Mavuno Score
- Crop insurance priced by the same score
