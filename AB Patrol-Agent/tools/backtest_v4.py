"""
backtest_v4.py — patrol-l1 V4.0 自动化回测脚本

实现 SKILL.md 核心交易逻辑，连接 sim_server 自动跑一周数据。
验证优化效果：多周期入场、Scalp 全状态、TR/Consolidation 交易。

用法:
    cd "AB Patrol-Agent"
    python3 tools/backtest_v4.py --hours 168
"""

import argparse
import json
import sys
import time
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

import requests

BASE_URL = "http://localhost:8095"
BOT_ID = "claude-pa-l1"
SYMBOL = "BTCUSDT"
RISK_PCT = 0.3  # 首仓 0.3%


# ========== 数据结构 ==========

@dataclass
class Bar:
    time: str
    o: float
    h: float
    l: float
    c: float
    ema20: float = 0.0
    atr14: float = 0.0
    body: float = 0.0
    bar_type: str = ""
    vs_ema20: str = ""

    @property
    def is_bull(self) -> bool:
        return self.c > self.o

    @property
    def is_bear(self) -> bool:
        return self.c < self.o

    @property
    def body_size(self) -> float:
        return abs(self.c - self.o)

    @property
    def range(self) -> float:
        return self.h - self.l

    @property
    def body_ratio(self) -> float:
        return self.body_size / self.range if self.range > 0 else 0


@dataclass
class Position:
    symbol: str
    side: str  # BUY/SELL
    entry_price: float
    stop_loss: float
    take_profit: float
    quantity: float
    entry_time: str
    style: str  # Scalp/Swing
    premise: str
    playbook: str
    timeframe: str  # 入场周期


@dataclass
class TradeResult:
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    pnl: float
    style: str
    playbook: str
    timeframe: str
    premise: str
    duration_hours: float
    result: str  # WIN/LOSS


@dataclass
class BacktestState:
    balance: float = 10000.0
    positions: list = field(default_factory=list)
    trades: list = field(default_factory=list)
    signals: list = field(default_factory=list)
    passes: list = field(default_factory=list)
    pass_rules: int = 0
    pass_waits: int = 0
    pass_judgments: int = 0
    scalp_count: int = 0
    swing_count: int = 0
    tr_trades: int = 0
    trend_trades: int = 0
    multi_tf_signals: dict = field(default_factory=lambda: {"5m": 0, "15m": 0, "30m": 0, "1h": 0})


# ========== K 线解析 ==========

def parse_bars(kline_data: dict) -> list[Bar]:
    """解析 API 返回的 K 线数据"""
    if not kline_data or "bars" not in kline_data:
        return []
    bars = []
    for b in kline_data["bars"]:
        bar = Bar(
            time=b.get("time", ""),
            o=b["O"], h=b["H"], l=b["L"], c=b["C"],
            ema20=b.get("ema20", 0),
            atr14=b.get("atr14", 0),
            bar_type=b.get("bar_type", ""),
            vs_ema20=b.get("vs_ema20", "0"),
        )
        bars.append(bar)
    return bars


# ========== 市场分析 ==========

def determine_ai_direction(bars: list[Bar]) -> str:
    """Al Brooks AI 方向判断 — EMA20 位置"""
    if len(bars) < 8:
        return "UNKNOWN"
    recent = bars[-8:]
    above = sum(1 for b in recent if b.c > b.ema20)
    below = sum(1 for b in recent if b.c < b.ema20)
    if above >= 6:
        return "AIL"
    elif below >= 6:
        return "AIS"
    else:
        return "TR"


