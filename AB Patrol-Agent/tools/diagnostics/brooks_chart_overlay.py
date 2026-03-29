#!/usr/bin/env python3
"""
Brooks 图表覆盖层生成器。

职责：
1. 在交易周期上生成 Brooks 信号标记
2. 只把大周期当作边界/背景，不作为第二套触发逻辑
3. 为 Web K 线图提供统一的覆盖层、边界线和摘要
"""

from __future__ import annotations

import types
from typing import Any

import pandas as pd
import numpy as np

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.data_loader import DataLoader  # noqa: E402


INDICATORS_DIR = ROOT / "indicators" / "batch"
AB_EMA_PATH = INDICATORS_DIR / "ab_ema.py"
AB_SR_PATH = INDICATORS_DIR / "ab_sr.py"
AB_MM_PATH = INDICATORS_DIR / "ab_mm.py"
AB_PATTERNS_PATH = INDICATORS_DIR / "ab_patterns.py"


def _load_ab_module(path, name: str):
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


AB_EMA = _load_ab_module(AB_EMA_PATH, "ab_ema")
AB_SR = _load_ab_module(AB_SR_PATH, "ab_sr")
AB_MM = _load_ab_module(AB_MM_PATH, "ab_mm")
AB_PATTERNS = _load_ab_module(AB_PATTERNS_PATH, "ab_patterns")


HIGHER_TIMEFRAME_MAP = {
    "1m": "5m",
    "5m": "15m",
    "15m": "1h",
    "30m": "4h",
    "1h": "4h",
    "4h": "1d",
    "1d": "1d",
}

MAX_VISIBLE_HL_MARKERS = 16
MAX_VISIBLE_PATTERN_MARKERS = 10
MAX_VISIBLE_REVERSAL_MARKERS = 6
MAX_VISIBLE_BAR_INDEX_MARKERS = 32
MAX_VISIBLE_MICRO_CHANNEL_MARKERS = 4
MAX_VISIBLE_SIGNAL_QUALITY_MARKERS = 6

SIGNAL_GROUP_LABELS = {
    "runtime_gate": "运行态 / 执行链",
    "trade_tf": "交易周期",
    "session_levels": "关键价位",
    "latest_h": "H 计数",
    "latest_l": "L 计数",
    "signal_quality": "Signal Bar / 风险",
    "breakout_mode": "突破模式",
    "micro_double": "微双顶底",
    "reversal": "反转 / 楔形",
    "gap": "缺口 / Gap",
    "micro_channel": "微通道",
    "pullback_ema": "小回调 / EMA",
    "pressure": "压力",
    "mag": "MAG",
    "mm": "MM",
    "higher_tf": "大周期",
}


def _to_epoch_seconds(ts: pd.Timestamp) -> int:
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return int(ts.timestamp())


def _normalize_bars(bars: pd.DataFrame) -> pd.DataFrame:
    frame = bars.copy()
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True, errors="coerce").dt.tz_localize(None)
    for column in ("open", "high", "low", "close", "volume"):
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna(subset=["timestamp", "open", "high", "low", "close"]).sort_values("timestamp").reset_index(drop=True)
    if "volume" not in frame.columns:
        frame["volume"] = 0.0
    frame["volume"] = frame["volume"].fillna(0.0)
    return frame


def _line_style(value: str) -> str:
    return value if value in {"solid", "dashed", "dotted"} else "dashed"


def _append_marker(target: list[dict[str, Any]], seen: set[tuple[Any, ...]], marker: dict[str, Any]) -> None:
    signature = (
        marker.get("time"),
        marker.get("text"),
        marker.get("position"),
        marker.get("shape"),
    )
    if signature in seen:
        return
    seen.add(signature)
    target.append(marker)


def _append_price_line(target: list[dict[str, Any]], seen: set[tuple[Any, ...]], line: dict[str, Any]) -> None:
    price = float(line.get("price") or 0.0)
    if price <= 0:
        return
    signature = (round(price, 8), str(line.get("title") or ""))
    if signature in seen:
        return
    seen.add(signature)
    payload = dict(line)
    payload["price"] = price
    payload["lineStyle"] = _line_style(str(payload.get("lineStyle") or "dashed"))
    target.append(payload)


