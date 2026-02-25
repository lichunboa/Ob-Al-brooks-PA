"""
回测 API — Agent 自我进化接口 V5.0

让 PA Agent 通过 HTTP 调用回测，验证交易策略并内化学习。

端点:
  POST /api/backtest/run     — 运行回测
  GET  /api/backtest/quick   — 快速回测（默认参数）
  GET  /api/backtest/strategies — 查看可用策略列表

用法 (Agent curl):
  curl -X POST http://localhost:8088/api/backtest/run \
    -H "Content-Type: application/json" \
    -d '{"symbol":"BTCUSDT","timeframe":"30m","days":365}'
"""

import asyncio
import json
import logging
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["backtest"])

# backtest_tool.py 路径
BACKTEST_SCRIPT = Path(__file__).parent.parent.parent.parent.parent / "scripts" / "backtest_tool.py"
# HuggingFace 缓存目录
CACHE_DIR = Path.home() / "Desktop" / "Obsidian" / "Al-brooks-PA" / "AB Console-Backend" / "data"


class BacktestRequest(BaseModel):
    """回测请求参数"""
    symbol: str = Field(default="BTCUSDT", description="交易对")
    timeframe: str = Field(default="30m", description="K线周期: 5m/15m/30m/1h")
    days: Optional[int] = Field(default=365, description="回测天数")
    start: Optional[str] = Field(default=None, description="开始日期 YYYY-MM-DD")
    end: Optional[str] = Field(default=None, description="结束日期 YYYY-MM-DD")
    threshold: int = Field(default=80, description="评分阈值 (>=此分数才开仓)")
    capital: float = Field(default=500.0, description="初始资金 USDT")
    risk: float = Field(default=1.0, description="单笔风险%")
    fee: float = Field(default=0.08, description="手续费% (round-trip)")
    sell_only: bool = Field(default=False, description="只做空")
    market_state: bool = Field(default=True, description="启用市场状态评分")
    multi_tf: bool = Field(default=False, description="多周期对比")