def determine_market_state(bars: list[Bar], ai_dir: str) -> str:
    """市场状态判断 — BO/TC/NC/BC/TR"""
    if len(bars) < 20:
        return "UNKNOWN"

    recent_20 = bars[-20:]
    recent_5 = bars[-5:]

    # 计算近 20 根的高低点
    high_20 = max(b.h for b in recent_20)
    low_20 = min(b.l for b in recent_20)
    range_20 = high_20 - low_20
    avg_bar = sum(b.range for b in recent_20) / 20

    # 计算连续同方向 K 线
    bull_streak = 0
    bear_streak = 0
    for b in reversed(recent_5):
        if b.is_bull and b.body_ratio > 0.5:
            bull_streak += 1
        else:
            break
    for b in reversed(recent_5):
        if b.is_bear and b.body_ratio > 0.5:
            bear_streak += 1
        else:
            break

    # 大 K 线检测（BO 特征）
    last = recent_5[-1]
    big_bar = last.body_size > avg_bar * 2

    # BO 检测
    if (bull_streak >= 3 or (big_bar and last.is_bull)) and ai_dir == "AIL":
        return "STRONG_BO_BULL"
    if (bear_streak >= 3 or (big_bar and last.is_bear)) and ai_dir == "AIS":
        return "STRONG_BO_BEAR"

    # Tight Channel：近 10 根 K 线都在 EMA 同侧，PB 很浅
    recent_10 = bars[-10:]
    if ai_dir == "AIL":
        all_above = all(b.c > b.ema20 for b in recent_10 if b.ema20 > 0)
        shallow_pb = all(b.l > b.ema20 - avg_bar * 0.5 for b in recent_10 if b.ema20 > 0)
        if all_above and shallow_pb:
            return "TIGHT_CHANNEL_BULL"
    elif ai_dir == "AIS":
        all_below = all(b.c < b.ema20 for b in recent_10 if b.ema20 > 0)
        shallow_pb = all(b.h < b.ema20 + avg_bar * 0.5 for b in recent_10 if b.ema20 > 0)
        if all_below and shallow_pb:
            return "TIGHT_CHANNEL_BEAR"

    # TR：价格在 EMA 附近来回穿越
    if ai_dir == "TR":
        crosses = 0
        for i in range(1, len(recent_10)):
            if recent_10[i].ema20 > 0 and recent_10[i-1].ema20 > 0:
                above_now = recent_10[i].c > recent_10[i].ema20
                above_prev = recent_10[i-1].c > recent_10[i-1].ema20
                if above_now != above_prev:
                    crosses += 1
        if crosses >= 2:
            return "TR"

    # Broad Channel
    if ai_dir in ("AIL", "AIS"):
        return f"CHANNEL_{ai_dir[-1]}"  # CHANNEL_L or CHANNEL_S

    return "TR"


def find_tr_range(bars: list[Bar]) -> tuple[float, float]:
    """找 TR 的高低边界"""
    recent = bars[-30:] if len(bars) >= 30 else bars
    high = max(b.h for b in recent)
    low = min(b.l for b in recent)
    return low, high


def detect_h1_h2(bars: list[Bar]) -> tuple[int, str]:
    """H1/H2/L1/L2 计数"""
    if len(bars) < 5:
        return 0, "NONE"

    # 简化版：找最近的 higher high / lower low 序列
    recent = bars[-10:]
    h_count = 0  # H 计数
    l_count = 0  # L 计数

    for i in range(2, len(recent)):
        # H1: 当前 high > 前一根 high（在下跌后）
        if recent[i].h > recent[i-1].h and recent[i-1].h <= recent[i-2].h:
            h_count += 1
        # L1: 当前 low < 前一根 low（在上涨后）
        if recent[i].l < recent[i-1].l and recent[i-1].l >= recent[i-2].l:
            l_count += 1

    if h_count >= 2:
        return h_count, "H2+"
    elif h_count == 1:
        return 1, "H1"
    elif l_count >= 2:
        return l_count, "L2+"
    elif l_count == 1:
        return 1, "L1"
    return 0, "NONE"


def detect_ema_touch(bars: list[Bar]) -> bool:
    """EMA PB 检测"""
    if len(bars) < 3:
        return False
    last = bars[-1]
    if last.ema20 <= 0:
        return False
    distance_pct = abs(last.c - last.ema20) / last.ema20
    return distance_pct < 0.003  # 0.3% 以内


