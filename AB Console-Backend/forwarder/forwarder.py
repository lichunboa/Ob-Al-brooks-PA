#!/usr/bin/env python3
"""简化的转发服务 - Alpine Linux 版本"""
import json
import os
import time
import requests
from datetime import datetime

TELEGRAM_API = os.environ.get('TELEGRAM_API', 'http://telegram-service:8090/api/catbo-forward')
USER_ID = os.environ.get('USER_ID', '756069822')
SIGNAL_FILE = os.environ.get('SIGNAL_FILE', '/app/signals/signals.jsonl')
LAST_POS_FILE = '/app/data/last_pos.txt'

def get_last_pos():
    try:
        with open(LAST_POS_FILE, 'r') as f:
            return int(f.read().strip())
    except:
        return 0

def save_pos(pos):
    with open(LAST_POS_FILE, 'w') as f:
        f.write(str(pos))

def forward_signal(signal):
    """转发信号详情"""
    symbol = signal.get('symbol', 'UNKNOWN')
    side = signal.get('side', 'BUY')
    strength = signal.get('strength', 0)
    
    emoji = "🟢" if side == "BUY" else "🔴"
    
    analysis = f"""{emoji} <b>{symbol} {side} 详细分析</b> | {datetime.now().strftime('%H:%M')}

<b>一、Al Brooks 七步分析</b>
<b>Step 1:</b> Always In {"Long" if side=="BUY" else "Short"}
<b>Step 2:</b> 市场周期 - 待确认
<b>Step 3:</b> Leg计数 - H2/L2区域
<b>Step 4:</b> 信号质量 - 强度{strength:.2f}
<b>Step 5:</b> 止损/目标 - 待计算
<b>Step 6:</b> 交易建议 - {"做多" if side=="BUY" else "做空"}
<b>Step 7:</b> 概率评估 - 待确认

<b>二、条件评分</b>
后端信号: {strength:.2f}

<b>评分: 待计算/100</b>"""
    
    try:
        r = requests.post(TELEGRAM_API, json={
            'user_id': USER_ID,
            'message': analysis,
            'parse_mode': 'HTML'
        }, timeout=10)
        return r.status_code == 200
    except Exception as e:
        print(f"[{datetime.now()}] 转发失败: {e}")
        return False

def main():
    print(f"[{datetime.now()}] 转发服务启动...")
    print(f"  Telegram API: {TELEGRAM_API}")
    print(f"  User ID: {USER_ID}")
    print(f"  Signal File: {SIGNAL_FILE}")
    
    while True:
        try:
            if not os.path.exists(SIGNAL_FILE):
                time.sleep(3)
                continue
            
            last_pos = get_last_pos()
            
            with open(SIGNAL_FILE, 'r') as f:
                f.seek(last_pos)
                lines = f.readlines()
                new_pos = f.tell()
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    signal = json.loads(line)
                    print(f"[{datetime.now()}] 检测到信号: {signal.get('symbol')} {signal.get('side')}")
                    
                    if forward_signal(signal):
                        print(f"[{datetime.now()}] ✅ 转发成功")
                    else:
                        print(f"[{datetime.now()}] ❌ 转发失败")
                except json.JSONDecodeError:
                    pass
            
            save_pos(new_pos)
            time.sleep(3)
            
        except Exception as e:
            print(f"[{datetime.now()}] 错误: {e}")
            time.sleep(5)

if __name__ == '__main__':
    main()
