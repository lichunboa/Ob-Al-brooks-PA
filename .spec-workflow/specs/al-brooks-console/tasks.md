# Tasks Document

> 重要：你选择了“B：所有任务都可分发给不同 AI”。因此本 tasks 文档额外包含 **并行开发一致性协议**。

## 并行开发一致性协议（强制）

- **单一信源（SSOT）**：以下能力只能有一份实现，且必须被后续任务复用：
	- 类型契约：`src/core/contracts.ts`
	- 字段归一化：`src/core/field-mapper.ts`
	- 交易索引：`src/core/trade-index.ts`
	- 统计口径：`src/core/stats.ts`
	- 集成适配器：`src/integrations/*Adapter.ts`
- **禁止重复造轮子**：任何任务不得新建第二套 TradeIndex/FieldMapper/Stats/Adapter；如果发现缺能力，只能扩展 SSOT 文件。
- **开工前必须做**：
	- 运行 `spec-workflow-guide`，阅读 `requirements.md` + `design.md`。
	- 在 `.spec-workflow/specs/al-brooks-console/Implementation Logs/` 中搜索关键词（至少：`TradeIndex` / `FieldMapper` / `Stats` / `Adapter`），避免重复实现。
- **收工必须做**：完成任务后必须调用 `log-implementation`，在 artifacts 里写清新增/修改的类型、函数、文件路径，供其他 AI 复用。

## 你当前选择的强交互优先级（用于 Advanced 阶段落地）

你输入的顺序为：**3、1、2、4**。本 tasks 将其映射为：
- (3) **策略卡片维护/治理**：策略仓库笔记的字段与枚举值归一、缺省字段补齐（落在任务 18）。
- (1) **交易笔记批量归一**：Trade notes 的字段名/同义值归一（落在任务 18）。
- (2) **Inspector 一键修复**：Inspector 只读发现问题，但允许“一键生成修复方案 + 交给 Manager 执行”（任务 17 → 18）。
- (4) **Course / Memory / SRS 参数调整**：通过插件设置调整关键参数并即时影响推荐与入口（落在任务 19）。



- [x] 1. MVP：核心契约（SSOT）+ 初始化插件骨架（TS + esbuild）
	- 创建 Obsidian 插件工程 `al-brooks-console`（TypeScript + esbuild）。
	- 配置开发/生产构建脚本，确保打包输出符合 Obsidian 插件规范。
	- 建立 **SSOT 文件骨架**（先空实现也可，但必须先落位，后续任务只能复用/扩展，不得另起炉灶）：
		- `src/core/contracts.ts`：`AccountType`、`TradeRecord`、`TradeStats`、`NormalizedTag`、`TradeId` 等类型。
		- `src/core/field-mapper.ts`：字段别名归一化入口（pnl/ticker 双语等）。
		- `src/core/stats.ts`：统计口径与胜率计算函数签名。
		- `src/core/trade-index.ts`：TradeIndex 对外接口签名（`getAll()`/`onChanged()`/`dispose()`）。
	- _Leverage: Follow Obsidian plugin patterns; keep build simple. Create SSOT file stubs for core contracts._
	- _Requirements: FR-1, FR-2, FR-4, FR-6, NFR-stability._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Obsidian plugin scaffolding engineer | Task: Scaffold `al-brooks-console` plugin with TypeScript and esbuild, AND create the SSOT core contract file stubs (contracts/field-mapper/stats/trade-index) that all later tasks must reuse. | Restrictions: Do not alter existing Dataview scripts. Do not introduce duplicate implementations of TradeIndex/FieldMapper/Stats anywhere else. | Success: Plugin builds and loads; SSOT files exist and export the initial types/interfaces used by later tasks._


- [x] 2. MVP：Hello World（ItemView 渲染 React）
	- 注册一个 ItemView + 命令打开视图。
	- 在 ItemView 内挂载 React root，显示简单文本与版本号。
	- _Leverage: Obsidian workspace/view APIs._
	- _Requirements: FR-1._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: UI integration engineer | Task: Implement an ItemView that renders a React component. | Restrictions: No routing, no extra panels. | Success: Opening the view consistently renders React._


