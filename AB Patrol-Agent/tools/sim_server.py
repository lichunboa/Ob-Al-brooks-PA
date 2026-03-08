"""
sim_server.py — 模拟回测服务器

模拟 execution-service API，用历史 K 线数据替代实时数据。
patrol-l1 连上来后，一根一根喂 K 线，验证交易流程和策略逻辑。

用法:
    cd "AB Patrol-Agent"
    python3 tools/sim_server.py --scenario trend_bull
    # 然后在另一个终端运行 /patrol-l1，把端口改成 8095

场景:
    trend_bull   — BTC 强势上涨（应该入场做多）
    trend_bear   — BTC 强势下跌（应该入场做空）
    tr_choppy    — BTC 横盘震荡（应该少做/不做）
    reversal     — BTC 趋势末期反转（应该谨慎）
    bad_market   — 假突破+洗盘（应该不开单）
"""

import argparse
import json
import math
import sys
import os
import time as _time
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# 添加项目根目录到 path
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# ========== 数据加载 ==========

import pandas as pd
import numpy as np

# 复用 backtest 库
from libs.backtest.data_loader import DataLoader
from libs.backtest.market_replay import MarketReplay, Candle


# ========== 场景定义 ==========

SCENARIOS = {
    "trend_bull": {
        "name": "强势多头趋势（5品种）",
        "desc": "2020年底牛市冲刺，5品种同时监控，完全模拟真实交易",
        "symbols": ["BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT"],
        "start": "2020-07-20",  # 提前 ~5 个月，确保 1d 有 150+ 根历史 K 线
        "end": "2021-01-10",
        "expected": "应识别各品种 AIL，找最佳入场",
    },
    "trend_bear": {
        "name": "强势空头趋势",
        "desc": "BTC 5月崩盘 58k→30k，应识别 AIS + L2 入场做空",
        "symbols": ["BTCUSDT"],
        "start": "2021-05-10",
        "end": "2021-05-25",
        "expected": "应入场做空，Swing 持有",
    },
    "tr_choppy": {
        "name": "横盘震荡",
        "desc": "BTC 30k-40k 区间震荡，应识别 TR + BLSHS 或不做",
        "symbols": ["BTCUSDT"],
        "start": "2021-06-20",
        "end": "2021-07-05",
        "expected": "应识别 TR，只做边缘 scalp 或不做",
    },
    "reversal": {
        "name": "趋势反转",
        "desc": "BTC 4月见顶 64k 后 climax + MTR，应谨慎判断",
        "symbols": ["BTCUSDT"],
        "start": "2021-04-10",
        "end": "2021-04-25",
        "expected": "应识别 MTR 条件，等 5/5 确认",
    },
    "bad_market": {
        "name": "假突破洗盘",
        "desc": "ETH 2021夏季反复假突破，应规避不瞎开单",
        "symbols": ["ETHUSDT"],
        "start": "2021-07-15",
        "end": "2021-07-30",
        "expected": "应识别假 BO + 不追，保持纪律",
    },
}


# ========== 指标计算 (与 executor.py 完全一致) ==========

def calc_ema(values: list, period: int) -> list:
    n = len(values)
    if n == 0:
        return []
    if n < period:
        return [None] * n
    result = [None] * (period - 1)
    sma = sum(values[:period]) / period
    result.append(sma)
    k = 2.0 / (period + 1)
    for i in range(period, n):
        ema_val = values[i] * k + result[-1] * (1 - k)
        result.append(ema_val)
    return result


def calc_atr(bars: list, period: int) -> list:
    """bars = list of (o, h, l, c)"""
    n = len(bars)
    if n == 0:
        return []
    trs = []
    for i in range(n):
        h, l, c = bars[i][1], bars[i][2], bars[i][3]
        if i == 0:
            trs.append(h - l)
        else:
            prev_c = bars[i - 1][3]
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
            trs.append(tr)
    if n < period:
        avg = sum(trs) / n if n else 0
        return [avg] * n
    result = [None] * (period - 1)
    atr = sum(trs[:period]) / period
    result.append(atr)
    for i in range(period, n):
        atr = (atr * (period - 1) + trs[i]) / period
        result.append(atr)
    return result


