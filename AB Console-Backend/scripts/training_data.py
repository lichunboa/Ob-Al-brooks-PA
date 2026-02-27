#!/usr/bin/env python3
"""
读盘训练营 — 场景数据生成器 V6（知识驱动）

从历史 Parquet 数据中抽取训练场景，每组包含:
  可见部分: 50×15m + 30×1h + 20×4h（Agent 分析用）
  结果部分: 20×15m（后续走势揭晓）
  自动标注: 市场状态 / 背景 / 实际方向 / 变化%
  技能标签: tested_skills（基于 knowledge_taxonomy.json 自动映射）

V6 新增:
  - 概念驱动抽样: 确保每技能 ≥ min_per_skill 场景覆盖
  - 场景技能标签: 每个场景标记考察的技能
  - --taxonomy 参数指定技能分类文件

用法:
    python scripts/training_data.py --count 200 --output data/training/scenes_v6.json
    python scripts/training_data.py --count 10 --seed 99 --output /tmp/test.json
"""

import argparse
import json
import random
import sys
import os
from datetime import datetime
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import numpy as np

from libs.backtest.data_loader import DataLoader
from libs.backtest.background import BackgroundAnalyzer

# CycleIdentifier + calculate_ema + Candle 从 backtest_tool 导入
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
from backtest_tool import CycleIdentifier, calculate_ema, Candle


# ============================================================
# 配置
# ============================================================

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
           "DOGEUSDT", "AAVEUSDT", "ADAUSDT", "AVAXUSDT"]
CACHE_DIR = str(PROJECT_ROOT / "data" / "backtest_cache")

# 每个场景的 K 线数量
VISIBLE_15M = 50
VISIBLE_1H = 30
VISIBLE_4H = 20
FUTURE_15M = 20   # 后续 5 小时

# 滑动窗口步长（4h = 16 根 15m）
STEP_15M = 16

# 数据范围 — 选择有代表性的牛熊区间
DATE_RANGES = {
    "BTCUSDT": [
        ("2020-01-01", "2021-11-10", "牛市"),      # 已缓存
        ("2022-01-01", "2022-12-31", "熊市"),      # 已缓存 (open_time列, data_loader已兼容)
        ("2025-10-15", "2026-02-15", "近期"),      # 已缓存
    ],
    "ETHUSDT": [
        ("2020-01-01", "2021-11-10", "牛市"),      # 已缓存
        ("2021-10-03", "2022-07-01", "熊市"),      # 匹配缓存: ETHUSDT_2021-10-03_2022-07-01
    ],
    "SOLUSDT": [
        ("2024-10-03", "2026-01-01", "全段"),      # 匹配缓存: SOLUSDT_2024-10-03_2026-01-01
    ],
    "BNBUSDT": [
        ("2024-07-03", "2025-06-01", "牛市"),      # 匹配缓存: BNBUSDT_2024-07-03_2025-06-01
        ("2021-10-03", "2022-07-01", "熊市"),      # 匹配缓存: BNBUSDT_2021-10-03_2022-07-01
    ],
    "DOGEUSDT": [
        ("2020-12-01", "2021-06-01", "牛市"),      # 匹配缓存
        ("2021-04-02", "2021-11-01", "回调"),      # 匹配缓存
        ("2025-08-29", "2026-02-25", "近期"),      # Binance API 下载
    ],
    "AAVEUSDT": [
        ("2020-12-01", "2021-06-01", "牛市"),      # 匹配缓存
        ("2025-08-29", "2026-02-25", "近期"),      # Binance API 下载
    ],
    "ADAUSDT": [
        ("2020-12-01", "2021-09-01", "牛市"),      # 匹配缓存
        ("2025-08-29", "2026-02-25", "近期"),      # Binance API 下载
    ],
    "AVAXUSDT": [
        ("2021-04-02", "2021-11-01", "牛市"),      # 匹配缓存
        ("2025-08-29", "2026-02-25", "近期"),      # Binance API 下载
    ],
}


# ============================================================
# 辅助函数
# ============================================================

def df_to_candles(df: pd.DataFrame, symbol: str, tf: str) -> list[Candle]:
    """DataFrame 行 → Candle 对象列表"""
    candles = []
    for _, row in df.iterrows():
        candles.append(Candle(
            symbol=symbol,
            timestamp=row["timestamp"].to_pydatetime() if hasattr(row["timestamp"], "to_pydatetime") else row["timestamp"],
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row.get("volume", 0)),
            timeframe=tf,
        ))
    return candles


def candles_to_list(candles: list[Candle]) -> list[dict]:
    """Candle 列表 → JSON-serializable list"""
    result = []
    for c in candles:
        result.append({
            "t": c.timestamp.strftime("%Y-%m-%d %H:%M"),
            "o": round(c.open, 2),
            "h": round(c.high, 2),
            "l": round(c.low, 2),
            "c": round(c.close, 2),
            "v": round(c.volume, 1),
        })
    return result


