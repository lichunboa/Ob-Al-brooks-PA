#!/usr/bin/env python3
"""
拆解回测中的持仓管理链影响。

量化重点：
1. partial close 参与了多少笔；
2. trailing / 保护性移损最终影响了多少笔；
3. TP 出场与 premise failure 出场分别贡献了多少；
4. 当前回测里哪些管理链已经建模，哪些还只是部分镜像。
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402
from libs.backtest.strategy_filters import classify_strategy_family, normalize_management_style  # noqa: E402

PREMISE_EXIT_REASONS = {"PREMISE", "FAILED_FT", "WEAK_SCALP", "ZOMBIE"}


@dataclass
class AuditWindow:
    """单个审计时间窗口。"""

    label: str
    start: str
    end: str


def parse_csv(raw: str) -> list[str]:
    """解析逗号分隔参数。"""
    return [item.strip() for item in str(raw or "").split(",") if item.strip()]


def parse_windows(raw: str) -> list[AuditWindow]:
    """解析时间窗口列表。"""
    windows: list[AuditWindow] = []
    for index, item in enumerate(parse_csv(raw), start=1):
        if ":" not in item:
            raise ValueError(f"无效窗口定义: {item}")
        start, end = item.split(":", 1)
        datetime.fromisoformat(start.strip())
        datetime.fromisoformat(end.strip())
        windows.append(AuditWindow(label=f"W{index}", start=start.strip(), end=end.strip()))
    return windows


def new_component_bucket(name: str) -> dict[str, Any]:
    """初始化管理动作聚合桶。"""
    return {
        "name": name,
        "trades": 0,
        "wins": 0,
        "losses": 0,
        "gross_profit": 0.0,
        "gross_loss": 0.0,
        "pnl_sum": 0.0,
        "r_multiple_sum": 0.0,
    }


def update_component_bucket(bucket: dict[str, Any], trade: dict[str, Any]) -> None:
    """用单笔交易更新管理动作聚合桶。"""
    bucket["trades"] += 1
    pnl_pct = float(trade.get("pnl_pct", 0.0) or 0.0)
    bucket["pnl_sum"] += pnl_pct
    bucket["r_multiple_sum"] += float(trade.get("r_multiple", 0.0) or 0.0)
    result = str(trade.get("result") or "")
    if result == "WIN":
        bucket["wins"] += 1
        bucket["gross_profit"] += max(0.0, pnl_pct)
    elif result == "LOSS":
        bucket["losses"] += 1
        bucket["gross_loss"] += abs(min(0.0, pnl_pct))


def finalize_component_bucket(bucket: dict[str, Any], total_trades: int) -> dict[str, Any]:
    """整理输出格式。"""
    trades = int(bucket["trades"] or 0)
    gross_profit = float(bucket["gross_profit"] or 0.0)
    gross_loss = float(bucket["gross_loss"] or 0.0)
    return {
        "name": bucket["name"],
        "trades": trades,
        "share_pct": trades / total_trades * 100 if total_trades else 0.0,
        "win_rate": (float(bucket["wins"]) / trades * 100) if trades else 0.0,
        "profit_factor": (
            gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
        ),
        "avg_pnl_pct": (float(bucket["pnl_sum"]) / trades) if trades else 0.0,
        "avg_r_multiple": (float(bucket["r_multiple_sum"]) / trades) if trades else 0.0,
    }


def new_count_bucket(name: str) -> dict[str, Any]:
    """初始化按家族/模板聚合的计数桶。"""
    return {
        "name": name,
        "trades": 0,
        "partial_close_involved": 0,
        "trailing_stop_exit": 0,
        "breakeven_stop_exit": 0,
        "take_profit_exit": 0,
        "premise_failure_exit": 0,
        "plain_stop_loss_exit": 0,
        "protective_scalp_involved": 0,
        "reentry_trade": 0,
        "scale_in_trade": 0,
    }


def is_partial_close_involved(trade: dict[str, Any]) -> bool:
    """是否发生过分批止盈/减仓。"""
    return any(
        (
            bool(trade.get("tp1_done", False)),
            bool(trade.get("tp2_done", False)),
            int(trade.get("partial_close_count", 0) or 0) > 0,
            int(trade.get("premise_reduce_count", 0) or 0) > 0,
        )
    )


def is_trailing_stop_exit(trade: dict[str, Any]) -> bool:
    """是否属于被移损后的止损出场。"""
    if str(trade.get("exit_reason") or "") != "SL":
        return False
    initial_stop = float(trade.get("initial_stop_loss", 0.0) or 0.0)
    final_stop = float(trade.get("stop_loss", 0.0) or 0.0)
    return abs(final_stop - initial_stop) > 1e-9 or int(trade.get("stop_adjust_count", 0) or 0) > 0


def is_take_profit_exit(trade: dict[str, Any]) -> bool:
    """是否由最终止盈单结束。"""
    return str(trade.get("exit_reason") or "") == "TP"


def is_premise_failure_exit(trade: dict[str, Any]) -> bool:
    """是否由 premise / 弱跟进链主动退出。"""
    return str(trade.get("exit_reason") or "") in PREMISE_EXIT_REASONS


def is_breakeven_stop_exit(trade: dict[str, Any]) -> bool:
    """是否属于保本/保护性止损被打。"""
    if str(trade.get("exit_reason") or "") != "SL":
        return False
    entry_price = float(trade.get("entry_price", 0.0) or 0.0)
    final_stop = float(trade.get("stop_loss", 0.0) or 0.0)
    if entry_price <= 0 or final_stop <= 0:
        return False
    return abs(final_stop - entry_price) / entry_price <= 0.0015 or (
        (str(trade.get("direction") or "") == "BUY" and final_stop >= entry_price)
        or (str(trade.get("direction") or "") == "SELL" and final_stop <= entry_price)
    )


def is_protective_scalp_involved(trade: dict[str, Any]) -> bool:
    """是否经历过从 swing/reversal 降级为保护性 scalp。"""
    return str(trade.get("management_state") or "") == "protective_scalp"


def main() -> None:
    parser = argparse.ArgumentParser(description="拆解回测中的持仓管理链影响")
    parser.add_argument("--symbols", default="BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT", help="币种，逗号分隔")
    parser.add_argument("--timeframes", default="5m,15m,1h", help="周期，逗号分隔")
    parser.add_argument(
        "--windows",
        required=True,
        help="窗口列表，格式 2022-01-01:2022-02-01,2023-01-01:2023-02-01",
    )
    parser.add_argument(
        "--management-profile",
        default="brooks_pdf",
        help="回测管理模板，默认使用 Brooks 管理语义",
    )
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "history" / "hf_parquet"), help="历史数据目录")
    parser.add_argument("--output", default="", help="输出 JSON 路径")
    args = parser.parse_args()

    symbols = parse_csv(args.symbols)
    timeframes = parse_csv(args.timeframes)
    windows = parse_windows(args.windows)

    component_buckets = {
        "partial_close_involved": new_component_bucket("partial_close_involved"),
        "trailing_stop_exit": new_component_bucket("trailing_stop_exit"),
        "breakeven_stop_exit": new_component_bucket("breakeven_stop_exit"),
        "take_profit_exit": new_component_bucket("take_profit_exit"),
        "premise_failure_exit": new_component_bucket("premise_failure_exit"),
        "plain_stop_loss_exit": new_component_bucket("plain_stop_loss_exit"),
        "protective_scalp_involved": new_component_bucket("protective_scalp_involved"),
        "reentry_trade": new_component_bucket("reentry_trade"),
        "scale_in_trade": new_component_bucket("scale_in_trade"),
    }
    by_strategy: dict[str, dict[str, int]] = {}
    by_family: dict[str, dict[str, int]] = {}
    by_management_style: dict[str, dict[str, int]] = {}
    by_exit_reason: dict[str, int] = {}
    sample_rows: list[dict[str, Any]] = []
    total_trades = 0

    for window in windows:
        cfg = BacktestConfig(
            symbols=symbols,
            timeframes=timeframes,
            start_date=window.start,
            end_date=window.end,
            days=max(1, (datetime.fromisoformat(window.end) - datetime.fromisoformat(window.start)).days),
            threshold=0,
            cache_dir=args.cache_dir,
            management_profile=args.management_profile,
        )
        result = BacktestRunner(cfg).run()
        sample_rows.append(
            {
                "window": window.label,
                "symbols": symbols,
                "timeframes": timeframes,
                "start": window.start,
                "end": window.end,
                "total_trades": result.total_trades,
                "profit_factor": result.profit_factor,
                "by_exit_reason": result.by_exit_reason,
            }
        )

        for trade in result.trades:
            total_trades += 1
            strategy = str(trade.get("strategy") or "UNKNOWN")
            family = classify_strategy_family(strategy)
            management_style = normalize_management_style(str(trade.get("management_style") or "default"))
            exit_reason = str(trade.get("exit_reason") or "UNKNOWN")
            by_exit_reason[exit_reason] = int(by_exit_reason.get(exit_reason, 0) or 0) + 1
            stats = by_strategy.setdefault(strategy, new_count_bucket(strategy))
            family_stats = by_family.setdefault(family, new_count_bucket(family))
            style_stats = by_management_style.setdefault(management_style, new_count_bucket(management_style))
            stats["trades"] += 1
            family_stats["trades"] += 1
            style_stats["trades"] += 1

            if is_partial_close_involved(trade):
                update_component_bucket(component_buckets["partial_close_involved"], trade)
                stats["partial_close_involved"] += 1
                family_stats["partial_close_involved"] += 1
                style_stats["partial_close_involved"] += 1
            if is_trailing_stop_exit(trade):
                update_component_bucket(component_buckets["trailing_stop_exit"], trade)
                stats["trailing_stop_exit"] += 1
                family_stats["trailing_stop_exit"] += 1
                style_stats["trailing_stop_exit"] += 1
            if is_breakeven_stop_exit(trade):
                update_component_bucket(component_buckets["breakeven_stop_exit"], trade)
                stats["breakeven_stop_exit"] += 1
                family_stats["breakeven_stop_exit"] += 1
                style_stats["breakeven_stop_exit"] += 1
            if is_take_profit_exit(trade):
                update_component_bucket(component_buckets["take_profit_exit"], trade)
                stats["take_profit_exit"] += 1
                family_stats["take_profit_exit"] += 1
                style_stats["take_profit_exit"] += 1
            if is_premise_failure_exit(trade):
                update_component_bucket(component_buckets["premise_failure_exit"], trade)
                stats["premise_failure_exit"] += 1
                family_stats["premise_failure_exit"] += 1
                style_stats["premise_failure_exit"] += 1
            if exit_reason == "SL" and not is_trailing_stop_exit(trade):
                update_component_bucket(component_buckets["plain_stop_loss_exit"], trade)
                stats["plain_stop_loss_exit"] += 1
                family_stats["plain_stop_loss_exit"] += 1
                style_stats["plain_stop_loss_exit"] += 1
            if is_protective_scalp_involved(trade):
                update_component_bucket(component_buckets["protective_scalp_involved"], trade)
                stats["protective_scalp_involved"] += 1
                family_stats["protective_scalp_involved"] += 1
                style_stats["protective_scalp_involved"] += 1
            if int(trade.get("reentry_attempt", 0) or 0) > 0:
                update_component_bucket(component_buckets["reentry_trade"], trade)
                stats["reentry_trade"] += 1
                family_stats["reentry_trade"] += 1
                style_stats["reentry_trade"] += 1
            if int(trade.get("scale_legs", 1) or 1) > 1:
                update_component_bucket(component_buckets["scale_in_trade"], trade)
                stats["scale_in_trade"] += 1
                family_stats["scale_in_trade"] += 1
                style_stats["scale_in_trade"] += 1

    payload = {
        "windows": [asdict(window) for window in windows],
        "samples": sample_rows,
        "model_notes": {
            "partial_close": "已建模，来自 Brooks 管理模板和 premise 减仓。",
            "trailing_stop": "已建模，使用保护性移损和余仓 trailing。",
            "premise_failure": "已建模，包含 PREMISЕ / FAILED_FT / WEAK_SCALP / ZOMBIE。",
            "take_profit": "当前回测能统计 TP 出场，但尚未完整镜像 runtime 的动态 MODIFY_TAKE_PROFIT 链。",
            "protective_scalp": "已建模，用于把 premise 变化或弱跟进降级成保护性 scalp。",
            "reentry_and_add_on": "已建模，使用 reentry_attempt 与 scale_legs 统计。",
        },
        "overall": {
            key: finalize_component_bucket(bucket, total_trades)
            for key, bucket in component_buckets.items()
        },
        "by_strategy": [
            {
                "strategy": strategy,
                **values,
            }
            for strategy, values in sorted(by_strategy.items(), key=lambda item: (-item[1]["trades"], item[0]))
        ],
        "by_family": [
            {
                "family": family,
                **values,
            }
            for family, values in sorted(by_family.items(), key=lambda item: (-item[1]["trades"], item[0]))
        ],
        "by_management_style": [
            {
                "management_style": style,
                **values,
            }
            for style, values in sorted(by_management_style.items(), key=lambda item: (-item[1]["trades"], item[0]))
        ],
        "by_exit_reason": dict(sorted(by_exit_reason.items(), key=lambda item: (-int(item[1]), item[0]))),
        "total_trades": total_trades,
    }

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"已写出: {output_path}")
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
