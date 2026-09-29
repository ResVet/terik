"""
Reference values for the statistics module, from pyMannKendall, lmoments3
and scipy. Run from the repository root:

    python3 validation/generate_stats.py
"""

from __future__ import annotations

import json
from pathlib import Path

import lmoments3
import numpy as np
import pymannkendall as mk
from lmoments3 import distr
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "lib" / "stats" / "__fixtures__"


def series(rng: np.random.Generator) -> list[dict]:
    """Annual-looking series: trend, AR(1) noise, and integer counts with ties."""
    out = []
    for n, trend, phi, kind in [
        (30, 0.00, 0.0, "float"), (30, 0.05, 0.0, "float"), (65, 0.03, 0.5, "float"),
        (65, -0.02, 0.3, "float"), (64, 0.4, 0.2, "count"), (40, 0.0, 0.7, "float"),
        (65, 0.8, 0.0, "count"), (12, 0.1, 0.0, "float"),
    ]:
        e = np.zeros(n)
        for i in range(n):
            e[i] = (phi * e[i - 1] if i else 0) + rng.normal()
        x = trend * np.arange(n) + e
        if kind == "count":
            x = np.maximum(0, np.round(10 + x * 3))
        x = np.round(x, 6)
        r = mk.hamed_rao_modification_test(x)
        o = mk.original_test(x)
        out.append({
            "x": x.tolist(),
            "s": float(r.s), "varS": float(r.var_s), "z": float(r.z), "p": float(r.p), "tau": float(r.Tau),
            "slope": float(r.slope), "intercept": float(r.intercept),
            "originalVarS": float(o.var_s),
        })
    return out


def gev_cases(rng: np.random.Generator) -> list[dict]:
    out = []
    for n, c, loc, scale in [(30, 0.2, 31.0, 0.6), (35, 0.05, 30.2, 0.8), (65, -0.1, 29.0, 1.0),
                             (30, 0.35, 32.0, 0.4), (50, 0.0, 30.0, 0.7)]:
        x = np.round(stats.genextreme.rvs(c, loc=loc, scale=scale, size=n, random_state=rng), 4)
        ratios = lmoments3.lmom_ratios(x, nmom=3)
        fit = distr.gev.lmom_fit(x)
        periods = [2, 5, 10, 20, 50, 100]
        levels = [float(stats.genextreme.ppf(1 - 1 / t, fit["c"], loc=fit["loc"], scale=fit["scale"])) for t in periods]
        probe = float(np.quantile(x, 0.9))
        cdf = float(stats.genextreme.cdf(probe, fit["c"], loc=fit["loc"], scale=fit["scale"]))
        out.append({
            "x": x.tolist(),
            "l1": float(ratios[0]), "l2": float(ratios[1]), "t3": float(ratios[2]),
            "shape": float(fit["c"]), "location": float(fit["loc"]), "scale": float(fit["scale"]),
            "periods": periods, "levels": levels, "probe": probe, "cdf": cdf,
        })
    return out


def normal_cases() -> dict:
    xs = [-6, -3.5, -2, -1.2, -0.3, 0, 0.4, 1, 1.96, 2.7, 4, 6]
    ps = [1e-6, 0.001, 0.025, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975, 0.999, 1 - 1e-6]
    return {
        "x": xs, "cdf": [float(stats.norm.cdf(v)) for v in xs],
        "p": ps, "ppf": [float(stats.norm.ppf(v)) for v in ps],
    }


def main() -> None:
    rng = np.random.default_rng(7)
    OUT.mkdir(parents=True, exist_ok=True)
    fixtures = {
        "source": f"pymannkendall {mk.__version__}, lmoments3, scipy {__import__('scipy').__version__}",
        "trend": series(rng),
        "gev": gev_cases(rng),
        "normal": normal_cases(),
        "quantile": {"x": [3, 1, 4, 1, 5, 9, 2, 6, 5, 3], "p": [0, 0.1, 0.25, 0.5, 0.9, 1],
                     "q": [float(np.quantile([3, 1, 4, 1, 5, 9, 2, 6, 5, 3], p)) for p in [0, 0.1, 0.25, 0.5, 0.9, 1]]},
    }
    (OUT / "reference.json").write_text(json.dumps(fixtures, indent=None, separators=(",", ":")))
    print("wrote", OUT / "reference.json")


if __name__ == "__main__":
    main()
