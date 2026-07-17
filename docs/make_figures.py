"""Generate documentation figures for MavunoAI (matplotlib, no network)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Ellipse
import os

OUT = os.path.join(os.path.dirname(__file__), "figures")
os.makedirs(OUT, exist_ok=True)

GOLD = "#e09a10"
GREEN = "#2e7d46"
DARK = "#1c2b21"
LIGHT = "#f4efdf"

def box(ax, x, y, w, h, text, fc=LIGHT, ec=DARK, fs=10, weight="normal", tc=DARK):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.04",
                                fc=fc, ec=ec, lw=1.6))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs,
            weight=weight, color=tc, wrap=True)

def arrow(ax, x1, y1, x2, y2, text="", fs=8.5, style="-|>", color=DARK, curved=0.0):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=16,
                                 lw=1.4, color=color, connectionstyle=f"arc3,rad={curved}"))
    if text:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 + 0.02
        ax.text(mx, my, text, ha="center", va="bottom", fontsize=fs, color=GREEN, style="italic")

def newfig(w=10, h=6):
    fig, ax = plt.subplots(figsize=(w, h), dpi=160)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    return fig, ax

def save(fig, name):
    fig.savefig(os.path.join(OUT, name), bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", name)

# ---------------------------------------------------------------- 1. conceptual framework
fig, ax = newfig(11, 5.5)
box(ax, 0.02, 0.62, 0.24, 0.28, "INDEPENDENT VARIABLES\n\nCrop health scanning\nMarket price visibility\nHarvest record keeping", fc="#e9f3ea", fs=9.5)
box(ax, 0.02, 0.12, 0.24, 0.28, "MODERATING VARIABLES\n\nInternet availability\nDevice access (phone)\nDigital literacy", fc="#fdf3dc", fs=9.5)
box(ax, 0.38, 0.36, 0.24, 0.30, "MAVUNOAI PLATFORM\n\nAI diagnosis engine\nPrice intelligence\nMavuno Score engine", fc=LIGHT, fs=10, weight="bold")
box(ax, 0.74, 0.36, 0.24, 0.30, "DEPENDENT VARIABLES\n\nReduced crop losses\nBetter selling prices\nAccess to affordable credit", fc="#e9f3ea", fs=9.5)
arrow(ax, 0.26, 0.76, 0.44, 0.62)
arrow(ax, 0.26, 0.26, 0.44, 0.40)
arrow(ax, 0.62, 0.51, 0.74, 0.51)
save(fig, "fig_conceptual.png")

# ---------------------------------------------------------------- 2. agile cycle
fig, ax = newfig(8.5, 8.5)
import math
stages = ["Requirements\nAnalysis", "Design", "Develop", "Test", "Release", "Feedback"]
cx, cy, R = 0.5, 0.5, 0.34
for i, s in enumerate(stages):
    a = math.pi / 2 - i * (2 * math.pi / len(stages))
    x, y = cx + R * math.cos(a), cy + R * math.sin(a)
    ax.add_patch(Ellipse((x, y), 0.24, 0.14, fc=LIGHT if i % 2 == 0 else "#e9f3ea", ec=DARK, lw=1.6))
    ax.text(x, y, s, ha="center", va="center", fontsize=10, weight="bold", color=DARK)
    a2 = math.pi / 2 - (i + 1) * (2 * math.pi / len(stages))
    x2, y2 = cx + R * math.cos(a2), cy + R * math.sin(a2)
    # shorten arrows so they do not pierce the ellipses
    fx, fy = x + (x2 - x) * 0.32, y + (y2 - y) * 0.32
    tx, ty = x + (x2 - x) * 0.68, y + (y2 - y) * 0.68
    arrow(ax, fx, fy, tx, ty, curved=-0.25)
ax.text(cx, cy, "AGILE\nITERATION", ha="center", va="center", fontsize=13, weight="bold", color=GOLD)
save(fig, "fig_agile.png")

# ---------------------------------------------------------------- 3. DFD level 0
fig, ax = newfig(11, 5.5)
box(ax, 0.03, 0.40, 0.18, 0.22, "FARMER\n(external entity)", fc="#e9f3ea")
ax.add_patch(Ellipse((0.5, 0.51), 0.26, 0.30, fc=LIGHT, ec=DARK, lw=1.8))
ax.text(0.5, 0.51, "0\nMAVUNOAI\nSYSTEM", ha="center", va="center", fontsize=11, weight="bold")
box(ax, 0.79, 0.66, 0.18, 0.20, "D1 | Harvest &\nfarm records", fc="#fdf3dc")
box(ax, 0.79, 0.40, 0.18, 0.20, "D2 | Market\nprice store", fc="#fdf3dc")
box(ax, 0.79, 0.14, 0.18, 0.20, "D3 | Loans &\nscores", fc="#fdf3dc")
arrow(ax, 0.21, 0.56, 0.37, 0.56, "leaf photo, harvest data")
arrow(ax, 0.37, 0.46, 0.21, 0.46, "diagnosis, prices, score, loan offer")
arrow(ax, 0.63, 0.58, 0.79, 0.72, "harvest entries")
arrow(ax, 0.63, 0.51, 0.79, 0.50, "price queries")
arrow(ax, 0.63, 0.44, 0.79, 0.26, "loan records")
save(fig, "fig_dfd0.png")

# ---------------------------------------------------------------- 4. use case
fig, ax = newfig(10.5, 7)
# actors
for (x, y, label) in [(0.06, 0.55, "Farmer"), (0.94, 0.55, "Lender /\nSACCO")]:
    ax.add_patch(plt.Circle((x, y + 0.10), 0.025, fc=LIGHT, ec=DARK, lw=1.5))
    ax.plot([x, x], [y + 0.075, y - 0.01], color=DARK, lw=1.5)
    ax.plot([x - 0.03, x + 0.03], [y + 0.045, y + 0.045], color=DARK, lw=1.5)
    ax.plot([x, x - 0.025], [y - 0.01, y - 0.06], color=DARK, lw=1.5)
    ax.plot([x, x + 0.025], [y - 0.01, y - 0.06], color=DARK, lw=1.5)
    ax.text(x, y - 0.11, label, ha="center", fontsize=10, weight="bold")
# system boundary
ax.add_patch(FancyBboxPatch((0.2, 0.06), 0.6, 0.88, boxstyle="round,pad=0.01", fill=False, ec=DARK, lw=1.6))
ax.text(0.5, 0.90, "MavunoAI System", ha="center", fontsize=11, weight="bold")
cases = ["Scan crop for disease", "View market prices", "Log a harvest", "View Mavuno Score", "Apply for micro-loan", "Use USSD services"]
ys = [0.76, 0.63, 0.50, 0.37, 0.24, 0.115]
for label, y in zip(cases, ys):
    ax.add_patch(Ellipse((0.5, y), 0.34, 0.095, fc="#e9f3ea", ec=DARK, lw=1.4))
    ax.text(0.5, y, label, ha="center", va="center", fontsize=9.5)
    ax.plot([0.09, 0.33], [0.55, y], color=DARK, lw=1, ls="-")
ax.plot([0.91, 0.67], [0.55, 0.37], color=DARK, lw=1)   # lender: view score
ax.plot([0.91, 0.67], [0.55, 0.24], color=DARK, lw=1)   # lender: loan
save(fig, "fig_usecase.png")

# ---------------------------------------------------------------- 5. architecture
fig, ax = newfig(11, 6)
box(ax, 0.03, 0.68, 0.94, 0.24, "", fc="#f7f7f2")
ax.text(0.06, 0.885, "PRESENTATION LAYER", fontsize=9, weight="bold", color=GREEN)
box(ax, 0.06, 0.71, 0.20, 0.13, "Web SPA\n(vanilla JS)", fs=9)
box(ax, 0.29, 0.71, 0.20, 0.13, "On-device Crop\nDoctor (canvas)", fs=9)
box(ax, 0.52, 0.71, 0.20, 0.13, "SVG chart\nengine", fs=9)
box(ax, 0.75, 0.71, 0.19, 0.13, "USSD interface\n(*384*626#)", fs=9)
box(ax, 0.03, 0.36, 0.94, 0.24, "", fc="#f7f7f2")
ax.text(0.06, 0.565, "APPLICATION LAYER — Node.js (zero dependencies)", fontsize=9, weight="bold", color=GREEN)
box(ax, 0.06, 0.39, 0.20, 0.13, "REST API\n(node:http)", fs=9)
box(ax, 0.29, 0.39, 0.20, 0.13, "Mavuno Score\nengine (5 factors)", fs=9)
box(ax, 0.52, 0.39, 0.20, 0.13, "Price & weather\nservices", fs=9)
box(ax, 0.75, 0.39, 0.19, 0.13, "Advisory\nengine", fs=9)
box(ax, 0.03, 0.05, 0.94, 0.23, "", fc="#f7f7f2")
ax.text(0.06, 0.225, "DATA LAYER", fontsize=9, weight="bold", color=GREEN)
box(ax, 0.06, 0.08, 0.26, 0.12, "SQLite (node:sqlite)\nfarmers · harvests · loans", fs=9)
box(ax, 0.36, 0.08, 0.26, 0.12, "prices · diagnoses", fs=9)
box(ax, 0.66, 0.08, 0.28, 0.12, "Future: KAMIS feed,\nOpenWeather, M-PESA API", fs=9, fc="#fdf3dc")
arrow(ax, 0.5, 0.68, 0.5, 0.61, "HTTPS / JSON")
arrow(ax, 0.5, 0.36, 0.5, 0.29, "SQL")
save(fig, "fig_architecture.png")

# ---------------------------------------------------------------- 6. database schema
fig, ax = newfig(11, 6)
def table(ax, x, y, w, title, rows, fc=LIGHT):
    rh = 0.052
    h = rh * (len(rows) + 1)
    box(ax, x, y, w, rh, title, fc=GREEN, tc="white", fs=9.5, weight="bold")
    for i, r in enumerate(rows):
        box(ax, x, y - rh * (i + 1), w, rh, r, fc="white", fs=8.5)
    return y - rh * len(rows)

table(ax, 0.04, 0.86, 0.20, "FARMERS", ["id (PK)", "name", "phone", "county", "farm_size_acres"])
table(ax, 0.30, 0.86, 0.22, "HARVESTS", ["id (PK)", "farmer_id (FK)", "crop, season", "quantity_kg", "sold_price_per_kg", "market, harvest_date"])
table(ax, 0.58, 0.86, 0.20, "LOANS", ["id (PK)", "farmer_id (FK)", "amount, rate, term", "purpose, status", "score_at_application"])
table(ax, 0.30, 0.36, 0.22, "DIAGNOSES", ["id (PK)", "farmer_id (FK)", "crop, disease", "confidence, severity"])
table(ax, 0.58, 0.36, 0.20, "PRICES", ["crop (PK)", "market (PK)", "day (PK)", "price_per_kg"])
arrow(ax, 0.24, 0.70, 0.30, 0.70, "1 : N")
arrow(ax, 0.52, 0.70, 0.58, 0.70, "1 : N")
arrow(ax, 0.14, 0.60, 0.30, 0.28, "1 : N", curved=0.2)
save(fig, "fig_schema.png")

print("ALL FIGURES DONE")