class MultiBacktestRequest(BaseModel):
    """多品种多周期回测请求"""
    symbols: list[str] = Field(
        default=["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
        description="交易对列表"
    )
    timeframes: list[str] = Field(
        default=["15m", "30m", "1h"],
        description="周期列表"
    )
    days: int = Field(default=365, description="回测天数")
    threshold: int = Field(default=80, description="评分阈值")
    capital: float = Field(default=500.0, description="初始资金")
    fee: float = Field(default=0.08, description="手续费%")
    market_state: bool = Field(default=True, description="启用市场状态评分")


async def _run_backtest(args: list[str]) -> dict:
    """执行 backtest_tool.py 并返回 JSON 结果"""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        output_path = tmp.name

    cmd = [
        "python3", str(BACKTEST_SCRIPT),
        "--output", output_path,
        *args,
    ]

    # 如果缓存目录存在，使用本地缓存
    if CACHE_DIR.exists():
        cmd.extend(["--cache-dir", str(CACHE_DIR)])

    logger.info(f"[Backtest API] 执行: {' '.join(cmd)}")

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(BACKTEST_SCRIPT.parent.parent),  # AB Console-Backend/
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=300,  # 5 分钟超时
        )

        if proc.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="replace")[-500:]
            return {
                "success": False,
                "error": f"回测执行失败 (exit {proc.returncode}): {error_msg}",
                "stdout": stdout.decode("utf-8", errors="replace")[-1000:],
            }

        # 读取 JSON 结果
        output_file = Path(output_path)
        if output_file.exists() and output_file.stat().st_size > 0:
            with open(output_file, "r") as f:
                result = json.load(f)
            output_file.unlink()
            return {"success": True, "data": result}
        else:
            # 从 stdout 提取关键信息
            return {
                "success": True,
                "data": {},
                "stdout": stdout.decode("utf-8", errors="replace")[-2000:],
            }

    except asyncio.TimeoutError:
        return {"success": False, "error": "回测超时 (>5分钟)"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        Path(output_path).unlink(missing_ok=True)


@router.post("/backtest/run")
async def run_backtest(req: BacktestRequest):
    """运行单品种回测

    Agent 用法:
    ```
    curl -X POST http://localhost:8088/api/backtest/run \
      -H "Content-Type: application/json" \
      -d '{"symbol":"BTCUSDT","timeframe":"30m","days":365,"threshold":80}'
    ```

    返回: 胜率、盈利因子、交易数、总PnL、最大回撤、per-strategy 分解
    """
    args = [
        "--symbol", req.symbol,
        "--timeframe", req.timeframe,
        "--threshold", str(req.threshold),
        "--capital", str(req.capital),
        "--risk", str(req.risk),
    ]

    if req.days:
        args.extend(["--days", str(req.days)])
    if req.start:
        args.extend(["--start", req.start])
    if req.end:
        args.extend(["--end", req.end])
    if req.fee > 0:
        args.extend(["--fee", str(req.fee)])
    if req.sell_only:
        args.append("--sell-only")
    if req.market_state:
        args.append("--market-state")
    if req.multi_tf:
        args.append("--multi-tf")

    result = await _run_backtest(args)
    return result


@router.get("/backtest/quick")
async def quick_backtest(
    symbol: str = Query("BTCUSDT", description="交易对"),
    timeframe: str = Query("30m", description="周期"),
    days: int = Query(180, description="天数"),
    threshold: int = Query(80, description="阈值"),
):
    """快速回测（GET 请求，适合简单查询）

    Agent 用法:
    ```
    curl "http://localhost:8088/api/backtest/quick?symbol=BTCUSDT&timeframe=30m&days=180"
    ```
    """
    args = [
        "--symbol", symbol,
        "--timeframe", timeframe,
        "--days", str(days),
        "--threshold", str(threshold),
        "--fee", "0.08",
        "--market-state",
    ]
    result = await _run_backtest(args)
    return result


@router.post("/backtest/matrix")
async def matrix_backtest(req: MultiBacktestRequest):
    """多品种多周期矩阵回测

    Agent 用法:
    ```
    curl -X POST http://localhost:8088/api/backtest/matrix \
      -H "Content-Type: application/json" \
      -d '{"symbols":["BTCUSDT","ETHUSDT"],"timeframes":["15m","30m","1h"],"days":365}'
    ```

    返回: 每个品种×周期组合的回测结果矩阵
    """
    results = {}

    for symbol in req.symbols:
        for tf in req.timeframes:
            key = f"{symbol}_{tf}"
            args = [
                "--symbol", symbol,
                "--timeframe", tf,
                "--days", str(req.days),
                "--threshold", str(req.threshold),
                "--capital", str(req.capital),
                "--fee", str(req.fee),
            ]
            if req.market_state:
                args.append("--market-state")

            result = await _run_backtest(args)
            results[key] = result

    # 生成汇总
    summary = {}
    for key, r in results.items():
        if r.get("success") and r.get("data"):
            data = r["data"]
            # data 可能是嵌套的 {symbol: stats}
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, dict) and "win_rate" in v:
                        summary[key] = {
                            "trades": v.get("total", 0),
                            "win_rate": v.get("win_rate", 0),
                            "pf": v.get("profit_factor", 0),
                            "total_pnl": v.get("total_pnl", 0),
                            "max_dd": v.get("max_drawdown", 0),
                        }

    return {
        "success": True,
        "summary": summary,
        "details": results,
    }


@router.get("/backtest/strategies")
async def list_strategies():
    """列出回测支持的策略和参数

    Agent 用法: curl http://localhost:8088/api/backtest/strategies
    """
    return {
        "strategies": {
            "backtest_tool": {
                "description": "PA评分系统回测 (V12g)",
                "parameters": {
                    "symbol": "BTCUSDT/ETHUSDT/SOLUSDT/BNBUSDT/XRPUSDT/DOGEUSDT",
                    "timeframe": "5m/15m/30m/1h",
                    "threshold": "60-95 (默认80, 回测最优)",
                    "capital": "初始资金 USDT (默认500)",
                    "fee": "手续费% round-trip (默认0.08)",
                    "market_state": "启用市场状态评分修正",
                    "sell_only": "只做空",
                    "days": "回测天数 (默认365)",
                },
                "verified_results": {
                    "BTC_30m": "牛市+112.8%, 熊市+36.2%, PF 3.87 (SCALP)",
                    "BTC_15m": "$939, WR 58.3%",
                    "ETH_15m": "+182.6%",
                    "BNB_15m": "$1036",
                },
            },
        },
        "evolution_tips": {
            "step_1": "先用 /backtest/quick 测试单品种单周期",
            "step_2": "用 /backtest/matrix 跑多品种多周期矩阵",
            "step_3": "对比不同 threshold (78/80/82/85) 找最优",
            "step_4": "分析 per-strategy 胜率，优化评分权重",
            "step_5": "将发现写入 references/scoring-rubric.md",
        },
    }
