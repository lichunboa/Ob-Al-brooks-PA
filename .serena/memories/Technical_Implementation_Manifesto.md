# 📄 交易员控制台 (Trader Command) 技术实现白皮书 (Technical Manifesto)

> **⚠️ Agent 注意**: 此文档记录了系统**"为什么这样设计"**以及**"核心逻辑如何运转"**。在修改复杂脚本（尤其是 core）之前，**必须**先阅读相关章节。修改代码后，**必须**同步更新此文档。

---

## 🏗️ 核心引擎: `scripts/pa-core.js`

**文件定位**: 系统的单一数据源 (Single Source of Truth)，负责加载、清洗交易数据，计算统计指标，并管理全局缓存。

### 1. 智能缓存与刷新机制 (Smart Cache & Refresh)

*   **痛点解决**: 解决 DataviewJS 频繁刷新导致的卡顿和滚动条跳动问题。
*   **核心状态**:
    *   `window.__paBuilding`: 锁，防止并发递归刷新。
    *   `window.paForceReload`: 标志位，UI 按钮点击刷新时置为 true。
    *   `window.paDirty`: 脏标记，由 `app.vault.on('modify')` 触发，标志着有数据文件变更。
*   **逻辑流程**:
    1.  **Check**: 检查 `cachedTs` 是否过期（默认 ttl 在 config 中定义）且 `paDirty` 为 false。
    2.  **Hit**: 如果命中缓存，直接返回 `window.paData` 中的数据（极速模式）。
    3.  **Miss**: 如果未命中或强制刷新，执行全量扫描（扫描模式）。

### 2. 滚动条锁定技术 (Scroll Locking)

*   **复杂逻辑**: Dataview 刷新会销毁 DOM，导致页面跳回顶部。我们实现了复杂的“滚动保持”逻辑。
*   **关键函数**:
    *   `paCaptureScrollState()`: 捕获当前 leaf 的 scrollTop/Ratio。
    *   `paStartScrollLock()`: 在刷新期间开启一个 `requestAnimationFrame` 循环，强行把 scrollTop 钉在目标位置，防止视觉跳动。
    *   `paRestoreScrollState()`: 刷新完成后，等待 DOM 高度稳定（3帧不变）后，恢复位置。
*   **陷阱 (Pitfalls)**:
    *   不要轻易修改 `paGetScrollerElForLeaf` 中的选择器优先级（`.view-content` vs `.cm-scroller`），这适配了 Obsidian 阅读/编辑模式的差异。

### 3. 数据清洗管道 (Data Pipeline)

*   **Review Hints (智能复盘提示)**:
    *   **逻辑**: 这里不仅加载数据，还运行了一层轻量级 AI 规则 (`buildReviewHints`)。
    *   **规则**: 检查 `setup`, `market_cycle`, `strategyName` 等字段是否缺失，生成提示对象数组。
    *   **目的**: 给 UI 层显示 "⚠️ 缺少设置" 警告，而不直接修改原文件。

### 4. 数据结构 (Data Schema)

*   `window.paData.tradesAsc`: 交易数组，按时间升序（旧->新）。
*   `window.paData.stats`: `livePnL`, `liveWin` 等实时统计。
*   `window.paData.strategyIndex`: 策略库索引，由 `Strategy Repository/` 文件夹解析而来。

---

## 📊 视图实现: `scripts/pa-view-*.js`

*(待补充: 随着您对各视图模块的维护，逐步填充此区域)*

---

## 🛠️ 维护守则 (Maintainer Protocols)

1.  **原子化核心升级**: 修改 `pa-core.js` 时，尽量只改动具体的处理函数，不要破坏顶层的 `try-catch` 结构和全局变量初始化。
2.  **Manifesto First**: 遇到不理解的变量（如 `__paUserScrollIntentInstalled`），先查阅此文档，不要随意删除看似“无用”的代码——它们通常是为了处理 Obsidian 的怪异行为。
