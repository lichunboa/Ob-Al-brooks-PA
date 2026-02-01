"""
配置模型
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class SettingBase(BaseModel):
    """配置基础模型"""
    category: str = Field(..., description="配置分类")
    key: str = Field(..., description="配置键")
    value: Dict[str, Any] = Field(..., description="配置值")
    description: Optional[str] = Field(None, description="配置说明")


class SettingCreate(SettingBase):
    """创建配置"""
    pass


class SettingUpdate(BaseModel):
    """更新配置"""
    value: Optional[Dict[str, Any]] = None
    description: Optional[str] = None


class Setting(SettingBase):
    """配置完整模型"""
    id: int
    updated_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class SignalRuleBase(BaseModel):
    """信号规则基础模型"""
    rule_id: str = Field(..., description="规则标识符")
    name: str = Field(..., description="规则名称")
    category: str = Field(..., description="分类")
    description: Optional[str] = None
    conditions: Dict[str, Any] = Field(..., description="规则条件")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="可配置参数")
    is_enabled: bool = Field(default=True, description="是否启用")
    priority: int = Field(default=0, description="优先级")
    cooldown_seconds: int = Field(default=300, description="冷却时间")
    min_strength: float = Field(default=0.5, description="最小信号强度")
    timeframes: List[str] = Field(default_factory=lambda: ["5m", "15m", "1h"])
    symbols: Optional[List[str]] = None
    exclude_symbols: Optional[List[str]] = None


class SignalRuleCreate(SignalRuleBase):
    """创建信号规则"""
    pass


class SignalRuleUpdate(BaseModel):
    """更新信号规则"""
    name: Optional[str] = None
    description: Optional[str] = None
    conditions: Optional[Dict[str, Any]] = None
    parameters: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None
    priority: Optional[int] = None
    cooldown_seconds: Optional[int] = None
    min_strength: Optional[float] = None
    timeframes: Optional[List[str]] = None
    symbols: Optional[List[str]] = None
    exclude_symbols: Optional[List[str]] = None


class SignalRule(SignalRuleBase):
    """信号规则完整模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True


class MonitoringConfigBase(BaseModel):
    """监控配置基础模型"""
    user_id: str = Field(..., description="用户ID")
    type: str = Field(..., description="类型：indicator, pattern, signal")
    name: str = Field(..., description="名称")
    config: Dict[str, Any] = Field(default_factory=dict, description="配置详情")
    is_active: bool = Field(default=True, description="是否激活")
    alert_enabled: bool = Field(default=False, description="是否启用告警")
    alert_threshold: Optional[float] = None


class MonitoringConfigCreate(MonitoringConfigBase):
    """创建监控配置"""
    pass


class MonitoringConfigUpdate(BaseModel):
    """更新监控配置"""
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    alert_enabled: Optional[bool] = None
    alert_threshold: Optional[float] = None


class MonitoringConfig(MonitoringConfigBase):
    """监控配置完整模型"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConfigCategory(BaseModel):
    """配置分类信息"""
    name: str
    description: str
    count: int


class SignalRuleCategory(BaseModel):
    """信号规则分类统计"""
    category: str
    count: int
    enabled_count: int


class BatchUpdateRequest(BaseModel):
    """批量更新请求"""
    settings: Dict[str, Dict[str, Any]]  # category -> {key: value}


class ConfigSyncResponse(BaseModel):
    """配置同步响应"""
    synced_at: datetime
    categories: List[str]
    rule_count: int
    monitoring_count: int
