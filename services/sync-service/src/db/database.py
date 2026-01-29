"""Database Connection & Models"""
from sqlalchemy import create_engine, Column, String, DateTime, Date, Numeric, Integer, Boolean, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from datetime import datetime
from typing import Generator

from config import settings

Base = declarative_base()


class TradeModel(Base):
    """交易记录数据库模型"""
    __tablename__ = "obsidian_trades"
    
    id = Column(String(64), primary_key=True)
    trade_date = Column(Date, nullable=False, index=True)
    symbol = Column(String(32), nullable=False, index=True)
    direction = Column(String(10), nullable=False)
    
    entry_price = Column(Numeric(20, 8), nullable=True)
    exit_price = Column(Numeric(20, 8))
    stop_loss = Column(Numeric(20, 8))
    take_profit = Column(Numeric(20, 8))
    
    position_size = Column(Numeric(20, 8))
    risk_percent = Column(Numeric(5, 2))
    
    result = Column(String(10))
    pnl_money = Column(Numeric(20, 2))
    pnl_r = Column(Numeric(10, 4))
    
    # 账户类型
    account_type = Column(String(16), default='Live', index=True)  # Live, Demo, Backtest
    
    strategy_name = Column(String(128), index=True)
    setup_key = Column(String(128))
    patterns = Column(JSON, default=list)
    
    note_path = Column(String(512), nullable=False)
    note_title = Column(String(256))
    tags = Column(JSON, default=list)
    
    market_cycle = Column(String(32))
    always_in = Column(String(16))
    entry_bar = Column(Integer)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = Column(DateTime, default=datetime.utcnow)
    
    raw_frontmatter = Column(JSON)


class StrategyModel(Base):
    """策略卡片数据库模型"""
    __tablename__ = "obsidian_strategies"
    
    id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False, index=True)
    canonical_name = Column(String(128))
    
    category = Column(String(64))
    setup_type = Column(String(64))
    path = Column(String(512), nullable=False)
    
    description = Column(Text)
    rules = Column(JSON, default=list)
    examples = Column(JSON, default=list)
    
    trade_count = Column(Integer, default=0)
    win_count = Column(Integer, default=0)
    
    srs_enabled = Column(Boolean, default=False)
    srs_due_date = Column(DateTime)
    srs_interval = Column(Integer)
    
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = Column(DateTime, default=datetime.utcnow)
    
    raw_frontmatter = Column(JSON)


class SyncLog(Base):
    """同步日志"""
    __tablename__ = "sync_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    sync_type = Column(String(32), nullable=False)  # trades, strategies
    source = Column(String(32), nullable=False)  # obsidian, manual
    status = Column(String(16), nullable=False)  # success, partial, failed
    total = Column(Integer, default=0)
    created = Column(Integer, default=0)
    updated = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


# 全局引擎和会话工厂
_engine = None
_SessionLocal = None


def init_db():
    """初始化数据库连接和表"""
    global _engine, _SessionLocal
    
    db_url = settings.database_url
    
    if db_url.startswith("sqlite"):
        # SQLite 模式（本地开发，无需 PostgreSQL）
        import os
        # 确保目录存在
        db_path = db_url.replace("sqlite:///", "")
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        
        _engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False}
        )
    else:
        # PostgreSQL 模式（生产环境）
        if db_url.startswith("postgresql://"):
            db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        
        _engine = create_engine(
            db_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
        )
    
    # 创建表
    Base.metadata.create_all(bind=_engine)
    
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    print(f"✅ 数据库已连接: {db_url.split('://')[0]}://***")
    return _engine


def get_db() -> Generator[Session, None, None]:
    """获取数据库会话 - 用于依赖注入"""
    if _SessionLocal is None:
        init_db()
    
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def db_session() -> Generator[Session, None, None]:
    """数据库会话上下文管理器"""
    if _SessionLocal is None:
        init_db()
    
    db = _SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
