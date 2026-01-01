# Tasks — al-brooks-console

> 状态标记：`[ ]` 待做，`[-]` 进行中，`[x]` 完成

## 1. 初始化插件骨架（TS + esbuild）
- [ ] 创建 Obsidian 插件工程 `al-brooks-console`（TypeScript + esbuild）。
- [ ] 配置开发/生产构建脚本，确保打包输出符合 Obsidian 插件规范。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Obsidian plugin scaffolding engineer
- Task: Scaffold `al-brooks-console` plugin with TypeScript and esbuild, minimal dependencies.
- Restrictions: Do not alter existing Dataview scripts. Do not introduce extra features beyond MVP.
- Leverage: Follow Obsidian plugin patterns; keep build simple.
- Requirements: FR-1, NFR (stability)
- Success: Plugin loads, builds, and can be enabled without errors.

## 2. Hello World：ItemView 渲染 React
- [ ] 注册一个 ItemView + 命令打开视图。
- [ ] 在 ItemView 内挂载 React root，显示简单文本与版本号。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: UI integration engineer
- Task: Implement ItemView that renders a React component.
- Restrictions: No routing, no extra panels.
- Leverage: Obsidian workspace/view APIs.
- Requirements: FR-1
- Success: Opening the view consistently renders React.

## 3. TradeIndex：初始扫描与识别规则（tag #PA/Trade）
- [ ] 实现 TradeIndex 初始扫描：遍历 markdown files，读取 metadataCache tags/frontmatter。
- [ ] 实现识别规则：tag `#PA/Trade`。
- [ ] 实现 FieldMapper：pnl/ticker 双语映射 + 安全解析。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Data indexing engineer
- Task: Build TradeIndex + FieldMapper MVP.
- Restrictions: Read-only; do not write to vault.
- Leverage: app.vault, app.metadataCache.
- Requirements: FR-2, FR-4, FR-5
- Success: TradeIndex returns correct TradeRecord[] for tagged trade notes.

## 4. 增量更新：vault 与 metadata 事件监听
- [ ] 监听 `modify/rename/delete` + `metadataCache.changed`。
- [ ] 增量更新索引并 debounce。
- [ ] 对外发布 `changed` 事件（EventEmitter/Observable）。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Obsidian event-driven systems engineer
- Task: Add real-time incremental updates.
- Restrictions: Avoid full rescans on every event.
- Leverage: existing auto-refresh concept in pa-core.js (design inspiration only).
- Requirements: FR-3, NFR performance
- Success: Editing/renaming/moving trade notes updates dashboard automatically.

## 5. MVP 仪表盘 UI：统计卡片 + 交易列表
- [ ] 计算 TradeStats（netProfit、count、winRate）。
- [ ] React UI：三张统计卡片 + 最近交易列表。
- [ ] 点击交易项打开对应文件。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: React UI engineer for Obsidian
- Task: Implement MVP dashboard UI driven by TradeIndex events.
- Restrictions: No charts, no strategy logic.
- Leverage: Obsidian API to open files.
- Requirements: FR-1, FR-2
- Success: UI updates live; list items open notes.

## 6. 口径统一：胜率以 pnl 为主，outcome 为兜底
- [ ] 实现统一胜率计算函数。
- [ ] 在 UI 与统计中只使用该口径。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Data correctness engineer
- Task: Standardize winrate calculation.
- Restrictions: Must not silently change meaning; document behavior.
- Leverage: Existing behavior in pa-core.js stats/liveWin and buildCoachFocus.
- Requirements: FR-6
- Success: Consistent winrate across all displays.

## 7. 对照与验收：保留 Dataview 版作为基准
- [ ] 写一份手工验收清单（基于 requirements AC）。
- [ ] 在 vault 中选择样本交易，核对 count/netProfit/winRate。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: QA engineer
- Task: Create a practical MVP validation checklist.
- Restrictions: No automation required.
- Leverage: Existing Dataview console as baseline.
- Requirements: AC-1..AC-6
- Success: Clear, repeatable manual validation steps.

## 8. 性能与稳定性优化（对比旧 Dataview 控制台的痛点）
- [ ] 启动性能：实现索引启动阶段分批（chunked）构建 + 进度状态（UI 可显示“正在建立索引/已就绪”）。
- [ ] 移动端友好：为 TradeIndex 增加“范围收敛”策略（只扫描匹配 tag 的文件；避免全库扫描）；必要时提供可配置的 folder allowlist（如 `Notes/`、`Trades/`）。
- [ ] 列表性能：交易列表采用虚拟列表（virtualized list），避免大量 DOM 渲染导致卡顿。
- [ ] 事件风暴保护：增量更新队列（coalesce）+ 最大频率限制（debounce/throttle），避免频繁编辑触发 UI 抖动。
- [ ] 崩溃隔离：React error boundary + 数据层错误上报（至少 console.warn）+ “重建索引”按钮（仅重建内存，不写 vault）。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Performance & reliability engineer
- Task: Add the minimal performance/stability upgrades required to eliminate legacy pain points (flicker, full rescans, mobile OOM).
- Restrictions: No new UX beyond a basic loading/ready/error state and a rebuild action.
- Leverage: Incremental indexing + React rendering.
- Requirements: NFR (performance, stability)
- Success: Large vault remains responsive; edits do not cause full rescans; UI remains stable.

