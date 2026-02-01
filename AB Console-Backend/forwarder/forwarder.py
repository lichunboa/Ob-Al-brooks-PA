#!/usr/bin/env python3
"""
信号转发服务 - v2.0
使用统一配置中心，支持Docker和本地环境
"""
import json
import os
import sys
import time
import requests
from datetime import datetime
from pathlib import Path

# 添加libs到路径
PROJECT_ROOT = Path(__file__).parent.parent
LIBS_PATH = PROJECT_ROOT / "libs"
if str(LIBS_PATH) not in sys.path:
    sys.path.insert(0, str(LIBS_PATH))

from common.service_discovery import ServiceRegistry, AppConfig
from common.logging_config import setup_logging, get_logger, log_execution_time

# 配置（从环境变量读取，有默认值）
TELEGRAM_API = os.environ.get(
    'TELEGRAM_API', 
    ServiceRegistry.get_url('telegram-service') + '/api/catbo-forward'
)
USER_ID = os.environ.get('USER_ID')
if not USER_ID:
    raise ValueError("USER_ID环境变量必须设置!")
    
SIGNAL_FILE = os.environ.get('SIGNAL_FILE', '/app/signals/signals.jsonl')
DATA_DIR = Path('/app/data')
DATA_DIR.mkdir(parents=True, exist_ok=True)
LAST_POS_FILE = DATA_DIR / 'last_pos.txt'

# 重试配置
MAX_RETRIES = 3
RETRY_DELAY = 2

# 初始化日志
logger = setup_logging(
    service_name='forwarder',
    level=os.getenv('LOG_LEVEL', 'INFO'),
    enable_file=True,
    enable_console=True,
    structured=os.getenv('LOG_STRUCTURED', 'false').lower() == 'true'
)


def get_last_pos():
    """获取上次读取位置"""
    try:
        if LAST_POS_FILE.exists():
            with open(LAST_POS_FILE, 'r') as f:
                return int(f.read().strip())
    except Exception as e:
        logger.warning(f"读取位置文件失败: {e}")
    return 0


def save_pos(pos):
    """保存读取位置"""
    try:
        with open(LAST_POS_FILE, 'w') as f:
            f.write(str(pos))
    except Exception as e:
        logger.error(f"保存位置文件失败: {e}")


@log_execution_time(logger)
def forward_signal(signal):
    """
    转发信号详情到Telegram
    
    Args:
        signal: 信号数据字典
        
    Returns:
        bool: 是否成功
    """
    symbol = signal.get('symbol', 'UNKNOWN')
    side = signal.get('side', signal.get('direction', 'BUY'))
    strength = signal.get('strength', 0)
    signal_type = signal.get('signal_type', signal.get('type', 'Unknown'))
    
    emoji = "🟢" if side == "BUY" else "🔴"
    
    analysis = f"""{emoji} <b>{symbol} {side} 详细分析</b> | {datetime.now().strftime('%H:%M')}

<b>信号类型:</b> {signal_type}
<b>强度:</b> {strength:.2f}

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
    
    # 重试逻辑
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(
                TELEGRAM_API,
                json={
                    'user_id': USER_ID,
                    'message': analysis,
                    'parse_mode': 'HTML'
                },
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info_ctx(
                    f"信号转发成功: {symbol} {side}",
                    symbol=symbol,
                    side=side,
                    strength=strength,
                    attempt=attempt + 1
                )
                return True
            else:
                logger.warning_ctx(
                    f"转发失败 (HTTP {response.status_code})",
                    status_code=response.status_code,
                    response=response.text[:200]
                )
                
        except requests.exceptions.Timeout:
            logger.warning(f"请求超时 (尝试 {attempt + 1}/{MAX_RETRIES})")
        except Exception as e:
            logger.error(f"转发异常: {e}")
        
        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAY * (attempt + 1))  # 指数退避
    
    return False


def process_signals():
    """处理信号文件"""
    if not os.path.exists(SIGNAL_FILE):
        return 0
    
    last_pos = get_last_pos()
    signals_processed = 0
    
    try:
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
                logger.info(f"检测到信号: {signal.get('symbol')} {signal.get('side')}")
                
                if forward_signal(signal):
                    signals_processed += 1
                    logger.info("✅ 转发成功")
                else:
                    logger.error("❌ 转发失败")
                    
            except json.JSONDecodeError as e:
                logger.warning(f"JSON解析错误: {e}")
            except Exception as e:
                logger.error(f"处理信号异常: {e}")
        
        save_pos(new_pos)
        
    except Exception as e:
        logger.error(f"读取信号文件失败: {e}")
    
    return signals_processed


def main():
    """主循环"""
    logger.info("=" * 60)
    logger.info("信号转发服务启动 (v2.0)")
    logger.info("=" * 60)
    logger.info(f"Telegram API: {TELEGRAM_API}")
    logger.info(f"User ID: {USER_ID}")
    logger.info(f"Signal File: {SIGNAL_FILE}")
    logger.info(f"Data Dir: {DATA_DIR}")
    logger.info(f"Docker模式: {ServiceRegistry.is_docker()}")
    logger.info("=" * 60)
    
    cycle_count = 0
    
    while True:
        try:
            cycle_count += 1
            signals = process_signals()
            
            if signals > 0:
                logger.info(f"本轮处理 {signals} 个信号")
            
            # 每100轮输出一次心跳
            if cycle_count % 100 == 0:
                logger.debug(f"服务运行中... (已运行 {cycle_count} 轮)")
            
            time.sleep(3)
            
        except KeyboardInterrupt:
            logger.info("收到停止信号，正在退出...")
            break
        except Exception as e:
            logger.error(f"主循环异常: {e}", exc_info=True)
            time.sleep(5)


if __name__ == '__main__':
    main()