- [x] 3. MVP：TradeIndex 初始扫描与识别规则（tag 为主 + fileClass 辅助）
	- 实现 TradeIndex 初始扫描：遍历 markdown files，读取 metadataCache tags/frontmatter。
	- 实现识别规则：tag `#PA/Trade`/`PA/Trade` 归一化后判断（tag 为主）；`fileClass` 命中交易类时也应识别为交易笔记（fileClass 辅助，默认可配置启用/禁用）。
	- 实现 FieldMapper：pnl/ticker 双语映射 + 安全解析。
	- _Leverage: app.vault, app.metadataCache. MUST implement in `src/core/trade-index.ts` and `src/core/field-mapper.ts`, and reuse types from `src/core/contracts.ts`._
	- _Requirements: FR-2, FR-4, FR-5._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Data indexing engineer | Task: Implement initial scan + identification rules (tag primary + fileClass secondary) and field mapping. | Restrictions: Read-only; do not write to vault. Do not create new TradeRecord/TradeStats types elsewhere—reuse `src/core/contracts.ts`. | Success: `TradeIndex.getAll()` returns correct `TradeRecord[]` for tagged trade notes._


- [x] 4. MVP：增量更新（vault 与 metadata 事件监听）
	- 监听 `modify/rename/delete` + `metadataCache.changed`。
	- 增量更新索引并 debounce。
	- 对外发布 `changed` 事件（EventEmitter/Observable）。
	- _Leverage: Implement in `src/core/trade-index.ts` only; publish change notifications from the same TradeIndex instance used by UI._
	- _Requirements: FR-3, NFR-performance._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Obsidian event-driven systems engineer | Task: Add real-time incremental updates and a debounced change signal on TradeIndex. | Restrictions: Avoid full rescans on every event. Do not introduce a second event bus or a second TradeIndex; UI must subscribe to this one. | Success: Editing/renaming/moving trade notes updates dashboard automatically._


- [x] 5. MVP：仪表盘 UI（统计卡片 + 交易列表）
	- 计算 TradeStats（netProfit、count、winRate）。
	- 统计必须按 `account_type` 分开计算（Live/Demo/Backtest），并同时提供一个“汇总（All）”。
	- React UI：三张统计卡片 + 最近交易列表。
	- 点击交易项打开对应文件。
	- _Leverage: MUST compute stats via `src/core/stats.ts` and read data via `src/core/trade-index.ts`. Use Obsidian API to open files._
	- _Requirements: FR-1, FR-2._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: React UI engineer for Obsidian | Task: Implement MVP dashboard UI driven by TradeIndex events and Stats SSOT. | Restrictions: No charts, no strategy logic. Must not re-scan vault or compute stats locally in the component; call `src/core/stats.ts`. | Success: UI updates live; list items open notes; per-account_type + All summary shown._


- [x] 6. MVP：口径统一（胜率以 pnl 为主，outcome 为兜底）
	- 实现统一胜率计算函数。
	- 在 UI 与统计中只使用该口径。
	- _Leverage: Implement in `src/core/stats.ts` only; pa-core.js behavior as reference only._
	- _Requirements: FR-6._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Data correctness engineer | Task: Standardize winrate calculation in the Stats SSOT (pnl primary, outcome fallback). | Restrictions: Must not silently change meaning; document behavior in code/docs. Must not add alternate winrate calculators elsewhere. | Success: Consistent winrate across all displays via `src/core/stats.ts`._


- [x] 7. MVP：对照与验收（保留 Dataview 版作为基准）
	- 写一份手工验收清单（基于 requirements AC）。
	- 在 vault 中选择样本交易，核对 count/netProfit/winRate。
	- _Leverage: Existing Dataview console as baseline._
	- _Requirements: AC-1..AC-6._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: QA engineer | Task: Create a practical MVP validation checklist. | Restrictions: No automation required. | Success: Clear, repeatable manual validation steps._


