#!/usr/bin/env python3
"""
初始化配置数据库
创建 config schema 和表
"""
import os
import sys
from pathlib import Path

# 添加 libs 到路径
LIBS_DIR = Path(__file__).parent.parent / "libs"
if str(LIBS_DIR) not in sys.path:
    sys.path.insert(0, str(LIBS_DIR))

import psycopg

# 数据库连接信息
DB_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5434/market_data'
)

# SQL 语句
INIT_SQL = """
-- 创建 config schema
CREATE SCHEMA IF NOT EXISTS config;

-- 配置表
CREATE TABLE IF NOT EXISTS config.settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, key)
);

-- 配置变更历史表
CREATE TABLE IF NOT EXISTS config.settings_history (
    id SERIAL PRIMARY KEY,
    setting_id INTEGER REFERENCES config.settings(id) ON DELETE CASCADE,
    old_value JSONB,
    new_value JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 信号规则配置表
CREATE TABLE IF NOT EXISTS config.signal_rules (
    id SERIAL PRIMARY KEY,
    rule_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL,
    parameters JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    cooldown_seconds INTEGER DEFAULT 300,
    min_strength NUMERIC(3, 2) DEFAULT 0.5,
    timeframes VARCHAR(20)[] DEFAULT ARRAY['5m', '15m', '1h'],
    symbols VARCHAR(50)[],
    exclude_symbols VARCHAR(50)[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

-- 监控配置表
CREATE TABLE IF NOT EXISTS config.monitoring (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    alert_enabled BOOLEAN DEFAULT false,
    alert_threshold NUMERIC(10, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, type, name)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_settings_category ON config.settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_key ON config.settings(key);
CREATE INDEX IF NOT EXISTS idx_signal_rules_category ON config.signal_rules(category);
CREATE INDEX IF NOT EXISTS idx_signal_rules_enabled ON config.signal_rules(is_enabled);
CREATE INDEX IF NOT EXISTS idx_monitoring_user ON config.monitoring(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_type ON config.monitoring(type);

-- 插入默认配置
INSERT INTO config.settings (category, key, value, description)
VALUES 
    ('system', 'default_symbols', '{"groups": ["main4"], "custom": []}'::jsonb, '默认监控的币种分组'),
    ('system', 'default_timeframes', '["5m", "15m", "1h", "4h"]'::jsonb, '默认监控的时间周期'),
    ('system', 'signal_cooldown', '{"default": 300}'::jsonb, '信号冷却时间（秒）'),
    ('system', 'data_refresh_interval', '{"default": 60}'::jsonb, '数据刷新间隔（秒）'),
    ('user', 'ui_preferences', '{"theme": "dark", "language": "zh-CN"}'::jsonb, '用户界面偏好')
ON CONFLICT (category, key) DO NOTHING;

-- 插入示例信号规则
INSERT INTO config.signal_rules (rule_id, name, category, description, conditions, parameters, priority)
VALUES 
    ('momentum.rsi_oversold', 'RSI超卖', 'momentum', 'RSI低于30时产生买入信号', 
     '{"indicator": "RSI", "period": 14, "condition": "<", "threshold": 30}'::jsonb,
     '{"rsi_period": 14, "oversold_level": 30}'::jsonb, 100),
     
    ('pattern.ema_cross', 'EMA金叉', 'pattern', '短期EMA上穿长期EMA', 
     '{"fast_ema": 12, "slow_ema": 26, "condition": "cross_up"}'::jsonb,
     '{"fast_period": 12, "slow_period": 26}'::jsonb, 90),
     
    ('trend.macd_bullish', 'MACD多头', 'trend', 'MACD柱状图由负转正', 
     '{"indicator": "MACD", "condition": "histogram_turn_positive"}'::jsonb,
     '{"fast": 12, "slow": 26, "signal": 9}'::jsonb, 80),
     
    ('volatility.bollinger_break', '布林带突破', 'volatility', '价格突破布林带上轨或下轨', 
     '{"indicator": "Bollinger", "period": 20, "std_dev": 2, "condition": "break_out"}'::jsonb,
     '{"period": 20, "std_dev": 2}'::jsonb, 70)
ON CONFLICT (rule_id) DO NOTHING;
"""

def init_database():
    """初始化数据库"""
    print(f"Connecting to database...")
    
    try:
        conn = psycopg.connect(DB_URL)
        cursor = conn.cursor()
        
        print("Creating config schema and tables...")
        cursor.execute(INIT_SQL)
        conn.commit()
        
        # 验证创建结果
        cursor.execute("SELECT COUNT(*) FROM config.settings")
        settings_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM config.signal_rules")
        rules_count = cursor.fetchone()[0]
        
        print(f"✅ Database initialized successfully!")
        print(f"   - Settings: {settings_count}")
        print(f"   - Signal Rules: {rules_count}")
        
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)
