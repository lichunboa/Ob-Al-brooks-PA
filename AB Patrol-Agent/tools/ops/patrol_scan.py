#!/usr/bin/env python3
"""
patrol_scan.py — PA 巡逻扫描器 v1.1

解决问题: 原始 patrol 每轮消耗 ~15,000 tokens（8个curl + 3个ref文件），
          10轮就撑爆 context window。
方案: 本地完成数据处理，只输出紧凑摘要（~30行/轮），降低 87% token 消耗。

用法:
  uv run python tools/ops/patrol_scan.py                         # 全品种扫描摘要
  uv run python tools/ops/patrol_scan.py --detail BNBUSDT        # 某品种详细5m K线
  uv run python tools/ops/patrol_scan.py --detail BNBUSDT --tf 15m  # 指定时间框架
  uv run python tools/ops/patrol_scan.py --positions              # 持仓管理摘要
  uv run python tools/ops/patrol_scan.py --full                   # 摘要 + 持仓 + 候选详情
"""

import argparse
import json
import os
import subprocess
from datetime import datetime
from urllib.request import Request, urlopen

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

API = "http://localhost:8092"  # 仅用于 can-trade 状态查询
SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
    "DOGEUSDT", "AAVEUSDT", "ADAUSDT", "AVAXUSDT",
]
TIMEFRAMES = ["5m", "15m", "30m", "1h"]
BOT_ID = "claude-pa"

# OKX bar 格式映射
OKX_BAR_MAP = {"5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H"}


# ─── HTTP ────────────────────────────────────────────────────────────────

def fetch_json(url: str) -> dict:
    try:
        with urlopen(Request(url), timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"_error": str(e)}


def fetch_okx_klines(symbol: str, bar: str, limit: int = 50) -> list:
    """直接从 OKX 获取 K 线数据（真实市场价格）"""
    try:
        r = subprocess.run(
            ["python3", os.path.join(SCRIPT_DIR, "okx_trader.py"),
             "klines", symbol, bar, str(limit)],
            capture_output=True, text=True, timeout=15
        )
        result = json.loads(r.stdout.strip())
        return result if isinstance(result, list) else []
    except Exception:
        return []


def calc_ema(values: list, period: int) -> list:
    """计算 EMA，返回等长列表，前 period-1 个为 None"""
    n = len(values)
    if n < period:
        return [None] * n
    result = [None] * (period - 1)
    sma = sum(values[:period]) / period
    result.append(sma)
    k = 2.0 / (period + 1)
    for v in values[period:]:
        result.append(result[-1] * (1 - k) + v * k)
    return result


def calc_atr(bars: list, period: int = 14) -> list:
    """计算 ATR14"""
    if len(bars) < 2:
        return [0.0] * len(bars)
    trs = [bars[0]["H"] - bars[0]["L"]]
    for i in range(1, len(bars)):
        h, low_price, pc = bars[i]["H"], bars[i]["L"], bars[i-1]["C"]
        trs.append(max(h - low_price, abs(h - pc), abs(low_price - pc)))
    atrs = [None] * (period - 1)
    if len(trs) >= period:
        atrs.append(sum(trs[:period]) / period)
        for i in range(period, len(trs)):
            atrs.append((atrs[-1] * (period - 1) + trs[i]) / period)
    return [a or 0.0 for a in atrs]


def okx_klines_to_tf_data(bars: list) -> dict:
    """将 OKX K 线列表转换为 scan_all 所需的 tf_data 格式"""
    if not bars or len(bars) < 5:
        return {}
    closes = [b["C"] for b in bars]
    emas = calc_ema(closes, 20)
    atrs = calc_atr(bars, 14)
    # 取最后20根用于分析
    bars20 = bars[-20:]
    ema20_val = next((e for e in reversed(emas) if e is not None), closes[-1])
    atr14_val = atrs[-1] if atrs else 0.0
    price = closes[-1]
    ema_dev = price - ema20_val
    ema_dev_pct = (ema_dev / ema20_val * 100) if ema20_val else 0
    pve = f"{ema_dev:+.1f} ({ema_dev_pct:+.2f}%)"
    return {
        "bars": bars20,
        "ema20": round(ema20_val, 4),
        "atr14": round(atr14_val, 4),
        "price_vs_ema": pve,
    }


