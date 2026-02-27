#!/usr/bin/env python3
"""
读盘训练营 — 执行器 V6（知识驱动）

读取 scenes_v6.json，逐个场景发送给 al-brooks Agent，两轮消息:
  第 1 轮: 给 K 线数据 + 概念专项提示，让 Agent 自主分析
  第 2 轮: 揭晓结果，Agent 自主反思 + 技能自评

V6 新增:
  - 概念专项提示: 每场景提示考察的技能
  - 技能自评: Round 2 要求 Agent 对每技能打 0-5 分
  - 日志增加: tested_skills 字段

用法:
    python scripts/training_run.py --input scenes_v6.json --log-dir logs_v6
    python scripts/training_run.py --input scenes_v6.json --start 1 --end 10 --log-dir logs_v6
    python scripts/training_run.py --dry-run
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
DEFAULT_SCENES = str(PROJECT_ROOT / "data" / "training" / "scenes_v6.json")
DEFAULT_LOG_DIR = str(PROJECT_ROOT / "data" / "training" / "logs_v6")
DEFAULT_TAXONOMY = str(PROJECT_ROOT / "data" / "training" / "knowledge_taxonomy.json")
MEMORY_PATH = os.path.expanduser("~/.openclaw/agents/al-brooks/MEMORY.md")


def load_taxonomy(path: str) -> dict:
    """加载技能分类文件"""
    if not os.path.exists(path):
        return {"skills": [], "state_to_skills": {}}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_skill_names(taxonomy: dict, skill_ids: list[str]) -> list[str]:
    """技能 ID → 技能名"""
    id_to_name = {s["id"]: s["name"] for s in taxonomy.get("skills", [])}
    return [id_to_name.get(sid, sid) for sid in skill_ids]


def format_candles_table(candles: list[dict], tf: str) -> str:
    """格式化 K 线数据为紧凑表格"""
    lines = [f"| # | 时间 | 开 | 高 | 低 | 收 |"]
    lines.append("|---|------|-----|-----|-----|-----|")
    for i, c in enumerate(candles):
        lines.append(f"| {i+1} | {c['t']} | {c['o']} | {c['h']} | {c['l']} | {c['c']} |")
    return "\n".join(lines)


def build_round1_message(scene: dict, idx: int, total: int, taxonomy: dict) -> str:
    """构建第 1 轮消息 — V6 知识驱动（概念专项提示 + 完整分析）"""
    s = scene
    symbol = s["symbol"]
    tested_skills = s.get("tested_skills", [])
    skill_names = get_skill_names(taxonomy, tested_skills)

    # 分类显示技能
    skill_display = ""
    if skill_names:
        # 取前 8 个最核心的技能展示
        display_names = skill_names[:8]
        skill_display = f"""
💡 **本场景重点考察技能**: {', '.join(display_names)}
请确保分析中**明确涉及**以上技能的应用。如果某技能不适用于当前场景，请说明原因。
"""

    msg = f"""📊 读盘训练 V6 | {idx}/{total} | {symbol}

这是一段历史K线回放。**请严格按照实盘流程完整分析**（SKILL.md Section 4 六步框架 + 逐项评分）。
⛔ 禁止调用外部 API，只用下面的数据。
⛔ 你不知道后面会怎么走。
{skill_display}
## 4h K线（{len(s['candles_4h'])} 根）— 大周期背景
{format_candles_table(s['candles_4h'], '4h')}

## 1h K线（{len(s['candles_1h'])} 根）— 中周期
{format_candles_table(s['candles_1h'], '1h')}

## 15m K线（{len(s['candles_15m'])} 根）— 入场级别
{format_candles_table(s['candles_15m'], '15m')}

---

**请按实盘流程完成（不可跳步）**:

**Step 0.5 — 我看到了什么？** 先用自然语言描述你看到的K线图。

**Step 0.75 — 主导特征检查（必填！）**
看最近 5 根 15m K线，回答：
- 谁在控场？多头还是空头？证据是什么？
- 收盘位置在K线上半段还是下半段？
- 实体在增大还是缩小？影线在变长还是变短？
- 有没有 Climax 结构特征？（抛物线加速 / Give-up bars / 影线加长+实体缩小）
⚠️ **涨幅大小 ≠ Spike末端！** 判断Climax只看结构特征，不看涨跌幅度。Tight Channel可以涨很多但不是Climax。