def describe_bar(body: float, upper_wick: float,
                 lower_wick: float, bar_range: float) -> str:
    if bar_range == 0:
        return "十字星"
    abs_body = abs(body)
    body_ratio = abs_body / bar_range
    if body_ratio < 0.1:
        desc = "十字星"
    elif body_ratio < 0.3:
        desc = "小" + ("阳" if body >= 0 else "阴") + "线"
    elif body_ratio < 0.7:
        desc = "中" + ("阳" if body >= 0 else "阴") + "线"
    else:
        desc = "大" + ("阳" if body >= 0 else "阴") + "线"
    wicks = []
    if upper_wick > abs_body * 0.5 and upper_wick > bar_range * 0.2:
        wicks.append("长上影")
    if lower_wick > abs_body * 0.5 and lower_wick > bar_range * 0.2:
        wicks.append("长下影")
    if wicks:
        return desc + "，" + "，".join(wicks)
    return desc


def generate_kline_summary(bars_data, ema20, atr14):
    """生成与 executor 一致的 K 线摘要"""
    if not bars_data:
        return {}
    above = below = 0
    check_count = min(8, len(bars_data))
    for i in range(-1, -check_count - 1, -1):
        if abs(i) > len(ema20) or ema20[i] is None:
            continue
        if bars_data[i][3] > ema20[i]:  # close > ema
            above += 1
        else:
            below += 1
    if above >= 6:
        trend = f"Always In Long — 最近 {above} 根 K 线在 EMA 上方"
    elif below >= 6:
        trend = f"Always In Short — 最近 {below} 根 K 线在 EMA 下方"
    elif above > below:
        trend = f"偏多但不确定 — EMA 上方 {above}, 下方 {below}"
    elif below > above:
        trend = f"偏空但不确定 — EMA 下方 {below}, 上方 {above}"
    else:
        trend = "方向不明 — 在 EMA 附近震荡"

    last_pullback = "无明显回调"
    recent = bars_data[-20:] if len(bars_data) >= 20 else bars_data
    range_high = max(b[1] for b in recent)  # high
    range_low = min(b[2] for b in recent)   # low
    range_size = range_high - range_low
    cur_atr = atr14[-1] if atr14[-1] is not None else 1
    ratio = range_size / cur_atr if cur_atr > 0 else 1
    if ratio < 1.5:
        day_type = "窄幅区间"
    elif ratio < 2.5:
        day_type = "窄幅趋势" if (above >= 6 or below >= 6) else "正常区间"
    elif ratio < 4:
        day_type = "趋势日" if (above >= 6 or below >= 6) else "宽幅区间"
    else:
        day_type = "大趋势日"

    return {
        "trend": trend,
        "last_pullback": last_pullback,
        "range": f"{range_low:.1f}-{range_high:.1f} ({range_size:.1f} 点区间)",
        "day_type": day_type,
    }


# ========== 模拟状态 ==========

