#!/usr/bin/env python3
"""
均线缺口族个案诊断脚本。

用途：
1. 不走整条回测执行链，只逐 bar 扫描 gap detector。
2. 统计 `20均线缺口 / 第一均线缺口 / MAG 20/20 Setup` 的生成情况。
3. 找出 `MAG` 为何始终是 0，是 detector 本体没生成，还是 signal bar 被拦截。
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import sys

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()
SIGNAL_SERVICE_SRC = ROOT / "services" / "signal-service" / "src"
if str(SIGNAL_SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SIGNAL_SERVICE_SRC))

from libs.backtest.data_loader import DataLoader  # noqa: E402
from libs.backtest.market_replay import MarketReplay  # noqa: E402
from trading.market.timeframe_roles import resolve_timeframe_roles  # noqa: E402
from engines.pa_engine import StrategyDetector  # noqa: E402
from engines.pa.analysis import CycleIdentifier, calculate_ema  # noqa: E402
from engines.pa.ema_context import project_higher_timeframe_ema  # noqa: E402


@dataclass(frozen=True)
class Scenario:
    """单个 gap 个案场景。"""

    label: str
    symbol: str
    timeframe: str
    start: str
    end: str


RANDOM_SCENARIOS = [
    Scenario("R1_BTC_5m_2024Q3", "BTCUSDT", "5m", "2024-08-10", "2024-09-09"),
    Scenario("R2_ETH_15m_2024Q2", "ETHUSDT", "15m", "2024-05-15", "2024-06-14"),
    Scenario("R3_BNB_15m_2023Q4", "BNBUSDT", "15m", "2023-10-01", "2023-10-31"),
    Scenario("R4_SOL_15m_2025Q3", "SOLUSDT", "15m", "2025-08-01", "2025-08-31"),
]


def _scenario_list(label: str) -> list[Scenario]:
    """返回脚本内置场景。"""
    if label == "random":
        return RANDOM_SCENARIOS
    return [item for item in RANDOM_SCENARIOS if item.label == label]


def _scan_scenario(detector: StrategyDetector, scenario: Scenario, cache_dir: str) -> dict[str, Any]:
    """逐 bar 扫描单个场景。"""
    df = DataLoader.load(scenario.symbol, scenario.start, scenario.end, cache_dir=cache_dir)
    replay = MarketReplay(
        [scenario.symbol],
        {scenario.symbol: df},
        timeframes=["1m", "5m", "15m", "1h", "4h", "1d"],
    )
    roles = resolve_timeframe_roles(scenario.timeframe)
    gap_context_tf = roles.context if roles.context else scenario.timeframe

    detector_stats = Counter()
    build_stats = Counter()
    invalid_reasons = Counter()
    mag_modes = Counter()
    mag_signal_blocks = Counter()
    mag_cluster_stats = Counter()
    overlap_stats = Counter()
    signal_profile_stats = Counter()
    signal_profile_broad_stats = Counter()
    examples: list[dict[str, Any]] = []

    for ts in replay.timestamps(scenario.timeframe):
        replay.advance_to(ts)
        candles = replay.get_candles(scenario.symbol, scenario.timeframe, limit=80)
        if len(candles) < 25:
            continue

        closes = [float(candle.close) for candle in candles]
        ema20 = calculate_ema(closes, 20)
        if len(ema20) < 20:
            continue

        gap_context_candles = (
            replay.get_candles(scenario.symbol, gap_context_tf, limit=60)
            if gap_context_tf != scenario.timeframe
            else candles
        )
        gap_ema20 = (
            project_higher_timeframe_ema(candles, gap_context_candles, period=20)
            if gap_context_tf != scenario.timeframe
            else ema20
        )
        if len(gap_ema20) < 20:
            gap_ema20 = ema20
            gap_context_candles = candles
        gap_context_closes = [float(candle.close) for candle in gap_context_candles]
        gap_context_ema20 = calculate_ema(gap_context_closes, 20)
        if gap_context_ema20:
            gap_market_state = CycleIdentifier.identify(gap_context_candles, gap_context_ema20)
        else:
            gap_market_state = CycleIdentifier.identify(candles, gap_ema20)
        gap_cycle = str(gap_market_state.cycle or "")
        gap_ch_type = str(gap_market_state.channel_type or "")
        if not (
            gap_cycle == "区间"
            or (gap_cycle.startswith("趋势") and gap_ch_type in {"tight", "broad"})
            or gap_cycle.startswith("急速")
        ):
            continue

        if gap_cycle in {"趋势多", "急速多"}:
            directions = ("BUY",)
        elif gap_cycle in {"趋势空", "急速空"}:
            directions = ("SELL",)
        else:
            directions = ("BUY", "SELL")

        for direction in directions:
            signal_bar = candles[-1]
            prior_bar = candles[-2]
            ema_value = float(gap_ema20[-1])
            signal_profile = detector._ema_gap_signal_profile(  # type: ignore[attr-defined]
                signal_bar,
                prior_bar,
                ema_value,
                direction,
            )
            cluster = detector._ema_gap_recent_opposite_gap_cluster(  # type: ignore[attr-defined]
                candles,
                gap_ema20,
                direction,
            )
            current_side_buffer = detector._ema_gap_side_buffer(candles, float(signal_bar.close))  # type: ignore[attr-defined]
            current_is_gap_bar = detector._ema_gap_full_opposite_gap_bar(  # type: ignore[attr-defined]
                signal_bar,
                ema_value,
                direction,
                side_buffer=current_side_buffer,
            )
            mag_gap_cluster_count = int(cluster["count"]) + (1 if current_is_gap_bar else 0)
            mag_ready = False
            if mag_gap_cluster_count > 0:
                mag_cluster_stats["cluster_present"] += 1
                mag_cluster_stats[f"cluster_count::{mag_gap_cluster_count}"] += 1
                mag_ready = detector._ema_gap_mag_signal_ready(  # type: ignore[attr-defined]
                    signal_bar,
                    prior_bar,
                    ema_value,
                    direction,
                    signal_profile,
                    gap_cluster_count=mag_gap_cluster_count,
                    current_is_opposite_gap_bar=current_is_gap_bar,
                )
                if mag_ready:
                    mag_cluster_stats["mag_signal_ready"] += 1

            variant = detector._ema_gap_variant_profile(  # type: ignore[attr-defined]
                candles,
                gap_ema20,
                gap_cycle,
                direction,
                first_reentry=False,
                gap_context_candles=gap_context_candles,
                gap_context_ema20=gap_context_ema20,
                gap_context_timeframe=gap_context_tf,
            )
            detector_stats["checked"] += 1
            if not bool(variant.get("valid")):
                invalid_reasons[str(variant.get("reason") or "unknown")] += 1
                continue

            label = str(variant.get("label") or "")
            detector_stats[f"valid::{label}"] += 1
            build_stats[f"variant_valid::{label}"] += 1
            signal_label = str(signal_profile.get("signal_type_label") or "unknown")
            signal_valid = bool(signal_profile.get("valid_signal_bar"))
            signal_key = f"{label}::{signal_label}::{'valid' if signal_valid else 'invalid'}"
            signal_profile_stats[signal_key] += 1
            if gap_ch_type == "broad":
                signal_profile_broad_stats[signal_key] += 1
            if label == "20均线缺口" and mag_gap_cluster_count > 0:
                overlap_stats["twenty_gap_with_cluster"] += 1
            if label == "20均线缺口" and mag_ready:
                overlap_stats["twenty_gap_with_mag_ready"] += 1
            signal_profile = dict(variant.get("signal_profile") or {})
            allow_mag_gap_signal_bar = bool(
                str(variant.get("management_template") or "") == "ema_gap_mag_final_leg"
                and bool(variant.get("current_is_gap_signal_bar"))
            )

            if label == "MAG 20/20 Setup":
                mag_modes[str(variant.get("mag_signal_mode") or "")] += 1
                if not bool(signal_profile.get("valid_signal_bar")) and not allow_mag_gap_signal_bar:
                    mag_signal_blocks[str(signal_profile.get("signal_type_label") or "unknown")] += 1

            # 继续把候选拆到“真信号生成”层，定位究竟死在 signal bar 还是 stop/risk。
            if label == "20均线缺口":
                if not bool(signal_profile.get("valid_signal_bar")):
                    build_stats["blocked::signal_bar_invalid"] += 1
                else:
                    build_stats["passed_signal_bar"] += 1
                signal_obj = detector._build_ema_gap_signal(  # type: ignore[attr-defined]
                    curr=signal_bar,
                    candles=candles,
                    ema20=gap_ema20,
                    cycle=gap_cycle,
                    direction=direction,
                    first_reentry=False,
                    atr=0.0,
                    gap_context_candles=gap_context_candles,
                    gap_context_ema20=gap_context_ema20,
                    gap_context_timeframe=gap_context_tf,
                )
                if signal_obj is None:
                    build_stats["blocked::build_none"] += 1
                else:
                    build_stats["signal_created"] += 1
                    stop_loss = float(getattr(signal_obj, "stop_loss", 0.0) or 0.0)
                    entry_trigger = float(getattr(signal_obj, "entry_trigger", 0.0) or 0.0)
                    actual_risk = (
                        entry_trigger - stop_loss if direction == "BUY" else stop_loss - entry_trigger
                    )
                    if actual_risk <= 0:
                        build_stats["signal_created_with_non_positive_risk"] += 1

            if len(examples) < 12:
                examples.append(
                    {
                        "timestamp": str(ts),
                        "direction": direction,
                        "gap_cycle": gap_cycle,
                        "gap_channel_type": gap_ch_type,
                        "label": label,
                        "bars_away": int(variant.get("bars_away") or 0),
                        "signal_label": str(signal_profile.get("signal_type_label") or ""),
                        "valid_signal_bar": bool(signal_profile.get("valid_signal_bar")),
                        "body_ratio": float(signal_profile.get("body_ratio") or 0.0),
                        "close_position": float(signal_profile.get("close_position") or 0.0),
                        "mag_signal_mode": str(variant.get("mag_signal_mode") or ""),
                        "current_is_gap_signal_bar": bool(variant.get("current_is_gap_signal_bar")),
                    }
                )

    return {
        "scenario": asdict(scenario),
        "detector_stats": dict(detector_stats),
        "build_stats": dict(build_stats),
        "invalid_reasons": dict(invalid_reasons),
        "mag_modes": dict(mag_modes),
        "mag_signal_blocks": dict(mag_signal_blocks),
        "mag_cluster_stats": dict(mag_cluster_stats),
        "overlap_stats": dict(overlap_stats),
        "signal_profile_stats": dict(signal_profile_stats),
        "signal_profile_broad_stats": dict(signal_profile_broad_stats),
        "examples": examples,
    }


def main() -> None:
    """脚本入口。"""
    parser = argparse.ArgumentParser(description="均线缺口族个案诊断")
    parser.add_argument("--label", default="random", help="random 或具体场景标签")
    parser.add_argument(
        "--cache-dir",
        default=str(ROOT / "data" / "history" / "hf_parquet"),
        help="历史数据目录",
    )
    parser.add_argument("--output", required=True, help="输出 JSON 路径")
    args = parser.parse_args()

    scenarios = _scenario_list(args.label)
    detector = StrategyDetector()
    results = [_scan_scenario(detector, scenario, args.cache_dir) for scenario in scenarios]

    payload = {
        "label": args.label,
        "results": results,
    }
    output = Path(args.output)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
