"""
Obsidian 交易笔记深度提取器
功能：遍历 Vault 中的交易笔记，提取结构化数据与非结构化复盘内容，生成 AI 诊断上下文。
"""

import os
import yaml
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# 配置路径
VAULT_PATH = Path("/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades")
OUTPUT_FILE = Path("/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/AI_Diagnosis_Context.md")

def parse_note(file_path):
    try:
        content = file_path.read_text(encoding='utf-8')

        # 提取 YAML Frontmatter
        yaml_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
        if not yaml_match:
            return None

        frontmatter = yaml.safe_load(yaml_match.group(1))

        # 提取核心复盘内容 (假设笔记中有 "## 复盘" 或 "## Analysis" 标题)
        # 简单起见，提取正文的前 500 字作为上下文
        body = content[yaml_match.end():].strip()

        # 尝试提取特定的复盘段落
        analysis_section = ""
        if "## 复盘" in body:
            analysis_section = body.split("## 复盘")[1].split("##")[0].strip()
        elif "## Analysis" in body:
            analysis_section = body.split("## Analysis")[1].split("##")[0].strip()
        else:
            # 如果没有特定标题，取正文前段
            analysis_section = body[:300].replace('\n', ' ')

        return {
            "file": file_path.name,
            "date": frontmatter.get("date", "Unknown"),
            "symbol": frontmatter.get("symbol", "Unknown"),
            "bot": frontmatter.get("bot", "Manual"),
            "strategy": frontmatter.get("strategy", "Unknown"),
            "pnl": frontmatter.get("pnl", 0),
            "outcome": frontmatter.get("outcome", "Unknown"),
            "analysis": analysis_section
        }
    except Exception as e:
        print(f"Error parsing {file_path.name}: {e}")
        return None

def generate_report():
    print(f"Scanning vault: {VAULT_PATH}")
    notes_data = []

    # 递归遍历 markdown 文件
    for file_path in VAULT_PATH.rglob("*.md"):
        if file_path.name == OUTPUT_FILE.name:
            continue
        data = parse_note(file_path)
        if data and data.get('bot'): # 只记录有 bot 归属的
            notes_data.append(data)

    # 按 Bot 分组
    bots = defaultdict(list)
    for note in notes_data:
        bot_name = note['bot']
        # 标准化 bot 名称
        if "al-brooks" in bot_name.lower() or "pa" in bot_name.lower():
            bots["al-brooks"].append(note)
        elif "quant" in bot_name.lower() or "trader" in bot_name.lower():
            bots["trader"].append(note)
        elif "wyckoff" in bot_name.lower():
            bots["wyckoff"].append(note)

    # 生成 Markdown 报告
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(f"# AI 交易员深度诊断上下文\n")
        f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("> 本文件由脚本自动生成，汇集了 Obsidian 中的历史交易笔记。请将此内容投喂给 Opus 4.6 模型进行深度分析。\n\n")

        for bot_id, trades in bots.items():
            f.write(f"## 🤖 Agent: {bot_id}\n\n")

            # 统计数据
            total_trades = len(trades)
            wins = sum(1 for t in trades if str(t['outcome']).lower() in ['win', 'profit'])
            win_rate = (wins / total_trades * 100) if total_trades > 0 else 0

            f.write(f"### 基础统计\n")
            f.write(f"- 总交易数: {total_trades}\n")
            f.write(f"- 胜率: {win_rate:.1f}%\n\n")

            f.write(f"### 交易详情 (最近 30 笔)\n")
            # 按日期倒序
            sorted_trades = sorted(trades, key=lambda x: str(x['date']), reverse=True)[:30]

            for t in sorted_trades:
                icon = "✅" if str(t['outcome']).lower() in ['win', 'profit'] else "❌"
                f.write(f"#### {icon} {t['date']} {t['symbol']} ({t['strategy']})\n")
                f.write(f"- **盈亏**: {t['pnl']}\n")
                f.write(f"- **复盘记录**: {t['analysis']}\n\n")

            f.write("---\n\n")

    print(f"Report generated at: {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_report()