class SimState:
    """模拟交易状态"""

    def __init__(self, initial_balance: float = 200.0):
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.available = initial_balance
        self.positions: list[dict] = []
        self.orders_log: list[dict] = []
        self.trade_history: list[dict] = []
        self.daily_pnl = 0.0

    def place_order(self, symbol, side, quantity, leverage, stop_loss,
                    take_profit, entry_price, strategy="", bot_id=""):
        """模拟下单"""
        order_id = f"SIM_{int(_time.time() * 1000)}"
        position = {
            "symbol": symbol,
            "side": side.upper(),
            "quantity": quantity,
            "leverage": leverage,
            "entry_price": entry_price,
            "mark_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "unrealized_pnl": 0.0,
            "bot_id": bot_id,
            "strategy": strategy,
            "order_id": order_id,
            "entry_time": datetime.now(timezone.utc).isoformat(),
        }
        self.positions.append(position)
        notional = quantity * entry_price
        margin = notional / leverage
        self.available -= margin

        log = {
            "action": "OPEN",
            "time": datetime.now(timezone.utc).isoformat(),
            **position,
        }
        self.orders_log.append(log)
        return {
            "success": True,
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "price": entry_price,
            "order_id": order_id,
            "status": "FILLED",
            "message": f"模拟开仓 {symbol} {side} {quantity}@{entry_price}",
        }

    def close_position(self, symbol, close_price, bot_id=""):
        """模拟平仓"""
        pos = None
        for p in self.positions:
            if p["symbol"] == symbol and (not bot_id or p["bot_id"] == bot_id):
                pos = p
                break
        if not pos:
            return {"success": False, "message": f"无持仓: {symbol}"}

        if pos["side"] == "BUY":
            pnl = (close_price - pos["entry_price"]) / pos["entry_price"] * pos["quantity"] * close_price
        else:
            pnl = (pos["entry_price"] - close_price) / pos["entry_price"] * pos["quantity"] * close_price
        fee = pos["quantity"] * close_price * 0.0004 * 2  # 双边手续费
        net_pnl = pnl - fee

        self.balance += net_pnl
        self.available = self.balance
        self.daily_pnl += net_pnl
        self.positions.remove(pos)

        trade = {
            "action": "CLOSE",
            "time": datetime.now(timezone.utc).isoformat(),
            "symbol": symbol,
            "side": pos["side"],
            "entry_price": pos["entry_price"],
            "exit_price": close_price,
            "quantity": pos["quantity"],
            "pnl": round(net_pnl, 2),
            "fee": round(fee, 2),
            "strategy": pos.get("strategy", ""),
        }
        self.trade_history.append(trade)
        self.orders_log.append(trade)
        return {"success": True, "symbol": symbol, "pnl": round(net_pnl, 2),
                "message": f"模拟平仓 {symbol} PnL=${net_pnl:.2f}"}

    def update_prices(self, prices: dict):
        """更新持仓的 mark price"""
        for pos in self.positions:
            if pos["symbol"] in prices:
                pos["mark_price"] = prices[pos["symbol"]]
                if pos["side"] == "BUY":
                    pos["unrealized_pnl"] = (pos["mark_price"] - pos["entry_price"]) / pos["entry_price"] * 100
                else:
                    pos["unrealized_pnl"] = (pos["entry_price"] - pos["mark_price"]) / pos["entry_price"] * 100

    def modify_sl(self, symbol, new_sl, bot_id=""):
        """修改止损"""
        for pos in self.positions:
            if pos["symbol"] == symbol and (not bot_id or pos["bot_id"] == bot_id):
                old_sl = pos["stop_loss"]
                pos["stop_loss"] = new_sl
                self.orders_log.append({
                    "action": "MODIFY_SL",
                    "time": datetime.now(timezone.utc).isoformat(),
                    "symbol": symbol,
                    "old_sl": old_sl,
                    "new_sl": new_sl,
                })
                return {"success": True, "old_sl": old_sl, "new_sl": new_sl}
        return {"success": False, "message": f"无持仓: {symbol}"}


# ========== 全局状态 ==========

app = FastAPI(title="PA Sim Server", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

replay: Optional[MarketReplay] = None
sim_state: Optional[SimState] = None
scenario_info: dict = {}
step_index: int = 0
symbols: list[str] = []

# V2.0 时间驱动
bar_interval: float = 5.0          # 秒/根 5m bar
auto_running: bool = False          # 是否正在自动推进
bar_count_5m: int = 0              # 5m bar 计数器（多周期聚合检测）
_ticker_thread: Optional[threading.Thread] = None
_ticker_lock: threading.Lock = threading.Lock()
_timestamps_cache: list = []        # 缓存 5m 时间戳列表


def format_klines(candles: list[Candle], symbol: str, interval: str) -> dict:
    """把 Candle 列表格式化成与 executor.fetch_klines() 完全一致的输出"""
    if not candles:
        return {"error": "无数据", "symbol": symbol}

    # 提取 OHLCV 数据
    bars_data = [(c.open, c.high, c.low, c.close) for c in candles]
    closes = [c.close for c in candles]

    # 计算指标
    ema20 = calc_ema(closes, 20)
    atr14 = calc_atr(bars_data, 14)

    # 智能精度: 根据价格量级决定小数位
    def _prec(price: float) -> int:
        if price == 0:
            return 8
        ap = abs(price)
        if ap >= 1:
            return 2
        if ap >= 0.01:
            return 4
        if ap >= 0.0001:
            return 6
        return 8

    sample_price = candles[-1].close if candles else 0
    dp = _prec(sample_price)

    # 格式化 bars
    bars = []
    for i, c in enumerate(candles):
        body = c.close - c.open
        u_wick = c.high - max(c.open, c.close)
        l_wick = min(c.open, c.close) - c.low
        bar_range = c.high - c.low

        entry = {
            "time": c.timestamp.strftime("%Y-%m-%dT%H:%M"),
            "O": round(c.open, dp), "H": round(c.high, dp),
            "L": round(c.low, dp), "C": round(c.close, dp),
            "vol": round(c.volume, 2),
            "body": f"{'+' if body >= 0 else ''}{round(body, dp)} ({'bull' if body >= 0 else 'bear'})",
            "upper_wick": round(u_wick, dp),
            "lower_wick": round(l_wick, dp),
            "bar_type": describe_bar(body, u_wick, l_wick, bar_range),
        }
        if i < len(ema20) and ema20[i] is not None:
            vs = c.close - ema20[i]
            entry["ema20"] = round(ema20[i], dp)
            entry["vs_ema20"] = f"{'+' if vs >= 0 else ''}{round(vs, dp)}"
        if i < len(atr14) and atr14[i] is not None:
            entry["atr14"] = round(atr14[i], dp)
        bars.append(entry)

    # 当前值
    cur_c = candles[-1].close
    cur_ema = ema20[-1] if ema20[-1] is not None else cur_c
    cur_atr = atr14[-1] if atr14[-1] is not None else 0
    vs_pct = (cur_c - cur_ema) / cur_ema * 100 if cur_ema else 0

    summary = generate_kline_summary(bars_data, ema20, atr14)

    return {
        "symbol": symbol.replace("USDT", ""),
        "interval": interval,
        "ema20": round(cur_ema, dp),
        "atr14": round(cur_atr, dp),
        "price_vs_ema": f"{'+' if vs_pct >= 0 else ''}{round(cur_c - cur_ema, dp)} ({vs_pct:+.2f}%)",
        "bars": bars,
        "summary": summary,
    }


# ========== API Routes ==========

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": "simulation",
        "scenario": scenario_info.get("name", "未加载"),
        "virtual_time": replay.virtual_time.isoformat() if replay and replay.virtual_time else None,
        "step": f"{step_index}/{replay.total_steps if replay else 0}",
    }


