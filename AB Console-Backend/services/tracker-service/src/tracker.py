#!/usr/bin/env python3
"""
交易追踪和账户同步服务
Docker 化版本 - 每 60 秒检查活跃交易并更新账户

功能：
1. 检查活跃交易是否触及止盈/止损/超时
2. 更新交易状态到 active_trades.json
3. 更新对应的 Obsidian 笔记
4. 同步完成的交易到 xiaoming_account.json
5. 提供健康检查端点
"""

import os
import re
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
import uvicorn

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# 配置路径（Docker 挂载）
WORKSPACE_DIR = os.environ.get("WORKSPACE_DIR", "/app/workspace")
OBSIDIAN_DIR = os.environ.get("OBSIDIAN_DIR", "/app/obsidian")
ACTIVE_TRADES_FILE = os.path.join(WORKSPACE_DIR, "active_trades.json")
ACCOUNT_FILE = os.path.join(WORKSPACE_DIR, "xiaoming_account.json")
POSITION_SIZE = int(os.environ.get("POSITION_SIZE", "1000"))  # $1000 仓位
CHECK_INTERVAL = int(os.environ.get("CHECK_INTERVAL", "60"))  # 60 秒检查间隔

# 全局状态
last_check_time = None
total_checks = 0
trades_processed = 0


def load_json(filepath: str) -> dict | None:
    """加载 JSON 文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"无法加载 {filepath}: {e}")
        return None


def save_json(filepath: str, data: dict) -> bool:
    """保存 JSON 文件"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"无法保存 {filepath}: {e}")
        return False


def calculate_net_profit(direction: str, entry_price: float, exit_price: float) -> float:
    """计算实际利润（按仓位比例）"""
    if entry_price is None or entry_price == 0 or exit_price is None:
        return 0
    
    if '做多' in str(direction) or 'Long' in str(direction):
        return round(POSITION_SIZE * (exit_price - entry_price) / entry_price, 2)
    else:  # 做空
        return round(POSITION_SIZE * (entry_price - exit_price) / entry_price, 2)


