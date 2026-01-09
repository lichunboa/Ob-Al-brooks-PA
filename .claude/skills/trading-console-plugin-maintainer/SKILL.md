---
name: trading-console-plugin-maintainer
description: This skill should be used when maintaining, upgrading, or UI-polishing the Obsidian native plugin console (TypeScript/React) at `.obsidian/plugins/al-brooks-console` for the 🦁 AL-Brooks 交易员控制台. It focuses on safe edits, build gating (`npm run build`), parity with v5.0 UX, and preventing regressions in the huge `Dashboard.tsx`.
---

# 🛠️ Trading Console Plugin Maintainer（原生插件控制台维护/升级）

## 目标

- 维护 Obsidian 原生插件控制台（TypeScript + React），确保：
  - **功能不丢**（尤其是对照 v5.0 的模块/入口）
  - **只做必要变更**（不引入额外 UX）
  - **每次改动都能 build**（门禁：`npm run build`）
  - **可回滚、可定位**（避免在超大文件里“迷路”）

## 何时触发本 Skill

- 修复插件控制台报错、TS/TSX 编译失败、运行时报错
- 调整控制台信息架构/页面布局（“UI 整理但不动功能”）
- 迁移/合并模块入口（例如把“每日行动”并入“交易中心”）
- 升级依赖、调整构建配置、处理 Obsidian API 变动
- 需要在 `.obsidian/plugins/al-brooks-console` 下做任何代码修改

## 关键约束（硬规则）

- 保持 UX 合同：实现“被描述的 UX”，不新增页面/弹窗/筛选/动画。
- 不删除功能：允许“换入口/换位置”，不允许“砍掉逻辑”。
- 不做无关重构：不要趁机重命名/抽组件/大规模格式化。
- 每个结构性改动后必须通过构建：`cd .obsidian/plugins/al-brooks-console && npm run build`。

## Repo 导航（高频路径）

- 插件根目录：`.obsidian/plugins/al-brooks-console/`
- 主控制台 UI（超大文件，谨慎编辑）：`.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx`
- 核心逻辑/索引：`.obsidian/plugins/al-brooks-console/src/core/*`
- 集成能力（Tasks/QuickAdd 等）：`.obsidian/plugins/al-brooks-console/src/integrations/*`
- 构建门禁：`npm run build`（tsc + esbuild）

## 标准维护工作流（强制按顺序）

### 0) 先读“自进化记忆”

- 读取：`memory/system_evolution.md`
- 目的：复用过去踩坑经验（特别是 Dashboard 大改、Tasks 集成、UI 条件渲染嵌套）

### 1) 明确变更类型（只选一种）

- UI 归类/移动入口（不动逻辑）
- Bug 修复（尽量最小 diff）
- 依赖/构建升级（优先锁住输出与行为）

输出：用 3–7 条 bullet 写出“要改什么、不改什么”。

### 2) 建立可回滚锚点

- 确认当前在正确分支（例如 `feature/ui-polish`）
- 确认 git 能看到改动（`git status`）
- 在超大文件编辑前：先用搜索定位锚点（标题文案、模块边界）

### 3) 只做一个“可验证”的小步改动

- 在 `Dashboard.tsx` 中编辑时：
  - 优先用稳定模块标题作边界（例如 `📥 导出`、`⚔️ 交易中心`）
  - 避免一次性大段移动导致重复块/残留块
  - 每次只完成一个目标：例如“移除一个重复 Actions 块”或“改一个条件渲染”

### 4) 立即跑构建门禁

- 执行：`cd .obsidian/plugins/al-brooks-console && npm run build`
- 若失败：只修复本次引入的问题；不要顺手修其它无关问题。

### 5) 变更完成后补记录（必须写）

- 更新：`memory/system_evolution.md`
  - 写入“这次学到的坑/约束/稳定锚点/容易错的结构”
- 更新：`references/changelog.md`
  - 记录“变更目的、涉及文件、验证方式、潜在回滚点”

## Dashboard.tsx（超大文件）专项规则

- 避免“半截补丁”：任何删除/替换都必须包含完整起止边界。
- 处理重复块：
  - 先全局搜索模块标题（例如 `✅ 每日行动`）统计出现次数
  - 逐个定位：读取命中附近 50–150 行确认所属页面（trading/manage）
  - 删除时用“前后稳定锚点”夹住（例如从 `✅ 每日行动` 到 `📥 导出`）
  - 删除后再次搜索，直到只剩目标位置
- 处理条件渲染：
  - 禁止把 learn 嵌到 analytics 之类的错误层级
  - 合并分支时优先改为“顺序渲染”（减少三元/嵌套）

## 集成能力（Tasks / QuickAdd / 命令）

- 始终走 capability 检测（例如 `can("tasks:open")`）
- 集成缺失时：渲染提示文案，不要隐藏整个模块
- 对外部命令调用：统一走 `action()`/`runCommand()` 体系

## v5 UI 优点提炼（基于截图，2026-01-05）

目标：不照抄视觉“皮肤”，而是复用 **信息层级 + 结构节奏 + 模块语义**，并且保持插件侧硬约束（Obsidian 主题中性色 + v5 语义色不改 + 小步可回滚 + build 门禁）。

### 1) 信息层级（为什么 v5 看起来“更高级”）

- **单页里只有 3 个主层级**：
  - Page 标题（图标 + 模块名）
  - 主卡片（核心任务/核心状态，一眼抓住）
  - 次级区块（明细/列表/建议，辅助决策）
- **关键数字被“隔离”出来**：KPI 用统一尺寸的小卡/徽章，数字大但不吵，标签小且灰。
- **动作按钮有明确优先级**：一个主 CTA（通常是整行/满宽），其它动作弱化成次按钮或链接。