@app.get("/balance")
async def get_balance():
    if not sim_state:
        raise HTTPException(503, "未初始化")
    return [{
        "asset": "USDT",
        "balance": round(sim_state.balance, 2),
        "available": round(sim_state.available, 2),
        "unrealized_pnl": round(sum(p.get("unrealized_pnl", 0) for p in sim_state.positions), 4),
    }]


@app.get("/positions")
async def get_positions():
    if not sim_state:
        return []
    return [{
        "symbol": p["symbol"],
        "side": p["side"],
        "quantity": p["quantity"],
        "entry_price": p["entry_price"],
        "mark_price": p["mark_price"],
        "unrealized_pnl": round(p.get("unrealized_pnl", 0), 4),
        "leverage": p.get("leverage", 100),
        "bot_id": p.get("bot_id", ""),
        "bot_ids": [p.get("bot_id", "")],
    } for p in sim_state.positions]


@app.get("/trading/bot-summary/{bot_id}")
async def bot_summary(bot_id: str):
    if not sim_state:
        raise HTTPException(503, "未初始化")
    bot_positions = [p for p in sim_state.positions if p.get("bot_id") == bot_id]
    return {
        "bot_id": bot_id,
        "positions": len(bot_positions),
        "max_positions": 8,
        "balance": round(sim_state.balance, 2),
        "daily_pnl": round(sim_state.daily_pnl, 2),
        "total_trades": len(sim_state.trade_history),
        "open_positions": [{
            "symbol": p["symbol"],
            "side": p["side"],
            "entry_price": p["entry_price"],
            "mark_price": p["mark_price"],
            "unrealized_pnl": round(p.get("unrealized_pnl", 0), 4),
            "stop_loss": p.get("stop_loss"),
            "take_profit": p.get("take_profit"),
        } for p in bot_positions],
        "mode": "SIMULATION",
        "scenario": scenario_info.get("name", ""),
    }


@app.get("/trading/can-trade/{bot_id}")
async def can_trade(bot_id: str):
    if not sim_state:
        return {"can_trade": False, "reason": "未初始化"}
    bot_positions = [p for p in sim_state.positions if p.get("bot_id") == bot_id]
    can = len(bot_positions) < 8
    return {
        "can_trade": can,
        "reason": "OK" if can else "持仓已满",
        "bot_id": bot_id,
        "allocation": {
            "max_positions": 8,
            "current_positions": len(bot_positions),
        }
    }


@app.get("/klines/{symbol}")
async def get_klines(symbol: str, interval: str = "1h", limit: int = 50):
    """单周期 K 线"""
    if not replay:
        raise HTTPException(503, "未加载数据")
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    candles = replay.get_candles(sym, interval, limit)
    return format_klines(candles, sym, interval)