def update_obsidian_note(note_path: str, outcome: str, exit_reason: str, 
                         exit_price: float, net_profit: float) -> bool:
    """更新 Obsidian 笔记的 frontmatter"""
    try:
        # 检查文件是否存在（可能在 Docker 挂载目录中）
        if not os.path.exists(note_path):
            # 尝试转换路径（Docker 内路径映射）
            if note_path.startswith("/Users/"):
                # 从宿主机路径转换为 Docker 路径
                relative = note_path.split("Daily/Trades/", 1)
                if len(relative) > 1:
                    note_path = os.path.join(OBSIDIAN_DIR, "Daily/Trades", relative[1])
        
        if not os.path.exists(note_path):
            logger.warning(f"笔记不存在: {note_path}")
            return False
        
        with open(note_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 更新 frontmatter 字段
        updates = [
            (r'(结果/outcome:\s*)\S*', rf'\1{outcome}'),
            (r'(出场原因/exit_reason:\s*)\S*', rf'\1{exit_reason}'),
            (r'(净利润/net_profit:\s*)\S*', rf'\g<1>{net_profit}'),
            (r'(追踪状态/tracking_status:\s*)\S*', r'\1已结束'),
        ]
        
        for pattern, replacement in updates:
            content = re.sub(pattern, replacement, content)
        
        # 更新正文
        result_emoji = "✅" if "止盈" in outcome else "❌" if "止损" in outcome else "➖"
        if "> ⏳ 追踪中" in content:
            content = re.sub(
                r'> ⏳ 追踪中.*?\n',
                f'> {result_emoji} 追踪完成 — {"止盈" if "止盈" in outcome else "止损" if "止损" in outcome else "超时"}出场\n',
                content
            )
        
        with open(note_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return True
    except Exception as e:
        logger.warning(f"无法更新笔记 {note_path}: {e}")
        return False


def archive_note(note_path: str) -> str | None:
    """将笔记移动到 Archive 文件夹，返回新路径"""
    import shutil
    
    try:
        # 转换为 Docker 内路径
        docker_path = note_path
        if note_path.startswith("/Users/"):
            relative = note_path.split("Daily/Trades/", 1)
            if len(relative) > 1:
                docker_path = os.path.join(OBSIDIAN_DIR, "Daily/Trades", relative[1])
        
        if not os.path.exists(docker_path):
            logger.warning(f"归档失败 - 笔记不存在: {docker_path}")
            return None
        
        # 获取日期文件夹（如 2026-02-06）
        parent_dir = os.path.dirname(docker_path)
        date_folder = os.path.basename(parent_dir)
        
        # 创建 Archive 目录
        archive_dir = os.path.join(parent_dir, "Archive")
        os.makedirs(archive_dir, exist_ok=True)
        
        # 移动笔记
        filename = os.path.basename(docker_path)
        new_path = os.path.join(archive_dir, filename)
        shutil.move(docker_path, new_path)
        
        logger.info(f"📦 已归档: {filename} -> {date_folder}/Archive/")
        return new_path
        
    except Exception as e:
        logger.warning(f"归档失败 {note_path}: {e}")
        return None


def update_account_statistics(completed_trades: list) -> bool:
    """更新账户统计"""
    account = load_json(ACCOUNT_FILE)
    if not account:
        return False
    
    stats = account.get('statistics', {})
    
    for trade in completed_trades:
        net_profit = trade.get('net_profit', 0)
        result_type = trade.get('result_type', 'scratch')
        
        stats['total_trades'] = stats.get('total_trades', 0) + 1
        
        if result_type == 'win':
            stats['winning_trades'] = stats.get('winning_trades', 0) + 1
            stats['total_profit'] = stats.get('total_profit', 0) + net_profit
        elif result_type == 'loss':
            stats['losing_trades'] = stats.get('losing_trades', 0) + 1
            stats['total_loss'] = stats.get('total_loss', 0) + net_profit
        else:
            stats['scratch_trades'] = stats.get('scratch_trades', 0) + 1
    
    # 重新计算胜率
    decisive_trades = stats.get('winning_trades', 0) + stats.get('losing_trades', 0)
    if decisive_trades > 0:
        stats['win_rate'] = round(stats['winning_trades'] / decisive_trades * 100, 1)
    
    stats['net_profit'] = round(stats.get('total_profit', 0) + stats.get('total_loss', 0), 2)
    stats['last_updated'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
    
    account['current_balance'] = account['initial_balance'] + stats['net_profit']
    account['statistics'] = stats
    
    return save_json(ACCOUNT_FILE, account)


def check_and_update_trades() -> int:
    """检查并更新活跃交易，返回处理的交易数"""
    global trades_processed
    
    data = load_json(ACTIVE_TRADES_FILE)
    if not data:
        logger.warning("无法加载活跃交易文件")
        return 0
    
    active_trades = data.get('active_trades', [])
    trades_history = data.get('trades', [])
    
    if not active_trades:
        logger.info("没有活跃交易需要检查")
        return 0
    
    logger.info(f"检查 {len(active_trades)} 笔活跃交易...")
    
    now = datetime.now().astimezone()
    completed_trades = []
    remaining_active = []
    
    for trade in active_trades:
        trade_id = trade.get('trade_id', 'unknown')
        expires_at_str = trade.get('max_hold_until', trade.get('expires_at', ''))
        
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        except:
            logger.warning(f"{trade_id}: 无法解析过期时间 '{expires_at_str}'")
            remaining_active.append(trade)
            continue
        
        # 检查是否过期
        if now > expires_at:
            logger.info(f"⏰ {trade_id}: 已过期，标记为 timeout")
            
            entry_price = trade.get('entry_price', 0)
            exit_price = entry_price  # 超时以入场价平仓
            net_profit = 0
            
            trade['status'] = 'timeout'
            trade['result_type'] = 'scratch'
            trade['outcome'] = '超时 (Timeout)'
            trade['exit_reason'] = '时间止损-到点/收盘 (Time Exit)'
            trade['exit_price'] = exit_price
            trade['net_profit'] = net_profit
            trade['closed_at'] = now.strftime('%Y-%m-%dT%H:%M:%S+08:00')
            
            # 更新 Obsidian 笔记
            note_path = trade.get('note_path', '')
            if note_path:
                update_obsidian_note(
                    note_path,
                    trade['outcome'],
                    trade['exit_reason'],
                    exit_price,
                    net_profit
                )
                # 归档 timeout 笔记（移到 Archive 文件夹）
                archive_note(note_path)
            
            trades_history.append(trade)
            completed_trades.append(trade)
            trades_processed += 1
        else:
            remaining_active.append(trade)
    
    # 保存更新
    data['active_trades'] = remaining_active
    data['trades'] = trades_history
    
    if save_json(ACTIVE_TRADES_FILE, data):
        logger.info(f"✅ 完成: {len(completed_trades)} 笔, 剩余活跃: {len(remaining_active)} 笔")
    
    # 更新账户统计
    if completed_trades:
        logger.info("💰 更新账户统计...")
        update_account_statistics(completed_trades)
    
    return len(completed_trades)


async def periodic_check():
    """定期检查任务"""
    global last_check_time, total_checks
    
    while True:
        try:
            logger.info("=" * 50)
            logger.info(f"🔄 开始检查 (第 {total_checks + 1} 次)")
            
            check_and_update_trades()
            
            last_check_time = datetime.now()
            total_checks += 1
            
        except Exception as e:
            logger.error(f"检查失败: {e}")
        
        await asyncio.sleep(CHECK_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("=" * 60)
    logger.info("🚀 Tracker Service 启动")
    logger.info(f"   检查间隔: {CHECK_INTERVAL} 秒")
    logger.info(f"   仓位大小: ${POSITION_SIZE}")
    logger.info(f"   工作目录: {WORKSPACE_DIR}")
    logger.info(f"   Obsidian: {OBSIDIAN_DIR}")
    logger.info("=" * 60)
    
    # 启动后台任务
    task = asyncio.create_task(periodic_check())
    
    yield
    
    # 关闭时
    task.cancel()
    logger.info("Tracker Service 已停止")


# FastAPI 应用
app = FastAPI(
    title="Tracker Service",
    description="交易追踪和账户同步服务",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/health")
async def health():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "tracker-service",
        "last_check": last_check_time.isoformat() if last_check_time else None,
        "total_checks": total_checks,
        "trades_processed": trades_processed,
        "check_interval_seconds": CHECK_INTERVAL
    }


@app.get("/status")
async def status():
    """详细状态"""
    data = load_json(ACTIVE_TRADES_FILE)
    account = load_json(ACCOUNT_FILE)
    
    return {
        "active_trades": len(data.get('active_trades', [])) if data else 0,
        "trade_history": len(data.get('trades', [])) if data else 0,
        "account_balance": account.get('current_balance') if account else None,
        "total_trades": account.get('statistics', {}).get('total_trades') if account else None,
        "win_rate": account.get('statistics', {}).get('win_rate') if account else None,
    }


@app.post("/check")
async def trigger_check():
    """手动触发检查"""
    processed = check_and_update_trades()
    return {"processed": processed}


if __name__ == "__main__":
    uvicorn.run(
        "src.tracker:app",
        host="0.0.0.0",
        port=8091,
        reload=False
    )
