# TradeCat 升级分析报告

> 生成日期：2026-02-07
> 对比版本：TradeCat (main) vs AL-Brooks Console (V2.4)

---

## 1. 项目定位对比

| 维度 | TradeCat | AL-Brooks Console |
|------|----------|-------------------|
| **定位** | 全市场量化数据平台 | Al Brooks PA 交易系统 |
| **市场** | 加密货币 + A股 + 美股 + 宏观 | 仅加密货币 |
| **方法论** | 量化指标 + Wyckoff | Al Brooks PA + 量化 + Wyckoff |
| **交互** | Telegram Bot | Discord + Obsidian |
| **数据规模** | 4.6亿+ 条记录 | 较小（按需采集） |

**结论**：TradeCat 是通用量化平台，AL-Brooks 是专注 PA 的交易系统。两者定位不同，但技术架构可借鉴。

---

## 2. 服务架构对比

### 2.1 服务清单

| 服务 | TradeCat | AL-Brooks | 差异分析 |
|------|----------|-----------|----------|
| **数据采集** | data-service | data-service | 功能相似 |
| **指标计算** | trading-service (38个指标) | trading-service | TradeCat 指标更丰富 |
| **信号检测** | signal-service (129条规则) | signal-service (PA Engine) | TradeCat 规则更多 |
| **AI 分析** | ai-service (多模型) | ai-service | TradeCat 多模型支持更好 |
| **Bot 交互** | telegram-service | telegram-service + OpenClaw | AL-Brooks 有 Discord 集成 |
| **数据同步** | - | sync-service | AL-Brooks 独有 |
| **交易追踪** | - | tracker-service | AL-Brooks 独有 |
| **可视化** | vis-service (预览) | vis-service (预览) | 功能相似 |
| **API 网关** | - | api-service | AL-Brooks 独有 |
| **Web 前端** | - | web-dashboard | AL-Brooks 独有 |

### 2.2 架构图对比

**TradeCat 架构**：
```
┌─────────────────────────────────────────────────────────┐
│                    Telegram Bot                          │
└─────────────────────────────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌─────────┐         ┌─────────────┐        ┌──────────┐
│ signal  │         │   trading   │        │    ai    │
│ service │◄────────│   service   │────────│  service │
│ (129条) │         │  (38指标)   │        │ (多模型) │
└─────────┘         └─────────────┘        └──────────┘
    │                      │
    └──────────┬───────────┘
               ▼
        ┌─────────────┐
        │    data     │
        │   service   │
        └─────────────┘
               │
               ▼
        ┌─────────────┐
        │ TimescaleDB │
        │  (4.6亿条)  │
        └─────────────┘
```

**AL-Brooks 架构**：
```
┌─────────────────────────────────────────────────────────┐
│              Discord (OpenClaw) + Obsidian               │
└─────────────────────────────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌─────────┐         ┌─────────────┐        ┌──────────┐
│ signal  │         │   trading   │        │ tracker  │
│ service │◄────────│   service   │        │ service  │
│(PA引擎) │         │   (指标)    │        │ (追踪)   │
└─────────┘         └─────────────┘        └──────────┘
    │                      │                      │
    └──────────┬───────────┴──────────────────────┘
               ▼
        ┌─────────────┐     ┌─────────────┐
        │    data     │     │    sync     │
        │   service   │     │   service   │
        └─────────────┘     └─────────────┘
               │                   │
               ▼                   ▼
        ┌─────────────┐     ┌─────────────┐
        │ TimescaleDB │     │  Obsidian   │
        └─────────────┘     └─────────────┘
```

---

## 3. 核心功能对比

### 3.1 信号检测系统

| 特性 | TradeCat | AL-Brooks | 建议 |
|------|----------|-----------|------|
| **规则数量** | 129 条 | ~20 条 (PA) | 可扩展 |
| **规则分类** | 8 大类 | 3 类 (趋势/区间/反转) | 可借鉴分类 |
| **冷却机制** | 规则级 + 全局 | 1分钟去重 | **需升级** |
| **数据新鲜度检查** | SIGNAL_DATA_MAX_AGE | 无 | **需添加** |
| **事件驱动** | SignalPublisher | Webhook | 功能相似 |

