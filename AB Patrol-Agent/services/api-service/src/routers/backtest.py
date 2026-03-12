"""
回测 API。

直接调用当前权威回测链：
- `libs.backtest.runner.BacktestRunner`
- 真实 `pa_engine` + Brooks 路由

不再走旧 `tools/backtest/backtest_tool.py`，避免继续输出旧评分体系结果。
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["backtest"])

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402


def _normalize_fee_rate(fee_percent: float) -> float:
    """把用户输入的百分比手续费转换成小数费率。"""
    return max(0.0, float(fee_percent or 0.0) / 100.0)


def _result_payload(result) -> dict[str, Any]:
    """统一把 BacktestResult 转成可直接返回的 JSON。"""
    data = json.loads(result.to_json())
    summary = data.get("summary", {})
    return {
        "symbol": data.get("symbol"),
        "threshold": data.get("threshold"),
        "days": data.get("days"),
        "summary": summary,
        "signals": data.get("signals", {}),
        "by_strategy": data.get("by_strategy", {}),
        "by_background": data.get("by_background", {}),
        "by_direction": data.get("by_direction", {}),
        "by_exit_reason": data.get("by_exit_reason", {}),
        "trades": data.get("trades", []),
    }


def _run_single_backtest(config: BacktestConfig) -> dict[str, Any]:
    """同步执行单次回测。"""
    result = BacktestRunner(config).run()
    return _result_payload(result)


class BacktestRequest(BaseModel):
    """单品种回测请求。"""

    symbol: str = Field(default="BTCUSDT", description="交易对")
    timeframe: str = Field(default="5m", description="K 线周期: 5m/15m/30m/1h")
    days: int | None = Field(default=30, description="回测天数")
    start: str | None = Field(default=None, description="开始日期 YYYY-MM-DD")
    end: str | None = Field(default=None, description="结束日期 YYYY-MM-DD")
    threshold: int = Field(default=80, description="全局 signal_threshold")
    capital: float = Field(default=10000.0, description="初始资金")
    fee: float = Field(default=0.08, description="手续费百分比（round-trip）")
    management_profile: str = Field(default="brooks_pdf", description="管理模板")
    strategy_profile: str = Field(default="", description="策略配置档")
    verbose: bool = Field(default=False, description="是否输出详细日志")


class MultiBacktestRequest(BaseModel):
    """多品种多周期回测请求。"""

    symbols: list[str] = Field(
        default=["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
        description="交易对列表",
    )
    timeframes: list[str] = Field(
        default=["5m", "15m"],
        description="周期列表",
    )
    days: int = Field(default=30, description="回测天数")
    start: str | None = Field(default=None, description="开始日期 YYYY-MM-DD")
    end: str | None = Field(default=None, description="结束日期 YYYY-MM-DD")
    threshold: int = Field(default=80, description="全局 signal_threshold")
    capital: float = Field(default=10000.0, description="初始资金")
    fee: float = Field(default=0.08, description="手续费百分比（round-trip）")
    management_profile: str = Field(default="brooks_pdf", description="管理模板")
    strategy_profile: str = Field(default="", description="策略配置档")


@router.post("/backtest/run")
async def run_backtest(req: BacktestRequest):
    """运行单品种回测。"""
    config = BacktestConfig(
        symbols=[req.symbol.upper()],
        timeframes=[req.timeframe],
        days=req.days or 0,
        start_date=req.start,
        end_date=req.end,
        threshold=req.threshold,
        fee_rate=_normalize_fee_rate(req.fee),
        initial_capital=req.capital,
        management_profile=req.management_profile or "brooks_pdf",
        strategy_profile=req.strategy_profile or "",
        verbose=req.verbose,
    )
    data = await asyncio.to_thread(_run_single_backtest, config)
    return {"success": True, "engine": "libs.backtest.runner", "data": data}


@router.get("/backtest/quick")
async def quick_backtest(
    symbol: str = Query("BTCUSDT", description="交易对"),
    timeframe: str = Query("5m", description="周期"),
    days: int = Query(14, description="天数"),
    threshold: int = Query(80, description="阈值"),
):
    """快速回测。"""
    config = BacktestConfig(
        symbols=[symbol.upper()],
        timeframes=[timeframe],
        days=days,
        threshold=threshold,
        fee_rate=_normalize_fee_rate(0.08),
        initial_capital=10000.0,
        management_profile="brooks_pdf",
    )
    data = await asyncio.to_thread(_run_single_backtest, config)
    return {"success": True, "engine": "libs.backtest.runner", "data": data}


@router.post("/backtest/matrix")
async def matrix_backtest(req: MultiBacktestRequest):
    """多品种多周期矩阵回测。"""
    results: dict[str, Any] = {}

    for symbol in req.symbols:
        normalized_symbol = str(symbol or "").upper()
        for timeframe in req.timeframes:
            key = f"{normalized_symbol}_{timeframe}"
            config = BacktestConfig(
                symbols=[normalized_symbol],
                timeframes=[timeframe],
                days=req.days,
                start_date=req.start,
                end_date=req.end,
                threshold=req.threshold,
                fee_rate=_normalize_fee_rate(req.fee),
                initial_capital=req.capital,
                management_profile=req.management_profile or "brooks_pdf",
                strategy_profile=req.strategy_profile or "",
            )
            try:
                results[key] = await asyncio.to_thread(_run_single_backtest, config)
            except Exception as exc:
                logger.error("矩阵回测失败 %s: %s", key, exc, exc_info=True)
                results[key] = {"error": str(exc)}

    summary: dict[str, Any] = {}
    for key, payload in results.items():
        if payload.get("error"):
            continue
        data = payload.get("summary", {})
        summary[key] = {
            "trades": data.get("total_trades", 0),
            "win_rate": data.get("win_rate", 0),
            "profit_factor": data.get("profit_factor", 0),
            "account_return_pct": data.get("account_return_pct", 0),
            "account_max_drawdown": data.get("account_max_drawdown", 0),
        }

    return {
        "success": True,
        "engine": "libs.backtest.runner",
        "summary": summary,
        "details": results,
    }


@router.get("/backtest/strategies")
async def list_strategies():
    """列出当前回测链与 Brooks playbook。"""
    return {
        "engine": "libs.backtest.runner",
        "architecture": {
            "signal_source": "真实 pa_engine",
            "routing": "Brooks state-first + playbook route",
            "execution": "SimExchange",
            "legacy_tool_removed_from_api": True,
        },
        "playbooks": {
            "趋势恢复": ["高1", "低1", "高2", "低2", "20均线缺口", "第一均线缺口", "突破回调"],
            "区间反做": ["看衰突破", "第二腿陷阱", "双重顶", "双重底", "楔形顶", "楔形底", "头肩顶MTR", "头肩底MTR"],
            "突破追随": ["收线追进", "ii突破", "ioi突破", "iii突破", "HOY突破", "LOY突破"],
        },
        "defaults": {
            "timeframe": "5m",
            "threshold": 80,
            "capital": 10000.0,
            "fee_percent": 0.08,
            "management_profile": "brooks_pdf",
        },
        "notes": [
            "当前 API 已不再调用旧 backtest_tool.py。",
            "threshold 现在表示真实引擎的全局 signal_threshold 覆盖，而不是第二套评分门槛。",
            "矩阵结果请优先关注胜率、日均交易数、盈利因子、账户收益和账户回撤。",
        ],
    }
