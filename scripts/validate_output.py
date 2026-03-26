import json
import sys

with open("data/processed/climate_800k.json", "r", encoding="utf-8") as f:
    d = json.load(f)

data = d["data"]
print(f"Total records: {len(data)}")
print()

# Sample records
for idx in [0, 1, 10, 400, 788, 799, 800]:
    if idx < len(data):
        r = data[idx]
        print(f"  [{idx:>3}] age_bp={r['age_bp']:>8}  era={r['era']:<14}  "
              f"CO2={str(r['co2_ppm']):>8}  CH4={str(r['ch4_ppb']):>8}  "
              f"temp={str(r['temp_anomaly']):>8}  insol={str(r['insolation']):>8}")

print()

# Era counts
from collections import Counter
eras = Counter(r["era"] for r in data)
print(f"Era counts: {dict(eras)}")

# Null counts
for var in ["co2_ppm", "ch4_ppb", "temp_anomaly", "sea_level_m", "insolation"]:
    non_null = sum(1 for r in data if r[var] is not None)
    print(f"  {var:16s}: {non_null}/{len(data)} non-null")

# Check metadata file
with open("data/processed/metadata.json", "r", encoding="utf-8") as f:
    m = json.load(f)

print()
print("Grid:", m["grid"])
print()
for src, info in m["sources"].items():
    print(f"  {src:14s}: {info}")
print()
for var, stats in m["statistics"].items():
    print(f"  {var:16s}: min={stats['min']:>10}  max={stats['max']:>10}  mean={stats['mean']:>10}")
