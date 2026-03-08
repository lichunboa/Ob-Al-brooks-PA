#!/usr/bin/env python3
"""
patrol_trade.py — PA 交易执行网关 v1.0

所有 claude-pa 的开仓必须通过此脚本。
它会强制校验分析日志是否完整，缺项则拒绝下单。

用法:
  python3 scripts/patrol_trade.py \\
    --symbol AAVEUSDT \\
    --side BUY \\
    --entry 118.5 \\
    --sl 117.2 \\
    --tp 121.0 \\
    --risk 2 \\
    --strategy "H2_PB_EMA" \\
    --ai-direction "5m:AIL 15m:AIL 1h:AIL 4h:AIL" \\
    --market-state "TC" \\
    --signal-bar "06:00 bull +0.16, close near high, small upper wick" \\
    --equation "P=55% R=2.5 PxR=1.38" \\
    --refs "1-direction.md,3a-trend-entries.md,4-evaluation.md" \\
    --bar-reading "5m最近10根: 3阳后PB到117.58(L2), H1@118.56, H2@118.74触发, signal bar是bull close near high"

缺少任何必填字段 → 拒绝下单 + 打印缺什么。
"""

import json
import sys
import argparse
import os
import re
from datetime import datetime
from urllib.request import urlopen, Request

API = "http://localhost:8092"
BOT_ID = "claude-pa"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
LOG_PATH = os.path.join(PROJECT_ROOT, "data", "pa_trader", "pa_trader.log")

# ─── 必填字段定义 ─────────────────────────────────────────────────────────

REQUIRED_FIELDS = {
    "symbol":       "交易品种 (e.g. AAVEUSDT)",
    "side":         "方向 BUY/SELL",
    "entry":        "入场价",
    "sl":           "止损价",
    "tp":           "止盈价",
    "risk":         "风险百分比",
    "strategy":     "策略名 (e.g. H2_PB_EMA, L2_TC, BO_FT)",
    "ai_direction": "多周期AI方向 (e.g. '5m:AIL 15m:AIL 1h:AIL 4h:AIL')",
    "market_state": "市场状态 (BO/TC/BC/TR)",
    "signal_bar":   "信号K线描述 (类型/body/影线/位置)",
    "equation":     "Trader's Equation (P=xx% R=x.x PxR=x.xx)",
    "refs":         "读过的reference文件 (逗号分隔)",
    "bar_reading":  "5m逐根读K线摘要 (至少描述最近10根的结构)",
}

STYLE_PROFILES = {
    "SCALP": {"label": "Scalp", "min_p": 0.50, "min_rr": 1.0},
    "SWING_TREND": {"label": "Swing(顺势)", "min_p": 0.50, "min_rr": 1.5},
    "SWING_REVERSAL": {"label": "Swing(逆势/MTR)", "min_p": 0.40, "min_rr": 2.0},
    "REVERSAL_PROBE": {"label": "反转试探", "min_p": 0.40, "min_rr": 2.0},
}

# ─── Trader's Equation 校验 ───────────────────────────────────────────────

def _parse_probability(raw: str) -> float:
    value = float(raw.replace("%", ""))
    if "%" in raw or value > 1:
        value /= 100.0
    return value


def parse_equation_metrics(eq_str: str) -> tuple[bool, dict]:
    try:
        compact = eq_str.upper().replace(" ", "")
        p_match = re.search(r"P=([0-9.]+%?)", compact)
        r_match = re.search(r"R=([0-9.]+)", compact)
        pxr_match = re.search(r"(?:PXR|P×R)=([0-9.]+)", compact)
        if not p_match or not r_match:
            raise ValueError("missing P/R")

        probability = _parse_probability(p_match.group(1))
        reward_multiple = float(r_match.group(1))
        pxr = float(pxr_match.group(1)) if pxr_match else probability * reward_multiple
        rhs = 1.0 - probability
        return True, {
            "p": probability,
            "r": reward_multiple,
            "pxr": pxr,
            "rhs": rhs,
        }
    except (ValueError, IndexError):
        return False, {
            "error": f"无法解析 Trader's Equation: '{eq_str}'，格式应为 'P=55% R=2.5 PxR=1.38'",
        }


