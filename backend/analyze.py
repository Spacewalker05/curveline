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

from .jv_analysis_core import (
    I_CANDIDATES, V_CANDIDATES, find_all_column_pairs, find_column, load_file, run_multi_analysis,
)

KEYMAP = {
    "PCE (%)": "pce", "Voc (V)": "voc", "Isc (mA)": "isc", "Imp (mA)": "imp", "Jsc (mA/cm2)": "jsc", "FF (%)": "ff",
    "Pmax (mW)": "pmax", "Vmp (V)": "vmpp", "Jmp (mA/cm2)": "jmpp",
    "Rs (Ohm)": "rs", "Rsh (Ohm)": "rsh", "FF0 (%)": "ff0", "dFF (%)": "dff",
}


EXPORT_ORDER = ["Voc (V)", "Isc (mA)", "Jsc (mA/cm2)", "FF (%)", "PCE (%)", "Vmp (V)", "Imp (mA)", "Pmax (mW)", "Rs (Ohm)", "Rsh (Ohm)", "FF0 (%)", "dFF (%)"]
ADVANCED = {"Rs (Ohm)", "Rsh (Ohm)", "FF0 (%)", "dFF (%)"}


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
    log, out_files, long_rows = [], [], []

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
        else:
            pixels = [_pixel(res, stem, stem)]
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
    ui_of = {core: ui for core, ui in KEYMAP.items()}
    order = [k for k in EXPORT_ORDER if bool(params.get("advanced", True)) or k not in ADVANCED]

    def val(px, direction, core):
        d = px.get(direction)
        return None if not d else d.get(ui_of[core])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        if len(out_files) == 1:
            # One device file: Pixel | <param> Forward | <param> Reverse | ...
            pixels = out_files[0]["pixels"]
            table = {"Pixel": [px["label"] for px in pixels]}
            for core in order:
                if any(px.get("forward") for px in pixels):
                    table[f"{core}  Forward"] = [val(px, "forward", core) for px in pixels]
                    table[f"{core}  Reverse"] = [val(px, "reverse", core) for px in pixels]
                else:
                    table[core] = [val(px, "reverse", core) for px in pixels]
            pd.DataFrame(table).to_excel(xw, sheet_name="JV Parameters", index=False)
        else:
            # Several sample files: one sheet per parameter, columns S(fwd) / S(rev), rows = pixels
            for core in order:
                cols, n = {core: None}, max(len(f["pixels"]) for f in out_files)
                cols = {core: [None] * n}
                for f in out_files:
                    stem = Path(f["name"]).stem
                    pxs = f["pixels"]
                    pad = lambda v: v + [None] * (n - len(v))
                    if any(px.get("forward") for px in pxs):
                        cols[f"{stem}(fwd)"] = pad([val(px, "forward", core) for px in pxs])
                        cols[f"{stem}(rev)"] = pad([val(px, "reverse", core) for px in pxs])
                    else:
                        cols[stem] = pad([val(px, "reverse", core) for px in pxs])
                name_ = re.sub(r"[\[\]:*?/\\]", "_", core)[:31]
                pd.DataFrame(cols).to_excel(xw, sheet_name=name_, index=False)

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


# ── Inspect: raw forward / reverse sweeps for line plots ─────────────────────

def _split_sweeps(df, min_points):
    """Same turning-point rule as jv_analysis_core.run_analysis."""
    V = df["V"].to_numpy()
    n = len(V)
    turning = []
    if n >= 4:
        signs = np.sign(np.diff(V))
        i = 1
        while i < len(signs):
            if signs[i] != 0 and signs[i - 1] != 0 and signs[i] != signs[i - 1]:
                run, j = 1, i + 1
                while j < len(signs) and (signs[j] == signs[i] or signs[j] == 0):
                    run += 1
                    j += 1
                if run >= max(2, min_points - 1):
                    turning.append(i)
                    break
            i += 1
        if not turning:
            turning = [k for k in (int(np.argmax(V)), int(np.argmin(V))) if 0 < k < n - 1]

    pack = lambda d: {"V": [float(x) for x in d["V"]], "I": [float(x) for x in d["I"]]}
    if not turning:
        return {"single": pack(df)}
    split = min(turning) + 1
    s1, s2 = df.iloc[:split], df.iloc[split:]
    if s1["V"].iloc[0] > s1["V"].iloc[-1]:
        return {"reverse": pack(s1), "forward": pack(s2)}
    return {"forward": pack(s1), "reverse": pack(s2)}


def inspect(files: list, params: dict) -> dict:
    """files: [{'name', 'data'}] -> {'files': [{'name', 'pixels': [{'label', 'forward'|'reverse'|'single': {'V','I'}}]}]}"""
    min_points = int((params or {}).get("min_points", 10))
    out = []
    for f in files:
        name = f["name"]
        with tempfile.NamedTemporaryFile(suffix=Path(name).suffix or ".csv", delete=False) as tmp:
            tmp.write(base64.b64decode(f["data"]))
            path = tmp.name
        try:
            raw = load_file(path)
            pairs = find_all_column_pairs(raw)
            if not pairs:
                v, i = find_column(raw, V_CANDIDATES), find_column(raw, I_CANDIDATES)
                if v is None or i is None:
                    raise ValueError("No voltage / current columns found in this file.")
                pairs = [(v, i, "")]
            pixels = []
            for v, i, label in pairs:
                df = raw[[v, i]].apply(pd.to_numeric, errors="coerce").dropna().reset_index(drop=True)
                df.columns = ["V", "I"]
                pixels.append({"label": label, **_split_sweeps(df, min_points)})
            out.append({"name": name, "pixels": pixels})
        except Exception as exc:
            out.append({"name": name, "pixels": [], "error": str(exc)})
        finally:
            os.unlink(path)
    return {"files": out}
