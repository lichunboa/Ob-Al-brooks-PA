-- 配置管理数据库Schema
-- 统一存储系统和用户配置

-- 配置表
CREATE TABLE IF NOT EXISTS config.settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,          -- 配置分类：system, user, signal, strategy
    key VARCHAR(100) NOT NULL,              -- 配置键
    value JSONB NOT NULL,                   -- 配置值（JSON格式）
    description TEXT,                       -- 配置说明
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
    changed_by VARCHAR(100),                -- 变更者（用户ID或系统）
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 信号规则配置表
CREATE TABLE IF NOT EXISTS config.signal_rules (
    id SERIAL PRIMARY KEY,
    rule_id VARCHAR(100) NOT NULL UNIQUE,   -- 规则标识符
    name VARCHAR(200) NOT NULL,             -- 规则名称
    category VARCHAR(50) NOT NULL,          -- 分类：momentum, pattern, trend, volatility, volume, futures
    description TEXT,                       -- 规则描述
    conditions JSONB NOT NULL,              -- 规则条件（JSON格式）
    parameters JSONB DEFAULT '{}',          -- 可配置参数
    is_enabled BOOLEAN DEFAULT true,        -- 是否启用
    priority INTEGER DEFAULT 0,             -- 优先级（数字越大越优先）
    cooldown_seconds INTEGER DEFAULT 300,   -- 冷却时间
    min_strength FLOAT DEFAULT 0.5,         -- 最小信号强度
    timeframes VARCHAR(20)[] DEFAULT ARRAY['5m', '15m', '1h'],  -- 适用周期
    symbols VARCHAR(50)[],                  -- 适用交易对（空表示全部）
    exclude_symbols VARCHAR(50)[],          -- 排除的交易对
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),                -- 创建者
    updated_by VARCHAR(100)                 -- 更新者
);

-- 监控配置表（用于指定监控哪些指标、形态等）
CREATE TABLE IF NOT EXISTS config.monitoring (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,          -- 用户ID
    type VARCHAR(50) NOT NULL,              -- 类型：indicator, pattern, signal
    name VARCHAR(100) NOT NULL,             -- 名称
    config JSONB DEFAULT '{}',              -- 配置详情
    is_active BOOLEAN DEFAULT true,         -- 是否激活
    alert_enabled BOOLEAN DEFAULT false,    -- 是否启用告警
    alert_threshold FLOAT,                  -- 告警阈值
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

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION config.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_settings_updated_at ON config.settings;
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON config.settings
    FOR EACH ROW
    EXECUTE FUNCTION config.update_updated_at_column();

DROP TRIGGER IF EXISTS update_signal_rules_updated_at ON config.signal_rules;
CREATE TRIGGER update_signal_rules_updated_at
    BEFORE UPDATE ON config.signal_rules
    FOR EACH ROW
    EXECUTE FUNCTION config.update_updated_at_column();

DROP TRIGGER IF EXISTS update_monitoring_updated_at ON config.monitoring;
CREATE TRIGGER update_monitoring_updated_at
    BEFORE UPDATE ON config.monitoring
    FOR EACH ROW
    EXECUTE FUNCTION config.update_updated_at_column();

-- 配置变更历史触发器
CREATE OR REPLACE FUNCTION config.log_settings_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO config.settings_history (setting_id, old_value, new_value, changed_at)
    VALUES (OLD.id, OLD.value, NEW.value, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS log_settings_change ON config.settings;
CREATE TRIGGER log_settings_change
    AFTER UPDATE ON config.settings
    FOR EACH ROW
    WHEN (OLD.value IS DISTINCT FROM NEW.value)
    EXECUTE FUNCTION config.log_settings_change();

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