## 9. 迁移“精华逻辑”：Review Hints（`buildReviewHints`）
- [ ] 从现有引擎迁移 `buildReviewHints` 的规则集到纯 TS 模块（不依赖 Dataview）。
- [ ] 定义 `ReviewHint` 类型与生成条件（例如：亏损复盘、盈利复盘、错误复盘、市场环境一句话等）。
- [ ] 在 TradeIndex 的 TradeRecord 中保留 `reviewHints` 字段（或可派生字段），并在 UI 中最小化展示（例如：今日/最近交易的复盘提示）。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Business logic migration engineer
- Task: Port the existing review algorithm (`buildReviewHints`) into the native plugin data pipeline.
- Restrictions: Keep behavior compatible with Dataview baseline; do not add new hint categories without approval.
- Leverage: Existing pa-core.js logic as reference only.
- Requirements: FR (coaching/review quality), parity
- Success: Same trades produce the same (or explainably equivalent) review hints.

## 10. 迁移“精华逻辑”：Context → Strategy Matching（策略推荐）
- [ ] 实现 `StrategyIndex`（若未在前序任务中完成到可用程度）：支持 `byPattern/lookup/byName/list`。
- [ ] 实现 `StrategyMatcher`：输入 `market_cycle + patterns/setup/signal`，输出推荐策略卡（先做最小匹配：market_cycle + isActiveStrategy）。
- [ ] 支持“单一信源”：策略仓库扫描/解析只在一个地方做（避免旧系统里 view 自扫导致口径漂移）。
- [ ] 在 UI 中加一个最小的“今日策略推荐”区域（仅展示 3-6 个策略链接）。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Strategy engine engineer
- Task: Implement context-strategy matching that mirrors the Dataview console’s core value.
- Restrictions: No extra dashboards; keep it minimal.
- Leverage: `daily.todayJournal.market_cycle` + `strategyIndex`.
- Requirements: FR (context matching)
- Success: Given the same market cycle, recommendations are stable and explainable.

## 11. 外部插件集成（Adapter Pattern，确保可随官方升级）

> 目标：集成“卫星插件”能力，但不把它们变成硬依赖。
> 升级策略：只用稳定入口（Commands / 公开 API）；使用 feature detection；适配器独立封装；缺失时优雅降级。

### 11.1 集成清单（基于当前 vault 已安装插件）
- [ ] QuickAdd（id: `quickadd`）：Console 的“New Trade”按钮触发 QuickAdd command（例如 `quickadd:choice:New Live Trade` 等），若命令不存在则隐藏/提示。
- [ ] Spaced Repetition（id: `obsidian-spaced-repetition`）：提供“开始复习”入口；MVP 用命令 `obsidian-spaced-repetition:srs-review-flashcards`；深度队列读取作为后续可选任务（需要 API 且需版本守护）。
- [ ] Tasks（id: `obsidian-tasks-plugin`）：先做“轻集成”（打开 Tasks 视图/执行命令/跳转到任务页）；复杂查询与渲染后置。
- [ ] Templater（id: `templater-obsidian`）：不直接耦合（通常由 QuickAdd/模板链路使用）；仅做存在性检测/诊断信息。
- [ ] Metadata Menu（id: `metadata-menu`）：可作为数据质量工具入口（打开/跳转到 metadata 管理），不把它作为 TradeIndex 的依赖。
- [ ] Dataview/Datacore（id: `dataview` / `datacore`）：迁移期保留为 baseline；新控制台不依赖其索引；仅用于对照/调试（例如“检测到 Dataview 已安装”并提示可用基准页）。

### 11.2 技术任务（实现方式）
- [ ] 实现 `PluginIntegrationRegistry`：检测插件是否启用、版本号、可用 capabilities（命令存在/公开 API 存在）。
- [ ] 为每个集成写一个 `*Adapter`（QuickAddAdapter/SrsAdapter/TasksAdapter/MetadataMenuAdapter），统一接口：`isAvailable()` / `getCapabilities()` / `run(action)`。
- [ ] 适配器必须：
	- 优先走 `app.commands.executeCommandById`（命令存在性通过 `app.commands.findCommand` 检测）
	- 仅当明确有稳定公开 API 时才调用 `app.plugins.plugins[id].api`（并加版本守护与 try/catch）
	- 缺失时不报错：UI 自动降级

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Integration engineer
- Task: Integrate external plugins via adapters that survive upstream upgrades.
- Restrictions: No hard dependency; no vendoring other plugins’ code.
- Leverage: Commands as stable integration points.
- Requirements: NFR stability, migration safety
- Success: Console works without these plugins; when present, buttons/actions light up.

## 12. 旧系统对照增强：把 View 依赖矩阵纳入验收
- [ ] 将当前已整理的依赖矩阵作为验收输入：`🦁 交易员控制台 (Trader Command)/📋 原生插件迁移-View依赖矩阵.md`。
- [ ] 在验收清单中加入“外部命令存在性/降级行为”检查（QuickAdd/SRS/Dataview）。
- [ ] 加入“写入风险”提示：旧 `pa-view-manager.js` 会批量写 frontmatter，原生插件 MVP 不实现该能力。

_Prompt:
Implement the task for spec al-brooks-console, first run spec-workflow-guide to get the workflow guide then implement the task:
- Role: Migration QA engineer
- Task: Expand validation checklist using the view dependency matrix.
- Restrictions: Keep it manual; no automation required.
- Leverage: Existing baseline report and dependency matrix.
- Requirements: parity, migration safety
- Success: Clear checklist covering data parity + integration downgrade behaviors.