def _limit_markers(markers: list[dict[str, Any]], per_text_limit: dict[str, int], default_limit: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for marker in sorted(markers, key=lambda item: int(item.get("time") or 0)):
        label = str(marker.get("text") or "").strip() or "_default"
        grouped.setdefault(label, []).append(marker)

    limited: list[dict[str, Any]] = []
    for label, items in grouped.items():
        limit = per_text_limit.get(label, default_limit)
        limited.extend(items[-limit:])
    return sorted(limited, key=lambda item: int(item.get("time") or 0))


def _summary_item(
    key: str,
    label: str,
    color: str,
    detail_lines: list[str],
    *,
    group_key: str | None = None,
    group_label: str | None = None,
) -> dict[str, Any]:
    resolved_group_key = str(group_key or key)
    return {
        "key": key,
        "label": label,
        "color": color,
        "detailTitle": label,
        "detailLines": detail_lines,
        "groupKey": resolved_group_key,
        "groupLabel": group_label or SIGNAL_GROUP_LABELS.get(resolved_group_key, "其他信号"),
    }


def _bias_label(value: str) -> str:
    mapping = {
        "AIL": "多头",
        "AIS": "空头",
        "TR": "震荡",
    }
    return mapping.get(str(value or "").upper(), str(value or "-"))


def _state_label(value: str) -> str:
    mapping = {
        "BO": "突破",
        "TC": "紧通道",
        "BC": "宽通道",
        "TR": "震荡区间",
    }
    return mapping.get(str(value or "").upper(), str(value or "-"))


def _mm_label(target: dict[str, Any]) -> str:
    direction = "↑" if str(target.get("direction") or "").lower() == "up" else "↓"
    mm_type = str(target.get("type") or "")
    if mm_type == "recent_leg1_eq_leg2":
        return f"MM{direction} 当前腿"
    if mm_type == "leg1_eq_leg2":
        return f"MM{direction} leg1=leg2"
    if mm_type == "tr_height":
        return f"MM{direction} 区间高度"
    if mm_type == "gap_mm":
        return f"MM{direction} 缺口测量"
    return f"MM{direction} {mm_type or '目标'}"


def _pick_preferred_mm_target(mm_info: dict[str, Any], ai_dir: str) -> dict[str, Any] | None:
    targets = [item for item in list(mm_info.get("targets") or []) if isinstance(item, dict)]
    if not targets:
        return None

    preferred_direction = "down" if ai_dir == "AIS" else "up" if ai_dir == "AIL" else None

    def target_priority(target: dict[str, Any]) -> tuple[int, int, float]:
        scope_rank = 0 if str(target.get("scope") or "") == "recent_local" else 1
        bars_ago = int(target.get("bars_ago") or 10_000)
        return (scope_rank, bars_ago, abs(float(target.get("pb_ratio") or 0.5) - 0.5))

    if preferred_direction:
        directional = [item for item in targets if str(item.get("direction") or "").lower() == preferred_direction]
        if directional:
            return sorted(directional, key=target_priority)[0]

    return sorted(targets, key=target_priority)[0]


def _build_series(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    for point in points:
        value = point.get("value")
        time = point.get("time")
        if value is None or time is None:
            continue
        series.append({"time": int(time), "value": float(value)})
    return series


def _infer_live_ai(frame: pd.DataFrame, ema20_last: float, atr14: float) -> tuple[str, str]:
    records = frame.tail(80).to_dict("records")
    if len(records) < 10:
        return ("TR", "insufficient")

    recent = records[-20:] if len(records) >= 20 else records
    price = float(recent[-1]["close"])
    norm = atr14 if atr14 > 0 else abs(price * 0.001) or 1.0
    weight_sum = len(recent) * (len(recent) + 1) / 2
    weighted_sum = 0.0
    for index, bar in enumerate(recent):
        weighted_sum += (float(bar["close"]) - float(bar["open"])) * (index + 1)

    momentum = weighted_sum / (norm * weight_sum) if norm else 0.0
    ema_dist = (price - ema20_last) / norm if norm else 0.0
    ema_signal = max(-2.0, min(2.0, ema_dist))

    window_high = max(float(bar["high"]) for bar in records)
    window_low = min(float(bar["low"]) for bar in records)
    window_range = window_high - window_low
    price_position = (price - window_low) / window_range if window_range > 0 else 0.5
    structure = (price_position - 0.5) * 2.0

    score = momentum * 0.45 + ema_signal * 0.35 + structure * 0.20
    if score > 0.25:
        return ("AIL", "strong" if score > 0.6 else "moderate")
    if score < -0.25:
        return ("AIS", "strong" if score < -0.6 else "moderate")
    return ("TR", "mixed" if abs(score) > 0.1 else "flat")


def _infer_market_state(frame: pd.DataFrame, ai_dir: str) -> str:
    records = frame.tail(20).to_dict("records")
    if len(records) < 12 or ai_dir == "TR":
        return "TR"

    overlap = 0.0
    for index in range(1, len(records)):
        current = records[index]
        previous = records[index - 1]
        inter = min(float(current["high"]), float(previous["high"])) - max(float(current["low"]), float(previous["low"]))
        union = max(float(current["high"]), float(previous["high"])) - min(float(current["low"]), float(previous["low"]))
        if union > 0 and inter > 0:
            overlap += inter / union
    overlap_pct = overlap / (len(records) - 1) if len(records) > 1 else 1.0

    max_run = 1
    run = 1
    for index in range(1, len(records)):
        current_body = float(records[index]["close"]) - float(records[index]["open"])
        previous_body = float(records[index - 1]["close"]) - float(records[index - 1]["open"])
        same_dir = (current_body > 0) == (previous_body > 0)
        if same_dir and current_body != 0:
            run += 1
            max_run = max(max_run, run)
        else:
            run = 1

    if max_run >= 5 and overlap_pct < 0.4:
        return "BO"
    if overlap_pct < 0.55:
        return "TC"
    if overlap_pct < 0.72:
        return "BC"
    return "TR"


def _hl_marker_color(prefix: str, count: int) -> str:
    if prefix == "H":
        return "#22c55e" if count <= 2 else "#38bdf8"
    return "#ef4444" if count <= 2 else "#f472b6"


def _detect_hl_count_markers(frame: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    ema20 = frame["close"].ewm(span=20, adjust=False).mean().to_numpy()
    high = frame["high"].to_numpy()
    low = frame["low"].to_numpy()
    close = frame["close"].to_numpy()
    timestamps = frame["timestamp"].tolist()

    latest_h: str | None = None
    latest_l: str | None = None
    highest_high: float | None = None
    lowest_low: float | None = None
    leg_count = 0
    leg_dir = 0
    wait_for_leg_completion = False
    previous_bias = 0
    tolerance = max(float(frame["close"].iloc[-1]) * 0.00005, 1e-8)

    for index in range(1, len(frame)):
        bull_bias = close[index] > ema20[index]
        bear_bias = close[index] < ema20[index]
        bias = 1 if bull_bias else (-1 if bear_bias else 0)

        if bias != previous_bias:
            leg_count = 0
            leg_dir = 0
            wait_for_leg_completion = False
            if bias == 1:
                highest_high = float(high[index])
                lowest_low = None
            elif bias == -1:
                lowest_low = float(low[index])
                highest_high = None
            previous_bias = bias

        if bias == 1:
            if highest_high is None or high[index] > highest_high + tolerance:
                highest_high = float(high[index])
                leg_count = 0
                leg_dir = 0
                wait_for_leg_completion = False

            down_leg_bar = (
                (high[index] < high[index - 1] and low[index] < low[index - 1])
                or close[index] < close[index - 1]
            )
            if down_leg_bar:
                if leg_dir != -1:
                    leg_count += 1
                    leg_dir = -1
                    wait_for_leg_completion = True
            elif leg_dir == -1 and wait_for_leg_completion and high[index] > high[index - 1]:
                label = f"H{leg_count}"
                latest_h = label
                _append_marker(
                    markers,
                    seen,
                    {
                        "time": _to_epoch_seconds(timestamps[index]),
                        "position": "belowBar",
                        "shape": "arrowUp",
                        "color": _hl_marker_color("H", leg_count),
                        "text": label,
                        "price": float(low[index]),
                        "size": 1.35 if leg_count <= 2 else 1.05,
                        "signalKey": "latest_h",
                    },
                )
                leg_dir = 0
                wait_for_leg_completion = False

        elif bias == -1:
            if lowest_low is None or low[index] < lowest_low - tolerance:
                lowest_low = float(low[index])
                leg_count = 0
                leg_dir = 0
                wait_for_leg_completion = False

            up_leg_bar = (
                (high[index] > high[index - 1] and low[index] > low[index - 1])
                or close[index] > close[index - 1]
            )
            if up_leg_bar:
                if leg_dir != 1:
                    leg_count += 1
                    leg_dir = 1
                    wait_for_leg_completion = True
            elif leg_dir == 1 and wait_for_leg_completion and low[index] < low[index - 1]:
                label = f"L{leg_count}"
                latest_l = label
                _append_marker(
                    markers,
                    seen,
                    {
                        "time": _to_epoch_seconds(timestamps[index]),
                        "position": "aboveBar",
                        "shape": "arrowDown",
                        "color": _hl_marker_color("L", leg_count),
                        "text": label,
                        "price": float(high[index]),
                        "size": 1.35 if leg_count <= 2 else 1.05,
                        "signalKey": "latest_l",
                    },
                )
                leg_dir = 0
                wait_for_leg_completion = False
        else:
            leg_dir = 0
            wait_for_leg_completion = False

    visible_markers = markers[-MAX_VISIBLE_HL_MARKERS:]
    h_count = 0
    l_count = 0
    for marker in markers:
        label = str(marker.get("text") or "")
        if label.startswith("H"):
            try:
                h_count = max(h_count, int(label[1:]))
            except ValueError:
                pass
        elif label.startswith("L"):
            try:
                l_count = max(l_count, int(label[1:]))
            except ValueError:
                pass

    return visible_markers, {
        "latest_h_count": latest_h,
        "latest_l_count": latest_l,
        "h_count": h_count,
        "l_count": l_count,
    }


def _build_bar_index_markers(frame: pd.DataFrame, step: int = 2) -> list[dict[str, Any]]:
    """补充原版常见的隔柱编号显示，默认只保留最近一段，避免图面过重。"""
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    bar_count = 0
    current_date = None

    for ts, low in zip(frame["timestamp"], frame["low"], strict=False):
        bar_date = pd.Timestamp(ts).date()
        if current_date != bar_date:
            current_date = bar_date
            bar_count = 0
        bar_count += 1
        if bar_count % step != 0:
            continue
        _append_marker(
            markers,
            seen,
            {
                "time": _to_epoch_seconds(pd.Timestamp(ts)),
                "position": "belowBar",
                "shape": "circle",
                "color": "#475569",
                "text": str(bar_count),
                "price": float(low),
                "size": 0.45,
                "signalKey": "trade_tf",
            },
        )

    return markers[-MAX_VISIBLE_BAR_INDEX_MARKERS:]


def _is_inside(high: pd.Series, low: pd.Series, index: int, mother_index: int) -> bool:
    return bool(high.iloc[index] <= high.iloc[mother_index] and low.iloc[index] >= low.iloc[mother_index])


def _is_outside(high: pd.Series, low: pd.Series, index: int, mother_index: int) -> bool:
    return bool(
        high.iloc[index] >= high.iloc[mother_index]
        and low.iloc[index] <= low.iloc[mother_index]
        and (high.iloc[index] != high.iloc[mother_index] or low.iloc[index] != low.iloc[mother_index])
    )


def _build_breakout_mode_markers(frame: pd.DataFrame, patterns: dict[str, Any]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    timestamps = frame["timestamp"].tolist()
    high = frame["high"]
    low = frame["low"]
    total = len(frame)

    for item in patterns.get("inside_bars", [])[-8:]:
        count = int(item.get("count") or 1)
        start_index = max(0, total - 1 - int(item.get("bars_ago") or 0))
        end_index = min(total - 1, start_index + count - 1)
        _append_marker(
            markers,
            seen,
            {
                "time": _to_epoch_seconds(timestamps[end_index]),
                "position": "inBar",
                "shape": "square",
                "color": "#facc15",
                "text": str(item.get("type") or "ib"),
                "price": float(frame.iloc[end_index]["close"]),
                "size": 0.85,
                "signalKey": "breakout_mode",
            },
        )

    recent_window_start = max(2, total - 40)
    for index in range(recent_window_start, total):
        if _is_outside(high, low, index - 1, index - 2) and _is_inside(high, low, index, index - 1):
            _append_marker(
                markers,
                seen,
                {
                    "time": _to_epoch_seconds(timestamps[index]),
                    "position": "inBar",
                    "shape": "square",
                    "color": "#f59e0b",
                    "text": "ioi",
                    "price": float(frame.iloc[index]["close"]),
                    "size": 0.9,
                    "signalKey": "breakout_mode",
                },
            )
        if _is_outside(high, low, index - 1, index - 2) and _is_outside(high, low, index, index - 1):
            _append_marker(
                markers,
                seen,
                {
                    "time": _to_epoch_seconds(timestamps[index]),
                    "position": "inBar",
                    "shape": "square",
                    "color": "#fb7185",
                    "text": "oo",
                    "price": float(frame.iloc[index]["close"]),
                    "size": 0.9,
                    "signalKey": "breakout_mode",
                },
            )

    return _limit_markers(
        markers,
        {
            "ioi": 2,
            "oo": 2,
            "ib": 2,
            "ii": 3,
            "iii": 2,
        },
        2,
    )[-MAX_VISIBLE_PATTERN_MARKERS:]


def _is_parabolic_wedge(item: dict[str, Any]) -> bool:
    first = int(item.get("push2_index") or 0) - int(item.get("push1_index") or 0)
    second = int(item.get("push3_index") or 0) - int(item.get("push2_index") or 0)
    if first <= 0 or second <= 0:
        return False
    return second <= first and bool(item.get("momentum_decreasing"))


def _build_reversal_markers(frame: pd.DataFrame, patterns: dict[str, Any]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    timestamps = frame["timestamp"].tolist()
    high = frame["high"]
    low = frame["low"]
    total = len(frame)

    for item in patterns.get("dt_db", [])[-MAX_VISIBLE_REVERSAL_MARKERS:]:
        pattern_type = str(item.get("type") or "").upper()
        if pattern_type == "DB":
            bars_ago = int(item.get("low2_bars_ago") or 0)
            index = max(0, total - 1 - bars_ago)
            marker = {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "belowBar",
                "shape": "arrowUp",
                "color": "#22c55e",
                "text": "DB",
                "price": float(low.iloc[index]),
                "size": 1.1,
                "signalKey": "reversal",
            }
        else:
            bars_ago = int(item.get("high2_bars_ago") or 0)
            index = max(0, total - 1 - bars_ago)
            marker = {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "aboveBar",
                "shape": "arrowDown",
                "color": "#ef4444",
                "text": "DT",
                "price": float(high.iloc[index]),
                "size": 1.1,
                "signalKey": "reversal",
            }
        _append_marker(markers, seen, marker)

    for item in patterns.get("wedges", [])[-MAX_VISIBLE_REVERSAL_MARKERS:]:
        bars_ago = int(item.get("bars_ago") or 0)
        index = max(0, total - 1 - bars_ago)
        direction = str(item.get("direction") or "").lower()
        marker_type = str(item.get("type") or "")
        parabolic = _is_parabolic_wedge(item)
        if direction == "bull":
            marker = {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "belowBar",
                "shape": "arrowUp",
                "color": "#06b6d4",
                "text": "PW↑" if parabolic else ("MTR↑" if "mtr" in marker_type else "W↑"),
                "price": float(low.iloc[index]),
                "size": 1.0,
                "signalKey": "reversal",
            }
        else:
            marker = {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "aboveBar",
                "shape": "arrowDown",
                "color": "#a78bfa",
                "text": "PW↓" if parabolic else ("MTR↓" if "mtr" in marker_type else "W↓"),
                "price": float(high.iloc[index]),
                "size": 1.0,
                "signalKey": "reversal",
            }
        _append_marker(markers, seen, marker)

    return _limit_markers(
        markers,
        {
            "DT": 3,
            "DB": 3,
            "W↑": 2,
            "W↓": 2,
            "MTR↑": 2,
            "MTR↓": 2,
            "PW↑": 2,
            "PW↓": 2,
        },
        2,
    )[-MAX_VISIBLE_PATTERN_MARKERS:]


def _build_micro_double_markers(frame: pd.DataFrame, patterns: dict[str, Any]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    timestamps = frame["timestamp"].tolist()
    high = frame["high"]
    low = frame["low"]
    total = len(frame)

    for item in list(patterns.get("micro_dt_db") or [])[-4:]:
        bars_ago = int(item.get("bars_ago") or 0)
        index = max(0, total - 1 - bars_ago)
        marker_type = str(item.get("type") or "").upper()
        if marker_type == "MDB":
            marker = {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "belowBar",
                "shape": "circle",
                "color": "#34d399",
                "text": "mDB",
                "price": float(low.iloc[index]),
                "size": 0.9,
                "signalKey": "micro_double",
            }
        else:
            marker = {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "aboveBar",
                "shape": "circle",
                "color": "#fb7185",
                "text": "mDT",
                "price": float(high.iloc[index]),
                "size": 0.9,
                "signalKey": "micro_double",
            }
        _append_marker(markers, seen, marker)

    return _limit_markers(markers, {"mDB": 3, "mDT": 3}, 2)[-4:]


def _gap_class_short(value: str) -> str:
    mapping = {
        "breakaway": "BG",
        "measuring": "MG",
        "exhaustion": "EG",
        "common": "CG",
    }
    return mapping.get(str(value or "").lower(), "Gap")


def _build_gap_markers(frame: pd.DataFrame, sr_info: dict[str, Any]) -> list[dict[str, Any]]:
    gaps = [item for item in list(sr_info.get("all_gaps") or []) if isinstance(item, dict)]
    if not gaps:
        return []

    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    total = len(frame)
    timestamps = frame["timestamp"].tolist()
    high = frame["high"].to_numpy()
    low = frame["low"].to_numpy()

    for gap in gaps:
        bars_ago = int(gap.get("bars_ago") or 0)
        index = total - 1 - bars_ago
        if index < 0 or index >= total:
            continue

        side = str(gap.get("side") or "").lower()
        marker = {
            "time": _to_epoch_seconds(timestamps[index]),
            "position": "belowBar" if side == "support" else "aboveBar",
            "shape": "circle",
            "color": "#22c55e" if side == "support" else "#ef4444",
            "text": f"{_gap_class_short(str(gap.get('gap_class') or ''))}{'↑' if side == 'support' else '↓'}",
            "price": float(low[index]) if side == "support" else float(high[index]),
            "size": 0.8 if gap.get("filled") else 1.0,
            "signalKey": "gap",
        }
        _append_marker(markers, seen, marker)

    return _limit_markers(
        markers,
        {
            "BG↑": 2,
            "BG↓": 2,
            "MG↑": 3,
            "MG↓": 3,
            "EG↑": 2,
            "EG↓": 2,
            "CG↑": 2,
            "CG↓": 2,
        },
        2,
    )[-MAX_VISIBLE_PATTERN_MARKERS:]


def _build_micro_channel_markers(frame: pd.DataFrame) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    high = frame["high"].to_numpy()
    low = frame["low"].to_numpy()
    close = frame["close"].to_numpy()
    timestamps = frame["timestamp"].tolist()
    tolerance = max(float(frame["close"].iloc[-1]) * 0.00005, 1e-8)
    bull_run = 1
    bear_run = 1

    def append_channel(index: int, count: int, direction: str) -> None:
        if count < 3:
            return
        if direction == "bull":
            _append_marker(
                markers,
                seen,
                {
                    "time": _to_epoch_seconds(timestamps[index]),
                    "position": "belowBar",
                    "shape": "circle",
                    "color": "#22c55e",
                    "text": f"MC↑{count}",
                    "price": float(low[index]),
                    "size": 0.9 if count < 6 else 1.1,
                    "signalKey": "micro_channel",
                },
            )
            return
        _append_marker(
            markers,
            seen,
            {
                "time": _to_epoch_seconds(timestamps[index]),
                "position": "aboveBar",
                "shape": "circle",
                "color": "#ef4444",
                "text": f"MC↓{count}",
                "price": float(high[index]),
                "size": 0.9 if count < 6 else 1.1,
                "signalKey": "micro_channel",
            },
        )

    for index in range(1, len(frame)):
        if low[index] >= low[index - 1] - tolerance:
            bull_run += 1
        else:
            append_channel(index - 1, bull_run, "bull")
            bull_run = 1

        if high[index] <= high[index - 1] + tolerance:
            bear_run += 1
        else:
            append_channel(index - 1, bear_run, "bear")
            bear_run = 1

    append_channel(len(frame) - 1, bull_run, "bull")
    append_channel(len(frame) - 1, bear_run, "bear")
    return markers[-MAX_VISIBLE_MICRO_CHANNEL_MARKERS:]


def _build_pressure_markers(frame: pd.DataFrame, patterns: dict[str, Any]) -> list[dict[str, Any]]:
    pressure = dict(patterns.get("pressure") or {})
    direction = str(pressure.get("direction") or "").lower()
    if direction not in {"bull_pressure", "bear_pressure"}:
        return []

    index = len(frame) - 1
    timestamp = _to_epoch_seconds(pd.Timestamp(frame.iloc[index]["timestamp"]))
    if direction == "bull_pressure":
        return [
            {
                "time": timestamp,
                "position": "belowBar",
                "shape": "square",
                "color": "#22c55e",
                "text": "BP",
                "price": float(frame.iloc[index]["low"]),
                "size": 0.85,
                "signalKey": "pressure",
            }
        ]
    return [
        {
            "time": timestamp,
            "position": "aboveBar",
            "shape": "square",
            "color": "#ef4444",
            "text": "SP",
            "price": float(frame.iloc[index]["high"]),
            "size": 0.85,
            "signalKey": "pressure",
        }
    ]


def _build_pullback_ema_markers(
    frame: pd.DataFrame,
    ema20: pd.Series,
    ai_dir: str,
    atr14: float,
    patterns: dict[str, Any],
    preferred_mm_target: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    norm = atr14 if atr14 > 0 else max(float(frame["close"].iloc[-1]) * 0.002, 1e-6)
    pb_depth_payload = patterns.get("pb_depth") or {}
    if isinstance(pb_depth_payload, dict):
        pb_depth = str(pb_depth_payload.get("depth") or "")
    else:
        pb_depth = str(pb_depth_payload or "")
    recent = frame.tail(20).reset_index(drop=True)
    recent_ema = ema20.tail(20).reset_index(drop=True)

    closest_idx: int | None = None
    closest_distance = float("inf")
    for index in range(len(recent)):
        low = float(recent.iloc[index]["low"])
        high = float(recent.iloc[index]["high"])
        ema_value = float(recent_ema.iloc[index])
        distance = min(abs(low - ema_value), abs(high - ema_value), abs(float(recent.iloc[index]["close"]) - ema_value))
        touched = low <= ema_value <= high or distance <= norm * 0.35
        if not touched:
            continue
        if distance < closest_distance:
            closest_distance = distance
            closest_idx = index

    if closest_idx is not None and ai_dir in {"AIL", "AIS"} and pb_depth in {"shallow", "normal", "deep"}:
        bar = recent.iloc[closest_idx]
        signal_label = "PB EMA↑" if ai_dir == "AIL" else "PB EMA↓"
        _append_marker(
            markers,
            seen,
            {
                "time": _to_epoch_seconds(pd.Timestamp(bar["timestamp"])),
                "position": "belowBar" if ai_dir == "AIL" else "aboveBar",
                "shape": "circle",
                "color": "#38bdf8" if ai_dir == "AIL" else "#f472b6",
                "text": signal_label,
                "price": float(bar["low"] if ai_dir == "AIL" else bar["high"]),
                "size": 0.9,
                "signalKey": "pullback_ema",
            },
        )

    if isinstance(preferred_mm_target, dict):
        direction = str(preferred_mm_target.get("direction") or "").lower()
        mm_price = float(preferred_mm_target.get("price") or 0.0)
        last_bar = frame.iloc[-1]
        distance_to_mm = abs(float(last_bar["close"]) - mm_price)
        if mm_price > 0 and distance_to_mm <= norm * 1.2:
            if direction == "up" and float(last_bar["close"]) < float(last_bar["open"]) and ai_dir == "AIL":
                _append_marker(
                    markers,
                    seen,
                    {
                        "time": _to_epoch_seconds(pd.Timestamp(last_bar["timestamp"])),
                        "position": "aboveBar",
                        "shape": "arrowDown",
                        "color": "#f59e0b",
                        "text": "FF顶",
                        "price": float(last_bar["high"]),
                        "size": 1.0,
                        "signalKey": "pullback_ema",
                    },
                )
            if direction == "down" and float(last_bar["close"]) > float(last_bar["open"]) and ai_dir == "AIS":
                _append_marker(
                    markers,
                    seen,
                    {
                        "time": _to_epoch_seconds(pd.Timestamp(last_bar["timestamp"])),
                        "position": "belowBar",
                        "shape": "arrowUp",
                        "color": "#f59e0b",
                        "text": "FF底",
                        "price": float(last_bar["low"]),
                        "size": 1.0,
                        "signalKey": "pullback_ema",
                    },
                )

    return markers[-4:]


def _classify_signal_bar_quality(
    *,
    direction: str,
    open_price: float,
    high_price: float,
    low_price: float,
    close_price: float,
    ema_value: float,
    atr14: float,
    market_state: str,
) -> tuple[str, str | None]:
    bar_range = max(high_price - low_price, 1e-8)
    body = close_price - open_price
    body_ratio = abs(body) / bar_range
    close_position = (close_price - low_price) / bar_range
    far_from_ema = abs(close_price - ema_value) >= max(atr14 * 1.15, bar_range * 1.25) if atr14 > 0 else False
    big_bar = bar_range >= atr14 * 1.2 if atr14 > 0 else body_ratio >= 0.75

    if direction == "bull":
        strong = body > 0 and close_position >= 0.67 and body_ratio >= 0.35
        weak = body <= 0 or close_position <= 0.55 or body_ratio <= 0.2
        high_risk = market_state == "TR" and big_bar and far_from_ema
    else:
        strong = body < 0 and close_position <= 0.33 and body_ratio >= 0.35
        weak = body >= 0 or close_position >= 0.45 or body_ratio <= 0.2
        high_risk = market_state == "TR" and big_bar and far_from_ema

    if strong:
        quality = "强"
    elif weak:
        quality = "弱"
    else:
        quality = "一般"

    if high_risk:
        return quality, "高风买" if direction == "bull" else "高风卖"
    return quality, None


def _build_signal_quality_markers(
    frame: pd.DataFrame,
    patterns: dict[str, Any],
    ema20: pd.Series,
    atr14: float,
    market_state: str,
) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    total = len(frame)
    timestamps = frame["timestamp"].tolist()
    recent_entries = [
        item
        for item in list(patterns.get("hl_entries") or [])
        if isinstance(item, dict) and int(item.get("bars_ago") or 99) <= 18
    ][-6:]

    for item in recent_entries:
        signal_type = str(item.get("type") or "").upper()
        if not signal_type:
            continue
        trigger_index = max(0, total - 1 - int(item.get("bars_ago") or 0))
        signal_index = max(0, trigger_index - 1)
        bar = frame.iloc[signal_index]
        direction = "bull" if signal_type.startswith("H") else "bear"
        quality, risk_label = _classify_signal_bar_quality(
            direction=direction,
            open_price=float(bar["open"]),
            high_price=float(bar["high"]),
            low_price=float(bar["low"]),
            close_price=float(bar["close"]),
            ema_value=float(ema20.iloc[signal_index]),
            atr14=atr14,
            market_state=market_state,
        )
        quality_label = f"{quality}{signal_type}"
        _append_marker(
            markers,
            seen,
            {
                "time": _to_epoch_seconds(timestamps[signal_index]),
                "position": "belowBar" if direction == "bull" else "aboveBar",
                "shape": "square",
                "color": "#22c55e" if direction == "bull" else "#ef4444",
                "text": quality_label,
                "price": float(bar["low"] if direction == "bull" else bar["high"]),
                "size": 0.8,
                "signalKey": "signal_quality",
            },
        )
        if risk_label:
            _append_marker(
                markers,
                seen,
                {
                    "time": _to_epoch_seconds(timestamps[signal_index]),
                    "position": "aboveBar" if direction == "bull" else "belowBar",
                    "shape": "circle",
                    "color": "#f59e0b",
                    "text": risk_label,
                    "price": float(bar["high"] if direction == "bull" else bar["low"]),
                    "size": 0.8,
                    "signalKey": "signal_quality",
                },
            )

    return _limit_markers(
        markers,
        {
            "高风买": 2,
            "高风卖": 2,
        },
        1,
    )[-MAX_VISIBLE_SIGNAL_QUALITY_MARKERS:]


def _build_mag_markers(frame: pd.DataFrame) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    ema20 = frame["close"].ewm(span=20, adjust=False).mean()
    timestamps = frame["timestamp"].tolist()
    highs = frame["high"].tolist()
    lows = frame["low"].tolist()
    closes = frame["close"].tolist()

    previous_above = False
    previous_below = False
    for index in range(len(frame)):
        full_above = lows[index] > ema20.iloc[index]
        full_below = highs[index] < ema20.iloc[index]
        if full_above and not previous_above:
            _append_marker(
                markers,
                seen,
                {
                    "time": _to_epoch_seconds(timestamps[index]),
                    "position": "belowBar",
                    "shape": "circle",
                    "color": "#f59e0b",
                    "text": "MAG↑",
                    "price": float(closes[index]),
                    "size": 0.8,
                    "signalKey": "mag",
                },
            )
        if full_below and not previous_below:
            _append_marker(
                markers,
                seen,
                {
                    "time": _to_epoch_seconds(timestamps[index]),
                    "position": "aboveBar",
                    "shape": "circle",
                    "color": "#f97316",
                    "text": "MAG↓",
                    "price": float(closes[index]),
                    "size": 0.8,
                    "signalKey": "mag",
                },
            )
        previous_above = full_above
        previous_below = full_below
    return _limit_markers(markers, {"MAG↑": 1, "MAG↓": 1}, 1)


def _visible_price_range(frame: pd.DataFrame) -> tuple[float, float]:
    chart_high = float(frame["high"].max())
    chart_low = float(frame["low"].min())
    span = max(chart_high - chart_low, abs(chart_high) * 0.002)
    return (chart_low - span * 0.4, chart_high + span * 0.4)


def _in_visible_window(price: float | None, frame: pd.DataFrame) -> bool:
    if price is None:
        return False
    lower, upper = _visible_price_range(frame)
    return lower <= float(price) <= upper


def _build_previous_session_lines(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """补充原版常用的上一交易日参考位。"""
    dated = frame.copy()
    dated["session_date"] = dated["timestamp"].dt.date
    unique_dates = sorted(dated["session_date"].dropna().unique())
    if len(unique_dates) < 2:
        return []

    previous_date = unique_dates[-2]
    current_date = unique_dates[-1]
    previous_session = dated[dated["session_date"] == previous_date]
    current_session = dated[dated["session_date"] == current_date]
    if previous_session.empty or current_session.empty:
        return []

    previous_high = float(previous_session["high"].max())
    previous_low = float(previous_session["low"].min())
    previous_close = float(previous_session["close"].iloc[-1])
    current_open = float(current_session["open"].iloc[0])

    return [
        {
            "price": previous_high,
            "color": "#94a3b8",
            "title": "昨高",
            "lineStyle": "dashed",
            "signalKey": "session_levels",
        },
        {
            "price": previous_low,
            "color": "#64748b",
            "title": "昨低",
            "lineStyle": "dashed",
            "signalKey": "session_levels",
        },
        {
            "price": previous_close,
            "color": "#38bdf8",
            "title": "昨收",
            "lineStyle": "dotted",
            "signalKey": "session_levels",
        },
        {
            "price": current_open,
            "color": "#f59e0b",
            "title": "今开",
            "lineStyle": "dotted",
            "signalKey": "session_levels",
        },
    ]


def _build_current_tf_overlay(frame: pd.DataFrame, timeframe: str) -> dict[str, Any]:
    open_arr = frame["open"].to_numpy()
    high = frame["high"].to_numpy()
    low = frame["low"].to_numpy()
    close = frame["close"].to_numpy()
    ema20_series = frame["close"].ewm(span=20, adjust=False).mean()

    ema_info = AB_EMA.analyze_ab_ema(high, low, close)
    patterns = AB_PATTERNS.analyze_ab_patterns(open_arr, high, low, close)
    mm_info = AB_MM.analyze_ab_mm(open_arr, high, low, close)
    sr_info = AB_SR.analyze_ab_sr(open_arr, high, low, close)

    ema20_last = float(ema20_series.iloc[-1])
    atr14 = float(sr_info.get("ATR") or 0.0)
    ai_dir, ai_strength = _infer_live_ai(frame, ema20_last, atr14)
    market_state = _infer_market_state(frame, ai_dir)

    hl_markers, hl_summary = _detect_hl_count_markers(frame)
    bar_index_markers = _build_bar_index_markers(frame)
    breakout_markers = _build_breakout_mode_markers(frame, patterns)
    signal_quality_markers = _build_signal_quality_markers(frame, patterns, ema20_series, atr14, market_state)
    micro_double_markers = _build_micro_double_markers(frame, patterns)
    reversal_markers = _build_reversal_markers(frame, patterns)
    gap_markers = _build_gap_markers(frame, sr_info)
    mag_markers = _build_mag_markers(frame)

    price_lines: list[dict[str, Any]] = []
    price_seen: set[tuple[Any, ...]] = set()
    nearest_bull_target = mm_info.get("nearest_bull_target")
    nearest_bear_target = mm_info.get("nearest_bear_target")
    preferred_mm_target = _pick_preferred_mm_target(mm_info, ai_dir)
    if preferred_mm_target is None:
        if ai_dir == "AIS" and isinstance(nearest_bear_target, dict):
            preferred_mm_target = nearest_bear_target
        elif ai_dir == "AIL" and isinstance(nearest_bull_target, dict):
            preferred_mm_target = nearest_bull_target
        elif isinstance(nearest_bear_target, dict):
            preferred_mm_target = nearest_bear_target
        elif isinstance(nearest_bull_target, dict):
            preferred_mm_target = nearest_bull_target

    micro_channel_markers = _build_micro_channel_markers(frame)
    pressure_markers = _build_pressure_markers(frame, patterns)
    pullback_markers = _build_pullback_ema_markers(frame, ema20_series, ai_dir, atr14, patterns, preferred_mm_target)

    if isinstance(preferred_mm_target, dict):
        mm_price = float(preferred_mm_target.get("price") or 0.0)
        if _in_visible_window(mm_price, frame):
            _append_price_line(
                price_lines,
                price_seen,
                {
                    "price": mm_price,
                    "color": "#22c55e" if str(preferred_mm_target.get("direction") or "").lower() == "up" else "#ef4444",
                    "title": _mm_label(preferred_mm_target),
                    "lineStyle": "dotted",
                    "signalKey": "mm",
                },
            )

    session_lines = _build_previous_session_lines(frame)
    for line in session_lines:
        if _in_visible_window(_safe_float(line.get("price")), frame):
            _append_price_line(price_lines, price_seen, line)

    summary: list[dict[str, Any]] = [
        _summary_item(
            "trade_tf",
            f"{timeframe} {_bias_label(ai_dir)} / {_state_label(market_state)}",
            "#2dd4bf",
            [
                f"当前交易周期使用 {timeframe} 作为真实信号周期。",
                f"方向/偏置：{_bias_label(ai_dir)}；结构状态：{_state_label(market_state)}。",
                "突破、窄通道、宽通道和震荡的主判读都在交易周期完成。",
                "大周期只补背景、边界和顺逆势语义，不代替交易周期触发。",
            ],
            group_key="trade_tf",
        ),
    ]
    if session_lines:
        session_titles = " / ".join(str(item.get("title") or "") for item in session_lines)
        summary.append(
            _summary_item(
                "session_levels",
                f"关键价位 {session_titles}",
                "#94a3b8",
                [
                    "昨高 / 昨低 / 昨收 / 今开是 Brooks 读图里最常用的磁体与边界。",
                    "这些价位更像位置过滤器，而不是独立 signal。",
                    "当 H/L、ii/ioi、DT/DB 正好压在这些位置上时，才更值得重点看。",
                ],
                group_key="session_levels",
            )
        )
    if hl_summary.get("latest_h_count"):
        latest_h = str(hl_summary["latest_h_count"])
        summary.append(
            _summary_item(
                "latest_h",
                f"{latest_h}（结构）",
                "#22c55e",
                [
                    f"当前最新多头结构计数：{latest_h}。",
                    "H1/H2/H3 是牛趋势或震荡里的回调计数，不等于每次都能直接开仓。",
                    "只有 signal bar、边界位置、趋势质量和盈亏比同时过关，结构计数才会升级成策略机会。",
                    "出现新的趋势高点后，多头回调计数会重置。",
                ],
                group_key="latest_h",
            )
        )
    if hl_summary.get("latest_l_count"):
        latest_l = str(hl_summary["latest_l_count"])
        summary.append(
            _summary_item(
                "latest_l",
                f"{latest_l}（结构）",
                "#ef4444",
                [
                    f"当前最新空头结构计数：{latest_l}。",
                    "L1/L2/L3 是熊趋势或震荡里的回调计数，不等于系统已经认可了开仓机会。",
                    "只有空头背景、bear signal bar 质量、位置优势和 trade gate 同时通过，结构计数才会升级成真实候选。",
                    "出现新的趋势低点后，旧的空头回调计数会重置。",
                ],
                group_key="latest_l",
            )
        )

    recent_quality_labels = [str(marker.get("text") or "") for marker in signal_quality_markers[-4:] if str(marker.get("text") or "").strip()]
    if recent_quality_labels:
        summary.append(
            _summary_item(
                "signal_quality",
                " / ".join(recent_quality_labels[-3:]),
                "#f59e0b",
                [
                    f"最近 signal bar / 风险标签：{' / '.join(recent_quality_labels[-3:])}。",
                    "这里把 Brooks 里高频会用到的 signal bar 强弱和 High Risk Buy/Sell 单独画出来，避免把弱 H/L 直接误看成可做机会。",
                    "Ali 实战里明确有 Fade Weak L1、Fade High Risk Buy、Fade High Risk Sell，这一组就是把这些语义单独可视化。",
                ],
                group_key="signal_quality",
            )
        )

    recent_breakout_labels = [str(marker.get("text") or "") for marker in breakout_markers[-4:] if str(marker.get("text") or "").strip()]
    if recent_breakout_labels:
        summary.append(
            _summary_item(
                "breakout_mode",
                " / ".join(recent_breakout_labels[-3:]),
                "#facc15",
                [
                    f"当前最近 breakout mode 标签：{' / '.join(recent_breakout_labels[-3:])}。",
                    "ii、ioi、oo 属于压缩和 breakout mode 结构，先看边界、磁体和突破接受。",
                    "这类结构更接近“准备突破”而不是“已经给出方向”。",
                ],
                group_key="breakout_mode",
            )
        )

    recent_micro_double_labels = [str(marker.get("text") or "") for marker in micro_double_markers[-4:] if str(marker.get("text") or "").strip()]
    if recent_micro_double_labels:
        summary.append(
            _summary_item(
                "micro_double",
                " / ".join(recent_micro_double_labels[-3:]),
                "#34d399",
                [
                    f"当前最近微双顶底：{' / '.join(recent_micro_double_labels[-3:])}。",
                    "Micro Double Top / Bottom 经常和 Higher Low / Lower High、Final Flag、Measured Move 一起出现。",
                    "它通常是轻量反转或退出线索，和大级别 DT/DB 比更贴近当前腿的末端变化。",
                ],
                group_key="micro_double",
            )
        )

    recent_reversal_labels = [str(marker.get("text") or "") for marker in reversal_markers[-4:] if str(marker.get("text") or "").strip()]
    if recent_reversal_labels:
        summary.append(
            _summary_item(
                "reversal",
                " / ".join(recent_reversal_labels[-3:]),
                "#f97316",
                [
                    f"当前最近反转标签：{' / '.join(recent_reversal_labels[-3:])}。",
                    "DT / DB / Wedge / MTR / Parabolic Wedge 都属于衰竭、二次测试和主要趋势反转语义。",
                    "这些结构本身只是 setup 线索，真正下单仍要回到 signal bar 与 trigger。",
                ],
                group_key="reversal",
            )
        )

    recent_gap_labels = [str(marker.get("text") or "") for marker in gap_markers[-4:] if str(marker.get("text") or "").strip()]
    gap_stats = dict(sr_info.get("gap_stats") or {})
    open_gaps = int(gap_stats.get("open_gaps") or 0)
    filled_gaps = int(gap_stats.get("filled_gaps") or 0)
    micro_gaps = int(gap_stats.get("micro_gaps") or 0)
    gap_phase = str(gap_stats.get("trend_phase") or "tr")
    if recent_gap_labels or open_gaps or filled_gaps or micro_gaps:
        summary.append(
            _summary_item(
                "gap",
                " / ".join(recent_gap_labels[-3:]) if recent_gap_labels else f"Gap {gap_phase}",
                "#f59e0b",
                [
                    f"最近缺口标签：{' / '.join(recent_gap_labels[-3:]) if recent_gap_labels else '当前窗口未显示具体 Gap 标签'}。",
                    f"Gap 统计：未回补 {open_gaps}，已回补 {filled_gaps}，微型 gap {micro_gaps}，阶段 {gap_phase}。",
                    "Gap 系列对应 Brooks 的 breakaway / measuring / exhaustion 语义，也是判断趋势是否还在 breakout phase 的重要线索。",
                    "这些缺口先是背景和目标过滤器；只有与 H/L、signal bar、关键位置一起共振时，才更可能升级成可执行机会。",
                ],
                group_key="gap",
            )
        )

    recent_micro_labels = [str(marker.get("text") or "") for marker in micro_channel_markers[-3:] if str(marker.get("text") or "").strip()]
    if recent_micro_labels:
        summary.append(
            _summary_item(
                "micro_channel",
                " / ".join(recent_micro_labels[-2:]),
                "#22c55e",
                [
                    f"当前最近微通道：{' / '.join(recent_micro_labels[-2:])}。",
                    "微通道代表极强顺势或极强压制，第一次逆势信号通常先按 minor reversal 处理。",
                    "在紧通道里，顺势 pullback 比逆势反转更值得优先处理。",
                ],
                group_key="micro_channel",
            )
        )

    if pullback_markers:
        summary.append(
            _summary_item(
                "pullback_ema",
                " / ".join(str(marker.get("text") or "") for marker in pullback_markers[-3:]),
                "#38bdf8",
                [
                    f"当前最近 EMA / 小回调标签：{' / '.join(str(marker.get('text') or '') for marker in pullback_markers[-3:])}。",
                    "这组信号主要服务 Small Pullback、第一次回到 EMA，以及 Final Flag 这类延续语义。",
                    "只有趋势仍然保持、signal bar 合格、边界位置合理时，才会升级成真实机会。",
                ],
                group_key="pullback_ema",
            )
        )

    pressure_direction = str((patterns.get("pressure") or {}).get("direction") or "")
    if pressure_direction in {"bull_pressure", "bear_pressure"}:
        pressure_label = "买压" if pressure_direction == "bull_pressure" else "卖压"
        summary.append(
            _summary_item(
                "pressure",
                pressure_label,
                "#22c55e" if pressure_direction == "bull_pressure" else "#ef4444",
                [
                    f"当前最近 10 根 bar 读取为：{pressure_label}。",
                    "压力读取衡量的是实体 bar 是否持续主导，而不是单根 bar 漂亮与否。",
                    "它更像背景与管理辅助，不单独等于 signal。",
                ],
                group_key="pressure",
            )
        )

    if ema_info.get("mag_type") and ema_info.get("mag_type") != "none":
        mag_label = f"MAG {ema_info['mag_type']}"
        summary.append(
            _summary_item(
                "mag",
                mag_label,
                "#f59e0b",
                [
                    f"当前均线缺口状态：{ema_info['mag_type']}。",
                    "MAG 用来衡量价格与 EMA20 的脱离程度，辅助判断趋势是否仍有空间。",
                    "Bull MAG 表示整根 bar 完整站上 EMA；Bear MAG 表示整根 bar 完整压在 EMA 下方。",
                    "MAG 只提供趋势质量与衰竭语义，不单独等同于入场信号。",
                ],
                group_key="mag",
            )
        )

    if mm_info.get("total_targets"):
        summary.append(
            _summary_item(
                "mm",
                _mm_label(preferred_mm_target) if isinstance(preferred_mm_target, dict) else f"MM {mm_info['total_targets']}",
                "#22c55e",
                [
                    f"当前可见测量目标数量：{mm_info['total_targets']}。",
                    "MM 代表 measured move / leg1 = leg2 这一类目标线。",
                    (
                        f"当前优先显示的是本周期最近主腿目标：{_mm_label(preferred_mm_target)} @ {float(preferred_mm_target.get('price') or 0.0):.4f}。"
                        if isinstance(preferred_mm_target, dict)
                        else "当前没有找到可以优先投影的本周期主腿目标。"
                    ),
                    "目标线是出场与管理参考，不会单独触发开仓。",
                ],
                group_key="mm",
            )
        )

    signal_names: list[str] = []
    signal_names.extend(sorted({marker["text"] for marker in hl_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in signal_quality_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in breakout_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in micro_double_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in reversal_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in gap_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in micro_channel_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in pullback_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in pressure_markers if marker.get("text")}))
    signal_names.extend(sorted({marker["text"] for marker in mag_markers if marker.get("text")}))

    return {
        "markers": (
            bar_index_markers
            + hl_markers
            + signal_quality_markers
            + breakout_markers
            + micro_double_markers
            + reversal_markers
            + gap_markers
            + micro_channel_markers
            + pullback_markers
            + pressure_markers
            + mag_markers
        ),
        "priceLines": price_lines,
        "overlayLines": [],
        "signalSummary": summary[:20],
        "focusMeta": {
            "tradeTimeframeBias": ai_dir,
            "tradeTimeframeBiasLabel": _bias_label(ai_dir),
            "tradeTimeframeStrength": ai_strength,
            "tradeTimeframeState": market_state,
            "tradeTimeframeStateLabel": _state_label(market_state),
            "tradeTimeframeLatestH": hl_summary.get("latest_h_count"),
            "tradeTimeframeLatestL": hl_summary.get("latest_l_count"),
            "tradeTimeframeSignals": " / ".join(signal_names[:20]) if signal_names else "无",
            "tradeSignalQuality": " / ".join(recent_quality_labels[-3:]) if recent_quality_labels else "无",
            "tradeMicroDouble": " / ".join(recent_micro_double_labels[-3:]) if recent_micro_double_labels else "无",
            "tradeNearestSupport": sr_info.get("nearest_support"),
            "tradeNearestResistance": sr_info.get("nearest_resistance"),
            "tradeTrPosition": sr_info.get("tr_position"),
            "tradeTrendPhase": sr_info.get("trend_phase"),
            "tradeGapPhase": gap_phase,
            "tradeOpenGaps": open_gaps,
            "tradeFilledGaps": filled_gaps,
            "tradeMicroGaps": micro_gaps,
            "tradePreferredMm": preferred_mm_target.get("price") if isinstance(preferred_mm_target, dict) else None,
            "tradePreferredMmLabel": _mm_label(preferred_mm_target) if isinstance(preferred_mm_target, dict) else None,
        },
    }


def _higher_timeframe_frame(frame: pd.DataFrame, timeframe: str) -> tuple[str | None, pd.DataFrame | None]:
    htf = HIGHER_TIMEFRAME_MAP.get(timeframe)
    if not htf or htf == timeframe:
        return None, None
    try:
        resampled = DataLoader.resample(frame.copy(), htf)
    except Exception:
        return htf, None
    resampled = _normalize_bars(resampled)
    if len(resampled) < 8:
        return htf, None
    return htf, resampled


def _build_higher_tf_overlay(frame: pd.DataFrame, timeframe: str) -> dict[str, Any]:
    htf, higher_frame = _higher_timeframe_frame(frame, timeframe)
    if not htf or higher_frame is None or higher_frame.empty:
        return {
            "priceLines": [],
            "overlayLines": [],
            "signalSummary": [],
            "focusMeta": {},
        }

    open_arr = higher_frame["open"].to_numpy()
    high = higher_frame["high"].to_numpy()
    low = higher_frame["low"].to_numpy()
    close = higher_frame["close"].to_numpy()
    ema20_values = AB_EMA.ema(close, 20)
    ema_info = AB_EMA.analyze_ab_ema(high, low, close)
    sr_info = AB_SR.analyze_ab_sr(open_arr, high, low, close)
    atr14 = float(sr_info.get("ATR") or 0.0)
    ai_dir, ai_strength = _infer_live_ai(higher_frame, float(ema20_values[-1]), atr14)
    market_state = _infer_market_state(higher_frame, ai_dir)

    overlay_lines: list[dict[str, Any]] = [
        {
            "id": f"{htf}-ema20",
            "title": f"{htf} EMA20",
            "color": "#f59e0b",
            "lineStyle": "dashed",
            "lineWidth": 1,
            "signalKey": "higher_tf",
            "points": _build_series(
                [
                    {"time": _to_epoch_seconds(ts), "value": value}
                    for ts, value in zip(higher_frame["timestamp"], ema20_values, strict=False)
                ]
            ),
        }
    ]

    last_completed = higher_frame.iloc[-2] if len(higher_frame) >= 2 else higher_frame.iloc[-1]
    price_lines: list[dict[str, Any]] = []
    price_seen: set[tuple[Any, ...]] = set()
    for price, color, title in (
        (float(last_completed["high"]), "#94a3b8", f"{htf} 前高"),
        (float(last_completed["low"]), "#64748b", f"{htf} 前低"),
        (_safe_float(sr_info.get("nearest_support")), "#38bdf8", f"{htf} 近支撑"),
        (_safe_float(sr_info.get("nearest_resistance")), "#fda4af", f"{htf} 近阻力"),
    ):
        if price is not None and _in_visible_window(price, frame):
            _append_price_line(
                price_lines,
                price_seen,
                {
                    "price": price,
                    "color": color,
                    "title": title,
                    "lineStyle": "dashed",
                    "signalKey": "higher_tf",
                },
            )

    boundary_parts = []
    if _safe_float(sr_info.get("nearest_support")) is not None:
        boundary_parts.append(f"支撑 {_safe_float(sr_info['nearest_support']):.5f}")
    if _safe_float(sr_info.get("nearest_resistance")) is not None:
        boundary_parts.append(f"阻力 {_safe_float(sr_info['nearest_resistance']):.5f}")
    boundary_parts.append(f"前高 {float(last_completed['high']):.5f}")
    boundary_parts.append(f"前低 {float(last_completed['low']):.5f}")

    return {
        "priceLines": price_lines,
        "overlayLines": overlay_lines,
        "signalSummary": [
            _summary_item(
                "higher_tf",
                f"{htf} {_bias_label(ai_dir)} / {_state_label(market_state)}",
                "#f59e0b",
                [
                    f"当前大周期使用 {htf} 作为背景周期。",
                    f"大周期方向/状态：{_bias_label(ai_dir)} / {_state_label(market_state)}。",
                    "大周期只提供边界、前高前低、近支撑近阻力和顺逆势语义。",
                    "真实突破、窄通道、宽通道、震荡的交易判断仍以交易周期为准。",
                ],
            )
        ],
        "focusMeta": {
            "higherTimeframe": htf,
            "higherTimeframeBias": ai_dir,
            "higherTimeframeBiasLabel": _bias_label(ai_dir),
            "higherTimeframeStrength": ai_strength,
            "higherTimeframeState": market_state,
            "higherTimeframeStateLabel": _state_label(market_state),
            "higherTimeframeBoundaries": " / ".join(boundary_parts),
        },
    }


def _safe_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not pd.notna(parsed):
        return None
    return parsed


def build_brooks_chart_overlay(bars: pd.DataFrame, timeframe: str) -> dict[str, Any]:
    frame = _normalize_bars(bars)
    if len(frame) < 20:
        return {
            "markers": [],
            "priceLines": [],
            "overlayLines": [],
            "signalSummary": [],
            "focusMeta": {},
        }

    current = _build_current_tf_overlay(frame, timeframe)
    higher = _build_higher_tf_overlay(frame, timeframe)

    markers = list(current["markers"])
    price_lines = list(current["priceLines"])
    overlay_lines = list(current["overlayLines"])
    signal_summary = list(current["signalSummary"])
    focus_meta = dict(current["focusMeta"])

    price_seen = {(round(float(item["price"]), 8), str(item.get("title") or "")) for item in price_lines}
    for line in higher["priceLines"]:
        _append_price_line(price_lines, price_seen, line)

    overlay_lines.extend(higher["overlayLines"])
    signal_summary.extend(higher["signalSummary"])
    focus_meta.update(higher["focusMeta"])

    return {
        "markers": markers,
        "priceLines": price_lines,
        "overlayLines": overlay_lines,
        "signalSummary": signal_summary[:20],
        "focusMeta": focus_meta,
    }
