# MavunoAI — Group Presenter Guide

Read this once together as a team, then each member reads their own section twice. The speaker notes inside the PowerPoint contain the word-for-word script per slide; this guide is the strategy layer.

## The one sentence everyone must be able to say

> **"M-PESA turned airtime behaviour into credit history. MavunoAI turns harvests into credit history."**

If a judge stops any of you in the corridor, this is the answer to "so what's your project?"

## Roles (4 presenters, ~8 minutes + demo)

| Who | Slides | Job |
|-----|--------|-----|
| **Presenter 1** | 1–2, 12 | Opener & closer. Owns the hook and the final ask. Same person opens and closes — it creates symmetry. |
| **Presenter 2** | 3–4, 11 | Storyteller. Owns Amina's story, the solution loop, and the roadmap. Narrates during the demo. |
| **Presenter 3** | 5–6, 9 | Technical lead. Drives the laptop during the demo, owns the score engine and the engineering slide. |
| **Presenter 4** | 7–8, 10 | Business lead. Owns "why Kenya why now", the gap chart, and the business model. |

**Only 2 or 3 people?** Merge Presenter 4 into Presenter 1 (business + hook fit one voice), then Presenter 2's roadmap moves to Presenter 3.

## Timing (rehearse to this)

| Segment | Time |
|---------|------|
| Hook + problem (slides 1–2) | 1:40 |
| Amina + solution (3–4) | 1:45 |
| **Live demo** (slide 5 as map) | 2:30 |
| Score engine (6) | 1:00 |
| Why Kenya + chart + business (7, 8, 10) | 2:00 |
| Roadmap + close (11–12) | 1:00 |
| **Total** | **~10:00** (cut demo steps 3 & 6 if you have 7 minutes) |

## Pre-stage demo checklist (Presenter 3 — do this 15 minutes before)

1. Delete `mavuno.db` from the project folder (resets Amina to the clean seeded state, score 722).
2. Run `node server.js` → open http://localhost:4500 → leave it on the Dashboard.
3. Have 2–3 real diseased-leaf photos on the desktop (yellowed maize leaf works best).
4. Zoom browser to 110–125% so the back row can read it.
5. Close every other tab and window. Turn off notifications.
6. **Wifi dies? Nothing changes** — the whole system is local. Say it out loud; judges love it.

## The two "wow" moments — protect them

1. **The loan approval.** After tapping "Apply in one tap", say NOTHING for two full seconds. Then: *"No payslip. No title deed. Just her harvests."*
2. **The score rising live.** When the toast announces the new score after logging a harvest: *"That number just became easier to borrow against. That is the loop."*

## Q&A preparation — likely judge questions

**"Can't farmers just enter fake harvests?"** *(→ Presenter 3)*
Three defences: (1) lending starts small and grows only with repayment — the same trust-laddering M-Shwari used, so lying buys you a KES 10,000 exposure, not 120,000; (2) phase 2 counter-verifies against cooperative delivery records and buyer confirmations; (3) internal consistency checks — a claimed yield far above the agronomic ceiling for the acreage gets flagged.

**"How is this different from DigiFarm / Apollo Agriculture?"** *(→ Presenter 4)*
They score the farmer with black boxes (telco data, satellites). We let the farmer build a transparent score she can see and improve — which changes behaviour, not just measures it. Also: they need smartphones or agents; we reach feature phones via USSD.

**"Is the AI real?"** *(→ Presenter 3 — be honest, it wins trust)*
The current diagnosis engine is an on-device colour-signature model over a 14-disease Kenyan knowledge base — deliberately lightweight so it runs offline on any phone. The interface is built so a convolutional network trained on the PlantVillage dataset drops in without changing anything the farmer sees. The credit engine, however, is fully real: five factors, weighted, tested.

**"What about regulation?"** *(→ Presenter 4)*
We don't lend off our own balance sheet. We provide the score; licensed partners (SACCOs, MFIs under CBK's Digital Credit Providers Regulations 2022) do the lending. We are the credit bureau of the shamba.

**"How do you make money?"** *(→ Presenter 4)*
Lender API fees per underwriting decision + input-supplier commissions at launch; insurance and anonymised analytics in phase 2. The farmer never pays.

**"Where does the price data come from?"** *(→ Presenter 3)*
Seeded realistic series today; the API is shaped to match the KAMIS wholesale feed, so integration is a data-source swap, not a rebuild.

**"Why should we believe you can execute?"** *(→ any presenter)*
Point at the engineering slide: 29 automated tests, 4 defects found and fixed by our own suite — including a bias in our own credit model that under-scored farmers growing high-value light crops. We found it, fixed it, and regression-tested it before you could.

**"What do you need to launch?"** *(→ Presenter 1 — this is the ask)*
One farmers' cooperative, one SACCO partner, one season. The prototype is done.

## Numbers to memorise (each presenter owns their slide's numbers)

- 4.5 million smallholder farms; ~75% of Kenya's food output
- Agriculture: ~21.8% of GDP direct, ~40% of employment, **under 4% of bank credit** (CBK)
- 20–40% of yields lost to pests/disease (FAO); extension ratio ~1:1,000 vs recommended 1:400
- Maize spread in the demo data: 54.7 (Kisumu) vs 40.5 (Nairobi) KES/kg — same day
- Amina: 8 harvests, 5 seasons, 12 t, KES 548K revenue, score 733, Prime Harvester
- Market maths: 5% adoption × KES 15,000 average loan book = KES 3.4B lending market

## Final reminders

- Speak to the judges, not the screen. The person NOT speaking watches the judges' faces.
- Never apologise ("sorry, we didn't have time to…"). State what exists — a lot exists.
- End every answer within 30 seconds. Land the point, stop talking.
- Dress code: whatever you're comfortable in, but matching team energy beats matching shirts.
- Sleep. A rested team beats a rehearsed-at-3am team every time.
