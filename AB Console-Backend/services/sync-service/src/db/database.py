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


# ========== 配置管理模型 ==========

class SettingModel(Base):
    """通用配置表"""
    __tablename__ = "settings"
    __table_args__ = {"schema": "config"}
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(50), nullable=False, index=True)
    key = Column(String(100), nullable=False)
    value = Column(JSON, nullable=False)
    description = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        # 确保 category + key 唯一
        {"schema": "config", "comment": "通用配置表"}
    )


class SignalRuleModel(Base):
    """信号规则配置表"""
    __tablename__ = "signal_rules"
    __table_args__ = {"schema": "config"}
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(String(100), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False, index=True)
    description = Column(Text)
    conditions = Column(JSON, nullable=False)
    parameters = Column(JSON, default=dict)
    is_enabled = Column(Boolean, default=True, index=True)
    priority = Column(Integer, default=0)
    cooldown_seconds = Column(Integer, default=300)
    min_strength = Column(Numeric(3, 2), default=0.5)
    timeframes = Column(JSON, default=list)  # ["5m", "15m", "1h"]
    symbols = Column(JSON, default=list)  # 空表示全部
    exclude_symbols = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100))
    updated_by = Column(String(100))


class MonitoringConfigModel(Base):
    """监控配置表"""
    __tablename__ = "monitoring"
    __table_args__ = {"schema": "config"}
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)
    type = Column(String(50), nullable=False, index=True)  # indicator, pattern, signal
    name = Column(String(100), nullable=False)
    config = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True, index=True)
    alert_enabled = Column(Boolean, default=False)
    alert_threshold = Column(Numeric(10, 4))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    
    # 创建config schema（如果不存在）
    from sqlalchemy import text
    with _engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS config"))
        conn.commit()
    
    # 创建表
    Base.metadata.create_all(bind=_engine)
    
    # 插入默认配置
    _init_default_settings()
    
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    print(f"✅ 数据库已连接: {db_url.split('://')[0]}://***")
    return _engine


def _init_default_settings():
    """初始化默认配置"""
    try:
        with db_session() as db:
            # 检查是否已有配置
            existing = db.query(SettingModel).first()
            if existing:
                return
            
            # 插入默认配置
            defaults = [
                SettingModel(
                    category="system",
                    key="default_symbols",
                    value={"groups": ["main4"], "custom": []},
                    description="默认监控的币种分组"
                ),
                SettingModel(
                    category="system",
                    key="default_timeframes",
                    value=["5m", "15m", "1h", "4h"],
                    description="默认监控的时间周期"
                ),
                SettingModel(
                    category="system",
                    key="signal_cooldown",
                    value={"default": 300},
                    description="信号冷却时间（秒）"
                ),
                SettingModel(
                    category="system",
                    key="data_refresh_interval",
                    value={"default": 60},
                    description="数据刷新间隔（秒）"
                ),
            ]
            
            for setting in defaults:
                db.add(setting)
            
            db.commit()
            print("✅ 默认配置已初始化")
    except Exception as e:
        print(f"⚠️ 默认配置初始化失败: {e}")


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
