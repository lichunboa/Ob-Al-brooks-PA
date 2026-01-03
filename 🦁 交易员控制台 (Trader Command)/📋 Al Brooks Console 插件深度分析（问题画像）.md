# 📋 Al Brooks Console 插件深度分析（问题画像）

> 目的：先把插件实现“长什么样、接口是什么、最可能的根因是什么”说清楚。
> 
> - 仅基于当前仓库内插件源码与导出快照/日志做分析
> - 不在本文直接改代码；修复方案与对比报告另文输出
> - 日期：2026-01-03

---

## 0. 插件在仓库里的位置

- 插件源码：`.obsidian/plugins/al-brooks-console/src/`
- 插件清单：`.obsidian/plugins/al-brooks-console/manifest.json`

插件入口：`.obsidian/plugins/al-brooks-console/src/main.ts`

---

## 1. 插件架构（从入口到 UI）

### 1.1 onload 做了什么

在 `onload()` 中：

- 初始化 3 个“数据源/索引器”
  - Trade Index：`ObsidianTradeIndex`
  - Strategy Index：`ObsidianStrategyIndex`
  - Today Context：`ObsidianTodayContext`
- 注册一个右侧视图：`ConsoleView`（React Dashboard）
- 注册打开控制台命令：`open-console`
- 目前注册了一个导出命令：`export-legacy-snapshot`（导出旧版兼容快照）

### 1.2 Dashboard 视图包含哪些子系统

从 `views/Dashboard.tsx` 的 import 可以看出插件试图把 v5.0 的多数能力“原生化”到 React 视图里：

- 交易统计：`core/stats`
- 复盘提示：`core/review-hints`
- 策略匹配：`core/strategy-matcher`
- 分析计算：`core/analytics`（资金曲线、日聚合、策略归因、筛选范围）
- 封面解析：`core/cover-parser`
- 枚举预设：`core/enum-presets`
- 巡检与修复计划：`core/inspector`
- 管理器（批量写入/恢复）：`core/manager`
- Course：`core/course`
- Memory/SRS：`core/memory`

结论：插件不是“只导出/索引”，而是试图替代 DataviewJS 控制台的大部分运行时能力。

---

## 2. 核心数据契约（插件侧的“paData 替身”）

插件没有 `window.paData`，而是通过索引器提供最小稳定结构：

### 2.1 TradeRecord（最小交易结构）

`core/contracts.ts`：

- `path` / `name`：文件定位
- `dateIso`：交易日期（字符串）
- `ticker?`、`pnl?`、`outcome?`、`accountType?`
- `mtime?`、`tags?`
- `rawFrontmatter?`：仅用于回退/调试

这相当于把 v5.0 的 trade 归一化结果做了硬收敛。

### 2.2 字段别名（Field Aliases）

`core/field-mapper.ts`：

- `pnl` 从 `pnl/net_profit/净利润/net_profit/净利润/盈亏/收益` 等键读取
- `accountType` 从 `account_type/accountType/账户类型/...` 读取
- `tags` 取 frontmatter.tags + inline tags 合并
- 交易识别 tag：`PA/Trade`

---

## 3. 索引器实现审计（最可能的“迁移后问题源头”）

### 3.1 TradeIndex 的识别规则

`platforms/obsidian/obsidian-trade-index.ts`：

- 候选文件：全库 Markdown（除非你传了 folderAllowlist）
- 认定为 trade 的条件（满足其一）：
  1) tag 包含 `PA/Trade`
  2) （可选）frontmatter `fileClass/FileClass` 命中配置列表

当前插件在 `main.ts` 中创建 TradeIndex 时没有传 options，因此：

- **folderAllowlist 为空**：默认扫描全库
- **enableFileClass 默认 true**
- **tradeFileClasses 默认是 ["PA_Metadata_Schema"]**（需要确认你是否真的使用此 fileClass）

### 3.2 高概率问题 A：Templates 被错误索引为交易

你的交易模板 `Templates/单笔交易模版 (Trade Note).md` 的 frontmatter 明确包含 `tags: [PA/Trade]`。

在插件的 TradeIndex 规则下，这个模板文件会被当成一条交易记录加入索引。

后果（典型症状）：

- 交易数量莫名其妙偏大（至少 +1）
- 列表出现“模板交易”，pnl/outcome/date 为空或异常
- 胜率分母/统计窗口被污染（尤其当模板数量多、或有多个模板含 PA/Trade tag）