@app.get("/klines/{symbol}/multi")
async def get_multi_klines(symbol: str):
    """多周期 K 线快照 — patrol-l1 主要调用这个（V2.0: 纯读取，不前进）"""
    if not replay:
        raise HTTPException(503, "未加载数据")

    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"

    if sym not in symbols:
        raise HTTPException(404, f"品种 {sym} 不在当前场景中。可用: {', '.join(symbols)}")

    with _ticker_lock:
        result = {}
        for tf, limit in [("5m", 150), ("15m", 150), ("30m", 150), ("1h", 150), ("4h", 150), ("1d", 150)]:
            candles = replay.get_candles(sym, tf, limit)
            result[tf] = format_klines(candles, sym, tf)

        # 更新持仓价格
        if sim_state and result.get("5m", {}).get("bars"):
            last_bar = result["5m"]["bars"][-1]
            sim_state.update_prices({sym: last_bar["C"]})

    return result


@app.get("/trading/calculate-size/{bot_id}")
async def calculate_size(
    bot_id: str,
    entry_price: float = Query(...),
    stop_loss: float = Query(...),
    risk_percent: float = Query(1.0),
):
    if not sim_state:
        raise HTTPException(503, "未初始化")

    sl_distance = abs(entry_price - stop_loss)
    sl_pct = sl_distance / entry_price * 100
    risk_amount = sim_state.balance * risk_percent / 100
    notional = risk_amount / (sl_pct / 100) if sl_pct > 0 else 0
    quantity = notional / entry_price if entry_price > 0 else 0

    return {
        "bot_id": bot_id,
        "quantity": round(quantity, 4),
        "explanation": f"余额${sim_state.balance:.0f} × 风险{risk_percent}% = ${risk_amount:.2f}风险 / {sl_pct:.2f}%SL = {quantity:.4f}",
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "risk_percent": risk_percent,
    }


class OrderRequest(BaseModel):
    symbol: str
    side: str
    quantity: float
    leverage: int = 100
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    bot_id: str = ""
    signal_source: str = ""
    strategy: str = ""
    order_type: str = "MARKET"
    price: Optional[float] = None


@app.post("/order")
async def place_order(req: OrderRequest):
    if not sim_state or not replay:
        raise HTTPException(503, "未初始化")

    # 获取当前价格
    sym = req.symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    candle = replay.get_current_candle(sym, "5m")
    entry_price = req.price or (candle.close if candle else 0)

    result = sim_state.place_order(
        symbol=sym,
        side=req.side,
        quantity=req.quantity,
        leverage=req.leverage,
        stop_loss=req.stop_loss or 0,
        take_profit=req.take_profit or 0,
        entry_price=entry_price,
        strategy=req.strategy,
        bot_id=req.bot_id,
    )
    print(f"📊 [ORDER] {req.side} {sym} qty={req.quantity} @{entry_price} SL={req.stop_loss} TP={req.take_profit}")
    return result


@app.post("/order/{symbol}/close")
async def close_position(symbol: str, bot_id: str = Query(None)):
    if not sim_state or not replay:
        raise HTTPException(503, "未初始化")
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    candle = replay.get_current_candle(sym, "5m")
    close_price = candle.close if candle else 0
    result = sim_state.close_position(sym, close_price, bot_id or "")
    print(f"📊 [CLOSE] {sym} @{close_price} PnL={result.get('pnl', 0)}")
    return result


@app.post("/order/{symbol}/modify-sl")
async def modify_sl(symbol: str, new_stop_loss: float = Query(...), bot_id: str = Query(None)):
    if not sim_state:
        raise HTTPException(503, "未初始化")
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    result = sim_state.modify_sl(sym, new_stop_loss, bot_id or "")
    print(f"📊 [MODIFY_SL] {sym} → {new_stop_loss}")
    return result


# ========== 模拟控制 API ==========

@app.post("/sim/advance")
async def advance(bars: int = Query(1, description="前进几根 5m K 线")):
    """手动前进 N 根 5m K 线（暂停状态下也可用）"""
    global step_index, bar_count_5m
    if not replay:
        raise HTTPException(503, "未加载数据")

    advanced = 0
    with _ticker_lock:
        for _ in range(bars):
            if step_index < len(_timestamps_cache) - 1:
                step_index += 1
                bar_count_5m += 1
                replay.advance_to(_timestamps_cache[step_index])
                advanced += 1
                _check_sl_tp()

    return {
        "advanced": advanced,
        "step": f"{step_index}/{len(_timestamps_cache)}",
        "virtual_time": replay.virtual_time.isoformat() if replay.virtual_time else None,
        "positions": len(sim_state.positions) if sim_state else 0,
        "balance": round(sim_state.balance, 2) if sim_state else 0,
    }


