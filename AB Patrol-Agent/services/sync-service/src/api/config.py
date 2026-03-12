"""
配置管理API
提供统一的配置存储和信号规则管理
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, func
from sqlalchemy.orm import Session

try:
    from ..db.database import MonitoringConfigModel, SettingModel, SignalRuleModel, get_db
    from ..models.config import (
        BatchUpdateRequest,
        ConfigCategory,
        ConfigSyncResponse,
        MonitoringConfig,
        MonitoringConfigCreate,
        MonitoringConfigUpdate,
        Setting,
        SettingCreate,
        SettingUpdate,
        SignalRule,
        SignalRuleCategory,
        SignalRuleCreate,
        SignalRuleUpdate,
    )
except ImportError:
    from db.database import MonitoringConfigModel, SettingModel, SignalRuleModel, get_db
    from models.config import (
        BatchUpdateRequest,
        ConfigCategory,
        ConfigSyncResponse,
        MonitoringConfig,
        MonitoringConfigCreate,
        MonitoringConfigUpdate,
        Setting,
        SettingCreate,
        SettingUpdate,
        SignalRule,
        SignalRuleCategory,
        SignalRuleCreate,
        SignalRuleUpdate,
    )

router = APIRouter(prefix="/config", tags=["config"])


# ========== 通用配置接口 ==========

@router.get("/settings", response_model=List[Setting])
async def get_settings(
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取配置列表"""
    query = db.query(SettingModel)
    if category:
        query = query.filter(SettingModel.category == category)
    
    settings = query.all()
    return settings


@router.get("/settings/{category}/{key}", response_model=Setting)
async def get_setting(
    category: str,
    key: str,
    db: Session = Depends(get_db)
):
    """获取单个配置"""
    setting = db.query(SettingModel).filter(
        SettingModel.category == category,
        SettingModel.key == key
    ).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    return setting


@router.post("/settings", response_model=Setting)
async def create_setting(
    setting: SettingCreate,
    db: Session = Depends(get_db)
):
    """创建配置"""
    # 检查是否已存在
    existing = db.query(SettingModel).filter(
        SettingModel.category == setting.category,
        SettingModel.key == setting.key
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="配置已存在")
    
    db_setting = SettingModel(**setting.dict())
    db.add(db_setting)
    db.commit()
    db.refresh(db_setting)
    
    return db_setting


@router.put("/settings/{category}/{key}", response_model=Setting)
async def update_setting(
    category: str,
    key: str,
    setting_update: SettingUpdate,
    db: Session = Depends(get_db)
):
    """更新配置"""
    setting = db.query(SettingModel).filter(
        SettingModel.category == category,
        SettingModel.key == key
    ).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    if setting_update.value is not None:
        setting.value = setting_update.value
    if setting_update.description is not None:
        setting.description = setting_update.description
    
    setting.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(setting)
    
    return setting


@router.delete("/settings/{category}/{key}")
async def delete_setting(
    category: str,
    key: str,
    db: Session = Depends(get_db)
):
    """删除配置"""
    setting = db.query(SettingModel).filter(
        SettingModel.category == category,
        SettingModel.key == key
    ).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    db.delete(setting)
    db.commit()
    
    return {"message": "配置已删除"}


@router.post("/settings/batch", response_model=Dict[str, int])
async def batch_update_settings(
    request: BatchUpdateRequest,
    db: Session = Depends(get_db)
):
    """批量更新配置"""
    updated_count = 0
    created_count = 0
    
    for category, settings in request.settings.items():
        for key, value in settings.items():
            setting = db.query(SettingModel).filter(
                SettingModel.category == category,
                SettingModel.key == key
            ).first()
            
            if setting:
                setting.value = value
                setting.updated_at = datetime.utcnow()
                updated_count += 1
            else:
                db_setting = SettingModel(
                    category=category,
                    key=key,
                    value=value,
                    description=""
                )
                db.add(db_setting)
                created_count += 1
    
    db.commit()
    
    return {
        "updated": updated_count,
        "created": created_count
    }


@router.get("/categories", response_model=List[ConfigCategory])
async def get_categories(db: Session = Depends(get_db)):
    """获取配置分类统计"""
    results = db.query(
        SettingModel.category,
        func.count(SettingModel.id).label("count")
    ).group_by(SettingModel.category).all()
    
    categories = []
    for category, count in results:
        description = {
            "system": "系统级配置",
            "user": "用户偏好配置",
            "signal": "信号检测配置",
            "strategy": "策略相关配置"
        }.get(category, f"{category} 配置")
        
        categories.append(ConfigCategory(
            name=category,
            description=description,
            count=count
        ))
    
    return categories


# ========== 信号规则接口 ==========