**Step 1 — 大周期背景** 4h 级别趋势方向和关键支撑阻力位。4h有否决权：逆4h Always-In方向的15m形态原则上不做（除非MTR三部曲全部完成）。

**Step 2 — 六步分析框架**:
A. 市场状态（Spike/TC/BC/TR/Climax/MTR？）
B. Always-In 方向（必须持仓的话，多还是空？依据：主导特征 > K线序列 > EMA位置）
C. 有没有可交易的形态？（描述结构，不匹配清单）
D. 信号K线质量 + Context（**Context > 形态 > 信号K线** — 这是 Al Brooks 的核心优先级）
E. 交易者方程（入场/止损/目标/RR？期望值为正？）
F. 缺口上下文（如果看到 Gap）

⛔ 不要调用任何外部工具（file_read / file_write / memory 等），用你已有的知识库知识直接分析。

**Step 3 — 逐项评分**:
- 趋势强度 (0-20): ___  理由: ___
- 信号质量 (0-20): ___  理由: ___
- 策略匹配 (0-25): ___  理由: ___
- 盈亏比 (0-20): ___  理由: ___
- 风险因素 (0-15): ___  理由: ___
- 回测验证加分: ___ (H1/L1/H2=+8, DT/MAG=+3)
- 强制扣分(上限-15): ___  理由: ___
- **总分**: ___

⚠️ 评分校准:
- H1/L1 in TC 至少70分。每个维度中间值(10-13)是正常的好交易。
- Al Brooks 的学生每天3-5笔交易。0笔不是谨慎，是恐惧。
- **绝对禁止「暂停策略」**。策略亏损了要找原因，不是停用策略。

**Step 4 — 决策**:
- >= 70: "我决定交易" + 入场/止损/目标
- 55-69: "不交易，但接近" + 必须说明：是"理性观望"还是"恐惧观望"？
- < 55: "不交易" + 原因"""

    return msg


def build_round2_message(scene: dict, taxonomy: dict) -> str:
    """构建第 2 轮消息 — V6 揭晓结果 + 反思 + 技能自评"""
    s = scene
    labels = s["labels"]
    tested_skills = s.get("tested_skills", [])
    skill_names = get_skill_names(taxonomy, tested_skills)

    # 构建技能自评表格模板
    skill_eval_table = ""
    if skill_names:
        display_skills = skill_names[:10]
        rows = "\n".join(f"| {name} | _/5 | ___ |" for name in display_skills)
        skill_eval_table = f"""

**6b. 技能自评** — 针对本场景考察的技能，逐项 0-5 分:
| 技能 | 自评(0-5) | 理由 |
|------|----------|------|
{rows}

评分标准: 0=完全没涉及, 1=提到但错误, 2=部分正确, 3=基本正确, 4=准确应用, 5=完美应用+深度理解"""

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

**1. 主导特征回顾**
- 你 Step 0.75 判断谁在控场？结果走势是否验证了？
- 你是用「主导特征」还是「K线序列 HH/HL」判断的方向？如果是后者，重新用主导特征判一次。

**2. 判断对照**
- 市场状态: 你的 vs 自动标注 → 对了/错了？
- Always-In 方向: 你的 vs 实际走势 → 偏差在哪？

**3. 评分校准（最重要！）**
- 你给了多少总分？
- 如果你说"不交易"但实际走势证明应该交易（方向对+变化>1%）→ 你哪些维度打分过低？**这是恐惧，不是谨慎。**
- 如果你说"交易"但实际走势亏损 → 你哪些维度打分过高？
- **校准建议**: 下次遇到类似情况，各维度应该给多少分？

**4. 恐惧 vs 理性自检**
- 你有没有因为"涨太多"或"跌太多"就扣分？→ Al Brooks 说 Tight Channel 可以涨很多而没有 Climax 特征。
- 你有没有想"暂停这个策略"？→ **绝对禁止暂停策略。** 找出具体失败原因，调整该场景下的判断标准，而不是关掉策略。

**5. 交易模拟**
- 如果你 Step 4 决定交易：用你的入场/止损/目标 vs 实际走势，盈亏多少？
- 如果你没交易但方向对了：错过了多少利润？

**6. 课程对照**
- 这次经历对应 Al Brooks 的哪条核心规则？
{skill_eval_table}

**7. 一句话总结** — 用一句话总结本次最大教训或收获。

⛔ 不要调用任何外部工具（file_write / file_read 等），直接在回复中输出所有内容
⛔ 所有输出必须使用中文"""

    return msg