# ─── Body 计算 ───────────────────────────────────────────────────────────

def bar_body(bar: dict) -> float:
    """直接用 C-O 计算 body，避免 API 预格式化字符串的精度丢失"""
    return bar["C"] - bar["O"]


def bar_range(bar: dict) -> float:
    return bar["H"] - bar["L"]


# ─── AI 方向判断 (v2: body加权动量 + EMA位置) ─────────────────────────────

def compute_ai(bars: list, ema20: float, atr14: float) -> tuple:
    """
    Al Brooks AI 方向判断:
    1. body加权动量（大K线权重高，近期K线权重高）
    2. EMA 位置（价格在EMA上方→多头加分）
    3. 整体结构（价格区间高低点位置）

    返回 (direction, strength)
    direction: AIL / AIS / TR
    strength:  strong / moderate / weak
    """
    if len(bars) < 10:
        return ("TR", "insufficient")

    browse = bars[-80:] if len(bars) >= 80 else bars
    recent = browse[-20:] if len(browse) >= 20 else browse
    n = len(recent)
    price = recent[-1]["C"]

    # ATR 归一化基准（防止跨品种比较偏差）
    norm = atr14 if atr14 > 0 else abs(price * 0.001) or 1.0

    # ── 信号1: body加权动量 ──
    # 近期K线权重更高 (线性递增), 大body权重更高
    weighted_sum = 0
    weight_total = 0
    weight_sum = n * (n + 1) / 2 if n > 0 else 1
    for i, b in enumerate(recent):
        w = (i + 1)  # 时间权重: 1,2,...,10
        body = bar_body(b)
        weighted_sum += body * w
        weight_total += abs(body) * w

    # 归一化到 [-1, +1]
    momentum = weighted_sum / (norm * weight_sum) if norm else 0

    # ── 信号2: EMA 距离 ──
    ema_dist = (price - ema20) / norm if norm else 0
    ema_signal = max(-2, min(2, ema_dist))  # clamp to [-2, +2]

    # ── 信号3: 80+20 读盘结构 ──
    # browse 窗口看整体位置，recent 窗口看当前执行端。
    window_high = max(b["H"] for b in browse)
    window_low = min(b["L"] for b in browse)
    window_range = window_high - window_low
    if window_range > 0:
        price_position = (price - window_low) / window_range  # 0=底部, 1=顶部
    else:
        price_position = 0.5

    structure = (price_position - 0.5) * 2  # 归一化到 [-1, +1]

    # ── 综合评分 ──
    score = momentum * 0.45 + ema_signal * 0.35 + structure * 0.20

    # 阈值判断
    if score > 0.25:
        strength = "strong" if score > 0.6 else "moderate"
        return ("AIL", strength)
    elif score < -0.25:
        strength = "strong" if score < -0.6 else "moderate"
        return ("AIS", strength)
    else:
        return ("TR", "mixed" if abs(score) > 0.1 else "flat")


# ─── 市场状态 ────────────────────────────────────────────────────────────

def market_state(bars: list, ai_dir: str) -> str:
    """识别 BO / TC / BC / TR"""
    if len(bars) < 12 or ai_dir == "TR":
        return "TR"

    recent = bars[-20:] if len(bars) >= 20 else bars
    n = len(recent)

    # 重叠度: 当前bar范围与前bar范围重叠
    overlap = 0
    for i in range(1, n):
        inter = min(recent[i]["H"], recent[i - 1]["H"]) - max(recent[i]["L"], recent[i - 1]["L"])
        union = max(recent[i]["H"], recent[i - 1]["H"]) - min(recent[i]["L"], recent[i - 1]["L"])
        if union > 0 and inter > 0:
            overlap += inter / union
    overlap_pct = overlap / (n - 1) if n > 1 else 1

    # 连续同向 bar
    max_run = 1
    run = 1
    for i in range(1, n):
        same_dir = (bar_body(recent[i]) > 0) == (bar_body(recent[i - 1]) > 0)
        if same_dir and bar_body(recent[i]) != 0:
            run += 1
            max_run = max(max_run, run)
        else:
            run = 1

    if max_run >= 5 and overlap_pct < 0.4:
        return "BO"
    elif overlap_pct < 0.55:
        return "TC"
    elif overlap_pct < 0.72:
        return "BC"
    else:
        return "TR"