@router.get("/signal-rules", response_model=List[SignalRule])
async def get_signal_rules(
    category: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    timeframe: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取信号规则列表"""
    query = db.query(SignalRuleModel)
    
    if category:
        query = query.filter(SignalRuleModel.category == category)
    if is_enabled is not None:
        query = query.filter(SignalRuleModel.is_enabled == is_enabled)
    if timeframe:
        query = query.filter(SignalRuleModel.timeframes.contains([timeframe]))
    
    rules = query.order_by(SignalRuleModel.priority.desc()).all()
    return rules


@router.get("/signal-rules/{rule_id}", response_model=SignalRule)
async def get_signal_rule(
    rule_id: str,
    db: Session = Depends(get_db)
):
    """获取单个信号规则"""
    rule = db.query(SignalRuleModel).filter(
        SignalRuleModel.rule_id == rule_id
    ).first()
    
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    return rule


@router.post("/signal-rules", response_model=SignalRule)
async def create_signal_rule(
    rule: SignalRuleCreate,
    db: Session = Depends(get_db),
    user_id: Optional[str] = "admin"
):
    """创建信号规则"""
    # 检查rule_id是否已存在
    existing = db.query(SignalRuleModel).filter(
        SignalRuleModel.rule_id == rule.rule_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="规则ID已存在")
    
    db_rule = SignalRuleModel(**rule.dict(), created_by=user_id, updated_by=user_id)
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    
    return db_rule


@router.put("/signal-rules/{rule_id}", response_model=SignalRule)
async def update_signal_rule(
    rule_id: str,
    rule_update: SignalRuleUpdate,
    db: Session = Depends(get_db),
    user_id: Optional[str] = "admin"
):
    """更新信号规则"""
    rule = db.query(SignalRuleModel).filter(
        SignalRuleModel.rule_id == rule_id
    ).first()
    
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    update_data = rule_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    
    rule.updated_at = datetime.utcnow()
    rule.updated_by = user_id
    
    db.commit()
    db.refresh(rule)
    
    return rule


@router.delete("/signal-rules/{rule_id}")
async def delete_signal_rule(
    rule_id: str,
    db: Session = Depends(get_db)
):
    """删除信号规则"""
    rule = db.query(SignalRuleModel).filter(
        SignalRuleModel.rule_id == rule_id
    ).first()
    
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    db.delete(rule)
    db.commit()
    
    return {"message": "规则已删除"}


@router.get("/signal-rules/categories", response_model=List[SignalRuleCategory])
async def get_signal_rule_categories(db: Session = Depends(get_db)):
    """获取信号规则分类统计"""
    results = db.query(
        SignalRuleModel.category,
        func.count(SignalRuleModel.id).label("count"),
        func.sum(func.cast(SignalRuleModel.is_enabled, Integer)).label("enabled_count")
    ).group_by(SignalRuleModel.category).all()
    
    categories = []
    for category, count, enabled in results:
        categories.append(SignalRuleCategory(
            category=category,
            count=count,
            enabled_count=enabled or 0
        ))
    
    return categories


@router.post("/signal-rules/{rule_id}/toggle")
async def toggle_signal_rule(
    rule_id: str,
    db: Session = Depends(get_db)
):
    """切换信号规则启用状态"""
    rule = db.query(SignalRuleModel).filter(
        SignalRuleModel.rule_id == rule_id
    ).first()
    
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    rule.is_enabled = not rule.is_enabled
    rule.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "rule_id": rule_id,
        "is_enabled": rule.is_enabled
    }


# ========== 监控配置接口 ==========

@router.get("/monitoring/{user_id}", response_model=List[MonitoringConfig])
async def get_monitoring_configs(
    user_id: str,
    type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """获取用户的监控配置"""
    query = db.query(MonitoringConfigModel).filter(
        MonitoringConfigModel.user_id == user_id
    )
    
    if type:
        query = query.filter(MonitoringConfigModel.type == type)
    if is_active is not None:
        query = query.filter(MonitoringConfigModel.is_active == is_active)
    
    configs = query.all()
    return configs


@router.post("/monitoring", response_model=MonitoringConfig)
async def create_monitoring_config(
    config: MonitoringConfigCreate,
    db: Session = Depends(get_db)
):
    """创建监控配置"""
    # 检查是否已存在
    existing = db.query(MonitoringConfigModel).filter(
        MonitoringConfigModel.user_id == config.user_id,
        MonitoringConfigModel.type == config.type,
        MonitoringConfigModel.name == config.name
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="监控配置已存在")
    
    db_config = MonitoringConfigModel(**config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    
    return db_config


@router.put("/monitoring/{config_id}", response_model=MonitoringConfig)
async def update_monitoring_config(
    config_id: int,
    config_update: MonitoringConfigUpdate,
    db: Session = Depends(get_db)
):
    """更新监控配置"""
    config = db.query(MonitoringConfigModel).filter(
        MonitoringConfigModel.id == config_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    update_data = config_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)
    
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    
    return config


@router.delete("/monitoring/{config_id}")
async def delete_monitoring_config(
    config_id: int,
    db: Session = Depends(get_db)
):
    """删除监控配置"""
    config = db.query(MonitoringConfigModel).filter(
        MonitoringConfigModel.id == config_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    db.delete(config)
    db.commit()
    
    return {"message": "配置已删除"}


# ========== 同步接口 ==========

@router.get("/sync/{user_id}", response_model=ConfigSyncResponse)
async def get_config_sync(
    user_id: str,
    db: Session = Depends(get_db)
):
    """获取配置同步信息"""
    # 统计各类配置数量
    setting_count = db.query(SettingModel).count()
    rule_count = db.query(SignalRuleModel).filter(
        SignalRuleModel.is_enabled == True
    ).count()
    monitoring_count = db.query(MonitoringConfigModel).filter(
        MonitoringConfigModel.user_id == user_id,
        MonitoringConfigModel.is_active == True
    ).count()
    
    # 获取所有分类
    categories = db.query(SettingModel.category).distinct().all()
    category_list = [c[0] for c in categories]
    
    return ConfigSyncResponse(
        synced_at=datetime.utcnow(),
        categories=category_list,
        rule_count=rule_count,
        monitoring_count=monitoring_count
    )


@router.post("/sync/{user_id}")
async def sync_config(
    user_id: str,
    settings: Dict[str, Dict[str, Any]],
    db: Session = Depends(get_db)
):
    """同步配置（从插件到后端）"""
    # 复用批量更新逻辑
    result = await batch_update_settings(
        BatchUpdateRequest(settings=settings),
        db
    )
    
    return {
        "user_id": user_id,
        "synced_at": datetime.utcnow().isoformat(),
        **result
    }
