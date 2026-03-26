#!/usr/bin/env python3
"""
Climate Attractor — Data Quality Assurance Report
===================================================
Reads  data/processed/climate_800k.json  and prints a detailed
console report covering completeness, range checks, splice quality,
era distribution, modern-values sanity, and attractor breakout ratio.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

# ── paths ───────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "processed" / "climate_800k.json"

# ── expected bounds ─────────────────────────────────────────────────
BOUNDS = {
    "co2_ppm":      (150, 500),
    "temp_anomaly": (-12, 4),
    "ch4_ppb":      (300, 2000),
    "sea_level_m":  (-160, 60),
    "insolation":   (150, 250),
}

VAR_LABELS = {
    "co2_ppm":      "CO₂ (ppm)",
    "temp_anomaly": "Temp (°C)",
    "ch4_ppb":      "CH₄ (ppb)",
    "sea_level_m":  "Sea level (m)",
    "insolation":   "Insolation (W/m²)",
}

SPLICE_AGE = 100  # yr BP — where modern joins ice core
HOLOCENE_START = 11_700  # yr BP

warnings = 0
errors = 0


def tag(level: str) -> str:
    global warnings, errors
    if level == "PASS":
        return "[PASS]"
    elif level == "WARN":
        warnings += 1
        return "[WARN]"
    else:
        errors += 1
        return "[ERR!]"


def hline(char: str = "═", width: int = 50) -> str:
    return char * width


# =====================================================================
#  MAIN
# =====================================================================
def main() -> None:
    global warnings, errors

    if not JSON_PATH.exists():
        print(f"ERROR: {JSON_PATH} not found. Run scripts/process_data.py first.")
        sys.exit(1)

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)

    data = payload["data"]
    n = len(data)

    print()
    print(hline())
    print("  CLIMATE ATTRACTOR — DATA QA  ")
    print(hline())

    # ──────────────────────────────────────────────────────────────
    #  1. COMPLETENESS
    # ──────────────────────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print("  1. COMPLETENESS")
    print(f"{'─'*50}")

    expected = 801  # 0 to 800_000 at 1 kyr step
    level = "PASS" if abs(n - expected) <= 5 else "ERR!"
    print(f"  {tag(level)} Total records: {n}  (expected ~{expected})")

    for var, label in VAR_LABELS.items():
        nulls = sum(1 for r in data if r.get(var) is None)
        pct = (n - nulls) / n * 100
        if pct < 90:
            lev = "WARN"
        elif pct < 99:
            lev = "PASS"
        else:
            lev = "PASS"
        print(f"  {tag(lev)} {label:22s}: {n - nulls}/{n} valid  ({pct:5.1f}%)"
              + ("  ⚠ coverage < 90%" if pct < 90 else ""))

    # ──────────────────────────────────────────────────────────────
    #  2. RANGE CHECKS
    # ──────────────────────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print("  2. RANGE CHECKS")
    print(f"{'─'*50}")

    for var, (lo, hi) in BOUNDS.items():
        vals = [r[var] for r in data if r.get(var) is not None]
        if not vals:
            print(f"  {tag('WARN')} {VAR_LABELS[var]:22s}: no data")
            continue
        vmin, vmax = min(vals), max(vals)
        oob = [v for v in vals if v < lo or v > hi]
        if oob:
            lev = "ERR!"
            extra = f"  {len(oob)} values out of [{lo}, {hi}]"
        else:
            lev = "PASS"
            extra = ""
        print(f"  {tag(lev)} {VAR_LABELS[var]:22s}: min={vmin:>10.2f}  max={vmax:>10.2f}{extra}")

    # ──────────────────────────────────────────────────────────────
    #  3. SPLICE QUALITY
    # ──────────────────────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print("  3. SPLICE QUALITY  (join at ~100 yr BP)")
    print(f"{'─'*50}")

    # Sort by age_bp ascending (0→800k)
    sorted_data = sorted(data, key=lambda r: r["age_bp"])

    # Find the index closest to SPLICE_AGE
    splice_idx = min(range(n), key=lambda i: abs(sorted_data[i]["age_bp"] - SPLICE_AGE))

    # Show window around splice
    window_lo = max(0, splice_idx - 4)
    window_hi = min(n, splice_idx + 5)
    print(f"\n  Points around splice (age_bp ≈ {SPLICE_AGE}):\n")
    print(f"  {'age_bp':>10}  {'era':<14}  {'CO2':>8}  {'Temp':>8}  {'CH4':>8}")
    print(f"  {'─'*10}  {'─'*14}  {'─'*8}  {'─'*8}  {'─'*8}")
    for i in range(window_lo, window_hi):
        r = sorted_data[i]
        marker = "  ◄── splice" if i == splice_idx else ""
        co2_s = f"{r['co2_ppm']:8.1f}" if r["co2_ppm"] is not None else "    null"
        tmp_s = f"{r['temp_anomaly']:8.3f}" if r["temp_anomaly"] is not None else "    null"
        ch4_s = f"{r['ch4_ppb']:8.1f}" if r["ch4_ppb"] is not None else "    null"
        print(f"  {r['age_bp']:>10}  {r['era']:<14}  {co2_s}  {tmp_s}  {ch4_s}{marker}")

    # Jump check at splice
    if splice_idx > 0 and splice_idx < n:
        before = sorted_data[splice_idx - 1]
        after  = sorted_data[splice_idx]
        # CO2 jump
        if before["co2_ppm"] is not None and after["co2_ppm"] is not None:
            co2_jump = abs(after["co2_ppm"] - before["co2_ppm"])
            lev = "WARN" if co2_jump > 20 else "PASS"
            print(f"\n  {tag(lev)} CO₂ jump at splice: {co2_jump:.1f} ppm"
                  + (" (> 20 ppm threshold)" if co2_jump > 20 else ""))
        # Temp jump
        if before["temp_anomaly"] is not None and after["temp_anomaly"] is not None:
            temp_jump = abs(after["temp_anomaly"] - before["temp_anomaly"])
            lev = "WARN" if temp_jump > 2 else "PASS"
            print(f"  {tag(lev)} Temp jump at splice: {temp_jump:.3f} °C"
                  + (" (> 2 °C threshold)" if temp_jump > 2 else ""))

    # ──────────────────────────────────────────────────────────────
    #  4. ERA DISTRIBUTION
    # ──────────────────────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print("  4. ERA DISTRIBUTION")
    print(f"{'─'*50}")

    era_counts: dict[str, list] = {}
    for r in sorted_data:
        era = r["era"]
        era_counts.setdefault(era, []).append(r["age_bp"])

    for era in ["paleoclimate", "holocene", "modern"]:
        if era in era_counts:
            ages = era_counts[era]
            print(f"  {tag('PASS')} {era:14s}: {len(ages):>4} pts,  "
                  f"age_bp {min(ages):>7,} – {max(ages):>7,}")
        else:
            print(f"  {tag('WARN')} {era:14s}: 0 pts")

    # ──────────────────────────────────────────────────────────────
    #  5. MODERN VALUES CHECK
    # ──────────────────────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print("  5. MODERN VALUES CHECK  (most recent point)")
    print(f"{'─'*50}")

    most_recent = sorted_data[0]  # age_bp = 0 = 1950 CE
    print(f"  Most recent: age_bp = {most_recent['age_bp']},  year_ce = {most_recent['year_ce']}")

    co2_now  = most_recent.get("co2_ppm")
    temp_now = most_recent.get("temp_anomaly")
    ch4_now  = most_recent.get("ch4_ppb")

    if co2_now is not None:
        # The grid point at age_bp=0 corresponds to ~1950 CE (the Mauna Loa start)
        # so we expect ~310-320 ppm, not 415 (that's 2024)
        lev = "PASS" if 280 <= co2_now <= 425 else "WARN"
        print(f"  {tag(lev)} CO₂  = {co2_now:.1f} ppm")

    if temp_now is not None:
        lev = "PASS" if -1.0 <= temp_now <= 1.5 else "WARN"
        print(f"  {tag(lev)} Temp = {temp_now:.3f} °C")

    if ch4_now is not None:
        lev = "PASS" if 600 <= ch4_now <= 1950 else "WARN"
        print(f"  {tag(lev)} CH₄  = {ch4_now:.1f} ppb")

    # ──────────────────────────────────────────────────────────────
    #  6. ATTRACTOR BREAKOUT CHECK
    # ──────────────────────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print("  6. ATTRACTOR BREAKOUT CHECK")
    print(f"{'─'*50}")

    paleo_co2 = [r["co2_ppm"] for r in data
                 if r["era"] == "paleoclimate" and r["co2_ppm"] is not None]
    modern_co2 = [r["co2_ppm"] for r in data
                  if r["era"] == "modern" and r["co2_ppm"] is not None]

    if paleo_co2 and modern_co2:
        paleo_max = max(paleo_co2)
        modern_val = max(modern_co2)  # use max across modern era
        ratio = modern_val / paleo_max if paleo_max > 0 else 0

        print(f"  Paleo CO₂ max  : {paleo_max:.1f} ppm")
        print(f"  Modern CO₂ max : {modern_val:.1f} ppm")
        print(f"  Ratio          : {ratio:.2f}x")

        lev = "PASS" if ratio >= 1.0 else "WARN"
        print(f"  {tag(lev)} Breakout ratio {'confirms' if ratio >= 1.0 else 'does NOT confirm'}"
              f" the attractor breakout narrative")
    else:
        print(f"  {tag('WARN')} Not enough data to compute breakout ratio")

    # ──────────────────────────────────────────────────────────────
    #  SUMMARY
    # ──────────────────────────────────────────────────────────────
    print(f"\n{hline()}")
    if errors == 0 and warnings == 0:
        print("  ✓ ALL CHECKS PASSED")
    else:
        parts = []
        if warnings:
            parts.append(f"{warnings} WARNING{'S' if warnings > 1 else ''}")
        if errors:
            parts.append(f"{errors} ERROR{'S' if errors > 1 else ''}")
        print(f"  ✗ {', '.join(parts)} FOUND")
        if errors:
            print("    → Review [ERR!] items above and re-run process_data.py")
        if warnings:
            print("    → Review [WARN] items — may indicate data gaps or edge cases")
    print(hline())
    print()


if __name__ == "__main__":
    main()