def detect_pb_complete(bars: list[Bar], direction: str) -> bool:
    """PB 完成确认"""
    if len(bars) < 4:
        return False
    recent = bars[-4:]

    if direction == "AIL":
        # 多头 PB 完成：不再创新低 + 出现阳线
        lows = [b.l for b in recent]
        no_new_low = lows[-1] >= min(lows[:-1])
        strong_bar = recent[-1].is_bull and recent[-1].body_ratio > 0.5
        return no_new_low and strong_bar
    else:
        highs = [b.h for b in recent]
        no_new_high = highs[-1] <= max(highs[:-1])
        strong_bar = recent[-1].is_bear and recent[-1].body_ratio > 0.5
        return no_new_high and strong_bar


def calc_pb_depth(bars: list[Bar], direction: str) -> float:
    """计算 PB 深度比例"""
    if len(bars) < 10:
        return 0.5
    recent = bars[-20:]

    if direction == "AIL":
        swing_high = max(b.h for b in recent)
        swing_low = min(b.l for b in recent[-5:])  # 最近 PB 低点
        leg_start = min(b.l for b in recent[:10])   # leg 起点
        leg_height = swing_high - leg_start
        if leg_height <= 0:
            return 0.5
        pb_depth = (swing_high - swing_low) / leg_height
        return pb_depth
    else:
        swing_low = min(b.l for b in recent)
        swing_high = max(b.h for b in recent[-5:])
        leg_start = max(b.h for b in recent[:10])
        leg_height = leg_start - swing_low
        if leg_height <= 0:
            return 0.5
        pb_depth = (swing_high - swing_low) / leg_height
        return pb_depth


# ========== 交易逻辑 ==========