def validate_equation(eq_str: str) -> tuple:
    """解析并校验 Trader's Equation, 返回 (ok, message)

    与 S5-evaluation 保持一致：
      P × R > (1 - P)
    其中 P 既兼容 `56%` 也兼容 `0.56` 写法。
    """
    ok, metrics = parse_equation_metrics(eq_str)
    if not ok:
        return False, metrics["error"]
    if metrics["pxr"] <= metrics["rhs"]:
        return False, f"P×R={metrics['pxr']:.2f} <= (1-P)={metrics['rhs']:.2f}，交易方程不成立"
    return True, f"P×R={metrics['pxr']:.2f} > (1-P)={metrics['rhs']:.2f} ✓"


def validate_refs(refs_str: str) -> tuple:
    """校验reference文件列表"""
    refs = [r.strip() for r in refs_str.split(",") if r.strip()]
    if len(refs) < 2:
        return False, f"至少需要2个reference文件，当前只有{len(refs)}个"
    valid_refs = [
        "0-reading.md", "1-direction.md", "2-market-state.md",
        "3a-trend-entries.md", "3b-reversal-entries.md",
        "4-evaluation.md", "5-execution.md", "6-management.md",
        "S0-daily-bias.md", "S1-reading.md", "S2-direction.md", "S3-market-state.md",
        "S3b-key-levels.md", "S4-strategy-match.md", "S5-evaluation.md",
        "S6-bo.md", "S6-channel.md", "S6-common.md", "S6-reversal.md",
        "S6-tr.md", "S7-management.md",
    ]
    invalid = [r for r in refs if r not in valid_refs]
    if invalid:
        return False, f"无效的reference文件: {invalid}"
    return True, f"References: {refs} ✓"


def validate_bar_reading(reading: str) -> tuple:
    """校验逐根读K线描述是否足够详细"""
    min_length = 50  # 至少50字符
    if len(reading) < min_length:
        return False, f"K线读盘描述太短({len(reading)}字符)，至少需要{min_length}字符的具体分析"
    # 检查是否包含关键PA术语
    pa_terms = ["bull", "bear", "PB", "BO", "H1", "H2", "L1", "L2", "EMA",
                "trend", "TR", "doji", "阳", "阴", "回撤", "突破", "signal"]
    found = [t for t in pa_terms if t.lower() in reading.lower()]
    if len(found) < 3:
        return False, f"K线读盘缺少PA术语(只找到{found})，看起来不像认真分析"
    return True, f"Bar reading: {len(reading)}字符, 含PA术语{found} ✓"


def _parse_refs(refs: str | list[str] | None) -> set[str]:
    if isinstance(refs, list):
        return {str(item).strip().upper() for item in refs if str(item).strip()}
    if isinstance(refs, str):
        return {part.strip().upper() for part in refs.split(",") if part.strip()}
    return set()


def classify_trade_style(style: str = "", strategy: str = "", market_state: str = "", refs: str | list[str] | None = None) -> tuple[str, dict]:
    raw = " ".join(part for part in [style, strategy] if str(part).strip())
    text = raw.upper()
    state_upper = str(market_state or "").upper()
    explicit = str(style or "").strip().lower()
    ref_set = _parse_refs(refs)

    def contains(*tokens: str) -> bool:
        return any(token.upper() in text for token in tokens)

    if any(token in explicit for token in ["probe", "试探"]):
        key = "REVERSAL_PROBE"
    elif "scalp" in explicit or "剥头皮" in explicit:
        key = "SCALP"
    elif "swing" in explicit:
        if any(token in explicit for token in ["mtr", "逆势", "反转", "弱势", "reversal"]):
            key = "SWING_REVERSAL"
        else:
            key = "SWING_TREND"
    elif contains("PROBE", "试探"):
        key = "REVERSAL_PROBE"
    elif "S6-REVERSAL.MD" in ref_set:
        key = "REVERSAL_PROBE" if contains("PROBE", "试探") else "SWING_REVERSAL"
    elif "S6-TR.MD" in ref_set:
        key = "SCALP"
    elif contains("MTR", "REVERSAL", "DT", "DB", "WEDGE", "HSB", "反转", "FAILED_BO_FADE", "TR_FADE"):
        key = "SWING_REVERSAL"
    elif contains("SCALP", "BLSHS", "TR_FADE", "FAILED_BO_FADE", "LIMIT_ORDER_MARKET"):
        key = "SCALP"
    elif state_upper == "TR":
        key = "SCALP"
    elif "S6-BO.MD" in ref_set or "S6-CHANNEL.MD" in ref_set:
        key = "SWING_TREND"
    elif state_upper in {"BO", "TC", "BC"}:
        # S5 明确要求默认按顺势 swing 思考，BC 不能因为“宽通道”就自动降级为 scalp。
        key = "SWING_TREND"
    else:
        key = "SWING_TREND"
    return key, STYLE_PROFILES[key]


