# Climate Attractor

**An interactive visualization of Earth's climate as a dynamical system — 800,000 years of real ice core data.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-climate--attractor.vercel.app-4fc3f7?style=flat-square&logo=vercel)](https://climate-attractor.vercel.app)
[![Data: EPICA](https://img.shields.io/badge/Data-EPICA%20Dome%20C-818cf8?style=flat-square)](https://www.ncei.noaa.gov)
[![License: MIT](https://img.shields.io/badge/License-MIT-4ade80?style=flat-square)](LICENSE)

For 800,000 years, Earth's climate cycled through a stable "attractor" — a bounded region of CO₂ and temperature states. Then the industrial era began. This visualization makes that breakout visceral.

---

## Live Demo

**[climate-attractor.vercel.app](https://climate-attractor.vercel.app)**

---

## What You're Looking At

**Phase Portrait** — CO₂ vs Temperature as a 2D orbit. Watch the convex hull (natural variability envelope) form over 800,000 years, then watch the modern era punch straight through it.

**t-SNE / UMAP** — All 5 climate variables compressed to 2D. 800,000 years of history clusters tightly. The modern era appears as a lone outlier.

**3D Orbit** — Rotate the full CO₂/Temperature/CH₄ phase space. The industrial spike is unmistakable from every angle.

---

## Data Sources

| Variable | Source | Period | Reference |
|---|---|---|---|
| CO₂ | EPICA Dome C | 800,000–22,000 BP | Lüthi et al. 2008 |
| CH₄ | EPICA Dome C | 800,000–22,000 BP | Loulergue et al. 2008 |
| Temperature | EPICA Dome C δD | 800,000–0 BP | Jouzel et al. 2007 |
| CO₂ modern | Mauna Loa (Scripps) | 1958–2026 | Keeling et al. |
| Temp modern | NASA GISTEMP v4 | 1880–2026 | Lenssen et al. |
| Insolation | Laskar 2004 | 800,000–0 BP | Laskar et al. 2004 |

---

## Run Locally

### 1. Clone and get data

```bash
git clone https://github.com/dhruva137/climate-attractor
cd climate-attractor
```

Download raw data files into `data/raw/` per the instructions in `docs/methodology.md`.

### 2. Run the pipeline

```bash
pip install pandas numpy scipy
python scripts/process_data.py
```

Outputs `data/processed/climate_800k.json`

### 3. Serve

```bash
npx serve .
# Open http://localhost:3000
```

No build step. No bundler. Pure static site.

---

## Tech Stack

- **D3.js v7** — phase portrait, convex hull, axes
- **Three.js r128** — 3D orbit view
- **tsne-js / umap-js** — dimensionality reduction
- **Python** (pandas, numpy, scipy) — data pipeline only
- **Vercel** — hosting

---

## Author

**Dhruva P Gowda**
[github.com/dhruva137](https://github.com/dhruva137)

---

## Citation

```
Gowda, D. P. (2026). Climate Attractor: Interactive visualization
of 800,000 years of Earth's climate data.
https://climate-attractor.vercel.app
```

---

## License

MIT © 2026 Dhruva P Gowda