def evaluate_entry(bars: list[Bar], ai_dir: str, state: str,
                   timeframe: str) -> Optional[dict]:
    """评估入场信号 — 实现 SKILL.md 核心逻辑"""
    if len(bars) < 20:
        return None

    last = bars[-1]
    avg_bar = sum(b.range for b in bars[-20:]) / 20

    # ===== 趋势入场 =====
    if state.startswith("STRONG_BO") or state.startswith("TIGHT_CHANNEL"):
        h_count, h_type = detect_h1_h2(bars)
        ema_touch = detect_ema_touch(bars)
        pb_done = detect_pb_complete(bars, ai_dir)

        # H1 after BO (T1)
        if "STRONG_BO" in state and h_type in ("H1", "H2+") and ai_dir == "AIL":
            # SL = Spike 起点（结构位）
            spike_low = min(b.l for b in bars[-5:])
            sl = spike_low - avg_bar * 0.5  # buffer
            tp = last.c + (last.c - sl) * 2  # 2R
            r = (tp - last.c) / (last.c - sl) if last.c > sl else 0
            p = 0.60
            return {
                "side": "BUY", "playbook": "T1", "style": "Swing",
                "p": p, "r": r, "sl": sl, "tp": tp,
                "premise": f"Strong BO Bull + {h_type} after BO",
            }

        if "STRONG_BO" in state and h_type in ("L1", "L2+") and ai_dir == "AIS":
            spike_high = max(b.h for b in bars[-5:])
            sl = spike_high + avg_bar * 0.5
            tp = last.c - (sl - last.c) * 2
            r = (sl - last.c) / (last.c - tp) if last.c < sl else 0
            r = (last.c - tp) / (sl - last.c) if sl > last.c else 0
            p = 0.60
            return {
                "side": "SELL", "playbook": "T1", "style": "Swing",
                "p": p, "r": r, "sl": sl, "tp": tp,
                "premise": f"Strong BO Bear + {h_type} after BO",
            }

        # H2 in Channel (T2)
        if "CHANNEL" in state or "TIGHT" in state:
            pb_depth = calc_pb_depth(bars, ai_dir)
            if pb_depth < 2/3 and pb_done:
                if ai_dir == "AIL" and h_type in ("H1", "H2+"):
                    pb_low = min(b.l for b in bars[-5:])
                    sl = pb_low - avg_bar * 0.3
                    tp = last.c + (last.c - sl) * 2
                    r = (tp - last.c) / (last.c - sl) if last.c > sl else 0
                    p = 0.55 if h_type == "H1" else 0.60
                    style = "Swing" if r >= 2 else "Scalp"
                    return {
                        "side": "BUY", "playbook": "T2", "style": style,
                        "p": p, "r": r, "sl": sl, "tp": tp,
                        "premise": f"Channel Bull + {h_type} PB完成 depth={pb_depth:.1%}",
                    }
                elif ai_dir == "AIS" and h_type in ("L1", "L2+"):
                    pb_high = max(b.h for b in bars[-5:])
                    sl = pb_high + avg_bar * 0.3
                    tp = last.c - (sl - last.c) * 2
                    r = (last.c - tp) / (sl - last.c) if sl > last.c else 0
                    p = 0.55 if h_type == "L1" else 0.60
                    style = "Swing" if r >= 2 else "Scalp"
                    return {
                        "side": "SELL", "playbook": "T2", "style": style,
                        "p": p, "r": r, "sl": sl, "tp": tp,
                        "premise": f"Channel Bear + {h_type} PB完成 depth={pb_depth:.1%}",
                    }

        # EMA PB (T3) — Scalp 快速通道场景 4
        if ema_touch and ai_dir in ("AIL", "AIS"):
            if ai_dir == "AIL" and last.is_bull:
                sl = last.ema20 - avg_bar * 2
                tp = last.c + avg_bar * 3
                r = (tp - last.c) / (last.c - sl) if last.c > sl else 0
                return {
                    "side": "BUY", "playbook": "T3-EMA", "style": "Scalp",
                    "p": 0.55, "r": r, "sl": sl, "tp": tp,
                    "premise": "EMA20 PB + Bull bar in uptrend",
                }
            elif ai_dir == "AIS" and last.is_bear:
                sl = last.ema20 + avg_bar * 2
                tp = last.c - avg_bar * 3
                r = (last.c - tp) / (sl - last.c) if sl > last.c else 0
                return {
                    "side": "SELL", "playbook": "T3-EMA", "style": "Scalp",
                    "p": 0.55, "r": r, "sl": sl, "tp": tp,
                    "premise": "EMA20 PB + Bear bar in downtrend",
                }

        # 趋势顺势 Scalp — 快速通道场景 2
        if ai_dir in ("AIL", "AIS") and pb_done:
            if ai_dir == "AIL" and last.is_bull and last.body_ratio > 0.5:
                major_hl = min(b.l for b in bars[-10:])
                sl = major_hl - avg_bar * 0.3
                tp = last.c + avg_bar * 2
                r = (tp - last.c) / (last.c - sl) if last.c > sl else 0
                if r >= 1.0:
                    return {
                        "side": "BUY", "playbook": "TREND-SCALP", "style": "Scalp",
                        "p": 0.55, "r": r, "sl": sl, "tp": tp,
                        "premise": "Trend Scalp: Swing SL + 1R target in AIL",
                    }
            elif ai_dir == "AIS" and last.is_bear and last.body_ratio > 0.5:
                major_lh = max(b.h for b in bars[-10:])
                sl = major_lh + avg_bar * 0.3
                tp = last.c - avg_bar * 2
                r = (last.c - tp) / (sl - last.c) if sl > last.c else 0
                if r >= 1.0:
                    return {
                        "side": "SELL", "playbook": "TREND-SCALP", "style": "Scalp",
                        "p": 0.55, "r": r, "sl": sl, "tp": tp,
                        "premise": "Trend Scalp: Swing SL + 1R target in AIS",
                    }

    # ===== TR 入场 (BLSHS) =====
    if state == "TR":
        tr_low, tr_high = find_tr_range(bars)
        tr_range = tr_high - tr_low
        if tr_range <= avg_bar * 3:
            return None  # TTR — 太窄不做

        lower_third = tr_low + tr_range / 3
        upper_third = tr_high - tr_range / 3

        # 下 1/3 做多
        if last.c < lower_third and last.is_bull:
            sl = tr_low - avg_bar * 0.5
            tp = tr_low + tr_range * 0.5  # TR 中间
            r = (tp - last.c) / (last.c - sl) if last.c > sl else 0
            if r >= 1.0:
                return {
                    "side": "BUY", "playbook": "TR1-BLSHS", "style": "Scalp",
                    "p": 0.60, "r": r, "sl": sl, "tp": tp,
                    "premise": f"BLSHS: Price in lower 1/3 of TR ({last.c:.0f} < {lower_third:.0f})",
                }

        # 上 1/3 做空
        if last.c > upper_third and last.is_bear:
            sl = tr_high + avg_bar * 0.5
            tp = tr_high - tr_range * 0.5
            r = (last.c - tp) / (sl - last.c) if sl > last.c else 0
            if r >= 1.0:
                return {
                    "side": "SELL", "playbook": "TR1-BLSHS", "style": "Scalp",
                    "p": 0.60, "r": r, "sl": sl, "tp": tp,
                    "premise": f"BLSHS: Price in upper 1/3 of TR ({last.c:.0f} > {upper_third:.0f})",
                }

    # ===== Channel 入场 =====
    if state.startswith("CHANNEL"):
        pb_depth = calc_pb_depth(bars, ai_dir)
        pb_done_flag = detect_pb_complete(bars, ai_dir)
        h_count, h_type = detect_h1_h2(bars)

        if ai_dir == "AIL" and pb_depth >= 1/3 and pb_depth < 2/3 and pb_done_flag:
            if h_type in ("H1", "H2+"):
                pb_low = min(b.l for b in bars[-5:])
                sl = pb_low - avg_bar * 0.5
                tp = last.c + (last.c - sl) * 2
                r = (tp - last.c) / (last.c - sl) if last.c > sl else 0
                style = "Swing" if r >= 2 else "Scalp"
                return {
                    "side": "BUY", "playbook": "T6-CH-PB", "style": style,
                    "p": 0.55, "r": r, "sl": sl, "tp": tp,
                    "premise": f"Channel PB: {h_type} + PB depth {pb_depth:.1%}",
                }

        if ai_dir == "AIS" and pb_depth >= 1/3 and pb_depth < 2/3 and pb_done_flag:
            if h_type in ("L1", "L2+"):
                pb_high = max(b.h for b in bars[-5:])
                sl = pb_high + avg_bar * 0.5
                tp = last.c - (sl - last.c) * 2
                r = (last.c - tp) / (sl - last.c) if sl > last.c else 0
                style = "Swing" if r >= 2 else "Scalp"
                return {
                    "side": "SELL", "playbook": "T6-CH-PB", "style": style,
                    "p": 0.55, "r": r, "sl": sl, "tp": tp,
                    "premise": f"Channel PB: {h_type} + PB depth {pb_depth:.1%}",
                }

    return None