def validate_stop_loss(
    side: str,
    entry: float,
    sl: float,
    tp: float,
    strategy: str = "",
    style: str = "",
    equation: str = "",
    market_state: str = "",
    refs: str | list[str] | None = None,
) -> tuple:
    """校验止损止盈合理性，风格门槛严格对齐 S5-evaluation。"""
    if side == "BUY":
        if sl >= entry:
            return False, f"BUY单止损{sl}应低于入场{entry}"
        if tp <= entry:
            return False, f"BUY单止盈{tp}应高于入场{entry}"
        risk = entry - sl
        reward = tp - entry
    else:
        if sl <= entry:
            return False, f"SELL单止损{sl}应高于入场{entry}"
        if tp >= entry:
            return False, f"SELL单止盈{tp}应低于入场{entry}"
        risk = sl - entry
        reward = entry - tp

    rr = reward / risk if risk > 0 else 0

    style_key, profile = classify_trade_style(style, strategy, market_state, refs)
    min_rr = float(profile["min_rr"])
    min_p = float(profile["min_p"])
    if rr < min_rr:
        return False, f"盈亏比{rr:.2f} < {min_rr:.2f} [{profile['label']}]"

    if equation:
        ok, metrics = parse_equation_metrics(equation)
        if not ok:
            return False, metrics["error"]
        if metrics["p"] < min_p:
            return False, f"概率{metrics['p'] * 100:.0f}% < {min_p * 100:.0f}% [{profile['label']}]"
        if metrics["r"] < min_rr:
            return False, f"Trader's Equation中的R={metrics['r']:.2f} < {min_rr:.2f} [{profile['label']}]"
    return True, f"Risk={risk:.2f} Reward={reward:.2f} R:R={rr:.2f} [{profile['label']}] ✓"


# ─── 下单执行（通过 okx_trader.py）─────────────────────────────────────────

import subprocess
OKX_TRADER = os.path.join(SCRIPT_DIR, "okx_trader.py")


def run_okx(args_list: list) -> dict:
    """调用 okx_trader.py 并返回 JSON 结果"""
    try:
        result = subprocess.run(
            ["python3", OKX_TRADER] + args_list,
            capture_output=True, text=True, timeout=15,
            cwd=PROJECT_ROOT,
        )
        return json.loads(result.stdout) if result.stdout.strip() else {"_error": result.stderr or "empty output"}
    except Exception as e:
        return {"_error": str(e)}


def calculate_size(symbol: str, entry: float, sl: float, risk_usdt: float) -> dict:
    return run_okx(["calc-size", symbol, str(entry), str(sl), str(risk_usdt)])


def place_order(symbol: str, side: str, qty: float, leverage: int,
                sl: float, tp: float) -> dict:
    cmd = ["order", symbol, side.lower(), str(qty), str(leverage),
           "--sl", str(sl), "--tp", str(tp)]
    return run_okx(cmd)


