"""
jv_analysis_core.py
Analysis engine (algorithms unchanged from jv_analysis.py).
"""

import os
import re as _re
import numpy as np
import pandas as pd
from scipy.interpolate import interp1d, CubicSpline
from scipy.optimize import brentq

V_CANDIDATES = [
    "voltage", "v", "volt", "potential", "e",
    "ewe", "ew", "evs", "we1potential",
    "we1potential", "potentialapplied",
    "vf", "vm",
    "volts", "smuvoltage", "smuv",
    "vr", "vapplied",
    "pot", "evolt", "voltage_v", "v_v",
]
I_CANDIDATES = [
    "current", "i", "curr", "ampere", "amp",
    "ima", "ia", "we1current",
    "we1current", "currentapplied",
    "if", "im", "ir",
    "amps", "smucurrent", "smui",
    "current_a", "i_a", "iapplied",
    "cur", "current_ma", "i_ma",
]

PARAM_KEYS = [
    "Voc (V)", "Isc (mA)", "Jsc (mA/cm2)",
    "Vmp (V)", "Imp (mA)", "Jmp (mA/cm2)",
    "Pmax (mW)", "FF (%)", "PCE (%)",
    "Rs (Ohm)", "Rsh (Ohm)",
    "FF0 (%)", "dFF (%)",
]


def _alnum(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())


_V_NORM = [_alnum(c) for c in V_CANDIDATES]
_I_NORM = [_alnum(c) for c in I_CANDIDATES]
_ALL_KW_NORM = _V_NORM + _I_NORM


def find_column(df, candidates):
    """Case-insensitive, punctuation-tolerant column name search (3-pass)."""
    norm = {c: _alnum(c) for c in df.columns}
    cands_norm = [_alnum(c) for c in candidates]
    for cand, cand_norm in zip(candidates, cands_norm):
        for col, col_norm in norm.items():
            if col_norm == cand_norm:
                return col
        if len(cand_norm) > 2:
            for col, col_norm in norm.items():
                if col_norm.startswith(cand_norm):
                    return col
        if len(cand_norm) > 2:
            for col, col_norm in norm.items():
                if cand_norm in col_norm:
                    return col
    return None


def _detect_header_row_in_lines(lines, max_scan=20):
    for line_idx, line in enumerate(lines[:max_scan]):
        tokens = _re.split(r"[\t,;|\s]+", line.strip().lower())
        normed_tokens = [_alnum(t) for t in tokens]
        for tok in normed_tokens:
            if not tok:
                continue
            for kw in _ALL_KW_NORM:
                if len(kw) <= 2:
                    if tok == kw:
                        return line_idx
                else:
                    if tok == kw or tok.startswith(kw):
                        return line_idx
    return 0


