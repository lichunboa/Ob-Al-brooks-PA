#!/usr/bin/env python3
"""分析50组读盘训练日志 — 提取学习成果"""

import json
import os
import re
from pathlib import Path
from collections import defaultdict

LOGS_DIR = Path(__file__).parent.parent / "data" / "training" / "logs"
SCENES_FILE = Path(__file__).parent.parent / "data" / "training" / "scenes_v2.json"


def load_scenes():
    """加载原始场景数据"""
    with open(SCENES_FILE) as f:
        return {s["id"]: s for s in json.load(f)}


def load_logs():
    """加载所有训练日志"""
    logs = {}
    for f in sorted(LOGS_DIR.glob("S*.json")):
        with open(f) as fh:
            log = json.load(fh)
            logs[log["scene_id"]] = log
    return logs


def extract_score(text):
    """从Round1回复中提取评分"""
    # 匹配 **总分：XX/100** 或 总分：XX/100
    patterns = [
        r"\*\*总分[：:]\s*(\d+)/100\*\*",
        r"总分[：:]\s*(\d+)/100",
        r"\*\*(\d+)/100\*\*",
        r"\|\s*\*\*总分\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|",  # 表格格式: | **总分** | **79** |
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return int(m.group(1))
    return None


def extract_decision(text):
    """从Round1回复中提取决策"""
    text_lower = text.lower()
    if "不交易" in text or "观望" in text:
        return "no_trade"
    if "执行交易" in text or "做多" in text or "做空" in text or "决定交易" in text:
        # Check if it's hypothetical
        if "假设强行" in text or "假设做" in text:
            return "no_trade"
        return "trade"
    return "no_trade"


def extract_direction_judgment(text):
    """从Round1提取Agent判断的方向"""
    if "看多" in text or "Always-In Long" in text or "多头" in text:
        return "up"
    if "看空" in text or "Always-In Short" in text or "空头" in text:
        return "down"
    if "不明" in text or "中性" in text or "观望" in text:
        return "neutral"
    return "neutral"


def extract_market_state_judgment(text):
    """从Round1提取Agent判断的市场状态"""
    states = {
        "Spike": ["Spike", "spike", "急速"],
        "Tight Channel": ["Tight Channel", "tight channel", "紧密通道", "TC"],
        "Broad Channel": ["Broad Channel", "broad channel", "宽通道", "BC"],
        "Trading Range": ["Trading Range", "trading range", "震荡", "区间", "TR"],
        "Climax": ["Climax", "climax", "穷尽"],
    }
    for state, keywords in states.items():
        for kw in keywords:
            if kw in text:
                return state
    return "Unknown"


def extract_round2_assessment(text):
    """从Round2提取评估结果"""
    assessments = {
        "correct": ["✅", "正确", "基本正确"],
        "partial": ["⚠️", "偏差", "部分正确"],
        "wrong": ["❌", "错误", "完全错误"],
    }
    # Count markers
    counts = {k: 0 for k in assessments}
    for k, markers in assessments.items():
        for m in markers:
            counts[k] += text.count(m)

    if counts["correct"] > counts["wrong"]:
        return "correct"
    elif counts["wrong"] > counts["correct"]:
        return "wrong"
    else:
        return "partial"


def check_would_have_profited(log, scene):
    """检查如果Agent做了交易是否盈利"""
    direction = log["labels"]["direction"]
    change = log["labels"]["change_pct"]
    agent_direction = extract_direction_judgment(log["round1_reply"])

    if agent_direction == "neutral":
        return "neutral"
    if (agent_direction == "up" and direction == "up") or \
       (agent_direction == "down" and direction == "down"):
        return "would_profit"
    return "would_loss"


def analyze_all():
    """主分析函数"""
    scenes = load_scenes()
    logs = load_logs()

    print(f"=== 读盘训练分析报告 ===")
    print(f"场景数: {len(scenes)}, 日志数: {len(logs)}")
    print()

    # --- 整体统计 ---
    stats = {
        "total": len(logs),
        "traded": 0,
        "no_trade": 0,
        "direction_correct": 0,
        "direction_wrong": 0,
        "direction_neutral": 0,
        "state_correct": 0,
        "state_partial": 0,
        "state_wrong": 0,
        "missed_profit": 0,  # 方向对但没交易
        "avoided_loss": 0,    # 方向错或不明,没交易=正确
        "scores": [],
        "by_symbol": defaultdict(lambda: {"total": 0, "correct": 0, "traded": 0}),
        "by_state": defaultdict(lambda: {"total": 0, "agent_correct": 0, "agent_traded": 0}),
        "by_direction": defaultdict(lambda: {"total": 0, "correct": 0}),
    }

    detailed = []

    for sid in sorted(logs.keys(), key=lambda x: int(x[1:])):
        log = logs[sid]
        scene = scenes.get(sid, {})

        r1 = log.get("round1_reply", "")
        r2 = log.get("round2_reply", "")

        score = extract_score(r1)
        decision = extract_decision(r1)
        agent_dir = extract_direction_judgment(r1)
        agent_state = extract_market_state_judgment(r1)
        actual_dir = log["labels"]["direction"]
        actual_state = log["labels"]["market_state"]
        change_pct = log["labels"]["change_pct"]
        symbol = log["symbol"]
        r2_assessment = extract_round2_assessment(r2)

        # Score
        if score is not None:
            stats["scores"].append(score)

        # Decision
        if decision == "trade":
            stats["traded"] += 1
        else:
            stats["no_trade"] += 1

        # Direction accuracy
        if agent_dir == "neutral":
            stats["direction_neutral"] += 1
        elif (agent_dir == "up" and actual_dir == "up") or \
             (agent_dir == "down" and actual_dir == "down"):
            stats["direction_correct"] += 1
        else:
            stats["direction_wrong"] += 1

        # Missed profit / avoided loss
        if decision == "no_trade":
            if agent_dir != "neutral" and \
               ((agent_dir == "up" and actual_dir == "up") or
                (agent_dir == "down" and actual_dir == "down")):
                stats["missed_profit"] += 1
            else:
                stats["avoided_loss"] += 1

        # By symbol
        stats["by_symbol"][symbol]["total"] += 1
        if r2_assessment == "correct":
            stats["by_symbol"][symbol]["correct"] += 1
        if decision == "trade":
            stats["by_symbol"][symbol]["traded"] += 1

        # By actual market state
        stats["by_state"][actual_state]["total"] += 1
        if r2_assessment == "correct":
            stats["by_state"][actual_state]["agent_correct"] += 1
        if decision == "trade":
            stats["by_state"][actual_state]["agent_traded"] += 1

        # R2 assessment
        if r2_assessment == "correct":
            stats["state_correct"] += 1
        elif r2_assessment == "partial":
            stats["state_partial"] += 1
        else:
            stats["state_wrong"] += 1

        detailed.append({
            "id": sid,
            "symbol": symbol,
            "actual_state": actual_state,
            "actual_dir": actual_dir,
            "change_pct": change_pct,
            "agent_dir": agent_dir,
            "agent_state": agent_state,
            "score": score,
            "decision": decision,
            "r2_assessment": r2_assessment,
            "missed_profit": decision == "no_trade" and agent_dir != "neutral" and \
                ((agent_dir == "up" and actual_dir == "up") or
                 (agent_dir == "down" and actual_dir == "down")),
        })

    # --- 打印报告 ---
    print("=" * 60)
    print("1. 整体表现")
    print("=" * 60)
    print(f"  总场景: {stats['total']}")
    print(f"  执行交易: {stats['traded']} ({stats['traded']/stats['total']*100:.0f}%)")
    print(f"  不交易:   {stats['no_trade']} ({stats['no_trade']/stats['total']*100:.0f}%)")
    print()

    if stats["scores"]:
        avg_score = sum(stats["scores"]) / len(stats["scores"])
        print(f"  平均评分: {avg_score:.1f}/100")
        print(f"  最高评分: {max(stats['scores'])}")
        print(f"  最低评分: {min(stats['scores'])}")
        print(f"  >= 80分: {sum(1 for s in stats['scores'] if s >= 80)}")
        print(f"  70-79分: {sum(1 for s in stats['scores'] if 70 <= s < 80)}")
        print(f"  < 70分:  {sum(1 for s in stats['scores'] if s < 70)}")

    print()
    print("=" * 60)
    print("2. 方向判断准确率")
    print("=" * 60)
    total_judged = stats["direction_correct"] + stats["direction_wrong"]
    if total_judged > 0:
        acc = stats["direction_correct"] / total_judged * 100
        print(f"  明确判断: {total_judged} 次")
        print(f"  方向正确: {stats['direction_correct']} ({acc:.0f}%)")
        print(f"  方向错误: {stats['direction_wrong']} ({100-acc:.0f}%)")
    print(f"  中性/不明: {stats['direction_neutral']}")
    print(f"  错过盈利 (方向对但没做): {stats['missed_profit']}")
    print(f"  规避亏损 (不确定没做):   {stats['avoided_loss']}")

    print()
    print("=" * 60)
    print("3. 市场状态判断 (Round2自评)")
    print("=" * 60)
    print(f"  正确: {stats['state_correct']} ({stats['state_correct']/stats['total']*100:.0f}%)")
    print(f"  部分: {stats['state_partial']} ({stats['state_partial']/stats['total']*100:.0f}%)")
    print(f"  错误: {stats['state_wrong']} ({stats['state_wrong']/stats['total']*100:.0f}%)")

    print()
    print("=" * 60)
    print("4. 按品种分析")
    print("=" * 60)
    for symbol in sorted(stats["by_symbol"].keys()):
        s = stats["by_symbol"][symbol]
        acc = s["correct"] / s["total"] * 100 if s["total"] > 0 else 0
        print(f"  {symbol}: {s['total']}组, 正确{s['correct']}({acc:.0f}%), 交易{s['traded']}次")

    print()
    print("=" * 60)
    print("5. 按市场状态分析")
    print("=" * 60)
    for state in sorted(stats["by_state"].keys()):
        s = stats["by_state"][state]
        acc = s["agent_correct"] / s["total"] * 100 if s["total"] > 0 else 0
        print(f"  {state}: {s['total']}组, Agent正确{s['agent_correct']}({acc:.0f}%), 交易{s['agent_traded']}次")

    print()
    print("=" * 60)
    print("6. 错过盈利的场景 (方向对但没做)")
    print("=" * 60)
    for d in detailed:
        if d["missed_profit"]:
            print(f"  {d['id']} | {d['symbol']} | 状态:{d['actual_state']} | 方向:{d['agent_dir']}(对) | 变化:{d['change_pct']:+.2f}% | 评分:{d['score']}")

    print()
    print("=" * 60)
    print("7. 方向判断错误的场景")
    print("=" * 60)
    for d in detailed:
        if d["agent_dir"] != "neutral" and d["agent_dir"] != d["actual_dir"]:
            print(f"  {d['id']} | {d['symbol']} | Agent:{d['agent_dir']} vs 实际:{d['actual_dir']} | 变化:{d['change_pct']:+.2f}% | 状态:{d['actual_state']}")

    print()
    print("=" * 60)
    print("8. 分数分布 (按实际市场状态)")
    print("=" * 60)
    state_scores = defaultdict(list)
    for d in detailed:
        if d["score"] is not None:
            state_scores[d["actual_state"]].append(d["score"])
    for state in sorted(state_scores.keys()):
        scores = state_scores[state]
        avg = sum(scores) / len(scores)
        print(f"  {state}: 平均{avg:.1f}, 范围[{min(scores)}-{max(scores)}], {len(scores)}组")

    print()
    print("=" * 60)
    print("9. 学习曲线 (前10组 vs 中10组 vs 后10组)")
    print("=" * 60)
    sorted_details = sorted(detailed, key=lambda x: int(x["id"][1:]))

    # Split into groups (skip S001-S005 which had session reuse issues)
    groups = {
        "前期 (S006-S015)": [d for d in sorted_details if 6 <= int(d["id"][1:]) <= 15],
        "中期 (S016-S030)": [d for d in sorted_details if 16 <= int(d["id"][1:]) <= 30],
        "后期 (S031-S050)": [d for d in sorted_details if 31 <= int(d["id"][1:]) <= 50],
    }

    for name, group in groups.items():
        if not group:
            continue
        scores = [d["score"] for d in group if d["score"] is not None]
        correct = sum(1 for d in group if d["r2_assessment"] == "correct")
        missed = sum(1 for d in group if d.get("missed_profit", False))
        avg_score = sum(scores) / len(scores) if scores else 0
        print(f"  {name}:")
        print(f"    平均评分: {avg_score:.1f}")
        print(f"    正确率: {correct}/{len(group)} ({correct/len(group)*100:.0f}%)")
        print(f"    错过盈利: {missed}")

    print()
    print("=" * 60)
    print("10. 详细场景列表")
    print("=" * 60)
    print(f"  {'ID':>5} | {'品种':>10} | {'状态':>8} | {'Agent方向':>8} | {'实际':>4} | {'变化%':>7} | {'分数':>4} | {'决策':>8} | {'评估':>8}")
    print(f"  {'-'*5} | {'-'*10} | {'-'*8} | {'-'*8} | {'-'*4} | {'-'*7} | {'-'*4} | {'-'*8} | {'-'*8}")
    for d in sorted_details:
        print(f"  {d['id']:>5} | {d['symbol']:>10} | {d['actual_state']:>8} | {d['agent_dir']:>8} | {d['actual_dir']:>4} | {d['change_pct']:>+7.2f} | {str(d['score']):>4} | {d['decision']:>8} | {d['r2_assessment']:>8}")

    # Save report as JSON
    report = {
        "summary": {
            "total_scenes": stats["total"],
            "traded": stats["traded"],
            "no_trade": stats["no_trade"],
            "avg_score": sum(stats["scores"]) / len(stats["scores"]) if stats["scores"] else 0,
            "direction_accuracy": stats["direction_correct"] / max(1, total_judged) * 100,
            "direction_correct": stats["direction_correct"],
            "direction_wrong": stats["direction_wrong"],
            "direction_neutral": stats["direction_neutral"],
            "missed_profit": stats["missed_profit"],
            "avoided_loss": stats["avoided_loss"],
            "r2_correct": stats["state_correct"],
            "r2_partial": stats["state_partial"],
            "r2_wrong": stats["state_wrong"],
        },
        "by_symbol": {k: dict(v) for k, v in stats["by_symbol"].items()},
        "by_state": {k: dict(v) for k, v in stats["by_state"].items()},
        "details": detailed,
    }

    report_path = LOGS_DIR.parent / "training_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n报告已保存: {report_path}")


if __name__ == "__main__":
    analyze_all()
