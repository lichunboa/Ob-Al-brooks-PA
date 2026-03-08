#!/usr/bin/env python3
"""Build structured Al Brooks context for patrol runtime."""

from __future__ import annotations

import argparse
import importlib.util
import json
import types
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent.parent
INDICATORS_DIR = ROOT / "indicators" / "batch"
AB_EMA_PATH = INDICATORS_DIR / "ab_ema.py"
AB_SR_PATH = INDICATORS_DIR / "ab_sr.py"
AB_MM_PATH = INDICATORS_DIR / "ab_mm.py"
AB_PATTERNS_PATH = INDICATORS_DIR / "ab_patterns.py"
PATROL_SCAN_PATH = ROOT / "tools" / "patrol_scan.py"

PRIMARY_TIMEFRAMES = ("5m", "15m", "1h")
CONTEXT_TIMEFRAMES = ("30m", "4h", "1d")
ALL_TIMEFRAMES = PRIMARY_TIMEFRAMES + CONTEXT_TIMEFRAMES


def _http_get_json(base_url: str, path: str, query: dict[str, Any] | None = None) -> Any:
    url = f"{base_url}{path}"
    if query:
        from urllib.parse import urlencode

        url = f"{url}?{urlencode(query)}"
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as exc:
        return {"_error": str(exc), "_url": url}


def _load_ab_module(path: Path, name: str):
    module = types.ModuleType(name)
    module.__dict__["np"] = np
    module.__dict__["pd"] = pd
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    core: list[str] = []
    skip = False
    for line in lines:
        if "from ..base" in line or line.startswith("import pandas"):
            continue
        if line.startswith("@register"):
            skip = True
            continue
        if skip and not line.startswith((" ", "\t")) and line.strip() and not line.startswith("class "):
            skip = False
        if skip:
            continue
        core.append(line)
    exec(compile("".join(core), name, "exec"), module.__dict__)
    return module


def _load_python_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


AB_EMA = _load_ab_module(AB_EMA_PATH, "ab_ema")
AB_SR = _load_ab_module(AB_SR_PATH, "ab_sr")
AB_MM = _load_ab_module(AB_MM_PATH, "ab_mm")
AB_PATTERNS = _load_ab_module(AB_PATTERNS_PATH, "ab_patterns")
PATROL_SCAN = _load_python_module(PATROL_SCAN_PATH, "patrol_scan")