def load_file(file_path):
    """Load a .txt/.csv/.xlsx/.xls file into a DataFrame, auto-detecting the header row."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext in (".xlsx", ".xls"):
        raw = pd.read_excel(file_path, header=None, dtype=str)
        lines = ["\t".join(str(v) for v in row) for row in raw.values]
        hdr = _detect_header_row_in_lines(lines)
        return pd.read_excel(file_path, header=hdr)

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
            raw_lines = fh.readlines()
    except Exception:
        raw_lines = []

    hdr = _detect_header_row_in_lines(raw_lines)

    for sep in ["\t", ",", ";", r"\s+"]:
        try:
            df = pd.read_csv(
                file_path, sep=sep, engine="python",
                header=hdr, skip_blank_lines=True,
                on_bad_lines="skip",
            )
            df = df.dropna(how="all").reset_index(drop=True)
            if df.shape[1] >= 2:
                return df
        except Exception:
            continue

    raise ValueError(
        f"Could not parse '{file_path}' as a delimited table.\n"
        "Check the delimiter / format."
    )


def calculate_parameters(scan_df, label, active_area, irradiance,
                         scan_min, scan_max, min_points, logs,
                         full_precision=False, advanced_params=True):
    """Compute JV solar-cell parameters for a single scan direction (CubicSpline + brentq)."""
    PIN = active_area * irradiance  # mW

    V = scan_df["V"].to_numpy(dtype=float)
    I = scan_df["I"].to_numpy(dtype=float)

    mask = (V >= scan_min) & (V <= scan_max)
    V, I = V[mask], I[mask]

    if len(V) < min_points:
        logs.append(("warn",
            f"Only {len(V)} point(s) in [{scan_min}, {scan_max}] V "
            f"for '{label}' (need >= {min_points}). Skipped."))
        return None

    order = np.argsort(V)
    Vs, Is = V[order], I[order]

    _, unique_idx = np.unique(Vs, return_index=True)
    Vs_u, Is_u = Vs[unique_idx], Is[unique_idx]

    cs = CubicSpline(Vs_u, Is_u)

    if Vs_u[0] <= 0 <= Vs_u[-1]:
        Isc = float(cs(0.0))
    else:
        Isc = float(interp1d(Vs_u, Is_u, fill_value="extrapolate",
                             assume_sorted=True)(0.0))
        logs.append(("info",
            f"'{label}': Isc extrapolated (V=0 outside measured range)."))

    Jsc = (Isc / active_area) * 1000

    sign_changes = np.where(np.diff(np.sign(Is_u)))[0]
    if len(sign_changes) > 0:
        idx0 = sign_changes[-1]
        Voc = brentq(cs, Vs_u[idx0], Vs_u[idx0 + 1])
    elif np.any(Is_u == 0.0):
        Voc = float(Vs_u[Is_u == 0.0][-1])
    else:
        Voc = float(interp1d(Is_u, Vs_u, fill_value="extrapolate",
                             assume_sorted=False)(0.0))
        logs.append(("info",
            f"'{label}': Voc extrapolated (no I=0 crossing in data)."))

    if Voc <= 0:
        logs.append(("warn",
            f"'{label}': Voc <= 0 ({Voc:.6f} V) — results unreliable."))

    pv_lo = max(Vs_u[0], 0.0)
    pv_hi = min(Vs_u[-1], Voc)

    if pv_hi <= pv_lo:
        logs.append(("info",
            f"'{label}': PV quadrant empty; using full window for MPP."))
        pv_lo, pv_hi = Vs_u[0], Vs_u[-1]

    cs_deriv = cs.derivative()

    def dPdV(v):
        return -(cs(v) + v * cs_deriv(v))

    n_pts = max(int((pv_hi - pv_lo) / 0.001) + 1, 2)
    V_fine = np.linspace(pv_lo, pv_hi, n_pts)
    P_fine = -V_fine * cs(V_fine)
    Vmp_coarse = V_fine[int(np.argmax(P_fine))]

    delta = 0.02
    lo_br = max(pv_lo + 1e-9, Vmp_coarse - delta)
    hi_br = min(pv_hi - 1e-9, Vmp_coarse + delta)

    try:
        Vmp = brentq(dPdV, lo_br, hi_br, xtol=1e-9) \
            if dPdV(lo_br) * dPdV(hi_br) < 0 else Vmp_coarse
    except Exception:
        Vmp = Vmp_coarse

    Imp = float(cs(Vmp))
    Jmp = (Imp / active_area) * 1000
    Pmax = -Vmp * Imp

    if Voc > 0 and Isc != 0:
        FF = Pmax / (Voc * abs(Isc))
    else:
        FF = float("nan")
        logs.append(("warn",
            f"'{label}': Voc or Isc is zero — FF/PCE unreliable."))

    PCE = (Pmax * 1000) / PIN * 100

    def _v(x):
        return float(x) if full_precision else round(float(x), 6)

    if advanced_params:
        try:
            dIdV_voc = float(cs_deriv(Voc))
            Rs = abs(-1.0 / dIdV_voc) if abs(dIdV_voc) > 1e-10 else float("nan")
        except Exception:
            Rs = float("nan")

        try:
            v_eval = 0.0 if (Vs_u[0] <= 0.0 <= Vs_u[-1]) else Vs_u[0]
            dIdV_0 = float(cs_deriv(v_eval))
            Rsh = abs(-1.0 / dIdV_0) if abs(dIdV_0) > 1e-10 else float("nan")
        except Exception:
            Rsh = float("nan")

        try:
            Vt = 0.02585
            v_oc = Voc / Vt
            if v_oc > 2.0:
                FF0 = (v_oc - np.log(v_oc + 0.72)) / (v_oc + 1.0)
                dFF = FF0 - FF
            else:
                FF0 = float("nan")
                dFF = float("nan")
        except Exception:
            FF0 = float("nan")
            dFF = float("nan")
    else:
        Rs = Rsh = FF0 = dFF = float("nan")

    return {
        "Voc (V)": _v(Voc),
        "Isc (mA)": _v(abs(Isc) * 1000),
        "Jsc (mA/cm2)": _v(abs(Jsc)),
        "Vmp (V)": _v(Vmp),
        "Imp (mA)": _v(abs(Imp) * 1000),
        "Jmp (mA/cm2)": _v(abs(Jmp)),
        "Pmax (mW)": _v(Pmax * 1000),
        "FF (%)": _v(FF * 100),
        "PCE (%)": _v(PCE),
        "Rs (Ohm)": _v(Rs),
        "Rsh (Ohm)": _v(Rsh),
        "FF0 (%)": _v(FF0 * 100),
        "dFF (%)": _v(dFF * 100),
    }


def run_analysis(
    file_path: str,
    active_area: float,
    irradiance: float,
    scan_min: float,
    scan_max: float,
    min_points: int,
    invert_current: bool,
    voltage_column: str = "",
    current_column: str = "",
    full_precision: bool = False,
    advanced_params: bool = True,
    _df_raw=None,
) -> dict:
    """Run the full JV analysis pipeline for one V/I pair. Returns a results dict."""
    logs = []

    if _df_raw is None:
        _df_raw = load_file(file_path)
        logs.append(("info",
            f"Loaded file: {os.path.basename(file_path)}  "
            f"({_df_raw.shape[0]} rows, {_df_raw.shape[1]} columns)"))
    else:
        logs.append(("info",
            f"Analysing: {os.path.basename(file_path)}  "
            f"({_df_raw.shape[0]} rows, {_df_raw.shape[1]} columns)"))

    v_col = voltage_column.strip() if voltage_column.strip() else find_column(_df_raw, V_CANDIDATES)
    i_col = current_column.strip() if current_column.strip() else find_column(_df_raw, I_CANDIDATES)

    if v_col is None or v_col not in _df_raw.columns:
        raise ValueError(
            f"Could not find Voltage column.\n"
            f"Available: {list(_df_raw.columns)}"
        )
    if i_col is None or i_col not in _df_raw.columns:
        raise ValueError(
            f"Could not find Current column.\n"
            f"Available: {list(_df_raw.columns)}"
        )

    logs.append(("info", f"Voltage column : '{v_col}'"))
    logs.append(("info", f"Current column : '{i_col}'"))

    df = _df_raw[[v_col, i_col]].copy()
    df.columns = ["V", "I"]
    df = df.dropna().reset_index(drop=True)

    if invert_current:
        df["I"] = -df["I"]
        logs.append(("info", "Current sign inverted (INVERT_CURRENT = True)."))

    logs.append(("info", f"Loaded {len(df)} valid data points."))

    V_full = df["V"].to_numpy()
    n = len(V_full)

    turning_candidates = []
    if n >= 4:
        dv = np.diff(V_full)
        signs = np.sign(dv)

        i = 1
        while i < len(signs):
            if signs[i] != 0 and signs[i - 1] != 0 and signs[i] != signs[i - 1]:
                new_sign = signs[i]
                run_len = 1
                j = i + 1
                while j < len(signs) and (signs[j] == new_sign or signs[j] == 0):
                    run_len += 1
                    j += 1
                if run_len >= max(2, min_points - 1):
                    turning_candidates.append(i)
                    break
            i += 1

        if not turning_candidates:
            idx_max = int(np.argmax(V_full))
            idx_min = int(np.argmin(V_full))
            turning_candidates = [i for i in (idx_max, idx_min) if 0 < i < n - 1]

    reverse_results = forward_results = single_results = None

    cfg = dict(active_area=active_area, irradiance=irradiance,
               scan_min=scan_min, scan_max=scan_max,
               min_points=min_points, logs=logs,
               full_precision=full_precision,
               advanced_params=advanced_params)

    if not turning_candidates:
        logs.append(("info", "Only one scan direction detected."))
        single_results = calculate_parameters(df, "single scan", **cfg)
    else:
        split = min(turning_candidates) + 1
        scan1 = df.iloc[:split].reset_index(drop=True)
        scan2 = df.iloc[split:].reset_index(drop=True)

        if scan1["V"].iloc[0] > scan1["V"].iloc[-1]:
            reverse_scan, forward_scan = scan1, scan2
            logs.append(("info", "Scan 1 → Reverse (high V to low V)"))
            logs.append(("info", "Scan 2 → Forward  (low V to high V)"))
        else:
            forward_scan, reverse_scan = scan1, scan2
            logs.append(("info", "Scan 1 → Forward  (low V to high V)"))
            logs.append(("info", "Scan 2 → Reverse  (high V to low V)"))

        reverse_results = calculate_parameters(reverse_scan, "reverse scan", **cfg)
        forward_results = calculate_parameters(forward_scan, "forward scan", **cfg)

    hi = hi_label = None
    if reverse_results and forward_results:
        pce_r = reverse_results["PCE (%)"]
        pce_f = forward_results["PCE (%)"]
        if pce_r != 0:
            hi = (pce_r - pce_f) / pce_r
            if hi > 0.05:
                hi_label = "reverse-dominant (typical perovskite)"
            elif hi < -0.05:
                hi_label = "forward-dominant"
            else:
                hi_label = "negligible hysteresis"
            logs.append(("info",
                f"Hysteresis Index (HI) = {hi:.4f}  ({hi_label})"))

    col_dict = {"Parameter": PARAM_KEYS}
    if reverse_results:
        col_dict["Reverse Scan"] = [reverse_results[k] for k in PARAM_KEYS]
    if forward_results:
        col_dict["Forward Scan"] = [forward_results[k] for k in PARAM_KEYS]
    if single_results:
        col_dict["Scan"] = [single_results[k] for k in PARAM_KEYS]

    return {
        "is_multi": False,
        "reverse": reverse_results,
        "forward": forward_results,
        "single": single_results,
        "hi": hi,
        "hi_label": hi_label,
        "logs": logs,
        "results_df": pd.DataFrame(col_dict),
        "columns_detected": (v_col, i_col),
    }


def _extract_pairs_helpers(df):
    all_cols = list(df.columns)
    col_norm = {c: _alnum(c) for c in all_cols}

    def _is(col, norms):
        cn = col_norm[col]
        for nc in norms:
            if cn == nc or cn.startswith(nc):
                return True
            if len(nc) >= 3 and nc in cn:
                return True
        return False

    return all_cols, (lambda c: _is(c, _V_NORM)), (lambda c: _is(c, _I_NORM))


def find_all_column_pairs(df) -> list:
    """
    Detect all (v_col, i_col, label) pairs.
      1. Interleaved  V I V I ...
      2. Grouped      V V V ... I I I ...
      3. Shared V     V I1 I2 I3 ...
    Returns [] if fewer than two pairs are found.
    """
    all_cols, _is_v, _is_i = _extract_pairs_helpers(df)

    pairs = []
    pending_v = None
    for col in all_cols:
        iv = _is_v(col)
        ii = _is_i(col) and not iv
        if iv:
            pending_v = col
        elif ii and pending_v is not None:
            pairs.append((pending_v, col, f"Pixel {len(pairs) + 1}"))
            pending_v = None

    if len(pairs) >= 2:
        return pairs

    v_cols = [c for c in all_cols if _is_v(c)]
    i_cols = [c for c in all_cols if _is_i(c) and not _is_v(c)]

    if len(v_cols) >= 2 and len(i_cols) >= 2:
        pairs = [(v, ic, f"Pixel {n}") for n, (v, ic) in enumerate(zip(v_cols, i_cols), 1)]
        if len(pairs) >= 2:
            return pairs

    if len(v_cols) == 1 and len(i_cols) >= 2:
        return [(v_cols[0], ic, f"Pixel {n}") for n, ic in enumerate(i_cols, 1)]

    return []


def run_multi_analysis(
    file_path: str,
    active_area: float,
    irradiance: float,
    scan_min: float,
    scan_max: float,
    min_points: int,
    invert_current: bool,
    full_precision: bool = False,
    advanced_params: bool = True,
) -> dict:
    """Analyse every V/I pair in the file; falls back to run_analysis for single-device files."""
    logs = []
    df_raw = load_file(file_path)
    logs.append(("info",
        f"Loaded: {os.path.basename(file_path)}  "
        f"({df_raw.shape[0]} rows × {df_raw.shape[1]} columns)"))

    pairs = find_all_column_pairs(df_raw)

    if not pairs:
        return run_analysis(
            file_path, active_area, irradiance,
            scan_min, scan_max, min_points,
            invert_current, "", "",
            full_precision=full_precision,
            advanced_params=advanced_params,
            _df_raw=df_raw)

    logs.append(("info",
        f"Multi-device mode — {len(pairs)} devices detected: "
        + ", ".join(lbl for _, _, lbl in pairs)))

    devices = []
    for v_col, i_col, label in pairs:
        logs.append(("info", f"Analysing {label}  (V: {v_col}  |  I: {i_col})"))
        try:
            result = run_analysis(
                file_path, active_area, irradiance,
                scan_min, scan_max, min_points,
                invert_current, v_col, i_col,
                full_precision=full_precision,
                advanced_params=advanced_params,
                _df_raw=df_raw)
            result["label"] = label
            for lvl, msg in result.get("logs", []):
                if lvl == "warn":
                    logs.append(("warn", f"[{label}] {msg}"))
            devices.append(result)
        except Exception as exc:
            logs.append(("warn", f"{label}: skipped — {exc}"))

    if not devices:
        raise ValueError("All devices failed analysis. Check your data file.")

    nan_col = [float("nan")] * len(PARAM_KEYS)

    def _col(d):
        if d is None:
            return nan_col[:]
        return [d.get(k, float("nan")) if full_precision
                else round(d.get(k, float("nan")), 4) for k in PARAM_KEYS]

    col_dict = {"Parameter": PARAM_KEYS}
    for dev in devices:
        lbl = dev["label"]
        if dev.get("reverse") or dev.get("forward"):
            col_dict[f"{lbl} (Rev)"] = _col(dev.get("reverse"))
            col_dict[f"{lbl} (Fwd)"] = _col(dev.get("forward"))
        elif dev.get("single"):
            col_dict[lbl] = _col(dev["single"])
        else:
            col_dict[f"{lbl} (Rev)"] = nan_col[:]
            col_dict[f"{lbl} (Fwd)"] = nan_col[:]

    return {
        "is_multi": True,
        "devices": devices,
        "combined_df": pd.DataFrame(col_dict),
        "logs": logs,
        "n_devices": len(devices),
    }