# ========== V2.0 时间驱动 ==========

def _ticker_loop():
    """后台线程：每 bar_interval 秒前进 1 根 5m bar"""
    global step_index, bar_count_5m, auto_running

    while auto_running:
        _time.sleep(bar_interval)
        if not auto_running:
            break

        with _ticker_lock:
            if step_index >= len(_timestamps_cache) - 1:
                print("🏁 数据回放结束")
                auto_running = False
                break

            step_index += 1
            bar_count_5m += 1
            replay.advance_to(_timestamps_cache[step_index])
            _check_sl_tp()

            # 打印新 bar 概要（所有品种）
            pos_count = len(sim_state.positions) if sim_state else 0
            pos_info = f" | 持仓={pos_count}" if pos_count > 0 else ""
            parts = []
            for sym in symbols:
                candle = replay.get_current_candle(sym, "5m")
                if candle:
                    d = '▲' if candle.close > candle.open else '▼'
                    short = sym.replace("USDT", "")
                    parts.append(f"{short}={candle.close:.0f}{d}")
            print(f"⏩ [{replay.virtual_time}] 5m #{bar_count_5m} {' | '.join(parts)}{pos_info}")

            # 多周期完成提示
            if bar_count_5m % 3 == 0:
                print(f"   📊 15m bar 完成")
            if bar_count_5m % 6 == 0:
                print(f"   📊 30m bar 完成")
            if bar_count_5m % 12 == 0:
                print(f"   📊 1h bar 完成")
            if bar_count_5m % 48 == 0:
                print(f"   📊 4h bar 完成")
            if bar_count_5m % 288 == 0:
                print(f"   📊 Daily bar 完成")


def _start_ticker(interval: float = None):
    """启动后台定时器"""
    global auto_running, _ticker_thread, bar_interval
    if interval is not None:
        bar_interval = interval
    if auto_running:
        return  # 已在运行
    auto_running = True
    _ticker_thread = threading.Thread(target=_ticker_loop, daemon=True)
    _ticker_thread.start()


def _stop_ticker():
    """停止后台定时器"""
    global auto_running
    auto_running = False


@app.post("/sim/start")
async def sim_start(interval: float = Query(5.0, description="秒/根 5m bar")):
    """开始自动推进"""
    _start_ticker(interval)
    return {
        "status": "running",
        "interval": bar_interval,
        "step": step_index,
        "virtual_time": replay.virtual_time.isoformat() if replay and replay.virtual_time else None,
    }


@app.post("/sim/pause")
async def sim_pause():
    """暂停自动推进"""
    _stop_ticker()
    return {
        "status": "paused",
        "step": step_index,
        "virtual_time": replay.virtual_time.isoformat() if replay and replay.virtual_time else None,
        "bar_count": bar_count_5m,
    }


@app.post("/sim/resume")
async def sim_resume():
    """恢复自动推进"""
    _start_ticker()
    return {
        "status": "running",
        "interval": bar_interval,
        "step": step_index,
        "virtual_time": replay.virtual_time.isoformat() if replay and replay.virtual_time else None,
    }


@app.post("/sim/speed")
async def sim_speed(interval: float = Query(5.0, description="秒/根 5m bar")):
    """运行时调速（会重启定时器）"""
    global bar_interval
    _stop_ticker()
    _time.sleep(0.2)  # 等旧线程退出
    bar_interval = interval
    _start_ticker(interval)
    return {
        "status": "running",
        "interval": bar_interval,
    }


@app.get("/sim/status")
async def sim_status():
    """模拟状态"""
    return {
        "scenario": scenario_info,
        "symbols": symbols,
        "step": step_index,
        "total_steps": len(_timestamps_cache),
        "virtual_time": replay.virtual_time.isoformat() if replay and replay.virtual_time else None,
        "balance": round(sim_state.balance, 2) if sim_state else 0,
        "daily_pnl": round(sim_state.daily_pnl, 2) if sim_state else 0,
        "positions": len(sim_state.positions) if sim_state else 0,
        "total_trades": len(sim_state.trade_history) if sim_state else 0,
        "orders_log": sim_state.orders_log[-20:] if sim_state else [],
        "auto_running": auto_running,
        "bar_interval": bar_interval,
        "bar_count_5m": bar_count_5m,
    }