def check_pxr(signal: dict) -> tuple[bool, str]:
    """P×R 门槛检查（含手续费扣除）

    S5 Trader's Equation: P × R > (1-P) × Risk × safety_margin
    简化（Risk=1 unit）: P × R > (1-P) × margin
    Swing margin = 1.2 (20% 安全边际), Scalp margin = 1.0
    """
    p = signal["p"]
    r = signal["r"]

    # 精确手续费: Binance taker 0.04% × 2 sides = 0.08% of notional
    # Fee impact on R = 0.08% / SL_distance_pct
    entry = signal.get("entry_price", 0)
    sl = signal["sl"]
    if entry > 0 and sl > 0:
        sl_pct = abs(entry - sl) / entry * 100  # SL 距离百分比
        fee_pct = 0.08  # 0.08% 往返
        fee_r = fee_pct / sl_pct if sl_pct > 0 else 0.1  # fee 占 R 的比例
    else:
        fee_r = 0.05  # 默认 5%
    r_net = r * (1 - fee_r)

    style = signal["style"]

    if style == "Scalp":
        if p < 0.50:
            return False, f"PASS-RULE: Scalp P={p:.0%} < 50%"
        if r_net < 1.0:
            return False, f"PASS-RULE: Scalp R_net={r_net:.2f} < 1.0 (fee_r={fee_r:.1%})"
        # TE: P×R > (1-P) × 1.0
        te = p * r_net - (1 - p)
        if te <= 0:
            return False, f"PASS-RULE: Scalp TE={te:.3f} <= 0"
    else:  # Swing
        if p < 0.40:
            return False, f"PASS-RULE: Swing P={p:.0%} < 40%"
        if r_net < 1.5:
            return False, f"PASS-RULE: Swing R_net={r_net:.2f} < 1.5 (fee_r={fee_r:.1%})"
        # TE: P×R > (1-P) × 1.2 (20% safety margin)
        te = p * r_net - (1 - p) * 1.2
        if te <= 0:
            return False, f"PASS-RULE: Swing TE={te:.3f} <= 0 (P×R={p*r_net:.2f} vs {(1-p)*1.2:.2f})"

    return True, f"OK (TE={p*r_net-(1-p):.3f})"


