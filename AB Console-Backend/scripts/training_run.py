#!/usr/bin/env python3
"""
读盘训练营 — 执行器

读取 scenes.json，逐个场景发送给 al-brooks Agent，两轮消息:
  第 1 轮: 给 K 线数据，让 Agent 自主分析
  第 2 轮: 揭晓结果，Agent 自主反思 + 更新 MEMORY.md

用法:
    python scripts/training_run.py                          # 跑全部 50 组
    python scripts/training_run.py --start 1 --end 5        # 只跑 1-5
    python scripts/training_run.py --start 3 --end 3        # 只跑第 3 组
    python scripts/training_run.py --dry-run                # 只打印消息不发送
"""

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_SCENES = str(PROJECT_ROOT / "data" / "training" / "scenes_v2.json")
LOG_DIR = str(PROJECT_ROOT / "data" / "training" / "logs")
MEMORY_PATH = os.path.expanduser("~/.openclaw/agents/al-brooks/MEMORY.md")
VERIFY_INTERVAL = 5  # 每 N 个场景验证一次 MEMORY.md


def format_candles_table(candles: list[dict], tf: str) -> str:
    """格式化 K 线数据为紧凑表格"""
    lines = [f"| # | 时间 | 开 | 高 | 低 | 收 |"]
    lines.append("|---|------|-----|-----|-----|-----|")
    for i, c in enumerate(candles):
        lines.append(f"| {i+1} | {c['t']} | {c['o']} | {c['h']} | {c['l']} | {c['c']} |")
    return "\n".join(lines)


def build_round1_message(scene: dict, idx: int, total: int) -> str:
    """构建第 1 轮消息 — 完整模拟实盘流程（含逐项评分）"""
    s = scene
    symbol = s["symbol"]

    msg = f"""📊 读盘训练 {idx}/{total} | {symbol}

这是一段历史K线回放。**请严格按照实盘流程完整分析**（SKILL.md Section 4 六步框架 + 逐项评分）。
⛔ 禁止调用外部 API，只用下面的数据。
⛔ 你不知道后面会怎么走。

## 4h K线（{len(s['candles_4h'])} 根）— 大周期背景
{format_candles_table(s['candles_4h'], '4h')}

## 1h K线（{len(s['candles_1h'])} 根）— 中周期
{format_candles_table(s['candles_1h'], '1h')}

## 15m K线（{len(s['candles_15m'])} 根）— 入场级别
{format_candles_table(s['candles_15m'], '15m')}

---

**请按实盘流程完成（不可跳步）**:

**Step 0.5 — 我看到了什么？** 先用自然语言描述你看到的K线图。

**Step 1 — 大周期背景** 4h 级别趋势方向和关键支撑阻力位。

**Step 2 — 六步分析框架**:
A. 市场状态（Spike/TC/BC/TR/Climax/MTR？）
B. Always-In 方向（必须持仓的话，多还是空？）
C. 有没有可交易的形态？（描述结构，不匹配清单）
D. 信号K线质量 + Context（Context > 形态 > 信号K线）
E. 交易者方程（入场/止损/目标/RR？期望值为正？）
F. 缺口上下文（如果看到 Gap）

**Step 3 — 逐项评分（严格按 scoring-rubric.md V5.3）**:
- 趋势强度 (0-20): ___  理由: ___
- 信号质量 (0-20): ___  理由: ___
- 策略匹配 (0-25): ___  理由: ___
- 盈亏比 (0-20): ___  理由: ___
- 风险因素 (0-15): ___  理由: ___
- 回测验证加分: ___ (H1/L1/H2=+8, DT/MAG=+3)
- 强制扣分(上限-15): ___  理由: ___
- **总分**: ___

⚠️ 评分校准: H1/L1 in TC 至少70分。每个维度中间值(10-13)是正常的好交易。

**Step 4 — 决策**:
- >= 70: "我决定交易" + 入场/止损/目标
- 55-69: "不交易，但接近" + 原因
- < 55: "不交易" + 原因"""

    return msg