# ─── 信号检测 (H1/H2/L1/L2) ────────────────────────────────────────────

def detect_signals(bars: list, ai_dir: str) -> str:
    """在5m K线中检测 H1/H2 或 L1/L2 入场信号"""
    if len(bars) < 10 or ai_dir not in ("AIL", "AIS"):
        return ""

    recent = bars[-20:] if len(bars) >= 20 else bars
    n = len(recent)

    if ai_dir == "AIL":
        # 找最近的 PB 起点（bear bar 或 lower low）
        pb_end = -1
        for i in range(n - 2, max(0, n - 15), -1):
            if bar_body(recent[i]) < 0 or recent[i]["L"] < recent[max(0, i - 1)]["L"]:
                pb_end = i
                break
        if pb_end < 0:
            return ""

        # 从 PB 之后数 H 信号
        h_count = 0
        h_price = 0
        for i in range(pb_end, n):
            if i > 0 and recent[i]["H"] > recent[i - 1]["H"] and bar_body(recent[i]) >= 0:
                h_count += 1
                h_price = recent[i]["H"]
        if h_count >= 2:
            return f"H2@{h_price}"
        elif h_count == 1:
            return f"H1@{h_price}"

    elif ai_dir == "AIS":
        pb_end = -1
        for i in range(n - 2, max(0, n - 15), -1):
            if bar_body(recent[i]) > 0 or recent[i]["H"] > recent[max(0, i - 1)]["H"]:
                pb_end = i
                break
        if pb_end < 0:
            return ""

        l_count = 0
        l_price = 0
        for i in range(pb_end, n):
            if i > 0 and recent[i]["L"] < recent[i - 1]["L"] and bar_body(recent[i]) <= 0:
                l_count += 1
                l_price = recent[i]["L"]
        if l_count >= 2:
            return f"L2@{l_price}"
        elif l_count == 1:
            return f"L1@{l_price}"

    return ""


# ─── 精度检测 ────────────────────────────────────────────────────────────

def precision_ok(bars: list) -> bool:
    """价格精度是否足以做 PA 分析（DOGE/ADA 等低价币可能不够）
    使用 C-O 直接计算避免 API body 字段四舍五入丢精度"""
    if len(bars) < 5:
        return False
    sample = bars[-10:]
    avg_body = sum(abs(bar_body(b)) for b in sample) / len(sample)
    # 也检查 H-L range，因为即使 body 小，range 可能足够
    avg_range = sum(bar_range(b) for b in sample) / len(sample)
    price = bars[-1]["C"]
    if price <= 0:
        return False
    # body 或 range 占价格的比例超过 0.02% 就够
    return (avg_body / price) > 0.0002 or (avg_range / price) > 0.0005


# ─── 动量衰减检测 ─────────────────────────────────────────────────────────

def momentum_fading(bars: list) -> bool:
    """检测连续 body 递减（exhaustion 信号）"""
    if len(bars) < 5:
        return False
    recent_bodies = [abs(bar_body(b)) for b in bars[-5:]]
    if recent_bodies[0] == 0:
        return False
    # 连续3根递减
    decreasing = all(recent_bodies[i] <= recent_bodies[i - 1] for i in range(1, len(recent_bodies)))
    return decreasing and recent_bodies[-1] < recent_bodies[0] * 0.5


# ─── 多周期一致性评分 ─────────────────────────────────────────────────────