**TradeCat 信号规则分类**：
1. 趋势信号 (Trend)
2. 动量信号 (Momentum)
3. 波动信号 (Volatility)
4. 成交量信号 (Volume)
5. 形态信号 (Pattern)
6. 期货信号 (Futures)
7. 多周期信号 (Multi-timeframe)
8. 复合信号 (Composite)

### 3.2 AI 分析系统

| 特性 | TradeCat | AL-Brooks | 建议 |
|------|----------|-----------|------|
| **模型支持** | Gemini/OpenAI/Claude/DeepSeek | Moonshot (单一) | **需升级** |
| **自动切换** | 大 payload 自动切换模型 | 无 | **需添加** |
| **分析方法** | Wyckoff | PA + Wyckoff + 量化 | AL-Brooks 更丰富 |
| **Prompt 管理** | 内置角色 | 外部文件 | 各有优势 |

### 3.3 技术指标系统

| 类别 | TradeCat | AL-Brooks | 差距 |
|------|----------|-----------|------|
| **趋势指标** | 8 个 | 3-4 个 | 可扩展 |
| **动量指标** | 6 个 | 2-3 个 | 可扩展 |
| **波动指标** | 4 个 | 2 个 | 可扩展 |
| **成交量指标** | 6 个 | 1-2 个 | **需补充** |
| **期货指标** | 8 个 | 0 | **需添加** |
| **K线形态** | 61 种 (TA-Lib) | 基础形态 | 可扩展 |

---

## 4. 升级建议

### 4.1 高优先级 (P0) - 立即可做

#### 4.1.1 多模型 AI 支持
**现状**：仅支持 Moonshot
**目标**：支持 Gemini/OpenAI/Claude/DeepSeek

**实现方案**：
```python
# ai-service/src/llm_router.py
class LLMRouter:
    MODELS = {
        'moonshot': {'max_tokens': 32000, 'cost': 'low'},
        'deepseek': {'max_tokens': 64000, 'cost': 'low'},
        'gpt-4o': {'max_tokens': 128000, 'cost': 'high'},
        'claude-3': {'max_tokens': 200000, 'cost': 'high'},
    }

    def select_model(self, payload_size: int) -> str:
        """根据 payload 大小自动选择模型"""
        if payload_size < 8000:
            return 'moonshot'  # 便宜
        elif payload_size < 32000:
            return 'deepseek'  # 中等
        else:
            return 'claude-3'  # 大 context
```

**工作量**：2-3 小时

#### 4.1.2 信号冷却机制增强
**现状**：仅 1 分钟去重
**目标**：规则级 + 品种级 + 全局冷却

**实现方案**：
```python
# signal-service/src/cooldown.py
class CooldownManager:
    def __init__(self):
        self.rule_cooldowns = {}      # 规则级冷却
        self.symbol_cooldowns = {}    # 品种级冷却
        self.global_cooldown = None   # 全局冷却

    def should_filter(self, signal) -> tuple[bool, str]:
        """检查是否应该过滤信号"""
        # 1. 检查全局冷却（连续亏损后触发）
        if self.global_cooldown and time.time() < self.global_cooldown:
            return True, "全局冷却中"

        # 2. 检查品种冷却
        symbol = signal['symbol']
        if symbol in self.symbol_cooldowns:
            if time.time() < self.symbol_cooldowns[symbol]:
                return True, f"{symbol} 冷却中"

        # 3. 检查规则冷却
        rule = signal.get('rule_id')
        if rule in self.rule_cooldowns:
            if time.time() < self.rule_cooldowns[rule]:
                return True, f"规则 {rule} 冷却中"

        return False, ""
```

**工作量**：1-2 小时

#### 4.1.3 数据新鲜度检查
**现状**：无检查
**目标**：过滤过期数据的信号

**实现方案**：
```python
# signal-service/src/freshness.py
SIGNAL_DATA_MAX_AGE = {
    '1m': 120,    # 2 分钟
    '5m': 600,    # 10 分钟
    '15m': 1800,  # 30 分钟
    '1h': 7200,   # 2 小时
    '4h': 28800,  # 8 小时
}

def is_data_fresh(signal) -> bool:
    """检查信号数据是否新鲜"""
    timeframe = signal.get('timeframe', '15m')
    max_age = SIGNAL_DATA_MAX_AGE.get(timeframe, 1800)
    data_time = signal.get('data_timestamp', 0)
    return (time.time() - data_time) < max_age
```