DIRECT_API_URL = "https://api.zhongzhuan.win/v1/messages"
DIRECT_API_KEY = "sk-63TNs5EJWDCcOhgMNxbK3g2EQvxZ2jtWAk60cMFNDw8QDqdj"
DIRECT_MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 3  # R1/R2 空白时的最大重试次数

# 训练专用 system prompt（精简版，round messages 已含完整指令）
TRAINING_SYSTEM_PROMPT = """你是一名精通 Al Brooks 价格行为方法论的加密货币交易分析师。

核心方法论：
- K线三分类：趋势K线(实体>50%)、反转K线(影线>50%)、区间K线(小实体)
- 市场周期：Spike → Tight Channel → Broad Channel → Trading Range
- Always-In 方向：主导特征 > K线序列 > EMA位置（严格优先级，不可颠倒）
- MTR 三部曲：突破 → 回撤 → 反转确认
- 核心优先级：Context > 形态 > 信号K线（这是评分权重，不只是分析顺序）
- 评分框架：趋势强度(0-20) + 信号质量(0-20) + 策略匹配(0-25) + 盈亏比(0-20) + 风险(0-15)
- Climax 判断只看结构特征（抛物线加速/Give-up bars/影线变化），不看涨跌幅度

⚠️ 必须遵守的修正规则（来自训练诊断）：

1. 主导特征优先级：连续2+根小实体/十字星=控场丧失→AI方向存疑。不能用大周期K线序列覆盖小周期主导特征。
2. H1在TC有效：Spike后第一次回调守住=H1入场，不需要等H2。强BO后/TR突破后的H1同样有效。
3. 方向决定找H还是L：AIS时找L1/L2做空，AIL时找H1/H2做多。Failed BO后切换方向。
4. 状态转换必须主动检查：每次分析完市场状态，问"当前是否正在转换？"Climax后检查恢复速度（2h内收复=假Climax）。TC确认需要3-5根回调K线守住。
5. Context强时降低信号K线门槛：三周期一致+明确结构时，区间K线即可入场。TC中小实体K线是正常现象，不是弱信号。
6. 反恐惧：不允许空洞"观望"，必须给出具体替代方案（如果跌到X则做多，涨到Y则做空）。总分55-64且Context强时检查是否恐惧扣分。

分析原则：
- 绝对禁止「暂停策略」，亏损要找具体原因调整判断标准
- 每天 3-5 笔交易是正常的，0 笔是恐惧不是谨慎
- 4h 有否决权：逆 4h Always-In 方向的 15m 形态原则上不做
- 合理交易率应在 30-50%，不是 10%

请使用中文回答所有内容。"""


def get_system_prompt() -> str:
    """返回训练专用 system prompt"""
    return TRAINING_SYSTEM_PROMPT


