> **⚠️ 历史文档 (2026-01 重组前)** — 本文记录的路径和架构可能已过时，仅供参考。当前项目结构请查看 `📁 开发文档/PROJECT_STRUCTURE.md`。

# AB Console 双向同步架构设计

> 定义 Web Dashboard 与 Obsidian Vault 之间的数据同步规范

## 1. 架构原则

### 1.1 单一数据源原则
- **Obsidian Vault** 是策略、交易记录、笔记的**唯一权威数据源**
- **后端服务** 负责读取 Obsidian 数据并提供 API 给 Web
- **Web Dashboard** 只通过后端 API 读写数据，不直接操作文件

### 1.2 文件格式标准化
- 所有数据以 **Markdown + YAML Frontmatter** 格式存储
- 遵循 Obsidian 的属性命名规范（中英文对照）
- 保持与现有策略卡片格式完全兼容

```yaml
---
策略名称/strategy_name: "20均线缺口 (20 EMA Gap)"
策略状态/strategy_status: "学习中 (Learning)"
方向/direction:
  - "做多 (Long)"
  - "做空 (Short)"
时间周期/timeframe:
  - "5m"
  - "15m"
风险等级/risk_level: "中 (Medium)"
---
```

## 2. 同步流程

### 2.1 Obsidian → Web (读取)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Obsidian  │───→│   Backend   │───→│     Web     │
│   Vault     │    │   Service   │    │  Dashboard  │
└─────────────┘    └─────────────┘    └─────────────┘
     (文件系统)        (读取解析)         (API调用)
```

**流程**:
1. 后端扫描 `策略仓库 (Strategy Repository)/` 目录
2. 解析 Markdown 文件的 frontmatter
3. 缓存到内存/JSON 文件
4. Web 通过 REST API 获取数据

### 2.2 Web → Obsidian (写入)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│     Web     │───→│   Backend   │───→│   Obsidian  │
│  Dashboard  │    │   Service   │    │   Vault     │
└─────────────┘    └─────────────┘    └─────────────┘
     (API调用)        (生成文件)         (文件系统)
```

**流程**:
1. Web 提交数据到后端 API
2. 后端生成标准 Markdown 文件
3. 写入 Obsidian Vault 对应目录
4. 刷新缓存

## 3. 数据模型

### 3.1 策略卡片 (Strategy Card)

**文件位置**: `策略仓库 (Strategy Repository)/Al Brooks 策略/{策略名}.md`

**必需属性**:
| 属性 | 类型 | 说明 |
|------|------|------|
| strategy_name | string | 策略名称（中英文）|
| strategy_status | string | 学习中/活跃/暂停/废弃 |
| direction | array | Long/Short |
| timeframe | array | 5m, 15m, 1H, 4H, 1D |
| risk_level | string | 低/中/高 |
| description | string | 策略描述（正文）|

**可选属性**:
| 属性 | 类型 | 说明 |
|------|------|------|
| setup_category | string | 设置类别 |
| patterns_observed | array | 观察到的形态 |
| entry_criteria | array | 入场条件 |
| stop_loss | array | 止损建议 |
| take_profit | array | 目标建议 |
| risk_reward | string | 盈亏比 |
| source | string | 来源 |

**Web端状态**:
- `enabled` (boolean): Web 端启用状态（存储在后端，不在 frontmatter）

### 3.2 交易记录 (Trade Record)

**文件位置**: `Daily/Trades/{日期}-{品种}-{方向}.md`

**必需属性**:
| 属性 | 类型 | 说明 |
|------|------|------|
| date | date | 交易日期 |
| ticker | string | 品种代码 |
| direction | string | Long/Short |
| entry_price | number | 入场价 |
| exit_price | number | 出场价 |
| pnl | number | 盈亏 |

### 3.3 品种配置 (Symbol)

**存储位置**: 后端 `~/.ab-console/symbols.json`

**注意**: 品种列表由后端维护，可从 Web 端添加/编辑

## 4. API 规范

### 4.1 策略相关

```
GET    /api/v1/strategies          # 获取策略列表
POST   /api/v1/strategies          # 创建新策略（生成 Markdown）
PUT    /api/v1/strategies/:id      # 更新策略（修改 Markdown）
DELETE /api/v1/strategies/:id      # 删除策略（删除文件）
POST   /api/v1/strategies/sync     # 触发从 Obsidian 同步
```

### 4.2 交易记录

```
GET    /api/v1/trades              # 获取交易列表
POST   /api/v1/trades              # 创建交易记录
GET    /api/v1/trades/stats        # 交易统计
```

### 4.3 品种

```
GET    /api/v1/symbols             # 获取品种列表
POST   /api/v1/symbols             # 添加品种
DELETE /api/v1/symbols/:id         # 删除品种
```

## 5. Markdown 生成模板

### 5.1 策略卡片模板

```markdown
---
categories:
  - 策略
tags:
  - PA/Strategy
策略名称/strategy_name: {{name}}
策略状态/strategy_status: {{status}}
方向/direction:{{#each directions}}
  - {{this}}{{/each}}
市场周期/market_cycle:{{#each market_cycles}}
  - {{this}}{{/each}}
设置类别/setup_category: {{setup_category}}
时间周期/timeframe:{{#each timeframes}}
  - {{this}}{{/each}}
风险等级/risk_level: {{risk_level}}
观察到的形态/patterns_observed:{{#each patterns}}
  - {{this}}{{/each}}
信号K/signal_bar_quality: []
入场条件/entry_criteria:{{#each entry_criteria}}
  - {{this}}{{/each}}
风险提示/risk_alerts: []
止损建议/stop_loss_recommendation:{{#each stop_loss}}
  - {{this}}{{/each}}
目标建议/take_profit_recommendation:{{#each take_profit}}
  - {{this}}{{/each}}
盈亏比/risk_reward: {{risk_reward}}
来源/source: {{source}}
---

# 🎯 策略概览

**一句话描述**:
{{description}}

## 📋 策略规则

### 入场条件
{{#each entry_criteria}}
- {{this}}
{{/each}}

### 止损设置
{{#each stop_loss}}
- {{this}}
{{/each}}

### 目标设置
{{#each take_profit}}
- {{this}}
{{/each}}

## 📝 交易记录

| 日期 | 品种 | 方向 | 盈亏 | 备注 |
|------|------|------|------|------|

## 💡 学习笔记


```

## 6. 实现路线图

### Phase 1: 策略同步 ✅
- [x] 后端读取 Obsidian 策略
- [x] Web 展示策略列表
- [x] Web 跳转 Obsidian 编辑

### Phase 2: 双向编辑
- [ ] Web 创建策略（生成 Markdown）
- [ ] Web 编辑策略（修改 Markdown）
- [ ] 自动同步机制

### Phase 3: 交易记录
- [ ] Web 创建交易记录
- [ ] 生成交易 Markdown
- [ ] 关联策略

### Phase 4: 回测数据
- [ ] 回测结果存储
- [ ] 生成回测报告 Markdown

## 7. 注意事项

1. **文件编码**: 统一使用 UTF-8
2. **换行符**: LF (Unix style)
3. **日期格式**: YYYY-MM-DD
4. **时间格式**: HH:mm:ss
5. **属性值**: 保留中英文对照格式

## 8. 错误处理

- 文件读取失败 → 记录日志，使用缓存
- 文件写入失败 → 返回错误，不修改数据
- 格式解析失败 → 标记为无效文件，跳过