def alignment_score(tf_results: dict) -> tuple:
    """
    多周期方向一致性评分
    返回 (dominant_direction, score 0-4, detail_str)
    """
    dirs = {}
    for tf in TIMEFRAMES:
        if tf in tf_results:
            d = tf_results[tf]["ai"]
            dirs[tf] = d

    ail_count = sum(1 for d in dirs.values() if d == "AIL")
    ais_count = sum(1 for d in dirs.values() if d == "AIS")

    if ail_count >= ais_count:
        dom = "AIL"
        score = ail_count
    else:
        dom = "AIS"
        score = ais_count

    if score <= 1:
        dom = "TR"

    detail = "/".join(dirs.get(tf, "?") for tf in TIMEFRAMES)
    return dom, score, detail


# ─── 扫描主函数 ──────────────────────────────────────────────────────────

def scan_all() -> list:
    """扫描所有品种 — 使用 OKX 真实市场数据"""
    results = []
    for sym in SYMBOLS:
        r = {"symbol": sym, "tfs": {}}

        for tf in TIMEFRAMES:
            raw_bars = fetch_okx_klines(sym, OKX_BAR_MAP[tf], 50)
            if not raw_bars:
                continue

            td = okx_klines_to_tf_data(raw_bars)
            if not td:
                continue

            bars = td["bars"]
            ema20 = td["ema20"]
            atr14 = td["atr14"]
            ai_dir, ai_str = compute_ai(bars, ema20, atr14)
            r["tfs"][tf] = {
                "ai": ai_dir,
                "ai_str": ai_str,
                "ema20": ema20,
                "atr14": atr14,
                "pve": td["price_vs_ema"],
                "price": bars[-1]["C"],
                "bars": bars,  # 保留用于 detail 输出
            }

        # 精度检查（基于5m）
        bars_5m = r["tfs"].get("5m", {}).get("bars", [])
        r["ok"] = precision_ok(bars_5m) if bars_5m else False

        # 5m 信号检测
        if r["ok"] and "5m" in r["tfs"]:
            ai5 = r["tfs"]["5m"]["ai"]
            r["signal"] = detect_signals(bars_5m, ai5)
            r["state"] = market_state(bars_5m, ai5)
            r["fading"] = momentum_fading(bars_5m)
        else:
            r["signal"] = ""
            r["state"] = "-"
            r["fading"] = False

        # 多周期一致性
        r["dom"], r["align"], r["tf_line"] = alignment_score(r["tfs"])

        results.append(r)
    return results


# ─── 持仓扫描 ────────────────────────────────────────────────────────────

def scan_positions() -> list:
    # claude-pa 持仓来自 OKX，不从 8092 读取
    try:
        r = subprocess.run(
            ["python3", os.path.join(SCRIPT_DIR, "okx_trader.py"), "positions"],
            capture_output=True, text=True, timeout=10
        )
        positions = json.loads(r.stdout.strip())
        return positions if isinstance(positions, list) else []
    except Exception:
        return []


def position_summary(positions: list, scan_results: list) -> list:
    """对每个持仓做 AI 方向判断"""
    summaries = []
    for pos in positions:
        sym = pos["symbol"].replace(":USDT", "USDT").replace("/", "")
        side = pos["side"]
        entry = pos["entry_price"]
        mark = pos["mark_price"]
        pnl = pos["unrealized_pnl"]
        qty = pos.get("contracts", pos.get("quantity", 0))
        pnl_pct = ((mark - entry) / entry * 100) if side == "LONG" else ((entry - mark) / entry * 100)

        # 找对应的扫描结果
        scan = next((r for r in scan_results if r["symbol"].replace(":USDT", "USDT") == sym), None)
        ai5 = scan["tfs"]["5m"]["ai"] if scan and "5m" in scan.get("tfs", {}) else "?"
        dom = scan["dom"] if scan else "?"

        # 判断 premise
        if side == "LONG":
            action = "HOLD" if dom == "AIL" else ("WARN" if dom == "TR" else "CLOSE")
        else:
            action = "HOLD" if dom == "AIS" else ("WARN" if dom == "TR" else "CLOSE")

        summaries.append({
            "symbol": sym, "side": side, "qty": qty,
            "entry": entry, "mark": mark,
            "pnl": pnl, "pnl_pct": pnl_pct,
            "ai5": ai5, "dom": dom,
            "action": action,
        })
    return summaries


