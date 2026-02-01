#!/usr/bin/env python3
"""
自动转发服务 - 监听信号并自动发送详版给 Telegram Service
"""
import json
import os
import time
import requests
from datetime import datetime

SIGNAL_FILE = os.environ.get('SIGNAL_FILE', '/app/signals/signals.jsonl')
LAST_POSITION_FILE = "/app/data/forwarder_last_pos.txt"
TELEGRAM_API = os.environ.get('TELEGRAM_API', 'http://localhost:8090/api/catbo-forward')
USER_ID = "756069822"

def get_last_position():
    try:
        with open(LAST_POSITION_FILE, "r") as f:
            return int(f.read().strip())
    except:
        return 0

def save_last_position(pos):
    with open(LAST_POSITION_FILE, "w") as f:
        f.write(str(pos))

def send_detailed_analysis(signal):
    """发送详细分析"""
    symbol = signal.get("symbol", "UNKNOWN")
    side = signal.get("side", "BUY")
    strength = signal.get("strength", 0)
    
    emoji = "🟢" if side == "BUY" else "🔴"
    
    # 简化的详版模板（实际应该调用完整分析）
    analysis = f"""{emoji} <b>{symbol} {side} 详细分析</b> | {datetime.now().strftime('%H:%M')}

<b>一、Al Brooks 七步分析</b>
<b>Step 1:</b> Always In方向 - {"Long" if side=="BUY" else "Short"}
<b>Step 2:</b> 市场周期 - 待确认
<b>Step 3:</b> Leg计数 - H2/L2区域
<b>Step 4:</b> 信号质量 - 待确认
<b>Step 5:</b> 止损/目标 - 待计算
<b>Step 6:</b> 交易建议 - {"做多" if side=="BUY" else "做空"}
<b>Step 7:</b> 概率评估 - {strength:.0%}

<b>二、条件评分</b>
后端信号: {strength:.2f}
<b>总分: 待计算/100</b>

📊 完整分析请查看图表"""
    
    try:
        response = requests.post(TELEGRAM_API, json={
            "user_id": USER_ID,
            "message": analysis,
            "parse_mode": "HTML"
        }, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"[{datetime.now()}] 转发失败: {e}")
        return False

def monitor_signals():
    """监控信号文件"""
    print(f"[{datetime.now()}] 自动转发服务启动...")
    
    while True:
        try:
            if not os.path.exists(SIGNAL_FILE):
                time.sleep(5)
                continue
            
            last_pos = get_last_position()
            
            with open(SIGNAL_FILE, "r") as f:
                f.seek(last_pos)
                lines = f.readlines()
                new_pos = f.tell()
            
            if lines:
                for line in lines:
                    line = line.strip()
                    if line:
                        try:
                            signal = json.loads(line)
                            print(f"[{datetime.now()}] 检测到信号: {signal}")
                            
                            if send_detailed_analysis(signal):
                                print(f"[{datetime.now()}] ✅ 详版已发送至 @abconsole_backend_bot")
                            else:
                                print(f"[{datetime.now()}] ❌ 发送失败")
                        except json.JSONDecodeError:
                            pass
                
                save_last_position(new_pos)
            
            time.sleep(3)  # 每3秒检查一次
            
        except Exception as e:
            print(f"[{datetime.now()}] 错误: {e}")
            time.sleep(5)

if __name__ == "__main__":
    monitor_signals()
