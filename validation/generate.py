"""
Builds the reference fixtures the unit tests compare against.

1. Downloads Liljegren's WBGT v1.1 C source (the copy kept in mdljts/wbgt,
   pinned to one commit), strips the demo main(), and compiles it twice:
   as published (float) and with every float promoted to double.
2. Runs both on a few thousand random weather cases.
3. Computes NREL SPA sun positions with pvlib for random times and places.

Requires gcc, numpy, pandas and pvlib. Run from the repository root:

    python3 validation/generate.py
"""

from __future__ import annotations

import json
import re
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pvlib

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "validation" / ".cache"
FIXTURES = ROOT / "src" / "lib" / "physics" / "__fixtures__"
COMMIT = "cd672a886880b67f3f27bdbf75038d8f7ff0bac2"
SOURCE_URL = f"https://raw.githubusercontent.com/mdljts/wbgt/{COMMIT}/src/wbgt.c.original"
SEED = 20260929
N_CASES = 3000
N_SUN = 1500


def fetch_source() -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "wbgt.c.original"
    if not path.exists():
        with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
            path.write_bytes(response.read())
    return path.read_text(encoding="utf-8", errors="replace").replace("\r", "")


def build(source: str) -> dict[str, Path]:
    lines = source.split("\n")
    # The library part starts at the second "/* ====" banner, right after the demo main().
    banners = [i for i, line in enumerate(lines) if line.startswith("/* ====")]
    library = "\n".join(lines[banners[0]:])
    builds = {}
    for name, text, real in (
        ("float", library, "float"),
        ("double", re.sub(r"\bfloat\b", "double", library), "double"),
    ):
        lib = CACHE / f"lib_{name}.c"
        lib.write_text(text)
        exe = CACHE / f"ref_{name}"
        subprocess.run(
            ["gcc", "-O2", "-std=gnu89", "-w", f"-DREAL={real}", "-o", str(exe),
             str(ROOT / "validation" / "driver.c"), str(lib), "-lm"],
            check=True,
        )
        builds[name] = exe
    return builds


def make_cases(rng: np.random.Generator) -> list[list[float]]:
    cases = []
    for _ in range(N_CASES):
        year = int(rng.integers(1950, 2050))
        leap = (year % 4 == 0 and year % 100 != 0) or year % 400 == 0
        doy = int(rng.integers(1, 367 if leap else 366))
        hour = int(rng.integers(0, 24))
        minute = int(rng.choice([0, 30]))
        lon = float(np.round(rng.uniform(-180, 180), 4))
        gmt = int(np.clip(np.round(lon / 15), -12, 14))
        avg = int(rng.choice([0, 60]))
        lat = float(np.round(rng.uniform(-70, 75), 4))
        solar = 0.0 if rng.random() < 0.2 else float(np.round(rng.uniform(0, 1200), 2))
        pres = float(np.round(rng.uniform(600, 1050), 2))
        tair = float(np.round(rng.uniform(-15, 50), 2))
        rh = float(np.round(rng.uniform(3, 100), 2))
        speed = 0.0 if rng.random() < 0.1 else float(np.round(rng.uniform(0, 15), 2))
        zspeed = float(rng.choice([2.0, 10.0]))
        dt = float(rng.choice([-1.0, 1.0]))
        urban = int(rng.integers(0, 2))
        cases.append([year, doy, hour, minute, gmt, avg, lat, lon, solar, pres, tair, rh, speed, zspeed, dt, urban])
    return cases


def run(exe: Path, cases: list[list[float]]) -> list[list[float]]:
    text = "\n".join(" ".join(str(v) for v in case) for case in cases) + "\n"
    out = subprocess.run([str(exe)], input=text, capture_output=True, text=True, check=True).stdout
    return [[float(x) for x in line.split()] for line in out.strip().split("\n")]


def sun_cases(rng: np.random.Generator) -> list[list[float]]:
    start = pd.Timestamp("1940-01-01", tz="UTC").value // 10**6
    end = pd.Timestamp("2030-12-31", tz="UTC").value // 10**6
    ms = rng.integers(start, end, size=N_SUN)
    lat = np.round(rng.uniform(-66, 66, size=N_SUN), 4)
    lon = np.round(rng.uniform(-180, 180, size=N_SUN), 4)
    rows = []
    for t, la, lo in zip(ms, lat, lon):
        stamp = pd.DatetimeIndex([pd.Timestamp(int(t), unit="ms", tz="UTC")])
        sp = pvlib.solarposition.get_solarposition(stamp, la, lo, method="nrel_numpy")
        rows.append([
            int(t), float(la), float(lo),
            round(90.0 - float(sp["zenith"].iloc[0]), 6),
            round(float(sp["azimuth"].iloc[0]), 6),
        ])
    return rows


def main() -> None:
    rng = np.random.default_rng(SEED)
    builds = build(fetch_source())
    cases = make_cases(rng)
    doubles = run(builds["double"], cases)
    floats = run(builds["float"], cases)

    ok = [i for i, row in enumerate(doubles) if row[0] == 0]
    float_diff = max(abs(doubles[i][5] - floats[i][5]) for i in ok if floats[i][0] == 0)
    failures = len(cases) - len(ok)

    FIXTURES.mkdir(parents=True, exist_ok=True)
    fields = ["year", "dayOfYear", "hour", "minute", "gmtOffset", "averagingMinutes", "latitude",
              "longitude", "solar", "pressure", "airTemperature", "relativeHumidity", "windSpeed",
              "windHeight", "deltaT", "urban"]
    outputs = ["status", "wind2m", "globe", "naturalWetBulb", "psychrometricWetBulb", "wbgt"]
    reference = {
        "source": SOURCE_URL,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "seed": SEED,
        "note": "Outputs from the double-precision build of the original C code.",
        "maxFloatVsDoubleWbgt": round(float_diff, 6),
        "nonConverged": failures,
        "inputs": fields,
        "outputs": outputs,
        "cases": [case + [round(v, 10) for v in out] for case, out in zip(cases, doubles)],
    }
    (FIXTURES / "liljegren-reference.json").write_text(json.dumps(reference, separators=(",", ":")))

    sun = {
        "source": f"pvlib {pvlib.__version__}, NREL SPA (method='nrel_numpy')",
        "fields": ["utcMs", "latitude", "longitude", "elevation", "azimuth"],
        "rows": sun_cases(rng),
    }
    (FIXTURES / "sun-spa.json").write_text(json.dumps(sun, separators=(",", ":")))

    print(f"cases: {len(cases)}, non-converged in C: {failures}, "
          f"max |WBGT float - double|: {float_diff:.4f} °C")


if __name__ == "__main__":
    main()