# ─── 输出格式化 ──────────────────────────────────────────────────────────

STRENGTH_ICON = {"strong": "★", "moderate": "", "weak": "↓", "mixed": "~", "flat": "=", "insufficient": "?"}


def print_scan(results: list):
    now = datetime.now().strftime("%H:%M")
    print(f"═══ SCAN {now} ═══ {len(SYMBOLS)} symbols ═══")

    candidates = []
    for r in results:
        sym = r["symbol"][:7].ljust(7)

        if "_error" in r:
            print(f"{sym} ERROR: {r['_error']}")
            continue

        if not r.get("ok"):
            print(f"{sym} {r.get('tf_line', '?')} | ⚠️精度不足")
            continue

        # 紧凑 TF 行
        parts = []
        for tf in TIMEFRAMES:
            if tf in r["tfs"]:
                d = r["tfs"][tf]
                icon = STRENGTH_ICON.get(d["ai_str"], "")
                parts.append(f"{tf}:{d['ai']}{icon}")
            else:
                parts.append(f"{tf}:?")
        tf_str = " ".join(parts)

        state = r["state"]
        sig = r["signal"] or "-"
        align = r["align"]
        fade = " FADE" if r["fading"] else ""
        pve = r["tfs"].get("5m", {}).get("pve", "?")

        line = f"{sym} {tf_str} | St:{state} A:{align}/4 | Sig:{sig}{fade} | ema:{pve}"
        print(line)

        if r["signal"] and "H2" in r["signal"] or "L2" in r["signal"]:
            candidates.append(r)

    if candidates:
        print(f"\n🎯 CANDIDATES: {', '.join(c['symbol'] + '(' + c['signal'] + ')' for c in candidates)}")
    else:
        print("\n⏸ 无入场信号")

    return candidates


def print_positions(pos_summaries: list):
    if not pos_summaries:
        print("═══ 持仓: 无 ═══")
        return

    print(f"═══ 持仓: {len(pos_summaries)} ═══")
    for p in pos_summaries:
        icon = {"HOLD": "✅", "WARN": "⚠️", "CLOSE": "❌"}.get(p["action"], "?")
        pnl_sign = "+" if p["pnl"] >= 0 else ""
        print(
            f"  {p['symbol'][:7].ljust(7)} {p['side'][:1]} "
            f"qty:{p['qty']} entry:{p['entry']:.2f} "
            f"pnl:{pnl_sign}{p['pnl']:.2f} ({p['pnl_pct']:+.2f}%) "
            f"AI:{p['dom']} {icon}{p['action']}"
        )

    # 需要平仓的
    to_close = [p for p in pos_summaries if p["action"] == "CLOSE"]
    if to_close:
        print(f"\n❌ CLOSE NEEDED: {', '.join(p['symbol'] for p in to_close)}")


def print_detail(results: list, symbol: str, tf_filter: str = "5m", num_bars: int = 20):
    """输出某品种某周期的详细K线"""
    r = next((x for x in results if x["symbol"] == symbol), None)
    if not r:
        print(f"未找到 {symbol}")
        return

    tfs_to_show = [tf_filter] if tf_filter != "all" else TIMEFRAMES
    for tf in tfs_to_show:
        if tf not in r.get("tfs", {}):
            print(f"{symbol} {tf}: 无数据")
            continue

        td = r["tfs"][tf]
        bars = td["bars"][-num_bars:]
        print(f"\n--- {symbol} {tf} --- AI:{td['ai']}({td['ai_str']}) EMA:{td['ema20']} ATR:{td['atr14']} ---")

        prev = None
        for b in bars:
            time = b["time"][-5:]
            body_val = bar_body(b)
            arrow = "▲" if body_val > 0 else ("▼" if body_val < 0 else "─")

            # 标注
            ann = []
            if prev:
                if b["H"] > prev["H"]:
                    ann.append("HH")
                if b["L"] > prev["L"]:
                    ann.append("HL")
                if b["H"] < prev["H"]:
                    ann.append("LH")
                if b["L"] < prev["L"]:
                    ann.append("LL")

            ann_str = f" [{','.join(ann)}]" if ann else ""
            print(f"  {time} O:{b['O']:>9} H:{b['H']:>9} L:{b['L']:>9} C:{b['C']:>9} {arrow}{body_val:>+8.2f}{ann_str}")
            prev = b