def get_background_label(candles_4h: list[Candle], candles_1d: list[Candle]) -> str:
    """用 BackgroundAnalyzer 获取大周期背景标签"""
    if len(candles_4h) < 25 or len(candles_1d) < 25:
        return "⚪ 中性"
    try:
        bg = BackgroundAnalyzer.analyze(candles_1d[-30:], candles_4h[-30:])
        return bg.background
    except Exception:
        return "⚪ 中性"


def get_market_state_label(candles_15m: list[Candle]) -> str:
    """用 CycleIdentifier 获取市场状态标签"""
    if len(candles_15m) < 25:
        return "观望"
    prices = [c.close for c in candles_15m]
    ema20 = calculate_ema(prices, 20)
    if not ema20:
        return "观望"
    state = CycleIdentifier.identify(candles_15m, ema20)
    return state.cycle


def compute_direction(future_candles: list[Candle]) -> tuple[str, float]:
    """从后续 K 线计算实际方向和变化%"""
    if not future_candles:
        return "flat", 0.0
    start = future_candles[0].open
    end = future_candles[-1].close
    if start == 0:
        return "flat", 0.0
    change_pct = (end - start) / start * 100
    if change_pct > 0.3:
        direction = "up"
    elif change_pct < -0.3:
        direction = "down"
    else:
        direction = "flat"
    return direction, round(change_pct, 3)


# ============================================================
# 场景抽取
# ============================================================

def extract_all_windows(symbol: str, date_ranges: list) -> list[dict]:
    """从一个品种的所有日期范围中提取所有可用窗口"""
    windows = []

    for start_date, end_date, period_label in date_ranges:
        print(f"\n  加载 {symbol} {period_label} ({start_date} ~ {end_date})...")
        try:
            df_1m = DataLoader.load(symbol, start_date, end_date, cache_dir=CACHE_DIR)
        except Exception as e:
            print(f"  加载失败: {e}")
            continue
        if df_1m.empty or len(df_1m) < 5000:
            print(f"  跳过: 数据不足 ({len(df_1m)} 根)")
            continue

        # 统一 tz-naive（防止 tz-aware/naive 比较报错）
        if df_1m["timestamp"].dt.tz is not None:
            df_1m["timestamp"] = df_1m["timestamp"].dt.tz_localize(None)

        # 重采样
        df_15m = DataLoader.resample(df_1m, "15m")
        df_1h = DataLoader.resample(df_1m, "1h")
        df_4h = DataLoader.resample(df_1m, "4h")
        df_1d = DataLoader.resample(df_1m, "1d")

        # 需要的最小长度: visible_15m + future_15m
        min_15m = VISIBLE_15M + FUTURE_15M + 5  # 5 根 buffer
        if len(df_15m) < min_15m:
            print(f"  跳过: 15m 数据不足 ({len(df_15m)} < {min_15m})")
            continue

        # 滑动窗口
        total_windows = 0
        for i in range(VISIBLE_15M, len(df_15m) - FUTURE_15M, STEP_15M):
            # 可见 15m
            vis_15m_df = df_15m.iloc[i - VISIBLE_15M:i]
            # 后续 15m
            fut_15m_df = df_15m.iloc[i:i + FUTURE_15M]

            if len(vis_15m_df) < VISIBLE_15M or len(fut_15m_df) < FUTURE_15M:
                continue

            # 对应时间点找 1h/4h/1d 的可见部分
            cut_time = vis_15m_df.iloc[-1]["timestamp"]
            vis_1h_df = df_1h[df_1h["timestamp"] <= cut_time].tail(VISIBLE_1H)
            vis_4h_df = df_4h[df_4h["timestamp"] <= cut_time].tail(VISIBLE_4H)
            vis_1d_df = df_1d[df_1d["timestamp"] <= cut_time].tail(30)

            if len(vis_1h_df) < 10 or len(vis_4h_df) < 10:
                continue

            # 转 Candle + 标注
            c_15m = df_to_candles(vis_15m_df, symbol, "15m")
            c_1h = df_to_candles(vis_1h_df, symbol, "1h")
            c_4h = df_to_candles(vis_4h_df, symbol, "4h")
            c_1d = df_to_candles(vis_1d_df, symbol, "1d")
            c_fut = df_to_candles(fut_15m_df, symbol, "15m")

            market_state = get_market_state_label(c_15m)
            background = get_background_label(c_4h, c_1d)
            direction, change_pct = compute_direction(c_fut)

            windows.append({
                "symbol": symbol,
                "period": period_label,
                "cut_time": cut_time.strftime("%Y-%m-%d %H:%M"),
                "candles_15m": candles_to_list(c_15m),
                "candles_1h": candles_to_list(c_1h),
                "candles_4h": candles_to_list(c_4h),
                "future_15m": candles_to_list(c_fut),
                "labels": {
                    "market_state": market_state,
                    "background": background,
                    "direction": direction,
                    "change_pct": change_pct,
                },
            })
            total_windows += 1

        print(f"  {symbol} {period_label}: 提取 {total_windows} 个窗口")

    return windows


