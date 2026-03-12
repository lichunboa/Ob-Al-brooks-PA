"""Strategy Data Processor"""
import hashlib
from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

try:
    from ..db.database import StrategyModel
    from ..models.strategy import StrategyCard
except ImportError:
    from db.database import StrategyModel
    from models.strategy import StrategyCard


class StrategyProcessor:
    """策略数据处理器"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def sync_strategies(
        self,
        strategies: List[StrategyCard],
        force_update: bool = False
    ) -> Dict[str, Any]:
        """同步策略卡片到数据库"""
        
        stats = {
            "total": len(strategies),
            "created": 0,
            "updated": 0,
            "errors": 0,
            "message": "Sync completed",
            "details": []
        }
        
        for strategy in strategies:
            try:
                # 生成唯一ID
                if not strategy.id:
                    strategy.id = self._generate_id(strategy)
                
                # 检查是否已存在
                existing = self.db.query(StrategyModel).filter(
                    StrategyModel.id == strategy.id
                ).first()
                
                if existing:
                    if force_update:
                        self._update_model(existing, strategy)
                        stats["updated"] += 1
                        stats["details"].append({
                            "id": strategy.id,
                            "action": "updated",
                            "name": strategy.name
                        })
                    else:
                        stats["details"].append({
                            "id": strategy.id,
                            "action": "skipped",
                            "name": strategy.name
                        })
                else:
                    model = self._create_model(strategy)
                    self.db.add(model)
                    stats["created"] += 1
                    stats["details"].append({
                        "id": strategy.id,
                        "action": "created",
                        "name": strategy.name
                    })
                
            except Exception as e:
                stats["errors"] += 1
                stats["details"].append({
                    "id": strategy.id if strategy.id else "unknown",
                    "action": "error",
                    "error": str(e)
                })
        
        self.db.commit()
        return stats
    
    def _generate_id(self, strategy: StrategyCard) -> str:
        """生成唯一ID"""
        content = f"{strategy.path}:{strategy.name}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _create_model(self, strategy: StrategyCard) -> StrategyModel:
        """创建数据库模型"""
        return StrategyModel(
            id=strategy.id,
            name=strategy.name,
            canonical_name=strategy.canonical_name,
            category=strategy.category,
            setup_type=strategy.setup_type,
            path=strategy.path,
            description=strategy.description,
            rules=strategy.rules,
            examples=strategy.examples,
            trade_count=strategy.trade_count,
            win_count=strategy.win_count,
            srs_enabled=strategy.srs_enabled,
            srs_due_date=strategy.srs_due_date,
            srs_interval=strategy.srs_interval,
            tags=strategy.tags,
            created_at=strategy.created_at or datetime.utcnow(),
            updated_at=strategy.updated_at or datetime.utcnow(),
            synced_at=datetime.utcnow(),
            raw_frontmatter=strategy.raw_frontmatter,
        )
    
    def _update_model(self, model: StrategyModel, strategy: StrategyCard):
        """更新数据库模型"""
        model.name = strategy.name
        model.canonical_name = strategy.canonical_name
        model.category = strategy.category
        model.setup_type = strategy.setup_type
        model.description = strategy.description
        model.rules = strategy.rules
        model.examples = strategy.examples
        model.trade_count = strategy.trade_count
        model.win_count = strategy.win_count
        model.srs_enabled = strategy.srs_enabled
        model.srs_due_date = strategy.srs_due_date
        model.srs_interval = strategy.srs_interval
        model.tags = strategy.tags
        model.updated_at = datetime.utcnow()
        model.synced_at = datetime.utcnow()
        model.raw_frontmatter = strategy.raw_frontmatter