def build_round2_message(scene: dict) -> str:
    """构建第 2 轮消息 — 揭晓结果 + 评分校准 + 自主学习"""
    s = scene
    labels = s["labels"]

    msg = f"""📊 结果揭晓 | {s['symbol']}

## 后续 {len(s['future_15m'])} 根 15m K线
{format_candles_table(s['future_15m'], '15m')}

## 自动标注（CycleIdentifier）
- 市场状态: {labels['market_state']}
- 背景: {labels['background']}
- 实际方向: {labels['direction']}
- 变化: {labels['change_pct']}%

---

现在请你自己对照反思:

**1. 判断对照**
- 市场状态: 你的 vs 自动标注 → 对了/错了？
- Always-In 方向: 你的 vs 实际走势 → 偏差在哪？

**2. 评分校准（最重要！）**
- 你给了多少总分？
- 如果你说"不交易"但实际走势证明应该交易（方向对+变化>1%）→ 你哪些维度打分过低？
- 如果你说"交易"但实际走势亏损 → 你哪些维度打分过高？
- **校准建议**: 下次遇到类似情况，各维度应该给多少分？

**3. 交易模拟**
- 如果你 Step 4 决定交易：用你的入场/止损/目标 vs 实际走势，盈亏多少？
- 如果你没交易但方向对了：错过了多少利润？这是"好的不做"还是"恐惧不做"？

**4. 课程对照**
- 回顾 references/，这次经历对应哪条原则？哪里违反了？

**5. 写入记忆** — 立即用 file_write 写入 MEMORY.md 的"课程回查记录"区。格式:
   - [日期] {{品种}} 训练 {s['id']}
   - 判断/评分: (你判断了什么，给了多少分)
   - 实际: (实际发生了什么)
   - 评分校准: (哪些维度该调高/调低)
   - 教训: (一句话总结)

⛔ 必须立即执行 file_write 写入 MEMORY.md，不能只说"我会写入"或"已记录"
⛔ 所有输出必须使用中文"""

    return msg


def build_memory_reminder() -> str:
    """当 MEMORY.md 未更新时发送的提醒消息"""
    return (
        '⚠️ 重要提醒：你在最近的训练中说了「写入记忆」但没有实际执行 file_write。\n\n'
        '请现在立即回顾你最近几组训练的分析，把关键发现写入 MEMORY.md 的「课程回查记录」区。\n\n'
        '格式:\n'
        '- [日期] {品种} 训练 {场景ID}\n'
        '- 判断: (你判断了什么)\n'
        '- 实际: (实际发生了什么)\n'
        '- 教训: (一句话总结)\n\n'
        '⛔ 这次你必须执行 file_write，不能只口头回复。'
    )


def send_to_agent(message: str, session_id: str = None, timeout: int = 120) -> dict:
    """通过 OpenClaw CLI 发送消息给 Agent"""
    cmd = [
        "openclaw", "agent",
        "--agent", "al-brooks",
        "--message", message,
        "--json",
        "--timeout", str(timeout),
    ]
    if session_id:
        cmd.extend(["--session-id", session_id])

    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout + 30
    )

    if result.returncode != 0:
        return {"status": "error", "error": result.stderr[:500]}

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"status": "error", "error": f"Invalid JSON: {result.stdout[:300]}"}


def extract_session_id(response: dict) -> str:
    """从 Agent 响应中提取 session ID"""
    meta = response.get("result", {}).get("meta", {})
    agent_meta = meta.get("agentMeta", {})
    return agent_meta.get("sessionId", "")


def extract_reply(response: dict) -> str:
    """从 Agent 响应中提取回复文本"""
    payloads = response.get("result", {}).get("payloads", [])
    if payloads:
        return payloads[0].get("text", "")
    return ""


