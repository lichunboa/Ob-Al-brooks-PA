# System Evolution Memory (自我进化记忆库)

此文件由 Agent 在每次维护或解决问题后自动更新。
**用途**: 记录系统特有的“怪癖”、最佳实践、已知的坑以及用户的偏好。
**规则**: 每次任务结束前，检查是否有新的经验需要写入。

## 🧠 Core Principles (核心原则)
1.  **Single Source of Truth**: 永远信赖 `window.paData`，不要尝试去从十几万行 Markdown 里重新正则匹配。
2.  **Safety First**: 修改属性必须使用 `pa-utils.js` (refactored v5.1) 里的 `safeStr`/`safeNum`，禁止硬编码 `page["field"]`。
3.  **Modular**: 当需要修改核心逻辑时，优先检查 `scripts/core/` 下的子模块，而不是 `pa-core.js`。

## 📚 Documentation Map (文档索引)
为了节省 Token，不要预加载这些文件。只有在需要相关知识时再读取它们：
- **系统架构**: `🦁 交易员控制台 (Trader Command)/📋 系统技术报告 v5.0.md`
- **字段定义**: `🦁 交易员控制台 (Trader Command)/📘 模板与字段说明.md` (修改模板前必读)
- **历史Context**: `🦁 交易员控制台 (Trader Command)/📝 系统升级日志.md`

## 🐛 Known Quirks & Fixes (已知怪癖与修复)
- **Scroll Issue**: Dataview 刷新会强制置顶。已通过 `pa-cache.js` 解决，刷新时必须传入 `{preserveScroll: true}`。
- **Template Logic**: `Trade Note.md` 极其依赖 Frontmatter 命名。如果修改了 `pa-config.js` 里的 `labels`，必须同步更新模板的 DataviewJS 映射。

## 📈 Evolution Log (进化日志)
* [2025-12-31] **MAJOR ROLLBACK**: Attempted to decouple `pa-core.js` into modular components (v5.2). Resulted in multiple view regressions (SR count 0, Course Map missing, Charts missing). Reverted to v14.6 monolithic code. 
    *   **Lesson**: The monolithic `pa-core.js` has hidden dependencies (like inline SR regex counting) that were lost in translation. Future refactors must strict audit *all* `window.paData` properties.
    *   **Status**: `scripts/core/` folder exists but is currently ORPHANED (not used by `pa-core.js`).
