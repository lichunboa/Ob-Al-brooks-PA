# CLAWDBOT 集成项目 - 执行计划

**版本**: v1.0
**日期**: 2026-01-31
**状态**: 规划阶段
**关联文档**: [架构设计稿](./al-brooks-trader-architecture.md) | [技术问答记录](./technical-qa-record.md) | [升级任务列表](./04-upgrade-tasks.md)

---

## 目录

- [项目概览](#项目概览)
- [Phase 0: 现有问题修复](#phase-0-现有问题修复-before-integration)
- [Phase 1: SKILL.md 优化](#phase-1-skillmd-优化)
- [Phase 2: MCP Gateway 开发](#phase-2-mcp-gateway-开发)
- [Phase 3: CLAWDBOT 集成测试](#phase-3-clawdbot-集成测试)
- [Phase 4: 多模式支持](#phase-4-多模式支持)
- [Phase 5: 稳定化与持续改进](#phase-5-稳定化与持续改进)
- [时间线总览](#时间线总览)
- [风险与缓解策略](#风险与缓解策略)

---

## 项目概览

### 目标

将 CLAWDBOT（AI 交易助手）与现有后端系统深度集成，通过 MCP 协议实现智能交易辅导能力。

### 系统现状

| 组件 | 说明 | 端口/位置 |
|------|------|-----------|
| api-service | REST API 网关 | :8088 |
| sync-service | 数据同步服务 | :8089 |
| signal-service | 信号检测引擎（129 规则） | 内部 |
| data-service | 行情数据采集 | 内部 |
| trading-service | 交易执行（34 指标） | 内部 |
| telegram-service | Telegram Bot 消息收发 | 内部 |
| ai-service | 现有 AI 分析 | 内部 |
| Obsidian Vault | 2600+ 笔记 | AB Console-Obsidian/ |
| Web Dashboard | Next.js 前端 | :3000 |

### 集成目标架构

```
用户 ──→ CLAWDBOT (Claude) ──→ MCP Gateway ──→ 后端微服务集群
                │                     │
                │                     ├──→ api-service:8088
                │                     ├──→ sync-service:8089
                │                     ├──→ signal-service
                │                     └──→ 向量知识库
                │
                └──→ SKILL-core.md (系统提示词)
                └──→ references/ (按需加载)
```

---

## Phase 0: 现有问题修复 (Before Integration)

> **时间估计**: 1-2 天
> **优先级**: P0 - 必须在集成前完成
> **目标**: 消除现有系统中的已知问题，确保干净的集成基础

### P0-1: 根目录重复文件清理 ✅ 已完成

**问题描述**:
Git 追踪的根目录文件与 `AB Console-Obsidian/` 和 `AB Console-Backend/` 中的文件重复，导致仓库混乱。

**已执行操作**:
- `git rm --cached` 移除重复的追踪文件
- 物理删除根目录冗余文件
- 更新 `.gitignore` 防止再次追踪

**验证标准**: `git status` 不再显示根目录重复文件

---

### P0-2: Web Dashboard 策略匹配修复

**问题描述**:
API 返回的策略数据中 `description` 字段为空，实际内容在 `content` 字段中，导致 Dashboard 显示空白。

**影响范围**:
- `strategies/page.tsx` - 策略列表页
- Scanner 页面 - 策略卡片展示

**修复方案**:

```
1. 定位 strategies/page.tsx 中读取 description 的位置
2. 修改为优先读取 content 字段，description 作为 fallback
3. Scanner 页面同步修复策略卡片的字段映射
4. 验证 API 响应结构，确认字段名称
```

**修复步骤**:
1. 检查 API 响应结构：`GET /api/strategies` 返回的字段
2. 更新 `strategies/page.tsx`：`description` → `content`
3. 更新 Scanner 页面策略卡片组件
4. 本地测试验证显示正常

**验证标准**:
- 策略列表页正确显示策略内容
- Scanner 页面策略卡片显示完整信息

---

### P0-3: .gitignore 清理

**问题描述**:
当前 `.gitignore` 文件底部（第 123-165 行）包含笔记本格式的注释，结构混乱。

**修复方案**:
1. 移除不规范的注释内容
2. 按类别重新组织忽略规则（系统文件 / 依赖 / 构建产物 / IDE / 敏感数据）
3. 确保所有需要忽略的文件类型都已覆盖

**验证标准**:
- `.gitignore` 结构清晰、分类明确
- 无多余注释或笔记内容
- `git status` 不出现意外的未追踪文件

---

## Phase 1: SKILL.md 优化

> **时间估计**: 1-2 天
> **优先级**: P1
> **目标**: 将单体 SKILL.md 拆分为模块化文件，降低 Token 消耗，提升加载效率

### P1-1: 拆分 SKILL.md

**现状分析**:
- 当前文件: `al-brooks-skill/SKILL.md`
- 体量: 1286 行 / ~17K tokens
- 问题: 每次加载全量内容，Token 浪费严重

**目标结构**:

```
al-brooks-skill/
├── SKILL-core.md                          (~7K tokens) [必加载]
│   ├── 人设与核心身份
│   ├── 分析框架（精简版6步流程）
│   ├── 快速参考表（Always In / 80%规则）
│   └── 安全规则与风险管理
│
└── references/                            [按需加载]
    ├── strategies-detailed.md             11 策略卡片
    ├── real-time-cases.md                 实战案例库
    ├── tools-and-checklists.md            交易工具与检查清单
    ├── al-brooks-quotes.md                Al Brooks 语录库
    └── analysis-workflow-deep.md          完整6步分析流程
```

**拆分原则**:
1. **核心文件 SKILL-core.md** 只保留每次对话必须的内容
2. **references/** 目录中的文件通过 MCP 工具按需检索
3. 每个 reference 文件独立自含，无交叉依赖

**Token 优化预期**:

| 场景 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 普通对话 | ~17K | ~7K | 59% |
| 策略查询 | ~17K | ~7K + 按需 ~3K | 41% |
| 完整分析 | ~17K | ~7K + 按需 ~8K | 12% |

---

### P1-2: 去重与整合

**问题描述**:
知识内容在多处重复存在：

| 来源 | 路径 | 内容 |
|------|------|------|
| SKILL.md | `al-brooks-skill/SKILL.md` | 11 策略卡片 + 分析框架 |
| references/ | `al-brooks-knowledge/` | 8 个知识文件（概念/回调/反转等） |
| Obsidian Vault | `AB Console-Obsidian/` | 2600+ 笔记（53 课字幕 + 标签） |

**整合策略**:
1. SKILL.md 中的策略卡片 → `references/strategies-detailed.md`（权威来源）
2. `al-brooks-knowledge/` 中与 SKILL.md 重复的内容 → 标注引用关系，不删除但标记
3. Obsidian Vault 笔记 → 通过向量索引提供检索，不纳入 SKILL 文件

**验证标准**:
- `SKILL-core.md` 独立可用，无外部依赖
- 所有 reference 文件内容完整无遗漏
- `al-brooks-knowledge/` 中无与 SKILL 完全重复的内容

---

## Phase 2: MCP Gateway 开发

> **时间估计**: 1-2 周
> **优先级**: P2
> **目标**: 构建 MCP 协议网关服务，将后端能力暴露给 CLAWDBOT

### P2-1: MCP Server 基础框架

**新增服务**: `mcp-gateway-service`

**技术选型**:

| 选项 | 语言 | 框架 | 优点 | 缺点 |
|------|------|------|------|------|
| **方案A** | Python | FastMCP | 生态丰富，AI 集成方便 | 与现有 TS 后端异构 |
| **方案B** | TypeScript | MCP SDK (官方) | 与后端同构，共享类型 | MCP TS SDK 较新 |

**推荐**: 方案B (TypeScript MCP SDK)
**理由**: 与现有 7 个微服务保持技术栈统一，可复用后端类型定义和工具库。

**MCP Tools 设计**:

| 工具名 | 输入参数 | 输出 | 数据源 |
|--------|----------|------|--------|
| `get_market_status` | `symbol: string` | 当前价格、趋势方向、市场周期 | api-service:8088 |
| `get_signals` | `symbol?: string, timeframe?: string` | 最近信号列表（类型/时间/强度） | signal-service |
| `get_strategy` | `strategy_id: string` | 策略卡片完整内容 | sync-service:8089 |
| `list_strategies` | 无 | 所有策略索引（ID/名称/简述） | sync-service:8089 |
| `search_knowledge` | `query: string, top_k?: number` | 向量搜索结果（笔记片段） | 向量数据库 |
| `get_active_alerts` | 无 | 当前活跃告警列表 | signal-service |

**服务架构**:

```
mcp-gateway-service/
├── src/
│   ├── server.ts              MCP Server 入口
│   ├── tools/
│   │   ├── market.ts          get_market_status
│   │   ├── signals.ts         get_signals, get_active_alerts
│   │   ├── strategies.ts      get_strategy, list_strategies
│   │   └── knowledge.ts       search_knowledge
│   ├── connectors/
│   │   ├── api-connector.ts   → api-service:8088
│   │   ├── sync-connector.ts  → sync-service:8089
│   │   ├── signal-connector.ts → signal-service
│   │   └── vector-connector.ts → 向量数据库
│   ├── types/
│   │   └── mcp-types.ts       MCP 协议类型定义
│   └── config/
│       └── index.ts           配置管理
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

### P2-2: 知识库向量索引

**目标**: 将 Obsidian Vault 2600+ 笔记建立向量索引，支持语义搜索。

**数据源分析**:

| 类别 | 数量 | 说明 |
|------|------|------|
| 53 课字幕笔记 | ~53 | Al Brooks 视频课程完整字幕 |
| 概念标签笔记 | ~30+ | `#pa+term`, `#pa+strategy` 等标签笔记 |
| 策略文档 | ~14 | 已整理策略卡片 |
| 其他笔记 | ~2500 | Vault 中的其他内容 |

**向量索引方案**:

```
Obsidian Vault (.md 文件)
    │
    ▼
文本预处理
    ├── Markdown 解析（提取纯文本）
    ├── 中文分词（jieba/pkuseg）
    ├── 分块策略（512 tokens/块，128 tokens 重叠）
    └── 元数据提取（标题/标签/课程号）
    │
    ▼
Embedding 生成
    ├── 模型: text-embedding-3-small (OpenAI)
    │   或 bge-large-zh-v1.5 (本地)
    └── 维度: 1536 / 1024
    │
    ▼
向量存储
    ├── 选项A: ChromaDB（轻量，本地部署）
    ├── 选项B: Qdrant（高性能，Docker 部署）
    └── 选项C: 复用现有 .smtcmp_vector_db
```

**推荐**: ChromaDB（轻量级，Python 生态，适合当前规模）

**增量更新机制**:
1. 监听 Obsidian Vault 文件变更（文件 hash 对比）
2. 仅对变更文件重新生成 embedding
3. 定时全量校验（每周一次）

---

### P2-3: Gateway 到 Backend 连接

**连接拓扑**:

```
mcp-gateway-service
    │
    ├──→ api-service:8088 (HTTP REST)
    │    ├── GET /api/market/status/:symbol
    │    ├── GET /api/market/klines/:symbol
    │    └── GET /api/portfolio/positions
    │
    ├──→ sync-service:8089 (HTTP REST)
    │    ├── GET /api/strategies
    │    ├── GET /api/strategies/:id
    │    └── GET /api/sync/status
    │
    ├──→ signal-service (内部通信)
    │    ├── GET /signals/recent
    │    ├── GET /signals/active-alerts
    │    └── WebSocket /signals/stream
    │
    └──→ 向量数据库 (本地连接)
         └── query(embedding, top_k)
```

**连接策略**:
- HTTP 连接使用连接池，超时设置 5 秒
- 关键路径设置重试机制（最多 3 次，指数退避）
- 非关键路径（知识搜索）设置降级策略
- 健康检查端点：`/health`，检测所有上游服务可用性

---

## Phase 3: CLAWDBOT 集成测试

> **时间估计**: 1 周
> **优先级**: P3
> **目标**: 将 MCP Gateway 接入 CLAWDBOT，验证端到端功能

### P3-1: 配置 CLAWDBOT 使用 MCP Gateway

**配置步骤**:

1. **注册 MCP Server**:
   在 CLAWDBOT 配置中添加 mcp-gateway-service 的连接信息

2. **加载优化后的系统提示词**:
   使用 `SKILL-core.md` 作为 system prompt，替代原始完整 SKILL.md

3. **工具注册验证**:
   确认 6 个 MCP Tools 全部可被 CLAWDBOT 发现和调用

**验证清单**:
- [ ] MCP Server 启动无错误
- [ ] CLAWDBOT 能列出所有可用工具
- [ ] 每个工具的参数校验正常
- [ ] 返回数据格式符合预期

---

### P3-2: 功能验证

**测试场景矩阵**:

| 测试场景 | 输入 | 预期输出 | 涉及工具 |
|----------|------|----------|----------|
| 实时行情查询 | "BTC 现在什么情况" | 价格 + 趋势 + Always In 方向 | `get_market_status` |
| 信号查询 | "最近有什么信号" | 最近信号列表 + 分析 | `get_signals` |
| 策略查找 | "H2 买入怎么操作" | 策略卡片内容 | `get_strategy` |
| 知识搜索 | "什么是 Final Flag" | 相关笔记片段 | `search_knowledge` |
| 告警查看 | "有没有需要关注的" | 活跃告警列表 | `get_active_alerts` |
| 综合分析 | "帮我分析 ETH 的交易机会" | 多工具联合分析结果 | 多工具组合 |

**端到端测试流程**:
```
1. 启动全部后端服务（7 微服务 + MCP Gateway）
2. 启动 CLAWDBOT 并加载 SKILL-core.md
3. 按照测试场景矩阵逐一验证
4. 记录响应时间、Token 消耗、结果准确性
5. 整理问题清单并修复
```

---

## Phase 4: 多模式支持

> **时间估计**: 2 周
> **优先级**: P3
> **目标**: 实现告警、复盘、学习三种高级交互模式

### P4-1: 告警模式

**数据流**:
```
signal-service (检测到信号)
    │
    ▼
MCP Gateway (接收事件)
    │
    ▼
CLAWDBOT (AI 分析)
    ├── 解读信号含义
    ├── 评估信号强度
    ├── 生成操作建议
    └── 附带风险提示
    │
    ▼
用户 (Telegram / Dashboard)
```

**实现要点**:
- signal-service 通过 WebSocket 推送事件到 MCP Gateway
- MCP Gateway 将事件转化为 CLAWDBOT 可理解的上下文
- CLAWDBOT 基于 SKILL-core.md 中的分析框架生成解读
- 支持告警过滤（按交易对、信号强度、时间段）

---

### P4-2: 复盘模式

**数据流**:
```
trading-service (交易历史)
    │
    ▼
MCP Gateway (结构化数据)
    │
    ▼
CLAWDBOT (复盘分析)
    ├── 交易回顾（入场/出场/理由）
    ├── 规则符合度检查
    ├── 盈亏分析
    ├── 改进建议
    └── 心理状态评估
```

**新增 MCP 工具**:
- `get_trade_history(symbol?, date_range?)` - 获取交易记录
- `get_trade_stats(period)` - 获取交易统计
- `generate_review_report(trade_ids)` - 生成复盘报告

---

### P4-3: 学习模式

**数据流**:
```
用户 (提出问题/请求学习)
    │
    ▼
CLAWDBOT
    ├── search_knowledge (检索相关知识)
    ├── 结合 Al Brooks 53 课内容
    ├── 生成教学内容
    ├── 出题测验（可选）
    └── 记录学习进度
```

**学习进度追踪**:
- 记录用户已学习的课程/概念
- 识别用户常犯的错误模式
- 推荐下一步学习内容
- 与 Obsidian Spaced Repetition 插件集成

---

## Phase 5: 稳定化与持续改进

> **时间估计**: 持续进行
> **优先级**: P4
> **目标**: 系统调优、成本控制、持续迭代

### 优化方向

| 领域 | 措施 | 目标 |
|------|------|------|
| **性能** | MCP 工具响应缓存 / 批量请求合并 | 平均响应 < 3 秒 |
| **Token 成本** | SKILL-core.md 持续精简 / 上下文压缩 | 单次对话 < 10K tokens |
| **准确性** | 用户反馈收集 / 错误案例标注 | 分析准确率 > 80% |
| **知识库** | Vault 持续更新 / 社区内容纳入 | 覆盖率持续提升 |
| **可用性** | 服务监控 / 自动恢复 / 日志分析 | 可用率 > 99% |

---

## 时间线总览

```
Week 1        Week 2        Week 3        Week 4        Week 5        Week 6+
──────────────────────────────────────────────────────────────────────────────
[Phase 0    ]
 Bug修复 1-2d
              [Phase 1    ]
               SKILL优化 1-2d
              [        Phase 2                          ]
               MCP Gateway 开发 1-2 周
                                          [Phase 3    ]
                                           集成测试 1 周
                                                        [Phase 4        ]
                                                         多模式 2 周
──────────────────────────────────────────────────────────────────────────────
                                                                  [Phase 5 →
                                                                   持续改进
```

**关键里程碑**:

| 里程碑 | 目标日期 | 交付物 |
|--------|----------|--------|
| M0: 基础修复完成 | Week 1 | Bug 修复 + .gitignore 清理 |
| M1: SKILL 优化完成 | Week 2 | 模块化 SKILL 文件 + 去重 |
| M2: MCP Gateway MVP | Week 3 | 6 个 MCP 工具可用 |
| M3: 端到端验证通过 | Week 4 | CLAWDBOT 可正常调用后端 |
| M4: 多模式上线 | Week 6 | 告警 + 复盘 + 学习模式 |

---

## 风险与缓解策略

| 风险 | 可能性 | 影响 | 缓解策略 |
|------|--------|------|----------|
| MCP SDK 不稳定 | 中 | 高 | 预留 REST API 降级方案 |
| 向量搜索质量差 | 中 | 中 | 先用关键词搜索兜底，逐步优化 |
| Token 成本超预期 | 低 | 中 | SKILL-core.md 持续精简 + 缓存 |
| 后端 API 变更 | 低 | 高 | MCP Gateway 做适配层，隔离变更 |
| 中文分词影响搜索 | 中 | 中 | 使用经过中文优化的 embedding 模型 |

---

## 附录: 决策记录

### DR-001: MCP Gateway 语言选型

**决策**: 选择 TypeScript
**替代方案**: Python (FastMCP)
**理由**: 与现有 7 个微服务保持技术栈统一，减少运维复杂度，可复用类型定义
**风险**: TypeScript MCP SDK 较 Python 版本社区支持少
**缓解**: 关注官方更新，必要时可迁移至 Python

### DR-002: 向量数据库选型

**决策**: ChromaDB
**替代方案**: Qdrant / 复用 .smtcmp_vector_db
**理由**: 轻量级部署、Python 原生支持、适合当前 2600 笔记规模
**风险**: 规模增长后可能需要迁移
**缓解**: 抽象 vector-connector 接口，支持后续替换
