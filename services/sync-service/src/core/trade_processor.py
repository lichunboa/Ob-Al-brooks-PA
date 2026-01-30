"""Trade Data Processor"""
import hashlib
from datetime import datetime
from typing import List, Dict, Any

from sqlalchemy.orm import Session

from db.database import TradeModel
from models.trade import TradeRecord


class TradeProcessor:
    """交易数据处理器"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def sync_trades(
        self,
        trades: List[TradeRecord],
        force_update: bool = False
    ) -> Dict[str, Any]:
        """同步交易记录到数据库"""
        
        stats = {
            "total": len(trades),
            "created": 0,
            "updated": 0,
            "errors": 0,
            "message": "Sync completed",
            "details": []
        }
        
        for trade in trades:
            try:
                # 生成唯一ID（基于 note_path + trade_date + symbol）
                if not trade.id:
                    trade.id = self._generate_id(trade)
                
                # 检查是否已存在
                existing = self.db.query(TradeModel).filter(
                    TradeModel.id == trade.id
                ).first()
                
                if existing:
                    if force_update:
                        self._update_model(existing, trade)
                        stats["updated"] += 1
                        stats["details"].append({
                            "id": trade.id,
                            "action": "updated",
                            "symbol": trade.symbol
                        })
                    else:
                        stats["details"].append({
                            "id": trade.id,
                            "action": "skipped",
                            "symbol": trade.symbol
                        })
                else:
                    # 创建新记录
                    model = self._create_model(trade)
                    self.db.add(model)
                    stats["created"] += 1
                    stats["details"].append({
                        "id": trade.id,
                        "action": "created",
                        "symbol": trade.symbol
                    })
                
            except Exception as e:
                stats["errors"] += 1
                stats["details"].append({
                    "id": trade.id if trade.id else "unknown",
                    "action": "error",
                    "error": str(e)
                })
        
        self.db.commit()
        return stats
    
    def _generate_id(self, trade: TradeRecord) -> str:
        """生成唯一ID"""
        content = f"{trade.note_path}:{trade.trade_date}:{trade.symbol}:{trade.direction}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _create_model(self, trade: TradeRecord) -> TradeModel:
        """创建数据库模型"""
        return TradeModel(
            id=trade.id,
            trade_date=trade.trade_date,
            symbol=trade.symbol,
            direction=trade.direction,
            entry_price=trade.entry_price,
            exit_price=trade.exit_price,
            stop_loss=trade.stop_loss,
            take_profit=trade.take_profit,
            position_size=trade.position_size,
            risk_percent=trade.risk_percent,
            result=trade.result,
            pnl_money=trade.pnl_money,
            pnl_r=trade.pnl_r,
            strategy_name=trade.strategy_name,
            setup_key=trade.setup_key,
            patterns=trade.patterns,
            account_type=trade.account_type or 'Live',
            note_path=trade.note_path,
            note_title=trade.note_title,
            tags=trade.tags,
            market_cycle=trade.market_cycle,
            always_in=trade.always_in,
            entry_bar=trade.entry_bar,
            created_at=trade.created_at or datetime.utcnow(),
            updated_at=trade.updated_at or datetime.utcnow(),
            synced_at=datetime.utcnow(),
            raw_frontmatter=trade.raw_frontmatter,
        )
    
    def _update_model(self, model: TradeModel, trade: TradeRecord):
        """更新数据库模型"""
        model.trade_date = trade.trade_date
        model.symbol = trade.symbol
        model.direction = trade.direction
        model.entry_price = trade.entry_price
        model.exit_price = trade.exit_price
        model.stop_loss = trade.stop_loss
        model.take_profit = trade.take_profit
        model.position_size = trade.position_size
        model.risk_percent = trade.risk_percent
        model.result = trade.result
        model.pnl_money = trade.pnl_money
        model.pnl_r = trade.pnl_r
        model.strategy_name = trade.strategy_name
        model.setup_key = trade.setup_key
        model.patterns = trade.patterns
        model.account_type = trade.account_type or 'Live'
        model.note_title = trade.note_title
        model.tags = trade.tags
        model.market_cycle = trade.market_cycle
        model.always_in = trade.always_in
        model.entry_bar = trade.entry_bar
        model.updated_at = datetime.utcnow()
        model.synced_at = datetime.utcnow()
        model.raw_frontmatter = trade.raw_frontmatter
