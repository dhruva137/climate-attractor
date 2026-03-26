#!/usr/bin/env python3
"""
Climate Attractor — Data Processing Pipeline
=============================================

Parses 7 raw paleoclimate / modern data files, resamples onto a common
1 000-year grid (−800 000 → 0 yr BP), splices modern instrumental records
onto ice-core data, synthesises a sea-level estimate, and writes:

    data/processed/climate_800k.json   — the main data payload
    data/processed/metadata.json       — provenance & statistics
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.interpolate import interp1d

# ── paths (run from repo root) ─────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
RAW  = ROOT / "data" / "raw"
OUT  = ROOT / "data" / "processed"

REFERENCE_YEAR = 1950  # "Before Present" convention: BP = before 1950 CE

# ── common time axis ────────────────────────────────────────────────────
TIME_MIN = 0           # years BP (0 = 1950 CE)
TIME_MAX = 800_000     # years BP (800 kyr ago)
TIME_STEP = 1_000
TIME_AXIS = np.arange(TIME_MIN, TIME_MAX + TIME_STEP, TIME_STEP, dtype=float)


# =====================================================================
#  1. EPICA Dome C — CO2  (edc-co2-2008.txt)
# =====================================================================
def parse_epica_co2(path: Path) -> pd.DataFrame:
    """
    The file has a multi-section layout.  We extract *all* numeric data
    rows that contain (Depth, Age, CO2, [sigma]) tuples from every section
    and every sub-column block.  We then de-duplicate on Age, keeping the
    first occurrence (which is the highest-resolution measurement).

    Section 1 (lines ~125-372): Two side-by-side 4-col / 3-col blocks.
    Section 2 (lines ~386+):    Up to 7 side-by-side sub-tables.

    Strategy: read every line, split on whitespace, try to pull out
    (Depth, Age, CO2) triplets.
    """
    ages, co2s = [], []
    with open(path, encoding="latin-1") as fh:
        in_data = False
        for line in fh:
            stripped = line.strip()
            # Skip blank lines and text header lines
            if not stripped:
                in_data = False
                continue
            # Detect data start: line begins with a number
            tokens = stripped.split()
            # Need at least 3 numeric tokens to have a (depth, age, co2) triple
            numeric_tokens = []
            for t in tokens:
                try:
                    numeric_tokens.append(float(t))
                except ValueError:
                    # Skip non-numeric tokens (e.g. 'b', 'g' lab codes)
                    pass
            if len(numeric_tokens) < 3:
                continue
            # Try to extract triplets: each group of ≥3 numbers is
            # (depth, age, co2 [, sigma])
            i = 0
            while i + 2 < len(numeric_tokens):
                depth = numeric_tokens[i]
                age   = numeric_tokens[i + 1]
                co2   = numeric_tokens[i + 2]
                # Sanity: depth in ~100..3200m, age 0..800k, co2 100..350
                if 50 < depth < 3500 and 0 <= age <= 810_000 and 100 < co2 < 400:
                    ages.append(age)
                    co2s.append(co2)
                    # If next token looks like sigma (small number), skip it
                    if i + 3 < len(numeric_tokens) and numeric_tokens[i + 3] < 20:
                        i += 4
                    else:
                        i += 3
                else:
                    i += 1

    df = pd.DataFrame({"age_bp": ages, "co2_ppm": co2s})
    # De-duplicate: keep mean of CO2 at each unique age
    df = df.groupby("age_bp", as_index=False).mean()
    df = df.sort_values("age_bp").reset_index(drop=True)
    df = df[(df.age_bp >= 0) & (df.age_bp <= 800_000)]
    print(f"  EPICA CO2 : {len(df):>5} rows,  age {df.age_bp.min():.0f} – {df.age_bp.max():.0f}")
    return df


# =====================================================================
#  2. EPICA Dome C — CH4  (edc-ch4-2008.txt)
# =====================================================================
def parse_epica_ch4(path: Path) -> pd.DataFrame:
    """
    Columns: Depth | Gas Age (yr BP) | CH4 (ppb) | 1σ | Lab
    Data starts after the header line 'Depth      Gas Age ...'
    """
    ages, ch4s = [], []
    with open(path, encoding="latin-1") as fh:
        in_data = False
        for line in fh:
            stripped = line.strip()
            if "Depth" in stripped and "Gas Age" in stripped:
                in_data = True
                continue
            if not in_data or not stripped:
                continue
            tokens = stripped.split()
            if len(tokens) < 3:
                continue
            try:
                depth = float(tokens[0])
                age   = float(tokens[1])
                ch4   = float(tokens[2])
                if 0 <= age <= 810_000 and 200 < ch4 < 2500:
                    ages.append(age)
                    ch4s.append(ch4)
            except ValueError:
                continue

    df = pd.DataFrame({"age_bp": ages, "ch4_ppb": ch4s})
    df = df.groupby("age_bp", as_index=False).mean()
    df = df.sort_values("age_bp").reset_index(drop=True)
    df = df[(df.age_bp >= 0) & (df.age_bp <= 800_000)]
    print(f"  EPICA CH4 : {len(df):>5} rows,  age {df.age_bp.min():.0f} – {df.age_bp.max():.0f}")
    return df


# =====================================================================
#  3. EPICA Dome C — Temperature  (edc3deuttemp2007.txt)
# =====================================================================
def parse_epica_temp(path: Path) -> pd.DataFrame:
    """
    Columns: Bag | ztop (m) | Age (yr BP 1950) | Deuterium (‰) | Temp (°C anomaly)
    Data starts after 'Bag         ztop          Age ...' header.
    Some early rows lack Deuterium & Temp columns.
    """
    ages, temps = [], []
    with open(path, encoding="latin-1") as fh:
        in_data = False
        for line in fh:
            stripped = line.strip()
            if "Bag" in stripped and "ztop" in stripped and "Age" in stripped:
                in_data = True
                continue
            if not in_data or not stripped:
                continue
            tokens = stripped.split()
            if len(tokens) < 5:
                # rows without temperature data — skip
                continue
            try:
                age  = float(tokens[2])
                temp = float(tokens[4])
                if 0 <= age <= 810_000:
                    ages.append(age)
                    temps.append(temp)
            except (ValueError, IndexError):
                continue

    df = pd.DataFrame({"age_bp": ages, "temp_anomaly": temps})
    df = df.sort_values("age_bp").reset_index(drop=True)
    df = df[(df.age_bp >= 0) & (df.age_bp <= 800_000)]
    print(f"  EPICA Temp: {len(df):>5} rows,  age {df.age_bp.min():.0f} – {df.age_bp.max():.0f}")
    return df


# =====================================================================
#  4. Laskar 2004 — Insolation  (laskar2004_insolation.txt)
# =====================================================================
def parse_insolation(path: Path) -> pd.DataFrame:
    """
    Space-delimited, no header.
    Column 1: time in kyr (negative = past)  Column 2: insolation (W m⁻²)
    Convert kyr → yr BP.
    """
    rows = []
    with open(path, encoding="latin-1") as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped:
                continue
            tokens = stripped.split()
            if len(tokens) < 2:
                continue
            try:
                time_kyr    = float(tokens[0])
                insolation  = float(tokens[1])
                age_bp = -time_kyr * 1_000  # -(-800) * 1000 = 800 000
                rows.append((age_bp, insolation))
            except ValueError:
                continue

    df = pd.DataFrame(rows, columns=["age_bp", "insolation"])
    df = df.sort_values("age_bp").reset_index(drop=True)
    df = df[(df.age_bp >= 0) & (df.age_bp <= 800_000)]
    print(f"  Insolation: {len(df):>5} rows,  age {df.age_bp.min():.0f} – {df.age_bp.max():.0f}")
    return df


# =====================================================================
#  5. Mauna Loa — CO2  (monthly_flask_co2_mlo.csv)
# =====================================================================
def parse_modern_co2(path: Path) -> pd.DataFrame:
    """
    Lines 1-57 are quoted headers.  Data lines start at line 58.
    Columns: Yr, Mn, Excel-date, decimal-date, CO2, ...
    Missing values = -99.99 or NaN.
    We take annual averages (mean of monthly valid data).
    """
    years, co2s = [], []
    with open(path, encoding="latin-1") as fh:
        for line in fh:
            stripped = line.strip()
            # Skip header / comment lines that start with '"'
            if stripped.startswith('"') or not stripped:
                continue
            # Skip column-label lines (contain non-numeric first field)
            tokens = [t.strip() for t in stripped.split(",")]
            if len(tokens) < 5:
                continue
            try:
                yr  = int(tokens[0])
                co2 = float(tokens[4])
                if co2 < 0 or np.isnan(co2):
                    # try the filled column (col 9)
                    co2 = float(tokens[8]) if len(tokens) > 8 else np.nan
                if co2 > 0 and not np.isnan(co2):
                    years.append(yr)
                    co2s.append(co2)
            except (ValueError, IndexError):
                continue

    df = pd.DataFrame({"year": years, "co2_ppm": co2s})
    df = df.groupby("year", as_index=False).mean()
    print(f"  Modern CO2: {len(df):>5} annual rows,  {df.year.min()} – {df.year.max()} CE")
    return df


# =====================================================================
#  6. GISTEMP — Global Temperature  (GISTEMP_GLB_annual.csv)
# =====================================================================
def parse_gistemp(path: Path) -> pd.DataFrame:
    """
    CSV with columns: Year,Jan,Feb,...,Dec,J-D.
    Missing values marked as '***'.
    We use column 'J-D' (annual mean anomaly vs. 1951-1980 baseline).
    """
    df = pd.read_csv(path, na_values=["***", "****"])
    # Keep Year and annual mean (J-D)
    df = df[["Year", "J-D"]].dropna().rename(columns={"Year": "year", "J-D": "temp_anomaly"})
    df["year"] = df["year"].astype(int)
    df["temp_anomaly"] = df["temp_anomaly"].astype(float)
    print(f"  GISTEMP   : {len(df):>5} annual rows,  {df.year.min()} – {df.year.max()} CE")
    return df


# =====================================================================
#  7. NOAA — Global mean CH4  (ch4_mm_gl.txt)
# =====================================================================
def parse_modern_ch4(path: Path) -> pd.DataFrame:
    """
    Space-delimited, '#'-commented header.
    Columns: year  month  decimal  average  average_unc  trend  trend_unc
    We take annual averages.
    """
    years, ch4s = [], []
    with open(path, encoding="latin-1") as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            tokens = stripped.split()
            if len(tokens) < 4:
                continue
            try:
                yr  = int(tokens[0])
                ch4 = float(tokens[3])
                if ch4 > 0:
                    years.append(yr)
                    ch4s.append(ch4)
            except ValueError:
                continue

    df = pd.DataFrame({"year": years, "ch4_ppb": ch4s})
    df = df.groupby("year", as_index=False).mean()
    print(f"  Modern CH4: {len(df):>5} annual rows,  {df.year.min()} – {df.year.max()} CE")
    return df


# =====================================================================
#  Interpolation helper
# =====================================================================
def resample(ages: np.ndarray, values: np.ndarray, target: np.ndarray,
             kind: str = "linear") -> np.ndarray:
    """Interpolate *values(ages)* onto *target* time axis.
    Extrapolated points are filled with NaN."""
    f = interp1d(ages, values, kind=kind, bounds_error=False, fill_value=np.nan)
    return f(target)


# =====================================================================
#  CE year → years BP conversion  (1950 = 0 BP)
# =====================================================================
def ce_to_bp(year_ce: int | float) -> float:
    return REFERENCE_YEAR - year_ce


# =====================================================================
#  Era categorisation
# =====================================================================
def classify_era(age_bp: float) -> str:
    """
    paleoclimate : > 11 700 yr BP  (pre-Holocene)
    holocene     : 11 700 → 100 yr BP  (≈ 1850 CE)
    modern       : < 100 yr BP  (post-1850 CE → instrumental era)
    """
    if age_bp > 11_700:
        return "paleoclimate"
    elif age_bp > 100:
        return "holocene"
    else:
        return "modern"


# =====================================================================
#  MAIN PIPELINE
# =====================================================================
def main() -> None:
    print("=" * 60)
    print("Climate Attractor — Data Processing Pipeline")
    print("=" * 60)

    # ── 0. Ensure output directory ──────────────────────────────────
    OUT.mkdir(parents=True, exist_ok=True)

    # ── 1. Parse all raw files ──────────────────────────────────────
    print("\n[1/5] Parsing raw data files …")

    co2_paleo  = parse_epica_co2(RAW / "epica" / "edc-co2-2008.txt")
    ch4_paleo  = parse_epica_ch4(RAW / "epica" / "edc-ch4-2008.txt")
    temp_paleo = parse_epica_temp(RAW / "epica" / "edc3deuttemp2007.txt")
    insol      = parse_insolation(RAW / "orbital" / "laskar2004_insolation.txt")
    co2_modern = parse_modern_co2(RAW / "modern" / "monthly_flask_co2_mlo.csv")
    temp_modern = parse_gistemp(RAW / "modern" / "GISTEMP_GLB_annual.csv")
    ch4_modern = parse_modern_ch4(RAW / "modern" / "ch4_mm_gl.txt")

    # ── 2. Convert modern CE years → years BP ──────────────────────
    print("\n[2/5] Converting modern records to years BP …")

    co2_modern["age_bp"]  = co2_modern["year"].apply(ce_to_bp)
    temp_modern["age_bp"] = temp_modern["year"].apply(ce_to_bp)
    ch4_modern["age_bp"]  = ch4_modern["year"].apply(ce_to_bp)

    # ── 3. Splice: merge modern onto paleo ─────────────────────────
    print("\n[3/5] Splicing modern instrumental data onto ice-core records …")

    SPLICE_THRESHOLD = 100  # yr BP ≈ 1850 CE

    # CO2
    co2_all = pd.concat([
        co2_paleo[co2_paleo.age_bp > SPLICE_THRESHOLD][["age_bp", "co2_ppm"]],
        co2_modern[co2_modern.age_bp <= SPLICE_THRESHOLD][["age_bp", "co2_ppm"]],
    ]).sort_values("age_bp").reset_index(drop=True)

    # CH4
    ch4_all = pd.concat([
        ch4_paleo[ch4_paleo.age_bp > SPLICE_THRESHOLD][["age_bp", "ch4_ppb"]],
        ch4_modern[ch4_modern.age_bp <= SPLICE_THRESHOLD][["age_bp", "ch4_ppb"]],
    ]).sort_values("age_bp").reset_index(drop=True)

    # Temperature
    temp_all = pd.concat([
        temp_paleo[temp_paleo.age_bp > SPLICE_THRESHOLD][["age_bp", "temp_anomaly"]],
        temp_modern[temp_modern.age_bp <= SPLICE_THRESHOLD][["age_bp", "temp_anomaly"]],
    ]).sort_values("age_bp").reset_index(drop=True)

    print(f"  Spliced CO2 : {len(co2_all):>5} rows")
    print(f"  Spliced CH4 : {len(ch4_all):>5} rows")
    print(f"  Spliced Temp: {len(temp_all):>5} rows")

    # ── 4. Resample onto common 1 000-year grid ───────────────────
    print("\n[4/5] Resampling onto 1 000-year grid …")

    co2_grid  = resample(co2_all.age_bp.values,  co2_all.co2_ppm.values,   TIME_AXIS)
    ch4_grid  = resample(ch4_all.age_bp.values,  ch4_all.ch4_ppb.values,   TIME_AXIS)
    temp_grid = resample(temp_all.age_bp.values, temp_all.temp_anomaly.values, TIME_AXIS)
    insol_grid = resample(insol.age_bp.values,   insol.insolation.values,  TIME_AXIS)

    # Sea level synthesis (placeholder: ΔT × 15 m/°C)
    sea_level_grid = temp_grid * 15.0

    # ── 5. Build output payload ────────────────────────────────────
    print("\n[5/5] Writing JSON output …")

    def _safe_round(val: float, ndigits: int) -> float:
        """round() via string formatting — avoids Pyright overload issues with numpy scalars."""
        return float(f"{float(val):.{ndigits}f}")

    records = []
    for i, age_bp in enumerate(TIME_AXIS):
        rec = {
            "age_bp":       int(age_bp),
            "year_ce":      int(REFERENCE_YEAR - age_bp),
            "era":          classify_era(age_bp),
            "co2_ppm":      _safe_round(co2_grid[i],        2) if not np.isnan(co2_grid[i])  else None,
            "ch4_ppb":      _safe_round(ch4_grid[i],        1) if not np.isnan(ch4_grid[i])  else None,
            "temp_anomaly": _safe_round(temp_grid[i],       3) if not np.isnan(temp_grid[i]) else None,
            "sea_level_m":  _safe_round(sea_level_grid[i],  1) if not np.isnan(sea_level_grid[i]) else None,
            "insolation":   _safe_round(insol_grid[i],      2) if not np.isnan(insol_grid[i]) else None,
        }
        records.append(rec)

    payload = {
        "meta": {
            "description": "Earth climate state vector, 800 kyr BP → present, 1 kyr resolution",
            "time_axis": "age_bp (years before 1950 CE)",
            "variables": {
                "co2_ppm":      "Atmospheric CO₂ (ppm) — EPICA + Mauna Loa",
                "ch4_ppb":      "Atmospheric CH₄ (ppb) — EPICA + NOAA global mean",
                "temp_anomaly": "Temperature anomaly (°C vs last 1 kyr mean) — EPICA δD + GISTEMP",
                "sea_level_m":  "Sea-level estimate (m, synthesised: ΔT × 15)",
                "insolation":   "65°N summer insolation (W m⁻²) — Laskar 2004",
            },
            "eras": {
                "paleoclimate": "> 11 700 yr BP",
                "holocene":     "11 700 – 100 yr BP",
                "modern":       "< 100 yr BP (post-1850 CE)",
            },
            "n_records":    len(records),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "data": records,
    }

    out_path = OUT / "climate_800k.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print(f"  → {out_path}  ({os.path.getsize(out_path) / 1024:.1f} KB)")

    # ── Metadata report ────────────────────────────────────────────
    non_null = lambda arr: np.count_nonzero(~np.isnan(arr))
    metadata = {
        "pipeline_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "grid": {
            "start_bp": int(TIME_MIN),
            "end_bp":   int(TIME_MAX),
            "step_yr":  int(TIME_STEP),
            "n_points": len(TIME_AXIS),
        },
        "sources": {
            "epica_co2":  {"file": "edc-co2-2008.txt",          "raw_rows": len(co2_paleo),  "coverage": f"{non_null(co2_grid)}/{len(TIME_AXIS)} grid pts"},
            "epica_ch4":  {"file": "edc-ch4-2008.txt",          "raw_rows": len(ch4_paleo),  "coverage": f"{non_null(ch4_grid)}/{len(TIME_AXIS)} grid pts"},
            "epica_temp": {"file": "edc3deuttemp2007.txt",       "raw_rows": len(temp_paleo), "coverage": f"{non_null(temp_grid)}/{len(TIME_AXIS)} grid pts"},
            "insolation": {"file": "laskar2004_insolation.txt", "raw_rows": len(insol),      "coverage": f"{non_null(insol_grid)}/{len(TIME_AXIS)} grid pts"},
            "modern_co2": {"file": "monthly_flask_co2_mlo.csv", "raw_rows": len(co2_modern)},
            "modern_temp":{"file": "GISTEMP_GLB_annual.csv",    "raw_rows": len(temp_modern)},
            "modern_ch4": {"file": "ch4_mm_gl.txt",             "raw_rows": len(ch4_modern)},
        },
        "statistics": {
            var: {
                "min":  round(float(np.nanmin(arr)), 3),
                "max":  round(float(np.nanmax(arr)), 3),
                "mean": round(float(np.nanmean(arr)), 3),
                "std":  round(float(np.nanstd(arr)), 3),
                "null_count": int(np.count_nonzero(np.isnan(arr))),
            }
            for var, arr in [
                ("co2_ppm", co2_grid),
                ("ch4_ppb", ch4_grid),
                ("temp_anomaly", temp_grid),
                ("sea_level_m", sea_level_grid),
                ("insolation", insol_grid),
            ]
        },
    }

    meta_path = OUT / "metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"  → {meta_path}  ({os.path.getsize(meta_path) / 1024:.1f} KB)")

    # ── Summary ────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("Pipeline complete.")
    print(f"  Records : {len(records)}")
    print(f"  Eras    : {sum(1 for r in records if r['era']=='paleoclimate')} paleoclimate, "
          f"{sum(1 for r in records if r['era']=='holocene')} holocene, "
          f"{sum(1 for r in records if r['era']=='modern')} modern")
    nulls = {k: sum(1 for r in records if r[k] is None) for k in ["co2_ppm","ch4_ppb","temp_anomaly","insolation"]}
    for k, v in nulls.items():
        print(f"  {k:16s}: {len(records)-v}/{len(records)} non-null")
    print("=" * 60)


if __name__ == "__main__":
    main()