def load_taxonomy(taxonomy_path: str) -> dict:
    """加载知识技能分类文件"""
    if not os.path.exists(taxonomy_path):
        print(f"  警告: 技能分类文件不存在 {taxonomy_path}, 使用空映射")
        return {"skills": [], "state_to_skills": {}}
    with open(taxonomy_path, encoding="utf-8") as f:
        return json.load(f)


def tag_skills(window: dict, state_to_skills: dict) -> list[str]:
    """基于市场状态给场景打技能标签"""
    state = window["labels"]["market_state"]
    return state_to_skills.get(state, [])


def concept_driven_sample(
    all_windows: list[dict],
    count: int,
    seed: int,
    taxonomy: dict,
    min_per_skill: int = 5,
) -> list[dict]:
    """概念驱动抽样 — 确保每技能 ≥ min_per_skill 场景覆盖"""
    rng = random.Random(seed)
    state_to_skills = taxonomy.get("state_to_skills", {})
    skill_ids = [s["id"] for s in taxonomy.get("skills", [])]

    # 按市场状态分桶
    buckets: dict[str, list[dict]] = {}
    for w in all_windows:
        key = w["labels"]["market_state"]
        buckets.setdefault(key, []).append(w)

    print(f"\n  市场状态分布 (窗口池):")
    for k, v in sorted(buckets.items(), key=lambda x: -len(x[1])):
        print(f"    {k}: {len(v)} 个窗口")

    # Phase 1: 确保每技能 ≥ min_per_skill 场景覆盖
    selected = []
    selected_ids = set()  # 用 cut_time+symbol 去重
    skill_coverage: dict[str, int] = {sid: 0 for sid in skill_ids}

    # 先找出哪些技能由哪些市场状态提供
    skill_to_states: dict[str, list[str]] = {}
    for state, skills in state_to_skills.items():
        for sid in skills:
            skill_to_states.setdefault(sid, []).append(state)

    # 优先填充稀缺技能（覆盖状态最少的技能优先）
    sorted_skills = sorted(skill_ids, key=lambda s: len(skill_to_states.get(s, [])))

    for sid in sorted_skills:
        states = skill_to_states.get(sid, [])
        needed = min_per_skill - skill_coverage.get(sid, 0)
        if needed <= 0:
            continue

        # 从对应状态的窗口池中抽取
        candidates = []
        for state in states:
            for w in buckets.get(state, []):
                wid = f"{w['symbol']}_{w['cut_time']}"
                if wid not in selected_ids:
                    candidates.append(w)

        rng.shuffle(candidates)
        for w in candidates[:needed]:
            wid = f"{w['symbol']}_{w['cut_time']}"
            selected_ids.add(wid)
            w_skills = tag_skills(w, state_to_skills)
            w["tested_skills"] = w_skills
            selected.append(w)
            for s in w_skills:
                skill_coverage[s] = skill_coverage.get(s, 0) + 1

    print(f"\n  Phase 1 (技能覆盖): 选中 {len(selected)} 个场景")

    # Phase 2: 补充到 count，按比例分配
    remaining = count - len(selected)
    if remaining > 0:
        unused = []
        for w in all_windows:
            wid = f"{w['symbol']}_{w['cut_time']}"
            if wid not in selected_ids:
                unused.append(w)
        rng.shuffle(unused)
        for w in unused[:remaining]:
            w_skills = tag_skills(w, state_to_skills)
            w["tested_skills"] = w_skills
            selected.append(w)
            for s in w_skills:
                skill_coverage[s] = skill_coverage.get(s, 0) + 1

    # 技能覆盖统计
    print(f"\n  技能覆盖统计:")
    uncovered = []
    for sid in skill_ids:
        cnt = skill_coverage.get(sid, 0)
        skill_name = next((s["name"] for s in taxonomy["skills"] if s["id"] == sid), sid)
        if cnt < min_per_skill:
            uncovered.append(f"    ⚠️  {skill_name}: {cnt}/{min_per_skill}")
        else:
            print(f"    ✅ {skill_name}: {cnt}")
    for msg in uncovered:
        print(msg)

    # 按时间排序 + 编号
    selected.sort(key=lambda w: w["cut_time"])
    for i, w in enumerate(selected):
        w["id"] = f"S{i + 1:03d}"

    return selected[:count]