def _truncate_levels(levels: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
    trimmed: list[dict[str, Any]] = []
    for item in levels[:limit]:
        trimmed.append(
            {
                "price": item.get("price"),
                "type": item.get("type"),
                "side": item.get("side"),
                "bars_ago": item.get("bars_ago"),
                "strength": item.get("strength"),
            }
        )
    return trimmed


def _truncate_targets(targets: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
    trimmed: list[dict[str, Any]] = []
    for item in targets[:limit]:
        trimmed.append(
            {
                "price": item.get("price"),
                "type": item.get("type"),
                "direction": item.get("direction"),
                "bars_ago": item.get("bars_ago"),
            }
        )
    return trimmed


def _truncate_wedges(wedges: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    trimmed: list[dict[str, Any]] = []
    for item in wedges[:limit]:
        trimmed.append(
            {
                "type": item.get("type"),
                "direction": item.get("direction"),
                "bars_ago": item.get("bars_ago"),
                "is_mtr": item.get("is_mtr"),
                "momentum_decreasing": item.get("momentum_decreasing"),
            }
        )
    return trimmed


def _last_bar_features(bars: list[dict[str, Any]], atr14: float) -> dict[str, Any]:
    if not bars:
        return {}
    last = bars[-1]
    last_range = float(last.get("H", 0.0)) - float(last.get("L", 0.0))
    return {
        "close": last.get("C"),
        "range": round(last_range, 4),
        "range_atr_multiple": round(last_range / atr14, 3) if atr14 else None,
        "body": last.get("body"),
        "bar_type": last.get("bar_type"),
    }


def _frame_events(
    signal: str,
    state: str,
    frame_ctx: dict[str, Any],
) -> list[str]:
    events: list[str] = []
    ab_ema = frame_ctx.get("ab_ema") if isinstance(frame_ctx.get("ab_ema"), dict) else {}
    ab_sr = frame_ctx.get("ab_sr") if isinstance(frame_ctx.get("ab_sr"), dict) else {}
    ab_patterns = frame_ctx.get("ab_patterns") if isinstance(frame_ctx.get("ab_patterns"), dict) else {}
    last_bar = frame_ctx.get("last_bar") if isinstance(frame_ctx.get("last_bar"), dict) else {}

    if signal:
        events.append(f"signal_trigger:{signal}")
    if state:
        events.append(f"state:{state}")
    if ab_ema.get("price_vs_ema") == "touching":
        events.append("ema_touch")
    if ab_ema.get("first_pb_type") not in (None, "", "none"):
        events.append(f"first_pb:{ab_ema.get('first_pb_type')}")
    tr_position = ab_sr.get("tr_position")
    if tr_position in {"top", "bottom"}:
        events.append(f"tr_edge:{tr_position}")
    pb_depth = ((ab_patterns.get("pb_depth") or {}).get("depth")) if isinstance(ab_patterns.get("pb_depth"), dict) else None
    if pb_depth not in (None, "", "none"):
        events.append(f"pb_depth:{pb_depth}")
    if ab_patterns.get("latest_h") or ab_patterns.get("latest_l"):
        latest = ab_patterns.get("latest_h") or ab_patterns.get("latest_l")
        events.append(f"hl_signal:{latest}")
    if ab_patterns.get("wedge_count", 0) > 0:
        events.append("wedge_or_mtr")
    if frame_ctx.get("momentum_fading"):
        events.append("momentum_fading")
    range_atr = last_bar.get("range_atr_multiple")
    if range_atr and range_atr >= 1.5:
        events.append("anomaly:large_bar")
    return events


def _summarize_frame(timeframe: str, block: dict[str, Any]) -> dict[str, Any]:
    bars = block.get("bars") or []
    if not isinstance(bars, list) or len(bars) < 20:
        return {}

    browse_bars = bars[-80:] if len(bars) >= 80 else bars
    signal_bars = bars[-20:] if len(bars) >= 20 else bars

    open_arr = np.array([float(bar["O"]) for bar in bars], dtype=float)
    high_arr = np.array([float(bar["H"]) for bar in bars], dtype=float)
    low_arr = np.array([float(bar["L"]) for bar in bars], dtype=float)
    close_arr = np.array([float(bar["C"]) for bar in bars], dtype=float)

    ema_info = AB_EMA.analyze_ab_ema(high_arr, low_arr, close_arr)
    sr_info = AB_SR.analyze_ab_sr(open_arr, high_arr, low_arr, close_arr)
    mm_info = AB_MM.analyze_ab_mm(open_arr, high_arr, low_arr, close_arr)
    patterns_info = AB_PATTERNS.analyze_ab_patterns(open_arr, high_arr, low_arr, close_arr)

    ema20 = float(block.get("ema20") or ema_info.get("ema20") or close_arr[-1])
    atr14 = float(block.get("atr14") or 0.0)
    ai_direction, ai_strength = PATROL_SCAN.compute_ai(browse_bars, ema20, atr14)
    state = PATROL_SCAN.market_state(browse_bars, ai_direction)
    signal = PATROL_SCAN.detect_signals(signal_bars, ai_direction) if timeframe in PRIMARY_TIMEFRAMES else ""
    fading = PATROL_SCAN.momentum_fading(signal_bars)

    frame_ctx = {
        "summary": block.get("summary"),
        "price": bars[-1].get("C"),
        "ema20": block.get("ema20"),
        "atr14": block.get("atr14"),
        "price_vs_ema": block.get("price_vs_ema"),
        "ai": ai_direction,
        "ai_strength": ai_strength,
        "state": state,
        "signal": signal,
        "momentum_fading": fading,
        "last_bar": _last_bar_features(bars, atr14),
        "ab_ema": {
            "ema20": round(float(ema_info.get("ema20") or 0.0), 6),
            "ema_slope": ema_info.get("ema_slope"),
            "price_vs_ema": ema_info.get("price_vs_ema"),
            "bars_above_ema": ema_info.get("bars_above_ema"),
            "bars_below_ema": ema_info.get("bars_below_ema"),
            "mag_type": ema_info.get("mag_type"),
            "mag_count_recent": ema_info.get("mag_count_recent"),
            "bull_mag_count": ema_info.get("bull_mag_count"),
            "bear_mag_count": ema_info.get("bear_mag_count"),
            "first_pb_bars_ago": ema_info.get("first_pb_bars_ago"),
            "first_pb_type": ema_info.get("first_pb_type"),
            "ema_sr_valid": ema_info.get("ema_sr_valid"),
        },
        "ab_sr": {
            "nearest_support": sr_info.get("nearest_support"),
            "nearest_resistance": sr_info.get("nearest_resistance"),
            "tr_position": sr_info.get("tr_position"),
            "trend_phase": sr_info.get("trend_phase"),
            "gap_stats": sr_info.get("gap_stats"),
            "confluence_zones": (sr_info.get("confluence_zones") or [])[:4],
            "levels": _truncate_levels(sr_info.get("levels") or []),
        },
        "ab_mm": {
            "nearest_bull_target": mm_info.get("nearest_bull_target"),
            "nearest_bear_target": mm_info.get("nearest_bear_target"),
            "targets": _truncate_targets(mm_info.get("targets") or []),
        },
        "ab_patterns": {
            "latest_h": patterns_info.get("latest_h"),
            "latest_h_bars_ago": patterns_info.get("latest_h_bars_ago"),
            "latest_l": patterns_info.get("latest_l"),
            "latest_l_bars_ago": patterns_info.get("latest_l_bars_ago"),
            "dt_count": patterns_info.get("dt_count"),
            "db_count": patterns_info.get("db_count"),
            "inside_count": patterns_info.get("inside_count"),
            "wedge_count": patterns_info.get("wedge_count"),
            "wedges": _truncate_wedges(patterns_info.get("wedges") or []),
            "pressure": patterns_info.get("pressure"),
            "pb_depth": patterns_info.get("pb_depth"),
        },
    }
    frame_ctx["events"] = _frame_events(signal, state, frame_ctx)
    return frame_ctx


def build_symbol_context(symbol: str, base_url: str) -> dict[str, Any]:
    bundle = _http_get_json(base_url, f"/klines/{symbol}/multi")
    if not isinstance(bundle, dict):
        bundle = {}
    for interval in CONTEXT_TIMEFRAMES:
        block = _http_get_json(base_url, f"/klines/{symbol}", {"interval": interval, "limit": 150})
        if isinstance(block, dict) and not block.get("_error"):
            bundle[interval] = block

    frames: dict[str, Any] = {}
    tf_results_for_alignment: dict[str, dict[str, Any]] = {}
    quick_scan: dict[str, list[str]] = {}
    best_signal = ""

    for timeframe in ALL_TIMEFRAMES:
        block = bundle.get(timeframe)
        if not isinstance(block, dict) or block.get("_error"):
            continue
        frame_ctx = _summarize_frame(timeframe, block)
        if not frame_ctx:
            continue
        frames[timeframe] = frame_ctx
        quick_scan[timeframe] = frame_ctx.get("events", [])
        if timeframe in PRIMARY_TIMEFRAMES:
            tf_results_for_alignment[timeframe] = {"ai": frame_ctx.get("ai")}
        if frame_ctx.get("signal") and not best_signal:
            best_signal = f"{timeframe}:{frame_ctx.get('signal')}"

    dom, align_score, align_detail = PATROL_SCAN.alignment_score(tf_results_for_alignment) if tf_results_for_alignment else ("TR", 0, "")
    return {
        "symbol": symbol,
        "dominant_direction": dom,
        "alignment_score": align_score,
        "alignment_detail": align_detail,
        "best_signal": best_signal,
        "timeframes": frames,
        "quick_scan": quick_scan,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build patrol AB context")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--port", type=int, default=8092)
    args = parser.parse_args()

    base_url = f"http://127.0.0.1:{args.port}"
    payload = build_symbol_context(args.symbol.upper(), base_url)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