# ========== 主回测循环 ==========

def fetch_multi_klines() -> dict:
    """获取多周期 K 线"""
    try:
        resp = requests.get(f"{BASE_URL}/klines/{SYMBOL}/multi", timeout=10)
        return resp.json()
    except Exception as e:
        print(f"  ❌ K 线获取失败: {e}")
        return {}


def advance_sim(bars: int = 12) -> dict:
    """推进 sim_server"""
    try:
        resp = requests.post(f"{BASE_URL}/sim/advance", params={"bars": bars}, timeout=10)
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def place_trade(signal: dict, balance: float) -> dict:
    """下单"""
    try:
        # 计算仓位
        calc_resp = requests.get(
            f"{BASE_URL}/trading/calculate-size/{BOT_ID}",
            params={
                "symbol": signal["symbol"],
                "entry_price": signal["entry_price"],
                "stop_loss": signal["sl"],
                "risk_percent": RISK_PCT,
            },
            timeout=5,
        ).json()
        qty = calc_resp.get("quantity", 0)
        if qty <= 0:
            return {"success": False, "reason": "qty=0"}

        # 下单
        order_resp = requests.post(
            f"{BASE_URL}/order",
            json={
                "symbol": SYMBOL,
                "side": signal["side"],
                "quantity": qty,
                "leverage": 100,
                "stop_loss": signal["sl"],
                "take_profit": signal["tp"],
                "bot_id": BOT_ID,
                "strategy": signal["playbook"],
                "order_type": "MARKET",
            },
            timeout=5,
        ).json()
        return order_resp
    except Exception as e:
        return {"success": False, "reason": str(e)}


def close_trade() -> dict:
    """平仓"""
    try:
        resp = requests.post(
            f"{BASE_URL}/order/{SYMBOL}/close",
            params={"bot_id": BOT_ID},
            timeout=5,
        ).json()
        return resp
    except Exception as e:
        return {"success": False, "reason": str(e)}


def get_positions() -> list:
    """获取持仓"""
    try:
        resp = requests.get(f"{BASE_URL}/positions", timeout=5)
        return resp.json()
    except:
        return []