**工作量**：30 分钟

### 4.2 中优先级 (P1) - 本周可做

#### 4.2.1 期货指标集成
**现状**：无期货数据
**目标**：添加持仓量、多空比、资金费率等

**TradeCat 期货指标**：
1. `open_interest` - 持仓量
2. `long_short_ratio` - 多空比
3. `funding_rate` - 资金费率
4. `liquidation` - 爆仓数据
5. `top_trader_ratio` - 大户持仓比
6. `taker_buy_sell_ratio` - 主动买卖比
7. `basis` - 期现价差
8. `oi_weighted_funding` - OI 加权资金费率

**实现方案**：
```python
# data-service/src/futures_collector.py
class FuturesCollector:
    async def collect_futures_data(self, symbol: str):
        """采集期货数据"""
        tasks = [
            self.get_open_interest(symbol),
            self.get_funding_rate(symbol),
            self.get_long_short_ratio(symbol),
            self.get_top_trader_ratio(symbol),
        ]
        return await asyncio.gather(*tasks)
```

**工作量**：4-6 小时

#### 4.2.2 成交量指标补充
**现状**：基础成交量
**目标**：OBV、CVD、VWAP、VPVR

**工作量**：3-4 小时

### 4.3 低优先级 (P2) - 后续迭代

#### 4.3.1 多市场支持
- A股数据 (AKShare)
- 美股数据 (yfinance)
- 宏观数据 (FRED)

**评估**：当前专注加密货币，暂不需要

#### 4.3.2 信号规则扩展
- 从 20 条扩展到 50+ 条
- 添加复合信号规则

**评估**：根据交易表现逐步添加

---

## 5. 升级路线图

### Phase 1: 基础增强 (本周)
- [x] 信号去重 (1分钟窗口) - 已完成
- [ ] 多模型 AI 支持
- [ ] 冷却机制增强
- [ ] 数据新鲜度检查

### Phase 2: 数据丰富 (下周)
- [ ] 期货指标集成
- [ ] 成交量指标补充
- [ ] 信号规则扩展 (10条)

### Phase 3: 智能进化 (2周后)
- [ ] AI 进化反馈闭环
- [ ] 自动权重调整
- [ ] 策略表现分析

---

## 6. 技术债务清理

### 6.1 当前技术债务

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 单一 LLM 模型 | 大 payload 失败 | P0 |
| 无数据新鲜度检查 | 过期信号 | P0 |
| 冷却机制简单 | 重复信号 | P1 |
| 期货数据缺失 | 分析不全面 | P1 |
| 指标数量少 | 信号覆盖不足 | P2 |

### 6.2 代码质量

| 服务 | 测试覆盖 | 文档 | 建议 |
|------|----------|------|------|
| signal-service | 低 | 中 | 添加单元测试 |
| trading-service | 低 | 低 | 添加指标文档 |
| tracker-service | 无 | 低 | 新服务，需补充 |

---

## 7. 总结

### 7.1 TradeCat 值得借鉴的特性

1. **多模型 AI 支持** - 根据 payload 自动切换
2. **完善的冷却机制** - 规则级 + 全局
3. **数据新鲜度检查** - 防止过期信号
4. **丰富的期货指标** - 8 个期货相关指标
5. **129 条信号规则** - 覆盖面广

### 7.2 AL-Brooks 的优势

1. **专注 PA 方法论** - 深度而非广度
2. **三机器人架构** - PA/量化/威科夫 分工明确
3. **Obsidian 集成** - 知识管理 + 交易记录
4. **Discord 交互** - 比 Telegram 更灵活
5. **交易追踪系统** - 完整的模拟交易闭环

### 7.3 建议优先级

| 优先级 | 升级项 | 预计工作量 |
|--------|--------|------------|
| **P0** | 多模型 AI 支持 | 2-3 小时 |
| **P0** | 冷却机制增强 | 1-2 小时 |
| **P0** | 数据新鲜度检查 | 30 分钟 |
| **P1** | 期货指标集成 | 4-6 小时 |
| **P1** | 成交量指标补充 | 3-4 小时 |
| **P2** | 信号规则扩展 | 持续迭代 |

---

*报告生成：2026-02-07*
*对比版本：TradeCat main vs AL-Brooks V2.4*