def get_okx_balance():
    """从 OKX 获取实际余额（claude-pa 独立账户）"""
    try:
        r = subprocess.run(
            ["python3", os.path.join(SCRIPT_DIR, "okx_trader.py"), "balance"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(r.stdout.strip())
        return data.get("available", 0), data.get("usdt_equity", 0)
    except Exception:
        return None, None


def get_okx_positions():
    """从 OKX 获取实际持仓数量"""
    try:
        r = subprocess.run(
            ["python3", os.path.join(SCRIPT_DIR, "okx_trader.py"), "positions"],
            capture_output=True, text=True, timeout=10
        )
        positions = json.loads(r.stdout.strip())
        return len(positions) if isinstance(positions, list) else 0
    except Exception:
        return 0


def print_bot_status():
    """Bot 状态 + OKX 实际数据（claude-pa 独立OKX账户）"""
    # OKX 实际数据（权威来源）
    avail, equity = get_okx_balance()
    okx_pos = get_okx_positions()

    # 8092 仅用于 can-trade 和 K线服务状态
    bot = fetch_json(f"{API}/trading/bot-summary/{BOT_ID}")
    can = bot.get("can_trade", True) if "_error" not in bot else True
    reason = bot.get("can_trade_reason", "OK") if "_error" not in bot else "OK"

    health = fetch_json(f"{API}/health")
    svc = "UP" if health.get("status") == "healthy" else "DOWN"

    if avail is not None:
        print(
            f"Bot:{BOT_ID}(OKX) | KlineSvc:{svc} | "
            f"Pos:{okx_pos} | OKX余额:${avail:.0f} | "
            f"Trade:{'YES' if can else 'NO'}({reason})"
        )
    else:
        print(
            f"Bot:{BOT_ID}(OKX) | KlineSvc:{svc} | "
            f"Pos:{okx_pos} | OKX余额:获取失败 | "
            f"Trade:{'YES' if can else 'NO'}({reason})"
        )


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="PA 巡逻扫描器")
    p.add_argument("--detail", type=str, help="显示某品种详细K线")
    p.add_argument("--tf", type=str, default="5m", help="详细模式的时间框架 (默认5m, 可选all)")
    p.add_argument("--bars", type=int, default=20, help="详细模式K线数量")
    p.add_argument("--positions", action="store_true", help="显示持仓管理")
    p.add_argument("--full", action="store_true", help="完整模式: 状态+持仓+扫描+候选详情")
    p.add_argument("--symbols", type=str, help="逗号分隔的品种列表")
    args = p.parse_args()

    global SYMBOLS
    if args.symbols:
        SYMBOLS = [s.strip() for s in args.symbols.split(",")]

    # 扫描
    results = scan_all()

    if args.detail:
        print_detail(results, args.detail, args.tf, args.bars)
        return

    if args.full:
        # 1. Bot 状态
        print_bot_status()
        print()

        # 2. 持仓
        my_pos = scan_positions()
        pos_sum = position_summary(my_pos, results) if my_pos else []
        print_positions(pos_sum)
        print()

        # 3. 扫描
        candidates = print_scan(results)

        # 4. 候选详情（自动展开）
        for c in candidates:
            print_detail(results, c["symbol"], "5m", 20)
        return

    if args.positions:
        my_pos = scan_positions()
        pos_sum = position_summary(my_pos, results) if my_pos else []
        print_positions(pos_sum)
        return

    # 默认: 只输出摘要
    print_bot_status()
    print()
    print_scan(results)


if __name__ == "__main__":
    main()