控制台 DataviewJS 版本里很多地方都显式排除 Templates（例如 tasks 查询 `path does not include Templates`），插件这条规则目前缺失。

### 3.3 高概率问题 B：dateIso 可能不是 ISO 日期

TradeIndex 的 dateIso：

- 优先读 frontmatter 的 `date/日期`
- 否则使用 `file.basename.substring(0, 10)`

但你的实际交易文件命名示例为：

- `Daily/Trades/251219_0036_实盘_ES.md`

它的 basename 前 10 字符是 `251219_0036`，并不是 `YYYY-MM-DD`。

后果（典型症状）：

- “按日期排序/筛选”错乱
- “今日交易”无法正确命中
- 资金曲线/日聚合按日分桶失败或分桶爆炸（大量非 ISO key）

这属于迁移时最常见的“日期口径丢失”。DataviewJS 版通常会用 mtime/path/解析规则兜底；插件需要显式实现同等兜底。

### 3.4 高概率问题 C：pnl 与 r 的语义冲突在插件侧更敏感

插件 stats 的 outcome 判定逻辑是：

- 只要 `pnl` 是 number，就用 pnl 的正负直接判 win/loss/scratch（覆盖掉 frontmatter.outcome）

如果你的 vault 里 `net_profit/净利润` 实际存的是“R 倍数”而非“金额”，那插件所有胜负与净利润统计都将以 R 为口径（这可能是你想要的，也可能不是）。

更关键的是：

- 控制台 v5.0 同时存在 `pnl` 和 `r`（且两者不一定同口径）
- 插件导出 snapshot 虽然补了 `r`（compat fields），但 stats 仍只用 `pnl`

---

## 4. 导出快照实现审计（与现有文档的偏差）

### 4.1 插件实际实现了两种导出函数

`main.ts` 中存在：

- `exportIndexSnapshot()`：写入 `Exports/al-brooks-console/snapshot_YYYYMMDD_HHMMSS.json`
- `exportLegacySnapshot()`：写入 `Exports/al-brooks-console/pa-db-export.json`

但目前 `onload()` 只注册了命令：

- `导出旧版兼容快照 (pa-db-export.json)` → 调用 `exportLegacySnapshot()`

**注意：`exportIndexSnapshot()` 目前没有被注册为命令，也没有在 UI 里调用。**

这会造成你写在文档里的“命令：导出索引快照（JSON）”在插件里找不到/无法触发。

### 4.2 你现在看到的 snapshot 文件来自哪里

仓库里存在离线脚本：`tools/generate-snapshot-from-legacy.js`

- 它会读取库根目录 `pa-db-export.json`
- 生成 `Exports/al-brooks-console/snapshot_*.json`
- `meta.pluginVersion` 固定写成 `dry-run-from-legacy`

而你当前 snapshot 文件里确实显示 `pluginVersion: dry-run-from-legacy`，因此：

- 这些 snapshot 不是插件导出的
- 而是离线脚本从 legacy 导出生成的（用于 schema 校验）

---

## 5. 插件当前“看起来会出很多问题”的原因归纳

把 v5.0 从 DataviewJS 移植到插件时，最容易出现的不是 UI bug，而是“数据口径与识别规则变硬”导致的系统性偏差：

1. TradeIndex 没有排除 Templates → 模板被当交易
2. dateIso 缺乏 filename/path 的解析兜底 → 交易日期乱
3. pnl/outcome 的覆盖规则较硬 → 旧数据/混合字段更容易被误判
4. 导出命令未对齐文档 → 你以为在测插件，其实在测离线脚本

---

## 6. 下一步（为了进入“对比报告 + 修复”阶段）

我建议下一步先做两件事（不用你先给太多信息）：

1) 我会生成一份对比报告：

- legacy（DataviewJS / pa-core）输出字段与规则
- plugin（TradeIndex + Dashboard）输出字段与规则
- 逐项列出“不一致”的点，并标注影响面（Today/Analytics/Manager/Export）

2) 你告诉我“插件的具体问题表现”用一句话列表（最多 5 条），例如：

- 今日看板没有交易/日期不对
- 交易统计数量多了 1
- 导出命令找不到
- 策略匹配总是失败
- Manager 写入后数据不刷新

我就能按优先级逐个修复，并用导出快照做回归验证。
