#!/usr/bin/env python3
"""简化版 Signal 转发器 - 读取信号文件并转发到 Telegram"""
import json
import os
import time
import requests
from pathlib import Path

SIGNAL_FILE = os.getenv("SIGNAL_FILE", "/app/signals/signals.jsonl")
TELEGRAM_API = os.getenv("TELEGRAM_API", "http://telegram-service:8090/api/catbo-forward")
USER_ID = os.getenv("USER_ID", "756069822")  # 默认用户 ID
PROCESSED_FILE = "/app/data/processed_signals.txt"  # 已处理信号记录

def load_processed_signals():
    """加载已处理的信号时间戳"""
    processed = set()
    try:
        if Path(PROCESSED_FILE).exists():
            with open(PROCESSED_FILE, 'r') as f:
                for line in f:
                    processed.add(line.strip())
    except Exception:
        pass
    return processed

def save_processed_signal(signal_id):
    """保存已处理的信号"""
    try:
        Path(PROCESSED_FILE).parent.mkdir(parents=True, exist_ok=True)
        with open(PROCESSED_FILE, 'a') as f:
            f.write(signal_id + "\n")
    except Exception as e:
        print(f"[Forwarder] 保存处理记录失败: {e}")

def format_signal_message(signal):
    """格式化信号为 Telegram 消息"""
    symbol = signal.get('symbol', 'UNKNOWN')
    direction = signal.get('direction', 'N/A')
    strength = signal.get('strength', 0)
    timeframe = signal.get('timeframe', '5m')
    price = signal.get('price', 0)
    signal_type = signal.get('signal_type', '未知信号')

    # 方向图标
    if direction.upper() in ['BUY', 'LONG', '做多']:
        direction_icon = "🟢"
        direction_text = "买入"
    elif direction.upper() in ['SELL', 'SHORT', '做空']:
        direction_icon = "🔴"
        direction_text = "卖出"
    else:
        direction_icon = "⚪"
        direction_text = direction

    # 强度条
    strength_pct = min(100, max(0, int(strength * 100) if strength <= 1 else int(strength)))
    filled = strength_pct // 10
    empty = 10 - filled
    strength_bar = "█" * filled + "░" * empty

    # 格式化价格
    if price >= 1000:
        price_str = f"{price:,.2f}"
    elif price >= 1:
        price_str = f"{price:.2f}"
    else:
        price_str = f"{price:.6f}"

    message = f"""{direction_icon} <b>{direction_text}</b> | {symbol}

📌 {signal_type}
⏱ 周期: {timeframe}
💰 价格: ${price_str}
📊 强度: [{strength_bar}] {strength_pct}%

💬 检测到{direction_text}信号"""

    return message

def forward_signals():
    """读取信号文件并转发到 Telegram"""
    signal_path = Path(SIGNAL_FILE)
    if not signal_path.exists():
        return  # 静默返回，不打印日志

    processed = load_processed_signals()
    new_signals = []

    try:
        with open(signal_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    signal = json.loads(line)
                    # 生成唯一 ID
                    signal_id = f"{signal.get('symbol')}_{signal.get('timestamp')}_{signal.get('signal_type')}"

                    if signal_id not in processed:
                        new_signals.append((signal_id, signal))
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"[Forwarder] 读取文件错误: {e}")
        return

    # 转发新信号
    for signal_id, signal in new_signals:
        try:
            message = format_signal_message(signal)
            payload = {
                "user_id": USER_ID,
                "message": message,
                "parse_mode": "HTML"
            }

            resp = requests.post(
                TELEGRAM_API,
                json=payload,
                timeout=10
            )

            if resp.status_code == 200:
                print(f"[Forwarder] 转发成功: {signal.get('symbol')} {signal.get('direction')}")
                save_processed_signal(signal_id)
            else:
                print(f"[Forwarder] 转发失败: {resp.status_code} - {resp.text[:100]}")
        except requests.RequestException as e:
            print(f"[Forwarder] 请求错误: {e}")

def cleanup_old_signals():
    """清理旧的信号文件（保留最近 100 条）"""
    signal_path = Path(SIGNAL_FILE)
    if not signal_path.exists():
        return

    try:
        with open(signal_path, 'r') as f:
            lines = f.readlines()

        if len(lines) > 100:
            # 只保留最近 100 条
            with open(signal_path, 'w') as f:
                f.writelines(lines[-100:])
            print(f"[Forwarder] 清理旧信号，保留 100 条")
    except Exception as e:
        print(f"[Forwarder] 清理失败: {e}")

if __name__ == "__main__":
    print("[Forwarder] 简化版转发器启动")
    print(f"[Forwarder] 信号文件: {SIGNAL_FILE}")
    print(f"[Forwarder] Telegram API: {TELEGRAM_API}")
    print(f"[Forwarder] 用户 ID: {USER_ID}")

    cleanup_counter = 0

    # 每 10 秒检查一次
    while True:
        forward_signals()

        # 每 10 分钟清理一次
        cleanup_counter += 1
        if cleanup_counter >= 60:
            cleanup_old_signals()
            cleanup_counter = 0

        time.sleep(10)
