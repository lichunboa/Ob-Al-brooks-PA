"""
Obsidian Vault 同步模块
为 AB Console Obsidian 插件提供数据同步接口
"""

import os
import re
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/obsidian", tags=["obsidian"])

# ============================================================
# 配置
# ============================================================
VAULT_PATH = os.environ.get("VAULT_PATH", os.path.expanduser("~/Desktop/Obsidian/Al-brooks-PA"))
STRATEGY_REPO_PATH = os.path.join(VAULT_PATH, "AB Console-Obsidian/策略仓库 (Strategy Repository)")
TRADES_PATH = os.path.join(VAULT_PATH, "AB Console-Obsidian/Daily/Trades")
DATA_DIR = os.path.expanduser("~/.ab-console")

# 确保数据目录存在
os.makedirs(DATA_DIR, exist_ok=True)

# ============================================================
# 数据模型
# ============================================================
class StrategyCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    tags: List[str] = []
    content: Optional[str] = ""

class TradeCreate(BaseModel):
    symbol: str
    direction: str  # Long / Short
    entry_price: float
    exit_price: Optional[float] = None
    quantity: float
    pnl: Optional[float] = None
    notes: Optional[str] = ""

# ============================================================
# 工具函数
# ============================================================
def parse_frontmatter(content: str) -> tuple[Dict[str, Any], str]:
    """解析 Markdown frontmatter"""
    pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
    match = re.match(pattern, content, re.DOTALL)
    
    if not match:
        return {}, content
    
    frontmatter_text = match.group(1)
    body = match.group(2).strip()
    
    # 简单解析 YAML
    frontmatter = {}
    for line in frontmatter_text.strip().split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            frontmatter[key] = value
    
    return frontmatter, body

def format_frontmatter(data: Dict[str, Any]) -> str:
    """格式化 frontmatter"""
    lines = ["---"]
    for key, value in data.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines)

# ============================================================
# 策略管理
# ============================================================
@router.get("/strategies")
async def get_strategies():
    """获取所有策略"""
    strategies = []
    
    if not os.path.exists(STRATEGY_REPO_PATH):
        return {"strategies": strategies, "count": 0}
    
    for root, dirs, files in os.walk(STRATEGY_REPO_PATH):
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    frontmatter, body = parse_frontmatter(content)
                    
                    strategies.append({
                        "id": file.replace('.md', ''),
                        "name": frontmatter.get('name', file.replace('.md', '')),
                        "description": frontmatter.get('description', ''),
                        "tags": frontmatter.get('tags', []),
                        "content": body,
                        "file_path": file_path,
                        "modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                    })
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
    
    return {"strategies": strategies, "count": len(strategies)}

@router.post("/strategies")
async def create_strategy(strategy: StrategyCreate):
    """创建新策略"""
    if not os.path.exists(STRATEGY_REPO_PATH):
        os.makedirs(STRATEGY_REPO_PATH, exist_ok=True)
    
    file_name = f"{strategy.name.replace(' ', '_').replace('/', '_')}.md"
    file_path = os.path.join(STRATEGY_REPO_PATH, file_name)
    
    frontmatter = {
        "name": strategy.name,
        "description": strategy.description,
        "tags": strategy.tags,
        "created": datetime.now().isoformat(),
        "type": "strategy"
    }
    
    content = format_frontmatter(frontmatter) + "\n\n" + strategy.content
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return {
        "success": True,
        "id": file_name.replace('.md', ''),
        "file_path": file_path
    }

# ============================================================
# 交易记录
# ============================================================
@router.get("/trades")
async def get_trades():
    """获取所有交易记录"""
    trades = []
    
    if not os.path.exists(TRADES_PATH):
        return {"trades": trades, "count": 0}
    
    for root, dirs, files in os.walk(TRADES_PATH):
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    frontmatter, body = parse_frontmatter(content)
                    
                    trades.append({
                        "id": file.replace('.md', ''),
                        "symbol": frontmatter.get('symbol', ''),
                        "direction": frontmatter.get('direction', ''),
                        "entry_price": float(frontmatter.get('entry_price', 0)),
                        "exit_price": float(frontmatter.get('exit_price', 0)) if frontmatter.get('exit_price') else None,
                        "quantity": float(frontmatter.get('quantity', 0)),
                        "pnl": float(frontmatter.get('pnl', 0)) if frontmatter.get('pnl') else None,
                        "date": frontmatter.get('date', ''),
                        "notes": body,
                        "file_path": file_path
                    })
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
    
    return {"trades": trades, "count": len(trades)}

@router.post("/trades")
async def create_trade(trade: TradeCreate):
    """创建新交易记录"""
    if not os.path.exists(TRADES_PATH):
        os.makedirs(TRADES_PATH, exist_ok=True)
    
    date_str = datetime.now().strftime('%Y-%m-%d')
    file_name = f"{date_str}_{trade.symbol}_{trade.direction}.md"
    file_path = os.path.join(TRADES_PATH, file_name)
    
    frontmatter = {
        "symbol": trade.symbol,
        "direction": trade.direction,
        "entry_price": trade.entry_price,
        "exit_price": trade.exit_price,
        "quantity": trade.quantity,
        "pnl": trade.pnl,
        "date": datetime.now().isoformat(),
        "type": "trade"
    }
    
    content = format_frontmatter(frontmatter) + "\n\n" + trade.notes
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return {
        "success": True,
        "id": file_name.replace('.md', ''),
        "file_path": file_path
    }

# ============================================================
# 同步状态
# ============================================================
@router.get("/sync/status")
async def get_sync_status():
    """获取同步状态"""
    strategies = await get_strategies()
    trades = await get_trades()
    
    return {
        "vault_path": VAULT_PATH,
        "strategy_repo_exists": os.path.exists(STRATEGY_REPO_PATH),
        "trades_path_exists": os.path.exists(TRADES_PATH),
        "strategies_count": strategies["count"],
        "trades_count": trades["count"],
        "last_sync": datetime.now().isoformat(),
        "status": "active"
    }

@router.post("/sync/trigger")
async def trigger_sync():
    """手动触发同步"""
    strategies = await get_strategies()
    trades = await get_trades()
    
    return {
        "success": True,
        "synced_strategies": strategies["count"],
        "synced_trades": trades["count"],
        "timestamp": datetime.now().isoformat()
    }