def send_direct(messages: list[dict], timeout: int = 300) -> dict:
    """直接调用 Claude API with streaming（绕过 OpenClaw gateway，支持 thinking 模型）"""
    import urllib.request
    import urllib.error

    body = {
        "model": DIRECT_MODEL,
        "max_tokens": 16384,
        "system": get_system_prompt(),
        "messages": messages,
        "stream": True,
    }

    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        DIRECT_API_URL,
        data=data,
        headers={
            "x-api-key": DIRECT_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )

    text = ""
    model_used = DIRECT_MODEL
    usage = {}
    t0 = time.time()
    json_errors = 0

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            buffer = ""
            for raw_chunk in resp:
                buffer += raw_chunk.decode("utf-8")
                # 按完整行处理（SSE 以 \n\n 分隔事件）
                while "\n" in buffer:
                    line_str, buffer = buffer.split("\n", 1)
                    line_str = line_str.strip()
                    if not line_str or line_str.startswith(":"):
                        continue
                    if line_str.startswith("event:"):
                        continue
                    if not line_str.startswith("data: "):
                        continue

                    payload = line_str[6:]
                    if payload == "[DONE]":
                        break

                    try:
                        event = json.loads(payload)
                        evt_type = event.get("type", "")

                        if evt_type == "message_start":
                            msg_obj = event.get("message", {})
                            model_used = msg_obj.get(
                                "model", DIRECT_MODEL
                            )
                        elif evt_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text += delta.get("text", "")
                        elif evt_type == "message_delta":
                            usage = event.get("usage", {})
                    except json.JSONDecodeError:
                        json_errors += 1

        elapsed = time.time() - t0
        if json_errors > 0:
            print(f"    ⚠️ JSON 解析错误: {json_errors} 次")
        return {
            "status": "ok",
            "result": {
                "payloads": [{"text": text}],
                "meta": {
                    "agentMeta": {
                        "model": model_used,
                        "provider": "claude-proxy",
                        "usage": usage,
                        "elapsed_s": round(elapsed, 1),
                        "json_errors": json_errors,
                    }
                },
            },
        }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        return {"status": "error", "error": f"HTTP {e.code}: {err_body}"}
    except Exception as e:
        return {"status": "error", "error": str(e)[:500]}


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

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout + 60
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"Timeout after {timeout + 60}s"}

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
    parser = argparse.ArgumentParser(description="读盘训练营 — 执行器 V6")
    parser.add_argument("--input", type=str, default=DEFAULT_SCENES, help="场景文件")
    parser.add_argument("--start", type=int, default=1, help="起始场景编号 (1-based)")
    parser.add_argument("--end", type=int, default=None, help="结束场景编号 (含)")
    parser.add_argument("--dry-run", action="store_true", help="只打印消息不发送")
    parser.add_argument("--timeout", type=int, default=180, help="每轮超时秒数")
    parser.add_argument("--pause", type=int, default=5, help="场景间暂停秒数")
    parser.add_argument("--log-dir", type=str, default=DEFAULT_LOG_DIR,
                        help="日志输出目录")
    parser.add_argument("--taxonomy", type=str, default=DEFAULT_TAXONOMY,
                        help="技能分类文件")
    parser.add_argument("--direct", action="store_true",
                        help="直接调用 Claude API（绕过 OpenClaw gateway，更快更稳定）")
    args = parser.parse_args()

    log_dir = args.log_dir
    taxonomy = load_taxonomy(args.taxonomy)

    with open(args.input, encoding="utf-8") as f:
        scenes = json.load(f)

    total = len(scenes)
    start_idx = args.start - 1  # 0-based
    end_idx = (args.end if args.end else total) - 1  # 0-based inclusive

    if start_idx < 0 or start_idx >= total:
        print(f"错误: start={args.start} 超出范围 (1-{total})")
        sys.exit(1)

    os.makedirs(log_dir, exist_ok=True)

    skill_count = len(taxonomy.get("skills", []))
    print(f"=" * 60)
    print(f"读盘训练营 V6 — 知识驱动训练")
    print(f"  场景: {args.input}")
    print(f"  范围: {args.start} ~ {end_idx + 1} (共 {end_idx - start_idx + 1} 组)")
    print(f"  技能: {skill_count} 个")
    mode_str = "DRY RUN" if args.dry_run else ("直接 API" if args.direct else "OpenClaw Gateway")
    print(f"  模式: {mode_str}")
    if args.direct:
        print(f"  模型: {DIRECT_MODEL}")
    print(f"  超时: {args.timeout}s/轮")
    print(f"=" * 60)

    results = []
    memory_mtime_before = os.path.getmtime(MEMORY_PATH) if os.path.exists(MEMORY_PATH) else 0

    for i in range(start_idx, end_idx + 1):
        scene = scenes[i]
        scene_id = scene["id"]
        idx = i + 1  # 1-based display
        tested_skills = scene.get("tested_skills", [])
        skill_names = get_skill_names(taxonomy, tested_skills)

        print(f"\n{'=' * 40}")
        print(f"场景 {idx}/{total}: {scene_id} | {scene['symbol']} | {scene.get('period', '?')} | {scene['labels']['market_state']}")
        if skill_names:
            print(f"  考察技能: {', '.join(skill_names[:6])}...")
        print(f"{'=' * 40}")

        # --- 第 1 轮: 读盘分析 ---
        scene_session_id = f"train-v6-{scene_id}-{uuid.uuid4().hex[:8]}"
        msg1 = build_round1_message(scene, idx, total, taxonomy)
        print(f"\n  [Round 1] 发送读盘数据 ({len(msg1)} chars) session={scene_session_id[:24]}...")

        if args.dry_run:
            print(f"  [DRY RUN] 消息长度 {len(msg1)}, 跳过发送")
            print(f"  消息前 200 字:\n  {msg1[:200]}...")
            continue

        if args.direct:
            # 直接 API 模式 — 无 gateway 开销
            conversation = [{"role": "user", "content": msg1}]
            resp1 = send_direct(conversation, timeout=args.timeout)
        else:
            resp1 = send_to_agent(msg1, session_id=scene_session_id, timeout=args.timeout)

        if resp1.get("status") == "error":
            print(f"  ❌ Round 1 失败: {resp1.get('error', 'unknown')}")
            results.append({"scene_id": scene_id, "status": "r1_error"})
            continue

        session_id = scene_session_id
        reply1 = extract_reply(resp1)
        model_used = (resp1.get("result", {}).get("meta", {})
                      .get("agentMeta", {}).get("model", "?"))

        # R1 空白重试（流式传输偶尔丢失文本数据）
        for retry_i in range(MAX_RETRIES):
            if len(reply1) >= 100:
                break
            delay = 5 * (retry_i + 1)
            print(f"  ⚠️ R1 过短 ({len(reply1)} chars), "
                  f"重试 {retry_i+1}/{MAX_RETRIES} "
                  f"(等待 {delay}s)...")
            time.sleep(delay)
            if args.direct:
                conversation = [{"role": "user", "content": msg1}]
                resp1 = send_direct(
                    conversation, timeout=args.timeout
                )
            else:
                resp1 = send_to_agent(
                    msg1, session_id=scene_session_id,
                    timeout=args.timeout,
                )
            reply1 = extract_reply(resp1)
            model_used = (
                resp1.get("result", {}).get("meta", {})
                .get("agentMeta", {}).get("model", "?")
            )
        if len(reply1) < 100:
            print(f"  ❌ R1 {MAX_RETRIES}次重试后仍过短 "
                  f"({len(reply1)} chars), 跳过场景")
            results.append({
                "scene_id": scene_id, "status": "r1_empty"
            })
            continue
        if retry_i > 0:
            print(f"  ✅ R1 第{retry_i+1}次重试成功 "
                  f"({len(reply1)} chars)")

        print(f"  ✅ Round 1 完成 ({len(reply1)} chars, "
              f"model={model_used})")
        print(f"  回复摘要: {reply1[:150]}...")

        time.sleep(2)

        # --- 第 2 轮: 结果揭晓 ---
        msg2 = build_round2_message(scene, taxonomy)
        print(f"\n  [Round 2] 揭晓结果 ({len(msg2)} chars)...")

        if args.direct:
            # 直接模式: 把 Round 1 对话传入上下文
            conversation.append({"role": "assistant", "content": reply1})
            conversation.append({"role": "user", "content": msg2})
            resp2 = send_direct(conversation, timeout=args.timeout)
        else:
            resp2 = send_to_agent(msg2, session_id=session_id, timeout=args.timeout)

        if resp2.get("status") == "error":
            print(f"  ❌ Round 2 失败: {resp2.get('error', 'unknown')}")
            results.append({
                "scene_id": scene_id, "status": "r2_error",
                "round1": reply1[:200],
            })
            continue

        reply2 = extract_reply(resp2)

        # R2 空白重试
        if len(reply2) < 100:
            print(f"  ⚠️ R2 过短 ({len(reply2)} chars), 等待 5s 后重试...")
            time.sleep(5)
            if args.direct:
                resp2 = send_direct(conversation, timeout=args.timeout)
            else:
                resp2 = send_to_agent(
                    msg2, session_id=session_id, timeout=args.timeout
                )
            reply2 = extract_reply(resp2)
            if len(reply2) < 100:
                print(f"  ❌ R2 重试后仍过短 ({len(reply2)} chars)")

        print(f"  ✅ Round 2 完成 ({len(reply2)} chars)")
        print(f"  回复摘要: {reply2[:150]}...")

        # 保存日志
        log = {
            "scene_id": scene_id,
            "symbol": scene["symbol"],
            "labels": scene["labels"],
            "tested_skills": tested_skills,
            "round1_reply": reply1,
            "round2_reply": reply2,
            "session_id": session_id,
        }
        log_path = os.path.join(log_dir, f"{scene_id}.json")
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
    print(f"  日志: {log_dir}/")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
