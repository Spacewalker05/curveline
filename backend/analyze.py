"""Glue between the UI payload and jv_analysis_core. No web framework needed."""

import base64
import io
import math
import os
import re
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from .jv_analysis_core import run_multi_analysis

KEYMAP = {
    "PCE (%)": "pce", "Voc (V)": "voc", "Jsc (mA/cm2)": "jsc", "FF (%)": "ff",
    "Pmax (mW)": "pmax", "Vmp (V)": "vmpp", "Jmp (mA/cm2)": "jmpp",
    "Rs (Ohm)": "rs", "Rsh (Ohm)": "rsh", "FF0 (%)": "ff0", "dFF (%)": "dff",
}


def _num(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _metrics(d):
    return None if not d else {ui: _num(d.get(core)) for core, ui in KEYMAP.items()}


def _pixel(dev, pid, label):
    px = {"id": pid, "label": label, "hysteresis_index": _num(dev.get("hi"))}
    if dev.get("reverse") or dev.get("forward"):
        px["reverse"], px["forward"] = _metrics(dev.get("reverse")), _metrics(dev.get("forward"))
    else:  # single-direction scan is shown as "reverse"
        px["reverse"] = _metrics(dev.get("single"))
    return px


def _data_url(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def analyze(files: list, params: dict) -> dict:
    """files: [{'name': str, 'data': base64 str}] -> JSON-serialisable response for src/api.ts."""
    log, out_files, long_rows, sheets = [], [], [], {}

    for f in files:
        name = f["name"]
        stem = Path(name).stem
        with tempfile.NamedTemporaryFile(suffix=Path(name).suffix or ".csv", delete=False) as tmp:
            tmp.write(base64.b64decode(f["data"]))
            path = tmp.name
        try:
            res = run_multi_analysis(
                path, float(params["area_cm2"]), float(params["irradiance_mw_cm2"]),
                float(params["v_min"]), float(params["v_max"]), int(params["min_points"]),
                bool(params["invert_current"]), full_precision=False,
                advanced_params=bool(params.get("advanced", True)),
            )
        except Exception as exc:
            log.append({"level": "error", "message": f"{name}: {exc}"})
            continue
        finally:
            os.unlink(path)

        for lvl, msg in res["logs"]:
            log.append({"level": lvl, "message": f"{name}: {msg}"})

        if res["is_multi"]:
            pixels = [_pixel(d, f"{stem}-{d['label']}", d["label"]) for d in res["devices"]]
            sheets[stem[:31]] = res["combined_df"]
        else:
            pixels = [_pixel(res, stem, stem)]
            sheets[stem[:31]] = res["results_df"]
        out_files.append({"name": name, "pixels": pixels})

        for px in pixels:
            for direction in ("reverse", "forward"):
                if px.get(direction):
                    long_rows.append({"File": name, "Pixel": px["label"], "Scan": direction, **px[direction]})

    if not out_files:
        raise ValueError("; ".join(l["message"] for l in log) or "No files could be analysed")

    pick = lambda px: px.get("reverse") or px.get("forward") or {}
    summary, statistics = {}, []
    for ui in KEYMAP.values():
        vals = [v for f in out_files for px in f["pixels"] if (v := pick(px).get(ui)) is not None]
        if vals:
            a = np.array(vals)
            sd = float(a.std(ddof=1)) if len(a) > 1 else 0.0
            summary[ui] = {"mean": float(a.mean()), "std": sd}
            statistics.append({"key": ui, "mean": float(a.mean()), "std": sd, "min": float(a.min()), "max": float(a.max())})

    long_df = pd.DataFrame(long_rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        long_df.to_excel(xw, sheet_name="All pixels", index=False)
        for sname, df in sheets.items():
            df.to_excel(xw, sheet_name=re.sub(r"[\[\]:*?/\\]", "_", sname) or "Sheet", index=False)

    return {
        "files": out_files,
        "summary": summary,
        "statistics": statistics,
        "log": log,
        "exports": {
            "xlsx": _data_url(buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "csv": _data_url(long_df.to_csv(index=False).encode(), "text/csv"),
        },
    }