- [x] 8. Next：性能与稳定性优化（对比旧 Dataview 控制台的痛点）
	- 启动性能：实现索引启动阶段分批（chunked）构建 + 进度状态（UI 可显示“正在建立索引/已就绪”）。
	- 移动端友好：TradeIndex 扫描范围收敛（只扫描匹配 tag 的文件；必要时支持 folder allowlist）。
	- 列表性能：交易列表采用虚拟列表（virtualized list），避免大量 DOM 渲染导致卡顿。
	- 事件风暴保护：增量更新队列（coalesce）+ 最大频率限制（debounce/throttle），避免频繁编辑触发 UI 抖动。
	- 崩溃隔离：React error boundary + 数据层错误上报（至少 console.warn）+ “重建索引”按钮（仅重建内存，不写 vault）。
	- _Leverage: Incremental indexing + React rendering._
	- _Requirements: NFR-performance, NFR-stability._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Performance & reliability engineer | Task: Add minimal performance/stability upgrades to eliminate legacy pain points (flicker, full rescans, mobile OOM). | Restrictions: No new UX beyond basic loading/ready/error state and a rebuild action. | Success: Large vault remains responsive; edits do not cause full rescans; UI remains stable._


- [x] 9. Next：迁移 Review Hints（`buildReviewHints`）
	- 迁移 `buildReviewHints` 规则到纯 TS 模块（不依赖 Dataview）。
	- 定义 `ReviewHint` 类型与生成条件。
	- 在 UI 中最小化展示（例如：最近交易的复盘提示）。
	- _Leverage: pa-core.js logic as reference only (no Dataview dependency in implementation)._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Business logic migration engineer | Task: Port the existing review algorithm (`buildReviewHints`) into the native plugin data pipeline. | Restrictions: Keep behavior compatible with Dataview baseline; do not add new hint categories without approval. | Success: Same trades produce the same (or explainably equivalent) review hints._


- [ ] 10. Next：迁移 Context → Strategy Matching（策略推荐）
	- 实现 `StrategyIndex`（单一信源）：支持 `byPattern/lookup/byName/list`。
	- 实现 `StrategyMatcher`：输入 `market_cycle + patterns/setup/signal` 输出推荐策略卡（先做最小匹配）。
	- UI 增加最小“今日策略推荐”（仅 3-6 个策略链接）。
	- _Leverage: `daily.todayJournal.market_cycle` + StrategyIndex single source of truth._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Strategy engine engineer | Task: Implement context-strategy matching that mirrors the Dataview console’s core value. | Restrictions: No extra dashboards; keep it minimal. | Success: Given the same market cycle, recommendations are stable and explainable._


- [x] 11. Next：外部插件集成（Adapter Pattern，确保可随官方升级）
	- 集成原则：优先 Commands；仅调用公开稳定 API；禁止私有耦合；缺失/禁用/升级破坏时自动降级且控制台仍可用。
	- MVP 集成清单：QuickAdd（New Trade）、Spaced Repetition（开始复习）、Tasks（打开视图/跳转）、Templater（仅检测）、Metadata Menu（仅入口）、Dataview/Datacore（仅对照提示）。
	- 技术实现：`PluginIntegrationRegistry` + 各 `*Adapter`（QuickAddAdapter/SrsAdapter/TasksAdapter/MetadataMenuAdapter），统一接口 `isAvailable()` / `getCapabilities()` / `run(action)`。
	- _Leverage: Commands as stable integration points; feature detection._
	- _Requirements: NFR-stability, migration safety._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Integration engineer | Task: Integrate external plugins via adapters that survive upstream upgrades. | Restrictions: No hard dependency; no vendoring other plugins’ code. | Success: Console works without these plugins; when present, buttons/actions light up._


- [x] 12. Next：旧系统对照增强（把 View 依赖矩阵纳入验收）
	- 将依赖矩阵作为验收输入：`🦁 交易员控制台 (Trader Command)/📋 原生插件迁移-View依赖矩阵.md`。
	- 在验收清单中加入“外部命令存在性/降级行为”检查（QuickAdd/SRS/Dataview）。
	- 加入“写入风险”提示：旧 `pa-view-manager.js` 会批量写 frontmatter，原生插件 MVP 不实现该能力。
	- _Leverage: Existing baseline report + view dependency matrix._
	- _Requirements: parity, migration safety._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Migration QA engineer | Task: Expand the validation checklist using the view dependency matrix, including downgrade behaviors. | Restrictions: Keep it manual; no automation required. | Success: Clear checklist covering data parity + integration downgrade behaviors._