@app.get("/sim/log")
async def sim_log():
    """所有交易决策日志"""
    if not sim_state:
        return {"log": []}
    return {
        "orders": sim_state.orders_log,
        "trades": sim_state.trade_history,
        "final_balance": round(sim_state.balance, 2),
        "total_pnl": round(sim_state.balance - sim_state.initial_balance, 2),
    }


@app.post("/sim/reset")
async def sim_reset():
    """重置到起点"""
    global step_index, sim_state, bar_count_5m
    _stop_ticker()
    _time.sleep(0.3)
    step_index = 0
    bar_count_5m = 0
    sim_state = SimState(sim_state.initial_balance)
    if _timestamps_cache:
        start = min(43200, len(_timestamps_cache) - 1)
        step_index = start
        replay.advance_to(_timestamps_cache[start])
    return {"status": "reset", "step": step_index, "virtual_time": replay.virtual_time.isoformat() if replay and replay.virtual_time else None}


@app.post("/sim/advance-to-next-signal")
async def advance_to_next_signal(bars: int = Query(12, description="前进几根 5m K 线")):
    """快进到下一个可能有信号的位置（跳过无聊的 bar）"""
    global step_index, bar_count_5m
    if not replay:
        raise HTTPException(503, "未加载数据")

    with _ticker_lock:
        for _ in range(bars):
            if step_index < len(_timestamps_cache) - 1:
                step_index += 1
                bar_count_5m += 1
                replay.advance_to(_timestamps_cache[step_index])
                _check_sl_tp()

    return {
        "step": f"{step_index}/{len(_timestamps_cache)}",
        "virtual_time": replay.virtual_time.isoformat() if replay.virtual_time else None,
        "balance": round(sim_state.balance, 2) if sim_state else 0,
    }


def _check_sl_tp():
    """检查持仓的 SL/TP 是否触发"""
    if not sim_state or not replay:
        return
    for pos in list(sim_state.positions):
        candle = replay.get_current_candle(pos["symbol"], "5m")
        if not candle:
            continue
        pos["mark_price"] = candle.close

        hit_sl = False
        hit_tp = False
        if pos["side"] == "BUY":
            if pos["stop_loss"] and candle.low <= pos["stop_loss"]:
                hit_sl = True
            if pos["take_profit"] and candle.high >= pos["take_profit"]:
                hit_tp = True
            pos["unrealized_pnl"] = (candle.close - pos["entry_price"]) / pos["entry_price"] * 100
        else:
            if pos["stop_loss"] and candle.high >= pos["stop_loss"]:
                hit_sl = True
            if pos["take_profit"] and candle.low <= pos["take_profit"]:
                hit_tp = True
            pos["unrealized_pnl"] = (pos["entry_price"] - candle.close) / pos["entry_price"] * 100

        if hit_sl and hit_tp:
            # 谁近谁先
            sl_dist = abs(pos["entry_price"] - pos["stop_loss"])
            tp_dist = abs(pos["take_profit"] - pos["entry_price"])
            if sl_dist <= tp_dist:
                hit_tp = False
            else:
                hit_sl = False

        if hit_sl:
            close_price = pos["stop_loss"]
            print(f"⛔ [SL HIT] {pos['symbol']} @{close_price}")
            sim_state.close_position(pos["symbol"], close_price, pos.get("bot_id", ""))
        elif hit_tp:
            close_price = pos["take_profit"]
            print(f"✅ [TP HIT] {pos['symbol']} @{close_price}")
            sim_state.close_position(pos["symbol"], close_price, pos.get("bot_id", ""))


# ========== 启动 ==========