def run_backtest(hours: int = 168, verbose: bool = False):
    """运行回测"""
    print(f"\n{'='*70}")
    print(f"  patrol-l1 V4.0 自动化回测")
    print(f"  场景: trend_bull (BTC 20k→40k)")
    print(f"  回测时长: {hours} 小时 ({hours/24:.1f} 天)")
    print(f"  每小时推进 12 根 5m K 线")
    print(f"{'='*70}\n")

    # 重置
    requests.post(f"{BASE_URL}/sim/reset", timeout=5)
    state = BacktestState()

    cycle_count = 0
    for hour in range(hours):
        # 推进 1 小时
        adv = advance_sim(12)
        vtime = adv.get("virtual_time", "?")
        step = adv.get("step", "?")

        # 获取 K 线
        multi = fetch_multi_klines()
        if not multi:
            continue

        cycle_count += 1

        # 检查持仓状态（SL/TP 由 sim_server 自动处理）
        positions = get_positions()
        has_position = len(positions) > 0

        # 如果有持仓被 SL/TP 清除了，记录
        # (sim_server 在 advance 时自动检查 SL/TP)

        # 多周期分析
        signals_this_cycle = []
        for tf in ["1h", "30m", "15m", "5m"]:
            tf_data = multi.get(tf, {})
            bars = parse_bars(tf_data)
            if len(bars) < 20:
                continue

            ai_dir = determine_ai_direction(bars)
            mkt_state = determine_market_state(bars, ai_dir)

            # 寻找入场信号
            signal = evaluate_entry(bars, ai_dir, mkt_state, tf)
            if signal:
                signal["timeframe"] = tf
                signal["entry_price"] = bars[-1].c
                signal["ai_dir"] = ai_dir
                signal["mkt_state"] = mkt_state
                signal["vtime"] = vtime

                # P×R 检查
                passed, reason = check_pxr(signal)
                if passed:
                    signals_this_cycle.append(signal)
                    state.signals.append(signal)
                    state.multi_tf_signals[tf] += 1
                else:
                    state.passes.append({
                        "time": vtime, "tf": tf, "reason": reason,
                        "playbook": signal["playbook"],
                    })
                    state.pass_rules += 1

        # 选择最佳信号（优先大周期，优先 Swing）
        if signals_this_cycle and not has_position:
            # 排序：大周期优先，Swing 优先
            tf_priority = {"1h": 0, "30m": 1, "15m": 2, "5m": 3}
            style_priority = {"Swing": 0, "Scalp": 1}
            signals_this_cycle.sort(key=lambda s: (
                tf_priority.get(s["timeframe"], 9),
                style_priority.get(s["style"], 9),
            ))
            best = signals_this_cycle[0]

            # 执行交易
            result = place_trade(best, state.balance)
            if result.get("success"):
                trade_info = {
                    "entry_time": vtime,
                    "side": best["side"],
                    "playbook": best["playbook"],
                    "style": best["style"],
                    "timeframe": best["timeframe"],
                    "premise": best["premise"],
                    "p": best["p"],
                    "r": best["r"],
                    "entry_price": best["entry_price"],
                    "sl": best["sl"],
                    "tp": best["tp"],
                }
                state.trades.append(trade_info)
                if best["style"] == "Scalp":
                    state.scalp_count += 1
                else:
                    state.swing_count += 1
                if "TR" in best["playbook"]:
                    state.tr_trades += 1
                else:
                    state.trend_trades += 1

                if verbose:
                    pr = best["p"] * best["r"]
                    print(f"  [{vtime}] 📊 TRADE: {best['side']} {best['playbook']} "
                          f"({best['style']}/{best['timeframe']}) "
                          f"@{best['entry_price']:.0f} SL={best['sl']:.0f} TP={best['tp']:.0f} "
                          f"P={best['p']:.0%} R={best['r']:.1f} P*R={pr:.2f}")
            else:
                if verbose:
                    print(f"  [{vtime}] ❌ ORDER FAILED: {result}")
        elif not signals_this_cycle:
            if verbose and hour % 24 == 0:
                # 每天报告一次无信号状态
                tf_data = multi.get("5m", {})
                bars = parse_bars(tf_data)
                ai_dir = determine_ai_direction(bars) if bars else "?"
                mkt_state = determine_market_state(bars, ai_dir) if bars else "?"
                print(f"  [{vtime}] 📋 No signal | AI={ai_dir} State={mkt_state} | step={step}")

        # 每 24 小时打印进度
        if (hour + 1) % 24 == 0:
            sim_status = requests.get(f"{BASE_URL}/sim/status", timeout=5).json()
            print(f"\n  === Day {(hour+1)//24} ({vtime}) ===")
            print(f"  Balance: ${sim_status.get('balance', 0):.2f} | "
                  f"Trades: {len(state.trades)} | "
                  f"Signals: {len(state.signals)} | "
                  f"Passes: {len(state.passes)} | "
                  f"Positions: {sim_status.get('positions', 0)}")

    # ========== 最终统计 ==========
    sim_log = requests.get(f"{BASE_URL}/sim/log", timeout=5).json()
    final_balance = sim_log.get("final_balance", 10000)
    total_pnl = sim_log.get("total_pnl", 0)
    completed_trades = sim_log.get("trades", [])

    wins = sum(1 for t in completed_trades if t.get("pnl", 0) > 0)
    losses = sum(1 for t in completed_trades if t.get("pnl", 0) <= 0)
    total_completed = wins + losses
    win_rate = wins / total_completed * 100 if total_completed > 0 else 0
    gross_profit = sum(t["pnl"] for t in completed_trades if t.get("pnl", 0) > 0)
    gross_loss = abs(sum(t["pnl"] for t in completed_trades if t.get("pnl", 0) <= 0))
    pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')

    print(f"\n{'='*70}")
    print(f"  回测结果 — patrol-l1 V4.0")
    print(f"{'='*70}")
    print(f"\n  周期: {hours} 小时 ({hours/24:.1f} 天)")
    print(f"  循环数: {cycle_count}")
    print(f"  起始余额: $10,000 → 最终余额: ${final_balance:.2f}")
    print(f"  总盈亏: ${total_pnl:.2f} ({total_pnl/100:.1f}%)")
    print(f"\n  === 交易统计 ===")
    print(f"  信号总数: {len(state.signals)}")
    print(f"  开仓次数: {len(state.trades)}")
    print(f"  完成交易: {total_completed} (Win: {wins} / Loss: {losses})")
    print(f"  胜率: {win_rate:.1f}%")
    print(f"  盈亏比 (PF): {pf:.2f}")
    print(f"  Scalp: {state.scalp_count} | Swing: {state.swing_count}")
    print(f"  趋势交易: {state.trend_trades} | TR 交易: {state.tr_trades}")
    print(f"\n  === 多周期信号分布 ===")
    for tf, count in state.multi_tf_signals.items():
        print(f"  {tf}: {count} 信号")
    print(f"\n  === PASS 分类 ===")
    print(f"  PASS-RULE: {state.pass_rules}")
    print(f"  PASS-WAIT: {state.pass_waits}")
    print(f"  Total passes: {len(state.passes)}")

    if completed_trades:
        print(f"\n  === 完成交易详情 ===")
        for i, t in enumerate(completed_trades, 1):
            pnl_str = f"+${t['pnl']:.2f}" if t['pnl'] > 0 else f"-${abs(t['pnl']):.2f}"
            emoji = "✅" if t['pnl'] > 0 else "❌"
            print(f"  {i}. {emoji} {t.get('side', '?')} @{t.get('entry_price', 0):.0f} "
                  f"→ @{t.get('exit_price', 0):.0f} | {pnl_str} | {t.get('strategy', '?')}")

    # 写结果到文件
    result_file = "data/pa_trader/backtest_v4_result.json"
    with open(result_file, "w") as f:
        json.dump({
            "version": "V4.0",
            "hours": hours,
            "final_balance": final_balance,
            "total_pnl": total_pnl,
            "signals": len(state.signals),
            "trades": len(state.trades),
            "completed": total_completed,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "profit_factor": pf,
            "scalp_count": state.scalp_count,
            "swing_count": state.swing_count,
            "trend_trades": state.trend_trades,
            "tr_trades": state.tr_trades,
            "multi_tf_signals": state.multi_tf_signals,
            "pass_count": len(state.passes),
            "completed_trades": completed_trades,
            "all_signals": [
                {"time": s["vtime"], "tf": s["timeframe"], "playbook": s["playbook"],
                 "style": s["style"], "side": s["side"], "p": s["p"], "r": s["r"]}
                for s in state.signals
            ],
        }, f, indent=2, ensure_ascii=False)
    print(f"\n  结果已保存到: {result_file}")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="patrol-l1 V4.0 自动化回测")
    parser.add_argument("--hours", type=int, default=168, help="回测小时数 (默认 168 = 1周)")
    parser.add_argument("--verbose", "-v", action="store_true", help="详细输出")
    args = parser.parse_args()

    run_backtest(hours=args.hours, verbose=args.verbose)