- [ ] 13. Next：迁移 Trading Hub（今日汇总 + 快速开仓 + 近期 R 趋势）
	- 提供“交易中心”等价入口（可在同一 ItemView 内以分区/Tab 呈现）。
	- 今日汇总：今日 PnL/交易数/最近交易。
	- 快速开仓：通过 QuickAddAdapter 触发；缺失则降级。
	- 近期 R 值趋势条（Last 10/30），保留账户配色逻辑。
	- _Leverage: TradeIndex + Stats + QuickAddAdapter._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Console UI engineer | Task: Port Trading Hub core cards and actions (summary, quick open, R trend) into native view. | Restrictions: Keep UI minimal; reuse existing data sources; no heavy chart libs. | Success: Users can perform the same Trading Hub workflows as the Dataview console._


- [ ] 14. Next：迁移 Today（市场周期→策略推荐 + 进行中交易策略助手）
	- 读取 `daily.todayJournal.market_cycle`（或同义字段）驱动“今日推荐”。
	- 进行中交易识别（outcome 为空/未完结）并展示策略助手：patterns→策略卡→入场/风险/止损要点。
	- _Leverage: StrategyMatcher + TradeIndex fields (patterns/outcome)._ 
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Product feature engineer | Task: Port Today module behaviors (cycle-driven recommendations + in-progress trade assistant) into native UI. | Restrictions: Match legacy behavior first; avoid adding new assistant logic. | Success: Today view provides equivalent value to legacy Today module._


- [ ] 15. Next：迁移 Analytics 核心（账户/日历/资金曲线/归因排行）
	- 账户概览：Live/Demo/Backtest 与汇总 All。
	- 日历热力图（优先 Live，或可切换/汇总）。
	- 资金曲线（SVG/轻量实现，避免重型图表库）。
	- 策略归因/排行：复用 StrategyIndex（单一信源）。
	- _Leverage: TradeIndex + TradeStats + StrategyIndex._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Analytics engineer | Task: Implement the core analytics module with per-account_type stats, calendar, equity curve, and strategy attribution. | Restrictions: No heavy charting dependencies; keep render lightweight for mobile. | Success: Analytics provides the same core outputs as legacy hub analytics._


- [ ] 16. Next：迁移 Gallery（封面/截图瀑布流）
	- 支持 `cover` 字段解析：wikilink/markdown link/相对路径/资源路径，与旧 gallery 等价。
	- 提供“查看所有图表/截图”的等价入口（例如搜索 tag 或打开专用列表）。
	- _Leverage: Obsidian vault resource paths + existing cover conventions._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Media/gallery engineer | Task: Port the Gallery module: cover parsing + gallery listing without adding new UI complexity. | Restrictions: Avoid new theme/colors; keep to existing Obsidian UI primitives. | Success: Gallery shows the same cover/screenshot assets users rely on._


- [ ] 17. Advanced：迁移数据治理（Inspector + Schema Monitor）
	- 引入“健康度/异常列表”的只读能力（不改写笔记）。
	- 枚举白名单来源：`Templates/属性值预设.md`（或未来 schema 文件），支持同义值归一化（CN/EN）。
	- 支持跳转到具体文件与字段定位（至少打开文件）。
	- 支持对选中问题**生成修复方案（FixPlan）**（只生成、不写入），并可一键进入 Manager 预览/执行（见任务 18）。
	- _Leverage: Properties inventory/presets as source of enum truth._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Data quality engineer | Task: Implement read-only Inspector + Schema Monitor checks to surface missing/invalid metadata and consistency issues. | Restrictions: No writing to vault; only navigation. | Success: Users can find data quality issues at least as well as in legacy Inspector/Schema._


- [ ] 18. Advanced：迁移 Manager（高风险写入治理与批量操作）
	- 默认关闭写入能力，仅在明确确认后启用。
	- 写入白名单/预览/回滚策略（至少提供“预览将改哪些文件/哪些字段”）。
	- 批处理失败隔离：单文件失败不影响其它文件，并汇总报告。
	- 必须覆盖你当前的两类高频治理动作：
		- (1) 交易笔记批量归一：字段名/同义值/枚举值归一（复用 `FieldMapper`；输出预览与报告）。
		- (3) 策略卡片维护：对“策略仓库 (Strategy Repository)”范围内策略卡执行同义字段归一、枚举值归一、缺省字段补齐（同样先预览后写入）。
	- 必须支持接收 Inspector 的 FixPlan（任务 17）并在 Manager 内完成预览→二次确认→写入。
	- _Leverage: Obsidian file modification APIs + FieldMapper normalization rules._
	- _Requirements: parity, migration safety._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Safety-first tooling engineer | Task: Implement a guarded bulk edit manager with preview and safe defaults mirroring legacy manager capabilities. | Restrictions: Must be opt-in; must provide preview; no silent writes. | Success: Bulk edits are safe, transparent, and recoverable._