def stratified_sample(all_windows: list[dict], count: int, seed: int) -> list[dict]:
    """分层抽样 — 按市场状态分桶，均匀抽取 (V5 兼容)"""
    rng = random.Random(seed)

    # 按市场状态分桶
    buckets: dict[str, list[dict]] = {}
    for w in all_windows:
        key = w["labels"]["market_state"]
        buckets.setdefault(key, []).append(w)

    print(f"\n  市场状态分布:")
    for k, v in sorted(buckets.items(), key=lambda x: -len(x[1])):
        print(f"    {k}: {len(v)} 个窗口")

    # 按比例分配 count
    total = len(all_windows)
    selected = []
    remaining = count

    bucket_keys = sorted(buckets.keys())
    for i, key in enumerate(bucket_keys):
        pool = buckets[key]
        # 最后一个桶拿剩余的
        if i == len(bucket_keys) - 1:
            n = remaining
        else:
            n = max(1, round(count * len(pool) / total))
            n = min(n, remaining, len(pool))
        rng.shuffle(pool)
        selected.extend(pool[:n])
        remaining -= min(n, len(pool))
        if remaining <= 0:
            break

    # 如果还没够（某些桶太小），从所有窗口补
    if len(selected) < count:
        used = set(id(w) for w in selected)
        extra = [w for w in all_windows if id(w) not in used]
        rng.shuffle(extra)
        selected.extend(extra[:count - len(selected)])

    # 按时间排序 + 编号
    selected.sort(key=lambda w: w["cut_time"])
    for i, w in enumerate(selected):
        w["id"] = f"S{i + 1:03d}"

    return selected[:count]


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="读盘训练营 — 场景数据生成 V6")
    parser.add_argument("--count", type=int, default=200, help="场景数量 (默认 200)")
    parser.add_argument("--seed", type=int, default=42, help="随机种子 (默认 42)")
    parser.add_argument("--output", type=str, default=None, help="输出文件路径")
    parser.add_argument("--symbols", nargs="+", default=SYMBOLS, help="品种列表")
    parser.add_argument("--taxonomy", type=str,
                        default=str(PROJECT_ROOT / "data" / "training" / "knowledge_taxonomy.json"),
                        help="技能分类文件")
    parser.add_argument("--min-per-skill", type=int, default=5,
                        help="每技能最少场景数 (默认 5)")
    parser.add_argument("--legacy", action="store_true",
                        help="使用 V5 分层抽样 (不使用概念驱动)")
    args = parser.parse_args()

    output_path = args.output or str(PROJECT_ROOT / "data" / "training" / "scenes_v6.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    taxonomy = load_taxonomy(args.taxonomy) if not args.legacy else {}
    mode = "V5 分层抽样" if args.legacy else "V6 概念驱动"

    print(f"=" * 60)
    print(f"读盘训练营 — 场景生成 ({mode})")
    print(f"  品种: {args.symbols}")
    print(f"  目标: {args.count} 组场景")
    print(f"  种子: {args.seed}")
    if not args.legacy:
        print(f"  技能: {len(taxonomy.get('skills', []))} 个")
        print(f"  每技能最少: {args.min_per_skill} 场景")
    print(f"  输出: {output_path}")
    print(f"=" * 60)

    # 提取所有窗口
    all_windows = []
    for symbol in args.symbols:
        ranges = DATE_RANGES.get(symbol)
        if not ranges:
            print(f"\n  警告: {symbol} 无日期范围配置, 跳过")
            continue
        windows = extract_all_windows(symbol, ranges)
        all_windows.extend(windows)

    print(f"\n  总窗口数: {len(all_windows)}")

    if len(all_windows) == 0:
        print("  错误: 无可用窗口!")
        sys.exit(1)

    # 抽样
    if args.legacy:
        scenes = stratified_sample(all_windows, args.count, args.seed)
    else:
        scenes = concept_driven_sample(
            all_windows, args.count, args.seed, taxonomy, args.min_per_skill
        )
    print(f"\n  抽样完成: {len(scenes)} 组场景")

    # 统计摘要
    print(f"\n  场景摘要:")
    by_symbol = {}
    by_state = {}
    by_dir = {}
    for s in scenes:
        by_symbol[s["symbol"]] = by_symbol.get(s["symbol"], 0) + 1
        by_state[s["labels"]["market_state"]] = by_state.get(s["labels"]["market_state"], 0) + 1
        by_dir[s["labels"]["direction"]] = by_dir.get(s["labels"]["direction"], 0) + 1

    print(f"    品种: {by_symbol}")
    print(f"    状态: {by_state}")
    print(f"    方向: {by_dir}")

    # 保存
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(scenes, f, ensure_ascii=False, indent=2)

    file_size = os.path.getsize(output_path) / 1024
    print(f"\n  已保存: {output_path} ({file_size:.0f} KB)")
    print(f"  完成!")


if __name__ == "__main__":
    main()
