"""Strategy Data Models"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class StrategyCard(BaseModel):
    """策略卡片模型 - 对应 Obsidian 策略笔记"""
    
    # 基本信息
    id: Optional[str] = Field(None, description="唯一ID")
    name: str = Field(..., description="策略名称")
    canonical_name: Optional[str] = Field(None, description="规范名称")
    
    # 分类
    category: Optional[str] = Field(None, description="分类")
    setup_type: Optional[str] = Field(None, description="Setup 类型")
    
    # 路径
    path: str = Field(..., description="Obsidian 文件路径")
    
    # 内容
    description: Optional[str] = Field(None, description="描述")
    rules: List[str] = Field(default_factory=list, description="规则")
    examples: List[str] = Field(default_factory=list, description="示例")
    
    # 统计
    trade_count: int = Field(0, description="交易次数")
    win_count: int = Field(0, description="盈利次数")
    
    # SRS 学习
    srs_enabled: bool = Field(False, description="是否启用 SRS")
    srs_due_date: Optional[datetime] = Field(None, description="下次复习日期")
    srs_interval: Optional[int] = Field(None, description="复习间隔(天)")
    
    # 元数据
    tags: List[str] = Field(default_factory=list, description="标签")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    synced_at: Optional[datetime] = Field(None, description="同步时间")
    
    # 原始数据
    raw_frontmatter: Optional[Dict[str, Any]] = Field(None, description="原始 frontmatter")


class StrategySyncRequest(BaseModel):
    """策略同步请求"""
    strategies: List[StrategyCard]
    force_update: bool = Field(False, description="强制更新")


class StrategySyncResponse(BaseModel):
    """策略同步响应"""
    success: bool
    message: str
    total: int
    created: int
    updated: int
    errors: int


class StrategyPerformance(BaseModel):
    """策略表现"""
    strategy_name: str
    trade_count: int
    win_count: int
    loss_count: int
    win_rate: float
    total_pnl_r: float
    avg_pnl_r: float
    total_pnl_money: float