def main():
    parser = argparse.ArgumentParser(description="读盘训练营 — 执行器")
    parser.add_argument("--input", type=str, default=DEFAULT_SCENES, help="场景文件")
    parser.add_argument("--start", type=int, default=1, help="起始场景编号 (1-based)")
    parser.add_argument("--end", type=int, default=None, help="结束场景编号 (含)")
    parser.add_argument("--dry-run", action="store_true", help="只打印消息不发送")
    parser.add_argument("--timeout", type=int, default=120, help="每轮超时秒数")
    parser.add_argument("--pause", type=int, default=5, help="场景间暂停秒数")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        scenes = json.load(f)

    total = len(scenes)
    start_idx = args.start - 1  # 0-based
    end_idx = (args.end if args.end else total) - 1  # 0-based inclusive

    if start_idx < 0 or start_idx >= total:
        print(f"错误: start={args.start} 超出范围 (1-{total})")
        sys.exit(1)

    os.makedirs(LOG_DIR, exist_ok=True)

    print(f"=" * 60)
    print(f"读盘训练营 — 执行")
    print(f"  场景: {args.input}")
    print(f"  范围: {args.start} ~ {end_idx + 1} (共 {end_idx - start_idx + 1} 组)")
    print(f"  模式: {'DRY RUN' if args.dry_run else '实际发送'}")
    print(f"=" * 60)

    results = []
    memory_mtime_before = os.path.getmtime(MEMORY_PATH) if os.path.exists(MEMORY_PATH) else 0
    scenes_since_verify = 0

    for i in range(start_idx, end_idx + 1):
        scene = scenes[i]
        scene_id = scene["id"]
        idx = i + 1  # 1-based display

        print(f"\n{'=' * 40}")
        print(f"场景 {idx}/{total}: {scene_id} | {scene['symbol']} | {scene['period']} | {scene['labels']['market_state']}")
        print(f"{'=' * 40}")

        # --- 第 1 轮: 读盘分析 ---
        # 每个场景生成唯一 session-id，确保隔离
        scene_session_id = f"train-{scene_id}-{uuid.uuid4().hex[:8]}"
        msg1 = build_round1_message(scene, idx, total)
        print(f"\n  [Round 1] 发送读盘数据 ({len(msg1)} chars) session={scene_session_id[:20]}...")

        if args.dry_run:
            print(f"  [DRY RUN] 消息长度 {len(msg1)}, 跳过发送")
            print(f"  消息前 200 字:\n  {msg1[:200]}...")
            continue

        resp1 = send_to_agent(msg1, session_id=scene_session_id, timeout=args.timeout)
        if resp1.get("status") == "error":
            print(f"  ❌ Round 1 失败: {resp1.get('error', 'unknown')}")
            results.append({"scene_id": scene_id, "status": "r1_error"})
            continue

        session_id = extract_session_id(resp1) or scene_session_id
        reply1 = extract_reply(resp1)
        sid_display = session_id[:20] if session_id else "none"
        print(f"  ✅ Round 1 完成 (session={sid_display}...)")
        print(f"  回复摘要: {reply1[:150]}...")

        # 短暂等待
        time.sleep(2)

        # --- 第 2 轮: 结果揭晓 ---
        msg2 = build_round2_message(scene)
        print(f"\n  [Round 2] 揭晓结果 ({len(msg2)} chars)...")

        resp2 = send_to_agent(msg2, session_id=session_id, timeout=args.timeout)
        if resp2.get("status") == "error":
            print(f"  ❌ Round 2 失败: {resp2.get('error', 'unknown')}")
            results.append({"scene_id": scene_id, "status": "r2_error", "round1": reply1[:200]})
            continue

        reply2 = extract_reply(resp2)
        print(f"  ✅ Round 2 完成")
        print(f"  回复摘要: {reply2[:150]}...")

        # 保存日志
        log = {
            "scene_id": scene_id,
            "symbol": scene["symbol"],
            "labels": scene["labels"],
            "round1_reply": reply1,
            "round2_reply": reply2,
            "session_id": session_id,
        }
        log_path = os.path.join(LOG_DIR, f"{scene_id}.json")
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)

        results.append({"scene_id": scene_id, "status": "ok"})

        # 场景间暂停
        if i < end_idx:
            print(f"\n  ⏳ 等待 {args.pause} 秒...")
            time.sleep(args.pause)

    # 最终验证 MEMORY.md
    final_mtime = os.path.getmtime(MEMORY_PATH) if os.path.exists(MEMORY_PATH) else 0
    memory_updated = final_mtime > memory_mtime_before

    # 汇总
    print(f"\n{'=' * 60}")
    print(f"训练完成!")
    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"  成功: {ok}/{len(results)}")
    if any(r["status"] != "ok" for r in results):
        failed = [r["scene_id"] for r in results if r["status"] != "ok"]
        print(f"  失败: {failed}")
    print(f"  MEMORY.md 更新: {'✅ 已更新' if memory_updated else '❌ 未更新'}")
    print(f"  日志: {LOG_DIR}/")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
