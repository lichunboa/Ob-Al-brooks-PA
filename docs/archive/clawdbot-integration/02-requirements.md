# CLAWDBOT 集成项目 - 需求规格说明书

**文档编号**: CLAWDBOT-REQ-002
**版本**: v1.0
**日期**: 2026-01-31
**状态**: 评审中
**作者**: Mitchell / Claude Code
**关联文档**: [架构设计稿](./al-brooks-trader-architecture.md) | [技术问答记录](./technical-qa-record.md) | [Al Brooks Skill](./al-brooks-skill/SKILL.md)

---

## 目录

1. [项目背景与目标](#1-项目背景与目标)
2. [功能需求](#2-功能需求-functional-requirements)
3. [非功能需求](#3-非功能需求-non-functional-requirements)
4. [系统约束](#4-系统约束)
5. [用户场景](#5-用户场景-use-cases)
6. [数据需求](#6-数据需求)
7. [接口需求](#7-接口需求)
8. [验收标准](#8-验收标准)
9. [术语表](#9-术语表)
10. [变更记录](#10-变更记录)

---

## 1. 项目背景与目标

### 1.1 问题陈述

当前 AB Console 系统已具备完整的后端数据管线（行情采集、34项技术指标计算、129条信号检测规则），但存在以下核心痛点：

| 编号 | 痛点描述 | 影响 |
|------|---------|------|
| P-1 | 现有 Telegram Bot "很呆"，只报数字，缺乏价格行为洞察 | 用户需要自行解读信号含义，效率低 |
| P-2 | 缺少实时交易陪伴，无法在市场变化时及时给出分析建议 | 错过高概率交易机会 |
| P-3 | 没有系统化学习路径，无法结合用户进度给出针对性指导 | 2600+ Obsidian 笔记难以高效检索利用 |
| P-4 | 复盘依赖人工整理，缺乏结构化分析和归因 | 进步缓慢，错误重复 |

### 1.2 项目目标

构建 **Al Brooks AI 交易导师** -- 一个基于价格行为学的智能交易教练系统，通过将 CLAWDBOT（AI 助手框架）与现有后端服务集成，实现以下目标：

| 目标编号 | 目标描述 | 衡量标准 |
|---------|---------|---------|
| G-1 | 实时分析市场行情，识别 Al Brooks 价格行为模式 | 能正确识别 Always In 方向、市场周期、H1/H2/L1/L2 信号 |
| G-2 | 陪伴交易全过程（盘前、盘中、盘后） | 覆盖 4 种工作模式：实时分析、告警、复盘、学习 |
| G-3 | 提供个性化学习指导 | 能从 2600+ 笔记中检索相关知识并回答问题 |
| G-4 | 与现有系统无缝集成 | 不影响现有服务运行，数据单一来源 |

### 1.3 项目范围

**范围内（In Scope）：**
- MCP Gateway 服务开发（只读数据接口）
- 知识库向量化检索服务
- Al Brooks Skill 拆分与优化
- 4 种工作模式（实时分析、告警、复盘、学习）的 AI 分析能力

**范围外（Out of Scope）：**
- 自动化交易执行（绝不自动下单）
- 新的前端界面开发（复用现有 Telegram 和 Web Dashboard）
- 现有后端服务的重构
- 移动端 App 开发

### 1.4 干系人

| 角色 | 职责 | 关注点 |
|------|------|--------|
| 交易员（Mitchell） | 终端用户，日常使用 AI 教练 | 分析质量、响应速度、学习体验 |
| 后端维护者 | 维护现有后端服务 | 不影响现有服务、接口兼容 |
| CLAWDBOT 框架 | AI 助手运行环境 | MCP 协议兼容、Skill 格式规范 |

---

## 2. 功能需求 (Functional Requirements)

### FR-1: MCP Gateway 服务

**优先级**: P0（核心依赖）
**描述**: 开发一个 MCP（Model Context Protocol）服务端，将现有后端 API 以标准化 MCP Tool 的形式暴露给 CLAWDBOT，所有工具均为**只读**操作。

#### FR-1.1: MCP Tool 注册与暴露

- **FR-1.1.1**: MCP Server 启动时自动注册所有可用 Tool，并通过 MCP 协议的能力发现机制让 CLAWDBOT 获取 Tool 列表。
- **FR-1.1.2**: 每个 Tool 必须包含完整的 JSON Schema 参数描述，包括参数名称、类型、是否必填、默认值和中文说明。
- **FR-1.1.3**: Tool 调用结果统一返回结构化 JSON，包含 `status`、`data`、`error` 字段。

#### FR-1.2: Tool 清单

| Tool 名称 | 描述 | 数据来源 | 参数 |
|-----------|------|---------|------|
| `get_market_status` | 获取指定品种的当前市场状态（价格、指标、趋势方向） | api-service → data-service + trading-service | `symbol: string`, `timeframe?: string` |
| `get_signals` | 获取当前活跃的信号检测结果 | api-service → signal-service | `symbol?: string`, `signal_type?: string`, `min_confidence?: number` |
| `get_strategies` | 获取匹配当前行情的策略卡片 | api-service → sync-service (Obsidian策略库) | `symbol: string`, `market_cycle?: string` |
| `get_active_alerts` | 获取用户配置的活跃告警列表 | api-service → signal-service | `status?: string` |
| `search_knowledge` | 向量检索知识库（见 FR-2） | 知识库向量服务 | `query: string`, `top_k?: number`, `language?: string` |
| `get_trade_history` | 获取历史交易记录 | api-service → 交易数据库 | `symbol?: string`, `date_range?: string`, `limit?: number` |
| `get_indicator_values` | 获取指定品种的技术指标数值（34项） | api-service → trading-service | `symbol: string`, `indicators?: string[]`, `timeframe?: string` |

#### FR-1.3: 认证与授权

- **FR-1.3.1**: MCP Server 通过 API Key 验证 CLAWDBOT 的身份，Key 存储在环境变量中，不硬编码。
- **FR-1.3.2**: 支持 API Key 定期轮换，轮换时不中断服务（双 Key 机制）。
- **FR-1.3.3**: 所有 Tool 调用记录审计日志，包含时间戳、Tool 名称、参数摘要、响应状态。

#### FR-1.4: 速率限制

- **FR-1.4.1**: 单 Tool 调用频率限制：最高 60 次/分钟。
- **FR-1.4.2**: 全局调用频率限制：最高 300 次/分钟。
- **FR-1.4.3**: 超出限制时返回标准错误码和重试建议（`retry_after` 字段）。

#### FR-1.5: 数据格式标准化

- **FR-1.5.1**: 所有价格数据统一使用 `string` 类型传输（避免浮点精度问题），保留原始精度。
- **FR-1.5.2**: 时间戳统一使用 ISO 8601 格式（UTC），例如 `2026-01-31T08:30:00Z`。
- **FR-1.5.3**: 枚举值使用大写蛇形命名，例如 `ALWAYS_IN_LONG`、`TIGHT_CHANNEL`。

---

### FR-2: 知识库向量检索

**优先级**: P0（核心依赖）
**描述**: 将 Obsidian Vault 中的 2600+ 笔记（Al Brooks 53 课视频文案、策略笔记、交易复盘等）构建为向量索引，支持语义检索。

#### FR-2.1: 笔记索引构建

- **FR-2.1.1**: 扫描 Obsidian Vault 目录，解析所有 `.md` 文件。
- **FR-2.1.2**: 按以下规则进行文档分块（Chunking）：
  - 按 Markdown 标题（`##` 及以上）拆分为独立段落
  - 每个 chunk 最大 1000 tokens，最小 100 tokens
  - 相邻 chunk 之间保留 100 tokens 重叠，保证上下文连贯
- **FR-2.1.3**: 为每个 chunk 生成向量嵌入（Embedding），存入向量数据库。
- **FR-2.1.4**: 保留 chunk 的元数据：源文件路径、标题层级、标签（Obsidian tags）、最后修改时间。

#### FR-2.2: MCP Tool - search_knowledge

- **FR-2.2.1**: 接受自然语言查询，返回最相关的 `top_k` 个结果（默认 `top_k=5`）。
- **FR-2.2.2**: 返回结果包含：
  - `content`: 匹配的文本片段
  - `source`: 源文件路径（相对于 Vault 根目录）
  - `title`: 所属章节标题
  - `score`: 相似度分数（0-1）
  - `tags`: Obsidian 标签列表
- **FR-2.2.3**: 支持按标签过滤，例如 `tags=["#pa+strategy"]` 只搜索策略相关笔记。
- **FR-2.2.4**: 支持按文件路径前缀过滤，例如只搜索 `Categories 分类/Al brooks/` 目录。

#### FR-2.3: 多语言支持

- **FR-2.3.1**: 支持中文查询检索中文内容（笔记主体为中文）。
- **FR-2.3.2**: 支持英文术语查询检索中文内容（例如查询 "MTR" 能匹配到 "主要趋势反转"）。
- **FR-2.3.3**: 选用支持中英双语的嵌入模型（推荐：`text-embedding-3-large` 或同等能力模型）。

#### FR-2.4: 增量索引更新

- **FR-2.4.1**: 监听 Obsidian Vault 文件变更（通过 sync-service 的同步事件或文件系统 watcher）。
- **FR-2.4.2**: 文件新增或修改时，仅重新索引变更的文件（增量更新，非全量重建）。
- **FR-2.4.3**: 文件删除时，移除对应的向量索引记录。
- **FR-2.4.4**: 支持手动触发全量重建索引的命令。

---

### FR-3: Al Brooks Skill 优化

**优先级**: P1（重要）
**描述**: 当前 SKILL.md 体量过大（约 17K+ tokens），需要拆分为核心文件和引用文件，通过 MCP Tool 按需加载，降低每次对话的 token 消耗。

#### FR-3.1: Skill 文件拆分

- **FR-3.1.1**: 拆分后的核心文件（`SKILL.md`）控制在 7K tokens 以内，包含：
  - 身份设定和核心定位
  - 六步实时分析流程（Step 1-6 摘要）
  - 标准输出模板
  - 安全边界与免责声明
  - Al Brooks 核心金句（10 条）
- **FR-3.1.2**: 引用文件按主题拆分存放在 `references/` 目录下：

  | 引用文件 | 内容 | 估计 tokens |
  |---------|------|------------|
  | `00-core-concepts.md` | 核心术语与概念定义 | ~2K |
  | `14-strategies.md` | 11 大策略卡片完整内容 | ~5K |
  | `15-probability.md` | 概率数据与交易者方程 | ~2K |
  | `16-mtr-deep-dive.md` | MTR 主要趋势反转专题 | ~3K |
  | `17-checklist-tools.md` | 交易检查清单与辅助工具 | ~2K |

#### FR-3.2: 动态引用加载

- **FR-3.2.1**: 当用户提问涉及特定策略时，Skill 通过 `search_knowledge` 工具按需加载对应引用文件片段。
- **FR-3.2.2**: 加载的引用内容作为临时上下文注入，不永久占用对话 token。
- **FR-3.2.3**: Skill 内置引用触发规则：

  | 用户意图 | 触发加载 |
  |---------|---------|
  | 询问特定术语 | `00-core-concepts.md` |
  | 询问交易策略 | `14-strategies.md` 中对应策略卡片 |
  | 询问概率/胜率 | `15-probability.md` |
  | 询问 MTR/反转 | `16-mtr-deep-dive.md` |
  | 要求交易检查清单 | `17-checklist-tools.md` |

#### FR-3.3: 分析质量保障

- **FR-3.3.1**: 拆分后的 Skill 在以下测试场景中，分析输出质量不低于拆分前：
  - Always In 方向判断
  - 市场周期识别
  - H1/H2/L1/L2 Leg 计数
  - 信号 K 线质量评估
  - 止损/目标/盈亏比计算
- **FR-3.3.2**: 建立 10 个标准测试用例，覆盖不同市场状态，用于拆分前后的对比验证。

---

### FR-4: 实时分析模式

**优先级**: P0（核心功能）
**描述**: 用户发送价格数据或触发实时分析后，AI 执行 Al Brooks 六步分析流程，输出结构化的交易分析报告。

#### FR-4.1: 价格数据输入

- **FR-4.1.1**: 支持以下输入格式：
  - 文本描述：`"BTC 当前价格 43200，前高 43500，前低 42800"`
  - 价格序列：`"100→98→99→97→98"`
  - 通过 `get_market_status` 工具自动获取实时数据
- **FR-4.1.2**: 用户可指定品种（symbol）和时间周期（timeframe），默认使用 5 分钟周期。
- **FR-4.1.3**: 支持 OHLCV 格式的 K 线数据输入（用于更精确分析）。

#### FR-4.2: 市场状态识别

- **FR-4.2.1**: 判断 Always In 方向（Long / Short / 不确定-TR），并说明判断依据（HH+HL / LH+LL / 无明确结构）。
- **FR-4.2.2**: 识别市场周期类型：突破（BO）、紧通道、宽通道、交易区间（TR）、紧交易区间（TTR）。
- **FR-4.2.3**: 执行 Leg 计数，识别当前处于 H1/H2/H3/H4 或 L1/L2/L3/L4 的哪一阶段。
- **FR-4.2.4**: 评估信号 K 线质量（15 分制评分系统：收盘位置、影线、实体、重叠、Context）。

#### FR-4.3: 交易计划生成

- **FR-4.3.1**: 根据分析结果生成具体交易计划，包含：
  - 交易方向（做多 / 做空 / 观望）
  - 入场价格（精确到 tick 级别）
  - 止损价格（基于 Major HL/LH，说明计算依据）
  - 目标价格（分段目标：保守 / 标准 / 延伸）
  - 盈亏比（必须 >= 2:1，否则标注警告）
- **FR-4.3.2**: 输出格式严格遵循 SKILL.md 中定义的标准模板（市场状态 → 交易计划 → 概率评估 → 关键提醒 → Al Brooks 原话）。

#### FR-4.4: 概率评估与交易者方程

- **FR-4.4.1**: 估算交易胜率（40%-60% 范围，基于市场状态和信号质量）。
- **FR-4.4.2**: 计算交易者方程：`期望值 = (胜率 x 收益) - (败率 x 风险)`，期望值为正时标注"可以交易"。
- **FR-4.4.3**: 评估风险等级（低 / 中 / 高），并给出对应的仓位建议。

---

### FR-5: 告警模式

**优先级**: P1（重要）
**描述**: AI 订阅 signal-service 的信号推送，对每个信号进行 Al Brooks 视角的增强分析，生成智能告警。

#### FR-5.1: 信号订阅

- **FR-5.1.1**: 通过 MCP Gateway 定期轮询 `get_signals` 工具获取新信号（轮询间隔可配置，默认 60 秒）。
- **FR-5.1.2**: 未来可升级为 WebSocket 实时推送（依赖 MCP 协议的 Server-Sent Events 能力）。
- **FR-5.1.3**: 信号去重：同一信号在 5 分钟内不重复处理。

#### FR-5.2: AI 增强分析

- **FR-5.2.1**: 对每个信号执行以下增强分析：
  - 验证信号是否符合 Al Brooks 80% 规则
  - 确认 Always In 方向是否一致
  - 评估信号 K 线质量
  - 计算盈亏比和交易者方程
- **FR-5.2.2**: 为信号附加 AI 置信度标签：`HIGH`（推荐关注）、`MEDIUM`（可选关注）、`LOW`（建议忽略）。
- **FR-5.2.3**: 生成简洁的告警文案（不超过 200 字），包含信号类型、AI 判断和建议操作。

#### FR-5.3: 信号过滤配置

- **FR-5.3.1**: 用户可配置关注的品种列表（例如只关注 BTC/USDT 和 ETH/USDT）。
- **FR-5.3.2**: 用户可配置信号类型过滤（例如只接收 H2/L2 和 MTR 信号）。
- **FR-5.3.3**: 用户可配置最低置信度阈值（例如只推送 `HIGH` 级别信号）。
- **FR-5.3.4**: 配置通过 Telegram 命令 `/config` 或 Web Dashboard 设置界面修改。

---

### FR-6: 复盘模式

**优先级**: P1（重要）
**描述**: 交易结束后，AI 读取当日交易记录，生成结构化的复盘报告，并自动保存到 Obsidian Vault。

#### FR-6.1: 交易历史输入

- **FR-6.1.1**: 通过 `get_trade_history` 工具自动获取指定日期的交易记录。
- **FR-6.1.2**: 支持用户手动输入交易信息（品种、方向、入场价、出场价、止损、时间）。
- **FR-6.1.3**: 自动获取交易时段的市场数据（K 线、指标），用于还原当时的市场环境。

#### FR-6.2: 结构化复盘报告

- **FR-6.2.1**: 报告包含以下章节：
  1. **交易统计摘要**：总盈亏、胜率、盈亏比、最大单笔盈亏、R-multiple 分布
  2. **逐笔分析**：对每笔交易按 Al Brooks 六步流程回顾，指出做对和做错之处
  3. **错误归因**：违反规则（比例）、情绪化交易（比例）、技术误判（比例）
  4. **技术评分**：Always In 判断、周期识别、Leg 计数、信号评估、止损管理（各项 10 分制）
  5. **心理状态评估**：FOMO、贪婪、恐惧、报复交易等情绪指标
  6. **改进建议**：基于 Al Brooks 原则的具体建议，附相关课程引用
  7. **明日关注**：需要关注的品种、价位、形态
- **FR-6.2.2**: 报告输出为 Markdown 格式，兼容 Obsidian 渲染。
- **FR-6.2.3**: 附带 Al Brooks 相关金句（根据错误类型选择对应金句）。

#### FR-6.3: 自动保存到 Obsidian

- **FR-6.3.1**: 复盘报告保存路径：`交易日记/YYYY/MM/YYYY-MM-DD-复盘.md`。
- **FR-6.3.2**: 通过 sync-service 的同步机制将文件写入 Obsidian Vault。
- **FR-6.3.3**: 报告 frontmatter 包含结构化元数据（日期、品种列表、总盈亏、胜率、评分）。
- **FR-6.3.4**: 自动添加 Obsidian 标签，例如 `#trade-review`、`#2026-01`。

---

### FR-7: 学习模式

**优先级**: P2（增强功能）
**描述**: AI 作为 Al Brooks 价格行为学导师，回答用户问题，提供学习指导，并与现有 Obsidian 间隔复习系统集成。

#### FR-7.1: 问答能力

- **FR-7.1.1**: 回答 Al Brooks 方法论相关问题，引用具体课程内容（53 课视频文案）。
- **FR-7.1.2**: 通过 `search_knowledge` 工具检索相关笔记片段，作为回答的知识依据。
- **FR-7.1.3**: 回答中标注知识来源（例如 "根据第 14 课 Breakouts and Gaps..."）。
- **FR-7.1.4**: 支持追问和深入讨论（多轮对话）。

#### FR-7.2: 测验与间隔复习集成

- **FR-7.2.1**: 根据用户当前学习进度，生成针对性的测验题目（选择题和简答题）。
- **FR-7.2.2**: 与 Obsidian Spaced Repetition 插件的闪卡格式兼容（`#flashcard` 标签）。
- **FR-7.2.3**: 根据用户答题表现，推荐需要复习的知识点。

#### FR-7.3: 课程引用

- **FR-7.3.1**: 回答问题时引用具体的课程编号和章节（例如 "第 17 课 Major Trend Reversals"）。
- **FR-7.3.2**: 提供相关笔记的 Obsidian 内部链接，方便用户跳转查看完整内容。
- **FR-7.3.3**: 按用户水平调整解释深度（初学者用简单语言，进阶者用专业术语）。

---

## 3. 非功能需求 (Non-Functional Requirements)

### NFR-1: 性能

| 编号 | 性能指标 | 目标值 | 衡量方法 |
|------|---------|--------|---------|
| NFR-1.1 | 实时分析模式端到端响应时间（含 LLM 推理） | < 15 秒 | 从用户发送请求到收到完整分析报告 |
| NFR-1.2 | 知识库向量检索延迟 | < 2 秒 | 从发起 search_knowledge 到返回结果 |
| NFR-1.3 | MCP Gateway 单次 Tool 调用延迟 | < 500 毫秒 | 不含 LLM 推理，纯数据获取 |
| NFR-1.4 | 告警模式信号处理延迟（从信号产生到推送） | < 30 秒 | 含 AI 增强分析时间 |
| NFR-1.5 | 向量索引全量构建时间（2600+ 笔记） | < 10 分钟 | 冷启动首次构建 |
| NFR-1.6 | 向量索引增量更新时间（单文件） | < 5 秒 | 文件变更后的增量处理 |

### NFR-2: 安全

| 编号 | 安全要求 | 说明 |
|------|---------|------|
| NFR-2.1 | MCP Tools 全部为**只读**操作 | 绝不通过 AI 执行交易下单、修改配置等写操作 |
| NFR-2.2 | API Key 不硬编码 | 所有凭据通过环境变量或密钥管理服务注入 |
| NFR-2.3 | API Key 支持轮换 | 双 Key 机制，轮换时零停机 |
| NFR-2.4 | LLM 上下文隔离 | 不将 API Key、数据库连接串、用户私钥等敏感信息传入 LLM 上下文 |
| NFR-2.5 | 审计日志 | 所有 Tool 调用记录日志，包含调用者、时间、参数摘要、结果状态 |
| NFR-2.6 | 免责声明 | AI 输出必须包含免责声明，明确标注"仅供教育目的，不构成投资建议" |

### NFR-3: 可用性与可靠性

| 编号 | 要求 | 说明 |
|------|------|------|
| NFR-3.1 | 与现有 TG Bot 共存 | CLAWDBOT 集成不影响现有 Telegram Bot 的任何功能 |
| NFR-3.2 | 后端服务降级处理 | 当 data-service / signal-service 不可用时，AI 仍能基于用户手动输入的数据进行分析 |
| NFR-3.3 | 向量服务降级处理 | 当向量数据库不可用时，学习模式降级为基于 Skill 内置知识的回答（不进行外部检索） |
| NFR-3.4 | 错误信息友好 | 服务异常时向用户返回可理解的中文错误提示，而非原始堆栈信息 |

### NFR-4: 可维护性

| 编号 | 要求 | 说明 |
|------|------|------|
| NFR-4.1 | 策略卡片独立更新 | 11 大策略卡片在 `references/` 目录中独立管理，修改单个策略不影响 Skill 核心文件 |
| NFR-4.2 | 知识库自动同步 | Obsidian Vault 笔记变更后，向量索引自动增量更新，无需人工干预 |
| NFR-4.3 | MCP Tool 可扩展 | 新增 Tool 只需添加函数定义和注册，不需要修改框架代码 |
| NFR-4.4 | 配置外部化 | 所有可调参数（轮询间隔、速率限制、top_k 默认值等）通过配置文件或环境变量管理 |
| NFR-4.5 | 日志分级 | 支持 DEBUG / INFO / WARN / ERROR 四级日志，生产环境默认 INFO 级别 |

### NFR-5: 兼容性

| 编号 | 要求 | 说明 |
|------|------|------|
| NFR-5.1 | MCP 协议版本 | 兼容 MCP 协议 v1.0+ |
| NFR-5.2 | LLM 模型兼容 | 支持 Claude（Sonnet/Opus）和 Gemini 作为底层推理模型 |
| NFR-5.3 | 操作系统 | 支持在 macOS（开发环境）和 Linux（Docker 部署）上运行 |

---

## 4. 系统约束

### 4.1 架构约束

| 约束编号 | 约束内容 | 原因 |
|---------|---------|------|
| C-1 | 不得修改或破坏现有后端服务（api-service、data-service、signal-service 等） | 现有服务已稳定运行，用户依赖 |
| C-2 | CLAWDBOT 保持独立部署（独立仓库、独立进程） | 解耦，CLAWDBOT 框架有自己的版本管理 |
| C-3 | 后端数据库为唯一数据源（Single Source of Truth） | MCP Gateway 只读取，不维护独立数据副本 |
| C-4 | MCP Gateway 作为后端与 AI 之间的唯一桥梁 | AI 不直接调用后端 REST API，所有访问通过 MCP Tool |

### 4.2 技术约束

| 约束编号 | 约束内容 | 原因 |
|---------|---------|------|
| C-5 | MCP Server 使用 TypeScript 或 Python 开发 | 与现有后端技术栈（Python）和 CLAWDBOT 生态（TypeScript）兼容 |
| C-6 | 向量数据库选型限制在轻量级方案（如 ChromaDB、LanceDB） | 本地开发环境，不引入重量级基础设施 |
| C-7 | LLM API 调用费用需控制 | 每日 LLM 调用成本不超过 $5（可调整） |
| C-8 | 单次 Skill 核心文件 token 消耗 <= 7K | CLAWDBOT 框架的上下文窗口限制 |

### 4.3 法规与合规约束

| 约束编号 | 约束内容 |
|---------|---------|
| C-9 | AI 输出不得构成具体投资建议，必须附带风险提示 |
| C-10 | 不存储、不传输用户的真实资金账户信息 |
| C-11 | 交易数据仅在本地存储，不上传至第三方 |

---

## 5. 用户场景 (Use Cases)

### UC-1: 实时交易分析

**场景名称**: 交易员询问当前行情能否做多

**前置条件**:
- 后端服务运行中
- MCP Gateway 已连接
- 用户正在盯盘

**主流程**:

| 步骤 | 角色 | 操作 |
|------|------|------|
| 1 | 交易员 | 发送消息："BTC 5分钟，当前43200，前高43500，前低42800，这个H2能做多吗？" |
| 2 | AI | 调用 `get_market_status("BTCUSDT", "5m")` 获取完整数据 |
| 3 | AI | 调用 `get_signals("BTCUSDT")` 获取当前信号 |
| 4 | AI | 执行六步分析流程（Always In → 市场周期 → Leg计数 → 信号质量 → 止损目标 → 建议） |
| 5 | AI | 输出结构化分析报告（标准模板格式） |
| 6 | 交易员 | 根据分析决定是否入场 |

**替代流程**:
- 步骤 2 失败（后端不可用）：AI 基于用户文本描述的价格数据进行分析，并提示"数据来自手动输入，建议核实"
- 步骤 4 判断为"观望"：AI 说明原因并建议等待的条件

**后置条件**: 交易员获得包含入场/止损/目标的具体交易计划

---

### UC-2: 信号告警触发 AI 分析

**场景名称**: 后端检测到 H2 信号，AI 自动增强分析并推送

**前置条件**:
- 告警模式已开启
- 用户已配置关注 BTCUSDT
- signal-service 检测到 H2 买入信号

**主流程**:

| 步骤 | 角色 | 操作 |
|------|------|------|
| 1 | signal-service | 检测到 BTCUSDT H2 买入信号（置信度 72%） |
| 2 | MCP Gateway | 轮询获取新信号，传递给 AI |
| 3 | AI | 调用 `get_market_status` 获取当前市场环境 |
| 4 | AI | 验证信号：检查 80% 规则、Always In 方向、信号 K 线质量 |
| 5 | AI | 判定为 `HIGH` 级别，生成告警文案 |
| 6 | AI | 通过 Telegram 推送告警给用户 |
| 7 | 交易员 | 收到告警，回复"详细分析"获取完整报告 |

**替代流程**:
- 步骤 4 判定 Always In 方向不一致：降级为 `LOW`，不推送（或根据配置推送低优先级提醒）
- 步骤 5 信号不满足最低置信度：静默忽略，仅记录日志

---

### UC-3: 盘后交易复盘

**场景名称**: 收盘后 AI 自动生成当日复盘报告

**前置条件**:
- 当日有交易记录
- 交易数据已同步到数据库

**主流程**:

| 步骤 | 角色 | 操作 |
|------|------|------|
| 1 | 交易员 | 发送消息："复盘今日" |
| 2 | AI | 调用 `get_trade_history(date="2026-01-31")` 获取当日交易 |
| 3 | AI | 调用 `get_market_status` 获取当日各交易时段的市场数据 |
| 4 | AI | 逐笔分析：对照 Al Brooks 六步流程，评估每笔交易 |
| 5 | AI | 汇总统计：胜率、盈亏比、错误归因、评分 |
| 6 | AI | 生成 Markdown 格式复盘报告 |
| 7 | AI | 通过 sync-service 保存到 Obsidian Vault |
| 8 | AI | 将报告摘要发送给用户，附文件链接 |

**替代流程**:
- 步骤 2 无交易记录：AI 提示"今日无交易记录"，建议进行市场观察复盘
- 步骤 7 sync-service 不可用：将报告内容直接发送给用户，提示手动保存

---

### UC-4: 学习 MTR 形态

**场景名称**: 交易员学习主要趋势反转（MTR）的判断方法

**前置条件**:
- 知识库向量索引已构建
- 学习模式已激活

**主流程**:

| 步骤 | 角色 | 操作 |
|------|------|------|
| 1 | 交易员 | 发送消息："什么是MTR？三个条件分别怎么判断？" |
| 2 | AI | 调用 `search_knowledge("MTR 主要趋势反转 三个条件", top_k=5)` |
| 3 | AI | 获取相关知识片段（第 17 课笔记、MTR 专题文档等） |
| 4 | AI | 以 Al Brooks 语气组织回答，引用具体课程内容 |
| 5 | AI | 给出 MTR 三条件的详细解释和实际案例 |
| 6 | 交易员 | 追问："LH MTR 和 HH MTR 哪个概率更高？" |
| 7 | AI | 检索概率相关笔记，给出数据支持的回答 |

**替代流程**:
- 步骤 2 向量服务不可用：AI 基于 Skill 内置的 MTR 知识回答（`16-mtr-deep-dive.md` 内容）
- 步骤 6 用户提出超出知识库范围的问题：AI 诚实回复"目前笔记中没有这方面的详细记录"

---

## 6. 数据需求

### 6.1 市场数据

| 数据类型 | 来源 | 格式 | 更新频率 |
|---------|------|------|---------|
| K 线数据（OHLCV） | Binance API（通过 data-service） | JSON，含 open/high/low/close/volume | 实时（每根 K 线收盘时） |
| 技术指标（34项） | trading-service 计算 | JSON，含指标名称和数值 | 实时（随 K 线更新） |
| 信号检测结果（129规则） | signal-service | JSON，含信号类型、置信度、触发时间 | 实时（信号触发时） |
| 策略卡片 | Obsidian Vault（sync-service 同步） | Markdown | 手动更新 |

### 6.2 知识库数据

| 数据类型 | 数量（估计） | 格式 | 存储 |
|---------|------------|------|------|
| Al Brooks 53 课视频文案 | ~53 文件 | Markdown（中文） | Obsidian Vault |
| 策略笔记 | ~200 文件 | Markdown（中英混合） | Obsidian Vault |
| 交易复盘 | 持续增长 | Markdown | Obsidian Vault |
| 形态标签笔记 | ~2000+ 文件 | Markdown（含 #pa 标签体系） | Obsidian Vault |
| 策略卡片（结构化） | 11 份 | Markdown（表格格式） | Skill references/ |

### 6.3 交易数据

| 数据类型 | 来源 | 格式 | 存储 |
|---------|------|------|------|
| 交易记录 | Obsidian JournalIt 插件 | JSON Cache | `trade-cache.json` |
| 历史交易 | SQLite 数据库 | SQL 表 | 后端数据库 |
| 用户配置（告警偏好等） | Telegram Bot / Web Dashboard | JSON | 后端数据库 |

---

## 7. 接口需求

### 7.1 MCP Tool 接口定义

#### 7.1.1 get_market_status

```json
{
  "name": "get_market_status",
  "description": "获取指定交易品种的当前市场状态，包括最新价格、技术指标摘要和趋势方向判断",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "交易品种代码，例如 BTCUSDT, ETHUSDT",
        "required": true
      },
      "timeframe": {
        "type": "string",
        "description": "K线时间周期",
        "enum": ["1m", "5m", "15m", "1h", "4h", "1d"],
        "default": "5m"
      }
    }
  },
  "returns": {
    "type": "object",
    "properties": {
      "symbol": "string",
      "timeframe": "string",
      "current_price": "string",
      "ohlcv_latest": {
        "open": "string",
        "high": "string",
        "low": "string",
        "close": "string",
        "volume": "string"
      },
      "trend_direction": "BULL | BEAR | NEUTRAL",
      "market_cycle": "BREAKOUT | TIGHT_CHANNEL | BROAD_CHANNEL | TRADING_RANGE | TIGHT_TR",
      "indicators_summary": {
        "ema_20": "string",
        "ema_50": "string",
        "rsi_14": "string",
        "atr_14": "string"
      },
      "recent_candles": ["array of last 20 OHLCV objects"],
      "timestamp": "ISO 8601 string"
    }
  }
}
```

#### 7.1.2 get_signals

```json
{
  "name": "get_signals",
  "description": "获取当前活跃的交易信号检测结果，来自后端129条信号规则引擎",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "交易品种代码，为空则返回所有品种信号"
      },
      "signal_type": {
        "type": "string",
        "description": "信号类型过滤",
        "enum": ["H1", "H2", "H3", "L1", "L2", "L3", "MTR", "BO", "DT", "DB", "WEDGE", "ALL"],
        "default": "ALL"
      },
      "min_confidence": {
        "type": "number",
        "description": "最低置信度阈值 (0-100)",
        "default": 50
      }
    }
  },
  "returns": {
    "type": "object",
    "properties": {
      "signals": [{
        "id": "string",
        "symbol": "string",
        "signal_type": "string",
        "confidence": "number",
        "price_at_signal": "string",
        "triggered_at": "ISO 8601 string",
        "details": "string (信号描述)"
      }],
      "total_count": "number"
    }
  }
}
```

#### 7.1.3 search_knowledge

```json
{
  "name": "search_knowledge",
  "description": "语义检索Al Brooks价格行为学知识库，支持中英文查询，返回最相关的笔记片段",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "自然语言查询，例如 'MTR三个条件' 或 'H2买入信号'",
        "required": true
      },
      "top_k": {
        "type": "number",
        "description": "返回结果数量",
        "default": 5,
        "maximum": 20
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Obsidian标签过滤，例如 ['#pa+strategy']"
      },
      "path_prefix": {
        "type": "string",
        "description": "文件路径前缀过滤，例如 'Categories 分类/Al brooks/'"
      },
      "language": {
        "type": "string",
        "enum": ["zh", "en", "auto"],
        "default": "auto",
        "description": "查询语言偏好，auto为自动检测"
      }
    }
  },
  "returns": {
    "type": "object",
    "properties": {
      "results": [{
        "content": "string (匹配的文本片段)",
        "source": "string (源文件相对路径)",
        "title": "string (所属章节标题)",
        "score": "number (相似度 0-1)",
        "tags": ["string"]
      }],
      "query_time_ms": "number"
    }
  }
}
```

### 7.2 后端 API 端点映射

MCP Gateway 将调用以下现有后端 API 端点：

| MCP Tool | 后端 API 端点 | HTTP Method | 端口 |
|---------|--------------|-------------|------|
| `get_market_status` | `/api/v1/market/{symbol}/status` | GET | 8088 |
| `get_signals` | `/api/v1/signals/active` | GET | 8088 |
| `get_strategies` | `/api/v1/strategies/match` | GET | 8088 |
| `get_active_alerts` | `/api/v1/alerts/active` | GET | 8088 |
| `get_trade_history` | `/api/v1/trades/history` | GET | 8088 |
| `get_indicator_values` | `/api/v1/indicators/{symbol}` | GET | 8088 |
| `search_knowledge` | 向量数据库直接查询（非后端 API） | - | - |

### 7.3 WebSocket 消息格式（未来升级）

当前阶段使用 HTTP 轮询，未来升级为 WebSocket 时的消息格式预留：

```json
{
  "type": "signal_event",
  "payload": {
    "signal_id": "sig_20260131_001",
    "symbol": "BTCUSDT",
    "signal_type": "H2",
    "confidence": 78,
    "price": "43250.00",
    "timestamp": "2026-01-31T14:32:00Z"
  }
}
```

---

## 8. 验收标准

### 8.1 FR-1 验收标准：MCP Gateway 服务

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-1.1 | CLAWDBOT 能通过 MCP 协议发现所有 7 个 Tool | 启动 MCP Server，检查 Tool 列表输出 |
| AC-1.2 | 每个 Tool 返回的 JSON 格式符合定义的 Schema | 逐一调用每个 Tool，验证返回结构 |
| AC-1.3 | 无效 API Key 调用被拒绝，返回 401 错误 | 使用错误 Key 调用，验证拒绝 |
| AC-1.4 | 超出速率限制时返回 429 错误和 `retry_after` | 快速连续调用超过限制，验证限流 |
| AC-1.5 | 后端服务不可用时返回友好错误信息，不崩溃 | 停止后端服务后调用 Tool，验证降级 |
| AC-1.6 | 审计日志记录所有调用（时间、Tool、参数、状态） | 执行多次调用后检查日志文件 |

### 8.2 FR-2 验收标准：知识库向量检索

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-2.1 | 2600+ Obsidian 笔记全部成功索引，无遗漏 | 对比文件数和索引记录数 |
| AC-2.2 | 中文查询"主要趋势反转三个条件"返回 MTR 相关内容（top-3 相关度 > 0.7） | 执行查询，验证结果相关性 |
| AC-2.3 | 英文查询"MTR conditions"返回同一批 MTR 内容 | 执行英文查询，对比中文结果 |
| AC-2.4 | 修改一篇笔记后，5 秒内向量索引自动更新 | 修改文件，等待 5 秒后查询验证内容更新 |
| AC-2.5 | 标签过滤 `#pa+strategy` 只返回策略相关笔记 | 带标签查询，验证结果文件路径 |
| AC-2.6 | 检索延迟 < 2 秒（本地环境） | 10 次查询取平均值 |

### 8.3 FR-3 验收标准：Al Brooks Skill 优化

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-3.1 | 核心 SKILL.md 文件 token 数 <= 7K | 使用 tiktoken 计算 |
| AC-3.2 | 引用文件按主题正确拆分到 `references/` 目录 | 检查文件结构和内容完整性 |
| AC-3.3 | 10 个标准测试用例中，拆分后分析质量与拆分前一致 | 对比测试（人工评审） |
| AC-3.4 | 用户询问 MTR 时，AI 能自动加载 MTR 引用文件 | 实际对话测试 |

### 8.4 FR-4 验收标准：实时分析模式

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-4.1 | 输入 "100→98→99→97→98"，正确识别 H2 买入信号 | 提供标准价格序列，验证分析结果 |
| AC-4.2 | 输出包含完整六步分析（Always In、周期、Leg、信号质量、止损目标、建议） | 检查输出结构完整性 |
| AC-4.3 | 盈亏比 < 2:1 时输出包含警告标注 | 构造低盈亏比场景，验证警告 |
| AC-4.4 | 端到端响应时间 < 15 秒 | 计时测量 |
| AC-4.5 | 通过 `get_market_status` 自动获取实时数据并分析 | 指定品种触发自动分析 |

### 8.5 FR-5 验收标准：告警模式

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-5.1 | signal-service 产生 H2 信号后 30 秒内收到 AI 增强告警 | 计时测量 |
| AC-5.2 | 告警文案包含信号类型、AI 置信度、建议操作 | 检查告警内容 |
| AC-5.3 | 配置只关注 BTCUSDT 后，ETHUSDT 信号不推送 | 配置过滤后验证 |
| AC-5.4 | 同一信号 5 分钟内不重复推送 | 连续触发相同信号，验证去重 |

### 8.6 FR-6 验收标准：复盘模式

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-6.1 | 发送"复盘今日"后生成完整复盘报告 | 准备测试交易数据，执行复盘 |
| AC-6.2 | 报告包含 7 个标准章节（统计、逐笔、归因、评分、心理、建议、关注） | 检查报告结构 |
| AC-6.3 | 报告自动保存到 Obsidian Vault 正确路径 | 检查文件系统 |
| AC-6.4 | 报告 Markdown 格式在 Obsidian 中正常渲染 | 在 Obsidian 中打开验证 |

### 8.7 FR-7 验收标准：学习模式

| 编号 | 验收条件 | 验证方法 |
|------|---------|---------|
| AC-7.1 | 询问"什么是MTR"能返回准确的三条件解释 | 提问验证 |
| AC-7.2 | 回答中引用具体课程编号（如"第17课"） | 检查回答内容 |
| AC-7.3 | 知识库检索返回的知识片段与问题相关 | 检查引用来源 |
| AC-7.4 | 向量服务不可用时仍能基于内置知识回答 | 停止向量服务后测试 |

---

## 9. 术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| CLAWDBOT | CLAWDBOT | AI 助手框架，提供 Skill 运行环境和工具调用能力 |
| MCP | Model Context Protocol | 模型上下文协议，标准化 AI 与外部系统交互 |
| Skill | Skill | CLAWDBOT 中的 AI 人格/能力模块，通过 SKILL.md 定义 |
| Always In | Always In | Al Brooks 术语，表示当前市场的主导方向（多/空/不确定） |
| H1/H2 | High 1 / High 2 | 牛市回调中的第一/第二 Leg 结束信号 |
| L1/L2 | Low 1 / Low 2 | 熊市回调中的第一/第二 Leg 结束信号 |
| MTR | Major Trend Reversal | 主要趋势反转，需满足三个条件：破线、回望<1/3、强突破 |
| TR | Trading Range | 交易区间，价格在水平区间内震荡 |
| TTR | Tight Trading Range | 紧交易区间，窄幅横盘 |
| BO | Breakout | 突破 |
| MM | Measured Move | 等距测量目标 |
| 交易者方程 | Trader's Equation | 期望值 = (胜率 x 收益) - (败率 x 风险) |
| 80% 规则 | 80% Rule | 80%的突破/反转尝试会失败 |
| BLSH | Buy Low Sell High | 区间交易策略：低买高卖 |
| TBTL | Ten Bars Two Legs | 10根K线2条Leg的目标 |

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-01-31 | 初始版本，包含完整功能需求和验收标准 | Mitchell / Claude Code |

---

**文档状态**: 等待评审
**下一步**: 由干系人评审确认后，进入技术设计阶段
