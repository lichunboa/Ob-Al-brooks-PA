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