- [ ] 19. Advanced：迁移学习闭环（Course + Memory / SRS）
	- Course：课程矩阵 + 推荐下一节/建议复习（复用 course.hybridRec 的输出口径）。
	- Memory：SRS 指标（Total/Due/Mastery/Load）+ 快速复习入口 + 随机抽题。
	- 外部插件依赖通过 Adapter Pattern；缺失降级不影响交易看板。
	- (4) 支持在插件设置中调整少量关键参数（例如：推荐窗口、Due 阈值、随机抽题数量），且调整应即时影响 Course/Memory 展示与入口行为。
	- _Leverage: SrsAdapter + existing course recommendation logic reference._
	- _Requirements: parity._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Learning loop engineer | Task: Port Course + Memory (SRS) modules with adapter-based integration and safe degradation. | Restrictions: No hard dependency on SRS plugin; keep UX minimal. | Success: Users regain the learning/review workflows present in the Dataview console._


- [ ] 20. Advanced：导出与回归（插件索引快照，替代 pa-db-export.json）
	- 提供“导出索引快照”能力（JSON），用于回归对照与备份。
	- 导出内容至少包括：trades（归一化字段）、stats（分 account_type + all）、strategyIndex（若已实现）。
	- _Leverage: TradeIndex/Stats/StrategyIndex single sources of truth._
	- _Requirements: parity, migration safety._
	- _Prompt: Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Export & migration engineer | Task: Add an export action that outputs a stable JSON snapshot of the plugin index/stats for regression and backup (legacy pa-db-export intent). | Restrictions: Export must be read-only and must not modify notes; keep format stable and documented. | Success: User can export a JSON snapshot containing trades + per-account_type stats + All summary (and strategyIndex if available)._

## 阶段规划（执行顺序）

> 目标：先把“可用、稳定、可对照”的 MVP 做出来；随后**按模块逐个迁移旧控制台能力，最终做到不缺失任何功能**。

- **MVP（先跑通）**：1 → 2 → 3 → 4 → 6 → 5 → 7
- **Next（补齐核心模块）**：8 → 11 → 9 → 10 → 12 → 13 → 14 → 15 → 16
- **Advanced（治理/高风险/深度联动）**：17 → 18 → 19 → 20

## 功能对齐清单（Parity Checklist：旧控制台不缺失）

> 说明：下面每一项都要在原生插件中提供等价能力（UI/入口形式可不同，但功能不能丢）。

- Dashboard（统计卡片 + 交易列表）→ MVP（任务 5）
- TradeIndex（识别/解析/增量更新/事件）→ MVP（任务 3/4）
- Trading Hub（今日汇总 + 快速开仓 + 近期 R 条形图）→ Next（任务 13）
- Today（市场周期 → 推荐策略；进行中交易策略助手）→ Next（任务 14）
- Analytics Hub（账户/日历/资金曲线/策略归因等）→ Next（任务 15）
- Gallery（最新复盘封面/截图瀑布流）→ Next（任务 16）
- Playbook（策略仓库索引 + 今日推荐 + 策略表现）→ Next（任务 10 + 15 的一部分；或独立增强）
- Course（课程地图 + 推荐学习）→ Advanced（任务 19）
- Memory（SRS 入口 + Due/Mastery/负载 + 随机抽题）→ Advanced（任务 19）
- Inspector（健康评分/缺失字段/非法枚举/一致性检查）→ Advanced（任务 17）
- Schema Monitor（标签全景 + 最小必填异常修复台）→ Advanced（任务 17）
- Manager（属性管理器：批量写入/归一化/治理）→ Advanced（任务 18，需高风险防护）
- Export（导出 paData/插件内索引快照）→ Advanced（任务 20）