def write_log(message: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a") as f:
        f.write(f"{timestamp} {message}\n")


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="PA 交易执行网关 — 校验分析完整性后才允许下单",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--symbol", required=True)
    p.add_argument("--side", required=True, choices=["BUY", "SELL"])
    p.add_argument("--entry", required=True, type=float)
    p.add_argument("--sl", required=True, type=float)
    p.add_argument("--tp", required=True, type=float)
    p.add_argument("--risk", required=True, type=float)
    p.add_argument("--strategy", required=True)
    p.add_argument("--ai-direction", required=True, dest="ai_direction")
    p.add_argument("--market-state", required=True, dest="market_state")
    p.add_argument("--signal-bar", required=True, dest="signal_bar")
    p.add_argument("--equation", required=True)
    p.add_argument("--refs", required=True)
    p.add_argument("--bar-reading", required=True, dest="bar_reading")
    p.add_argument("--style", default="", help="交易风格：Scalp / Swing / 逆势 / 试探")
    p.add_argument("--dry-run", action="store_true", help="只校验不下单")
    p.add_argument("--leverage", type=int, default=125)

    args = p.parse_args()

    print("=" * 60)
    print("PA TRADE GATE — 开仓前校验")
    print("=" * 60)

    # ── 逐项校验 ──
    errors = []
    warnings = []

    # 1. Trader's Equation
    ok, msg = validate_equation(args.equation)
    print(f"{'✅' if ok else '❌'} Equation: {msg}")
    if not ok:
        errors.append(msg)

    # 2. Reference files
    ok, msg = validate_refs(args.refs)
    print(f"{'✅' if ok else '❌'} Refs: {msg}")
    if not ok:
        errors.append(msg)

    # 3. Bar reading quality
    ok, msg = validate_bar_reading(args.bar_reading)
    print(f"{'✅' if ok else '❌'} Reading: {msg}")
    if not ok:
        errors.append(msg)

    # 4. Stop loss / Take profit (R:R 按策略类型分档)
    ok, msg = validate_stop_loss(
        args.side,
        args.entry,
        args.sl,
        args.tp,
        args.strategy,
        args.style,
        args.equation,
        args.market_state,
        args.refs,
    )
    print(f"{'✅' if ok else '❌'} SL/TP: {msg}")
    if not ok:
        errors.append(msg)

    # 5. AI direction — 至少3/4周期同向
    ai_parts = args.ai_direction.replace(",", " ").split()
    target_dir = "AIL" if args.side == "BUY" else "AIS"
    aligned = sum(1 for part in ai_parts if target_dir in part.upper())
    if aligned < 3:
        msg = f"AI对齐不足: {args.side}需要至少3个TF为{target_dir}，当前只有{aligned}个"
        print(f"❌ Alignment: {msg}")
        errors.append(msg)
    else:
        print(f"✅ Alignment: {aligned}/4 TF = {target_dir} ✓")

    # 6. Market state vs strategy 一致性
    state = args.market_state.upper()
    if state == "TR" and "BO" in args.strategy.upper():
        msg = "TR状态下不应做BO策略"
        print(f"⚠️  State: {msg}")
        warnings.append(msg)
    else:
        print(f"✅ State: {state} + {args.strategy} 一致")

    print("-" * 60)

    # ── 结果判定 ──
    if errors:
        print(f"\n❌ 校验失败 ({len(errors)}项错误):")
        for e in errors:
            print(f"   • {e}")
        print("\n🚫 下单被拒绝。修正以上问题后重试。")
        sys.exit(1)

    if warnings:
        print(f"\n⚠️  警告 ({len(warnings)}项):")
        for w in warnings:
            print(f"   • {w}")

    print("\n✅ 全部校验通过")

    # ── 计算仓位（通过 okx_trader.py calc-size）──
    risk_usdt = args.risk  # 直接传 USDT 金额（如 60 = $3000 * 2%）
    size_info = calculate_size(args.symbol, args.entry, args.sl, risk_usdt)
    if "_error" in size_info:
        print(f"\n❌ 仓位计算失败: {size_info['_error']}")
        sys.exit(1)

    qty = size_info.get("contracts") or size_info.get("size") or size_info.get("quantity", 0)
    leverage = size_info.get("leverage", args.leverage)
    print(f"\n📐 仓位计算: qty={qty} lev={leverage}x (risk=${risk_usdt})")

    if args.dry_run:
        print("\n🔍 DRY RUN — 不实际下单")
        print(f"   Order: {args.side} {args.symbol} qty={qty} @ ~{args.entry}")
        print(f"   SL={args.sl} TP={args.tp}")
        sys.exit(0)

    # ── 写信号日志 ──
    ref_tags = args.refs.replace(",", ", ")
    signal_log = (
        f"[SIGNAL] 📊 CLAUDE [REF: {ref_tags}]: "
        f"{args.symbol} {args.ai_direction} | State:{state} | "
        f"{args.bar_reading[:200]} | "
        f"Equation:{args.equation} | Signal:{args.signal_bar}"
    )
    write_log(signal_log)
    print(f"\n📝 Signal logged")

    # ── 下单（通过 okx_trader.py）──
    result = place_order(
        args.symbol, args.side, qty, leverage,
        args.sl, args.tp,
    )

    if "_error" in result:
        print(f"\n❌ 下单失败: {result['_error']}")
        write_log(f"[ERROR] 下单失败 {args.symbol}: {result['_error']}")
        sys.exit(1)

    # ── 写交易日志 ──
    trade_log = (
        f"[TRADE] 📍 CLAUDE开仓 {args.symbol} {args.side} {qty}@{args.entry} | "
        f"SL={args.sl} TP={args.tp} | {args.strategy} | "
        f"{args.bar_reading[:100]}"
    )
    write_log(trade_log)

    print(f"\n✅ 下单成功:")
    print(f"   {args.side} {args.symbol} qty={qty}")
    print(f"   SL={args.sl} TP={args.tp}")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