### 2) 模块边界（为什么 v5 不乱）

- **卡片不是堆叠，而是“卡片容器 + 内部分区”**：容器负责主背景/边界；内部用轻分隔/留白做节奏。
- **同类信息使用“网格”而不是“列表”**：例如 KPI 统一为 5 个并列 tile，视觉上更稳定。
- **每个模块都有“可扫描的左侧锚点”**：小图标/标题条/关键标签（如 Live/Demo）让用户快速定位。

### 3) 视觉语言（在不引入新主题色的前提下可迁移的部分）

- **对比靠“明度/层级”而不是靠“线条/阴影”**：边框细、阴影轻；更多用背景层级（primary/secondary/hover）。
- **语义色只用于“点状强调”**：标签/徽章/关键数字/提示 icon；大面积底色谨慎。
- **文字更精致的关键**：标题不靠巨大字号，而靠字重 + 间距 + 组块。

## 分模块落地顺序（讨论确认后按此迭代）

每次只做一个模块的“结构 + 层级”改造：完成 → build → 截图对比 → 写入经验 → 再进入下一模块。

1. Trading Hub（交易中心）

- 目标：做出 v5 那种“主卡片 + KPI tile + 最近记录 + 主 CTA”的结构节奏。
- 验收：一眼能看到今日状态、策略助手、最近记录、下一步动作。

2. Analytics Hub（数据中心）

- 目标：账户概览卡（核心数字 + account badge）+ 日历热力（弱化边框、强化选中态）+ 趋势图容器。
- 验收：数据密度高但不乱，读数路径明确。

3. Learning（学习模块）

- 目标：一张“记忆核心”主卡 + 复习 CTA；其余为次级卡（课程地图/策略仓库）。
- 验收：复习路径突出、其余信息不抢。

## 迁移时的“硬规则”补充（避免跑偏）

- 不追求渐变/玻璃拟态本身；优先迁移 **布局节奏、层级、CTA 优先级、KPI 栅格一致性**。
- 中性色必须跟随 Obsidian 变量；语义色保持既有 v5 palette（不新增色值）。
- 不一次性“全局换肤”；先做 1 个模块到位，再复制模式到下一个模块。

## 通用型 UI 设计方案（每个模块都适用）

这是一套“结构节奏 + 可复用 class”的通用骨架。目标是让每个模块都长得像同一个系统，而不是四个不同页面拼在一起。

### 通用结构（顺序固定）

1. **模块标题条**（Module Header）

- 左侧：图标 + 中文标题
- 右侧/同一行：英文副标题或简短说明（弱化）
- 作用：给用户“我在哪”与扫描锚点

2. **主卡片**（Primary Card）

- 承载模块最重要的状态与动作
- 卡内用分区标题、留白节奏，不靠粗边框/重阴影

3. **KPI 网格**（KPI Tiles）

- 用 grid 对齐（例如 3 列 + 2 列），保证视觉稳定
- KPI tile 内：label 小且灰，value 大但不吵

4. **主 CTA**（Primary CTA）

- 每个模块最多 1 个“主 CTA”（可以是整行按钮）
- 其它动作降级为次按钮/文本链接

5. **列表/明细**（Secondary）

- 放在主卡之后，避免跟 KPI 抢注意力

### 可复用 class（已在 GlobalStyles 中实现）

- `.pa-module-header` / `.pa-module-title` / `.pa-module-subtitle`
- `.pa-card`（模块主容器）
- `.pa-section-title`（卡内分区标题）
- `.pa-kpi-grid.cols-3` / `.pa-kpi-grid.cols-2`
- `.pa-kpi-grid` + `.pa-kpi-grid-3` / `.pa-kpi-grid-2`
- `.pa-kpi-tile` / `.pa-kpi-label` / `.pa-kpi-value` / `.pa-kpi-value.lg`

### 强约束（与主题/语义色一致）

- 中性色：只用 Obsidian 主题变量（background/text/border/hover）。
- 语义色：只用于 KPI value/徽章/小图标点强调；不做大面积铺底。
- Typography：标题不靠超大字号；靠字重 + 间距 + 组块。

## 验收清单（执行前后都要过一遍）

- UI：用户要求的入口归类完成（且没有新增 UX）
- 功能：原有模块仍可访问（只是位置变了也算）
- 搜索：关键关键词无残留（例如移除页面后不再出现 `"daily"`）
- 构建：`npm run build` 通过

（更细 checklist 见：`references/checklists.md`）

## 常见坑位（快速排雷）

- 在 `Dashboard.tsx` 删除块时留下残破 JSX → 300+ 解析错误
- 条件渲染三元嵌套导致页面被错误包裹
- 把带作用域的函数（如 `openFile`）插进不正确的组件边界（例如 ErrorBoundary）
- 管理页重复块：删了一份还有一份（必须用“命中数 == 目标数”验收）

（更细坑位见：`references/gotchas.md`）

## Skill 自升级协议（让它能跟着插件演进）

- 每次完成插件控制台相关任务后：
  - 追加 1–5 条到 `memory/system_evolution.md`
  - 追加 1 条到 `references/changelog.md`
- 每当发现“重复出错/重复耗时”的步骤：
  - 把它写成 checklist 条目（`references/checklists.md`）
  - 或写成明确禁令/模式（`references/gotchas.md`）
- 当目录结构/构建命令变化时：
  - 立即更新本文件“Repo 导航”和“构建门禁”两节

## 资源

- `memory/system_evolution.md`：强制读取/强制写入的经验库
- `references/checklists.md`：可复制执行的检查清单
- `references/gotchas.md`：高频坑位与处理模式
- `references/changelog.md`：skill 与插件版本演进记录
