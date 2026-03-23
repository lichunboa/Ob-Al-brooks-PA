"""
今日实盘 vs 回测对照工具。

用途：
1. 读取当天实盘 execution journal。
2. 使用本地 parquet 按当前 live 白名单回测同一天行情。
3. 生成 JSON 与 Markdown 中文报告。
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
from collections import Counter, defaultdict
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from _bootstrap import ensure_agent_root_on_path

PROJECT_ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner
from libs.backtest.strategy_filters import DEFAULT_LIVE_STRATEGY_SCOPE

DATA_DIR = PROJECT_ROOT / "data"
JOURNAL_FILE = DATA_DIR / "pa_trader" / "journal" / "execution_log.jsonl"
RUNTIME_STATE_FILE = DATA_DIR / "pa_trader" / "state" / "runtime_state.json"
REPORT_DIR = DATA_DIR / "reports" / "backtest"
CACHE_ROOTS = [
    DATA_DIR / "history" / "cache",
    DATA_DIR / "backtest_cache",
]


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_symbol_from_parquet(path: Path, date_text: str) -> str:
    suffix = f"_{date_text}_1m.parquet"
    name = path.name
    if name.endswith(suffix):
        return name[: -len(suffix)]
    return path.stem


def _load_runtime_symbols() -> dict[str, dict[str, Any]]:
    if not RUNTIME_STATE_FILE.exists():
        return {}
    payload = _read_json(RUNTIME_STATE_FILE)
    return payload.get("symbols", {}) or {}


def _load_live_rows(date_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not JOURNAL_FILE.exists():
        return rows
    with JOURNAL_FILE.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            logged_at = str(item.get("logged_at", ""))
            if logged_at.startswith(date_text):
                rows.append(item)
    return rows


def _discover_live_dates() -> list[str]:
    dates: set[str] = set()
    if JOURNAL_FILE.exists():
        with JOURNAL_FILE.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                logged_at = str(item.get("logged_at", "")).strip()
                if len(logged_at) >= 10:
                    dates.add(logged_at[:10])
    return sorted(dates)


def _discover_cache_dates() -> list[str]:
    dates: set[str] = set()
    for cache_root in CACHE_ROOTS:
        if not cache_root.exists():
            continue
        for path in cache_root.glob("live_today_*"):
            suffix = path.name.replace("live_today_", "").strip()
            if len(suffix) == 8 and suffix.isdigit():
                dates.add(f"{suffix[:4]}-{suffix[4:6]}-{suffix[6:]}")
    return sorted(dates)


def _resolve_report_date(requested_date: str) -> str:
    live_dates = _discover_live_dates()
    cache_dates = _discover_cache_dates()
    if requested_date in live_dates or requested_date in cache_dates:
        return requested_date
    candidates = sorted(set(live_dates) | set(cache_dates))
    if candidates:
        return candidates[-1]
    return requested_date


def _extract_error_message(item: dict[str, Any]) -> str | None:
    response = item.get("response")
    if isinstance(response, dict):
        message = response.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    message = item.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return None


def _top_failure_reasons(rows: list[dict[str, Any]]) -> list[list[Any]]:
    counter: Counter[str] = Counter()
    for item in rows:
        status = str(item.get("status", "")).upper()
        if status in {"FAILED", "BLOCKED", "UNKNOWN", "SIZE_FAILED", "LIVE_ENTRY_CONFLICT", "SKIPPED"}:
            reason = _extract_error_message(item)
            if reason:
                counter[reason] += 1
    return [[reason, count] for reason, count in counter.most_common(5)]


def _executed_like_count(status_counter: Counter[str]) -> int:
    executed_statuses = {
        "PLACED",
        "open",
        "OPEN_RECONCILED",
        "PLACED_RECONCILED",
        "closed",
        "PARTIAL_CLOSED",
        "MODIFIED",
    }
    total = 0
    for status, count in status_counter.items():
        if status in executed_statuses:
            total += count
    return total


def _normalize_trade(trade: Any) -> dict[str, Any]:
    if isinstance(trade, dict):
        return trade
    if is_dataclass(trade):
        return asdict(trade)
    return dict(trade)


def _run_backtest_for_symbol(symbol: str, parquet_path: Path, date_text: str) -> dict[str, Any]:
    parquet_frame = pd.read_parquet(parquet_path, columns=["timestamp"])
    parquet_frame["timestamp"] = pd.to_datetime(parquet_frame["timestamp"], utc=True, errors="coerce").dt.tz_localize(None)
    parquet_frame = parquet_frame.dropna(subset=["timestamp"]).sort_values("timestamp")
    coverage_start = parquet_frame["timestamp"].iloc[0] if not parquet_frame.empty else None
    coverage_end = parquet_frame["timestamp"].iloc[-1] if not parquet_frame.empty else None
    end_date = (datetime.strptime(date_text, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    cfg = BacktestConfig(
        symbols=[symbol],
        timeframes=["5m", "15m", "1h"],
        start_date=date_text,
        end_date=end_date,
        threshold=80,
        initial_capital=10000.0,
        fee_rate=0.0008,
        management_profile="brooks_pdf",
        strategy_whitelist=list(DEFAULT_LIVE_STRATEGY_SCOPE),
        parquet_path=str(parquet_path),
    )
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        result = BacktestRunner(cfg).run()
    trades = [_normalize_trade(trade) for trade in result.trades]
    top_strategies = []
    for name, stats in sorted(
        result.by_strategy.items(),
        key=lambda item: (item[1].get("trades", 0), item[1].get("pnl", 0.0)),
        reverse=True,
    ):
        top_strategies.append(
            {
                "strategy": name,
                "trades": stats.get("trades", 0),
                "win_rate": stats.get("win_rate", 0.0),
                "profit_factor": stats.get("profit_factor", 0.0),
                "pnl": stats.get("pnl", 0.0),
            }
        )
    return {
        "symbol": symbol,
        "total_trades": result.total_trades,
        "win_rate": result.win_rate,
        "profit_factor": result.profit_factor,
        "account_return_pct": result.account_return_pct,
        "account_max_drawdown": result.account_max_drawdown,
        "signals_generated": result.signals_generated,
        "signals_passed": result.signals_passed,
        "signals_blocked_strategy": result.signals_blocked_strategy,
        "signals_blocked_route": result.signals_blocked_route,
        "signals_blocked_score": result.signals_blocked_score,
        "signals_blocked_bg": result.signals_blocked_bg,
        "coverage_start": coverage_start.isoformat() if coverage_start is not None else "",
        "coverage_end": coverage_end.isoformat() if coverage_end is not None else "",
        "top_strategies": top_strategies[:5],
        "sample_trades": trades[:5],
    }


def _diagnose_symbol(symbol: str, live_info: dict[str, Any], backtest_info: dict[str, Any] | None) -> list[str]:
    notes: list[str] = []
    status_counts = Counter(live_info.get("status_counts", {}))
    executed_like = live_info.get("executed_like", 0)
    conflicts = status_counts.get("LIVE_ENTRY_CONFLICT", 0)
    failed_like = sum(
        status_counts.get(name, 0)
        for name in ["FAILED", "BLOCKED", "UNKNOWN", "SIZE_FAILED", "SKIPPED", "NOT_FOUND"]
    )
    if backtest_info is None:
        notes.append("缺少本地 parquet，当前无法做同日回测对照。")
        return notes
    if backtest_info["total_trades"] > 0 and executed_like == 0:
        notes.append("回测今天有交易，但实盘没有真正落地，优先怀疑执行链或风控门控。")
    if backtest_info["profit_factor"] > 1.0 and failed_like > 0:
        notes.append("回测口径为正，但实盘存在明显执行失败，亏损更可能来自执行层而不是策略本身。")
    if backtest_info["total_trades"] == 0 and executed_like > 0:
        notes.append("回测今天未给出同类成交，但实盘有执行记录，存在实盘触发漂移风险。")
    if conflicts > 0:
        notes.append("同品种同策略冲突较多，部分亏损/少单来自持仓管理链拦截，而不是新信号质量。")
    for reason, count in live_info.get("top_failure_reasons", []):
        if "precision" in reason or "minimum amount" in reason:
            notes.append("存在最小下单精度/最小数量问题，执行层会把本可盈利的单打成失败。")
            break
        if "Reach max stop order limit" in reason:
            notes.append("存在交易所止损单数量上限，保护单堆积会扭曲实盘胜率与频率。")
            break
        if "timed out" in reason:
            notes.append("存在执行服务超时，实盘链路会丢单或延迟，和回测无法一一对齐。")
            break
    if not notes:
        notes.append("当前品种未见明显执行异常，回测与实盘更可能是市场内生波动差异。")
    return notes


def _build_live_summary(rows: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[list[Any]]]:
    by_symbol: dict[str, list[dict[str, Any]]] = defaultdict(list)
    global_failures: Counter[str] = Counter()
    for item in rows:
        symbol = str(item.get("symbol", ""))
        by_symbol[symbol].append(item)
        reason = _extract_error_message(item)
        if reason and str(item.get("status", "")).upper() in {
            "FAILED",
            "BLOCKED",
            "UNKNOWN",
            "SIZE_FAILED",
            "LIVE_ENTRY_CONFLICT",
            "SKIPPED",
        }:
            global_failures[reason] += 1
    summary: dict[str, dict[str, Any]] = {}
    for symbol, items in by_symbol.items():
        status_counts = Counter(str(item.get("status", "")) for item in items)
        summary[symbol] = {
            "events_total": len(items),
            "status_counts": dict(status_counts),
            "executed_like": _executed_like_count(status_counts),
            "top_failure_reasons": _top_failure_reasons(items),
        }
    return summary, [[reason, count] for reason, count in global_failures.most_common(10)]


def _render_markdown(report: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# 今日实盘 vs 回测对照（{report['date']}）")
    lines.append("")
    lines.append(f"- 生成时间: {report['generated_at']}")
    lines.append(f"- live 白名单: {', '.join(report['live_strategy_scope'])}")
    lines.append(f"- 本地 parquet 目录: `{report['parquet_dir']}`")
    lines.append("")
    lines.append("## 关键结论")
    for item in report["summary"]["headline_findings"]:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## 全局执行异常 Top")
    for reason, count in report["summary"]["global_failure_reasons"]:
        lines.append(f"- `{reason}` × {count}")
    if not report["summary"]["global_failure_reasons"]:
        lines.append("- 今日未发现显著全局执行失败。")
    lines.append("")
    lines.append("## 品种摘要")
    for symbol in report["symbols"]:
        lines.append("")
        lines.append(f"### {symbol['symbol']}")
        runtime = symbol.get("runtime", {})
        lines.append(
            f"- runtime: `{runtime.get('strategy') or '-'} / {runtime.get('status') or '-'} / {runtime.get('stage') or '-'} / {runtime.get('execution_mode') or '-'}`"
        )
        live = symbol["live"]
        lines.append(
            f"- live 今日事件: `{live['events_total']}`，状态分布: `{live['status_counts']}`"
        )
        backtest = symbol.get("backtest")
        if backtest:
            lines.append(
                f"- 回测今日: 交易 `{backtest['total_trades']}`，胜率 `{backtest['win_rate']:.2f}%`，PF `{backtest['profit_factor']:.2f}`，收益 `{backtest['account_return_pct']:.2f}%`"
            )
            if backtest.get("coverage_start") and backtest.get("coverage_end"):
                lines.append(
                    f"- 数据覆盖: `{backtest['coverage_start']}` ~ `{backtest['coverage_end']}`"
                )
            if backtest["top_strategies"]:
                top = backtest["top_strategies"][0]
                lines.append(
                    f"- 回测主策略: `{top['strategy']}`，交易 `{top['trades']}`，胜率 `{top['win_rate']:.2f}%`，PF `{top['profit_factor']:.2f}`"
                )
        else:
            lines.append("- 回测今日: 缺少本地 parquet，未生成对照。")
        if live["top_failure_reasons"]:
            lines.append(f"- 执行失败Top: `{live['top_failure_reasons']}`")
        for note in symbol["diagnosis"]:
            lines.append(f"- 诊断: {note}")
    return "\n".join(lines) + "\n"


def build_report(date_text: str) -> dict[str, Any]:
    runtime_symbols = _load_runtime_symbols()
    live_rows = _load_live_rows(date_text)
    live_summary, global_failures = _build_live_summary(live_rows)
    parquet_dir: Path | None = None
    parquet_map: dict[str, Path] = {}
    for cache_root in CACHE_ROOTS:
        candidate_dir = cache_root / f"live_today_{date_text.replace('-', '')}"
        if not candidate_dir.exists():
            continue
        parquet_dir = candidate_dir
        for path in sorted(candidate_dir.glob(f"*_{date_text}_1m.parquet")):
            symbol = _normalize_symbol_from_parquet(path, date_text)
            parquet_map[symbol] = path
        if parquet_map:
            break

    all_symbols = sorted(set(live_summary.keys()) | set(parquet_map.keys()) | set(runtime_symbols.keys()))
    symbol_reports: list[dict[str, Any]] = []
    positive_backtest = []
    execution_drag = []
    missing_data = []
    for symbol in all_symbols:
        runtime_info = runtime_symbols.get(symbol, {})
        live_info = live_summary.get(
            symbol,
            {"events_total": 0, "status_counts": {}, "executed_like": 0, "top_failure_reasons": []},
        )
        backtest_info = None
        if symbol in parquet_map:
            backtest_info = _run_backtest_for_symbol(symbol, parquet_map[symbol], date_text)
            if backtest_info["profit_factor"] > 1.0:
                positive_backtest.append(symbol)
        else:
            missing_data.append(symbol)
        diagnosis = _diagnose_symbol(symbol, live_info, backtest_info)
        if backtest_info and backtest_info["profit_factor"] > 1.0:
            status_counts = Counter(live_info["status_counts"])
            if sum(status_counts.get(name, 0) for name in ["FAILED", "BLOCKED", "UNKNOWN", "SIZE_FAILED"]) > 0:
                execution_drag.append(symbol)
        symbol_reports.append(
            {
                "symbol": symbol,
                "runtime": {
                    "strategy": runtime_info.get("strategy"),
                    "status": runtime_info.get("status"),
                    "stage": runtime_info.get("stage"),
                    "execution_mode": runtime_info.get("execution_mode"),
                    "strategy_family": runtime_info.get("strategy_family"),
                    "playbook_id": runtime_info.get("playbook_id"),
                },
                "live": live_info,
                "backtest": backtest_info,
                "diagnosis": diagnosis,
            }
        )

    headline_findings = [
        f"今日实盘 journal 共 `{len(live_rows)}` 条事件，不能直接等同于成交笔数；其中 `LOG_ONLY` 占比最高。",
        f"本地 parquet 可回测品种 `{len(parquet_map)}` 个，缺数品种 `{len(missing_data)}` 个。",
    ]
    if positive_backtest:
        headline_findings.append(
            f"回测今天 PF 大于 1 的品种有：{', '.join(positive_backtest)}。"
        )
    if execution_drag:
        headline_findings.append(
            f"这些品种回测不差但实盘被执行层拖累：{', '.join(execution_drag)}。"
        )
    if not execution_drag:
        headline_findings.append("当前没有发现明显“回测为正但实盘纯被执行链拖垮”的集中品种簇。")

    return {
        "date": date_text,
        "generated_at": datetime.now().astimezone().isoformat(),
        "live_strategy_scope": list(DEFAULT_LIVE_STRATEGY_SCOPE),
        "parquet_dir": str(parquet_dir) if parquet_dir is not None else "",
        "summary": {
            "live_rows": len(live_rows),
            "symbols_with_parquet": len(parquet_map),
            "symbols_missing_parquet": missing_data,
            "positive_backtest_symbols": positive_backtest,
            "execution_drag_symbols": execution_drag,
            "global_failure_reasons": global_failures,
            "headline_findings": headline_findings,
        },
        "symbols": symbol_reports,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="生成今日实盘 vs 回测对照报告")
    parser.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"), help="日期，格式 YYYY-MM-DD")
    args = parser.parse_args()
    resolved_date = _resolve_report_date(args.date)
    report = build_report(resolved_date)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORT_DIR / f"live_vs_backtest_today_{resolved_date.replace('-', '')}.json"
    md_path = REPORT_DIR / f"live_vs_backtest_today_{resolved_date.replace('-', '')}.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(_render_markdown(report), encoding="utf-8")
    print(f"JSON: {json_path}")
    print(f"MD: {md_path}")


if __name__ == "__main__":
    main()