def load_scenario(scenario_name: str, port: int, interval: float = 5.0, balance: float = 200.0):
    """加载场景数据"""
    global replay, sim_state, scenario_info, step_index, symbols
    global _timestamps_cache, bar_interval

    bar_interval = interval

    if scenario_name not in SCENARIOS:
        print(f"❌ 未知场景: {scenario_name}")
        print(f"可用场景: {', '.join(SCENARIOS.keys())}")
        sys.exit(1)

    sc = SCENARIOS[scenario_name]
    scenario_info = sc
    # 兼容旧格式 "symbol" 和新格式 "symbols"
    symbols = sc.get("symbols", [sc["symbol"]] if "symbol" in sc else [])

    print(f"\n{'='*60}")
    print(f"📊 PA Sim Server V2.0 — {sc['name']}")
    print(f"   {sc['desc']}")
    print(f"   品种: {', '.join(symbols)} | 期间: {sc['start']} ~ {sc['end']}")
    print(f"   预期: {sc['expected']}")
    print(f"   节奏: 每 {interval} 秒出 1 根 5m bar")
    print(f"{'='*60}\n")

    cache_dir = str(ROOT / "data" / "backtest_cache")
    df_dict = {}
    for sym in symbols:
        print(f"加载 {sym} 历史数据...")
        df = DataLoader.load(
            sym,
            start_date=sc["start"],
            end_date=sc["end"],
            cache_dir=cache_dir,
        )
        if df.empty:
            print(f"  ⚠️ 无缓存数据: {sym}，尝试下载...")
            df = DataLoader.download_from_binance(sym, days=30, cache_dir=cache_dir)
        if df.empty:
            print(f"  ❌ {sym} 数据加载失败，跳过")
            continue
        # 统一去除时区信息（避免 tz-naive vs tz-aware 比较错误）
        if hasattr(df.index, 'tz') and df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        df_dict[sym] = df
        print(f"  ✅ {sym}: {len(df):,} 根 1m K 线")

    if not df_dict:
        print("❌ 所有品种数据加载失败，退出")
        sys.exit(1)

    # 更新 symbols 为实际加载成功的品种
    symbols = list(df_dict.keys())
    print(f"\n✅ 共加载 {len(symbols)} 个品种: {', '.join(symbols)}")

    # 创建 MarketReplay
    replay = MarketReplay(
        symbols=symbols,
        df_1m_dict=df_dict,
        timeframes=["5m", "15m", "30m", "1h", "4h", "1d"],
    )

    # 初始化状态
    sim_state = SimState(balance)

    # 缓存时间戳列表
    _timestamps_cache = list(replay.timestamps("5m"))
    start = min(43200, len(_timestamps_cache) - 1)
    step_index = start
    replay.advance_to(_timestamps_cache[start])

    remaining = len(_timestamps_cache) - start
    eta_seconds = remaining * interval
    eta_hours = eta_seconds / 3600

    print(f"✅ 就绪: {len(_timestamps_cache)} 根 5m 步进，从 step {start} 开始")
    print(f"   虚拟时间: {replay.virtual_time}")
    print(f"   剩余 {remaining} 根 | 预计 {eta_hours:.1f} 小时完成回测")
    print(f"   模拟余额: ${sim_state.balance}")
    print(f"\n🚀 服务器启动在 http://localhost:{port}")
    print(f"   patrol-l1 请将 API 端口改为 {port}")
    print(f"\n   控制:")
    print(f"   POST /sim/start?interval=5  — 开始自动推进（{interval}秒/bar）")
    print(f"   POST /sim/pause             — 暂停")
    print(f"   POST /sim/resume            — 恢复")
    print(f"   POST /sim/speed?interval=3  — 运行时调速")
    print(f"   POST /sim/advance?bars=1    — 手动前进（暂停时用）")
    print(f"   GET  /sim/status            — 查看当前状态")
    print(f"   POST /sim/reset             — 重置到起点")

    # 自动开始推进
    _start_ticker(interval)
    print(f"\n⏩ 自动推进已启动: 每 {interval} 秒出 1 根 5m bar")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PA 模拟回测服务器 V2.0")
    parser.add_argument("--scenario", "-s", default="trend_bull",
                        choices=list(SCENARIOS.keys()),
                        help="场景名称")
    parser.add_argument("--port", "-p", type=int, default=8095,
                        help="服务端口 (默认 8095)")
    parser.add_argument("--interval", "-i", type=float, default=5.0,
                        help="秒/根 5m bar (默认 5.0)")
    parser.add_argument("--balance", "-b", type=float, default=200.0,
                        help="初始余额 (默认 200)")
    parser.add_argument("--list", "-l", action="store_true",
                        help="列出所有场景")
    args = parser.parse_args()

    if args.list:
        print("\n可用场景:")
        for name, sc in SCENARIOS.items():
            print(f"  {name:15s} — {sc['name']}: {sc['desc']}")
        sys.exit(0)

    load_scenario(args.scenario, args.port, args.interval, args.balance)
    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="warning")
