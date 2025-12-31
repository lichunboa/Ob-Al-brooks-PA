# Capability: System Maintainer (系统维护专家)

**触发条件**: 当用户要求 "升级系统"、"修复模板"、"检查数据健康度" 或 "添加新属性" 时。

## 1. 🛡️ Template Integrity Check (模板完整性检查)
**目标**: 确保所有 `Templates/` 下的文件都引用了最新的 API，且没有硬编码错误。

### 检查清单:
1.  **Scan**: 读取 `Templates/单笔交易模版 (Trade Note).md`。
2.  **Verify**: 检查是否使用了 `utils.safeStr` 或 `utils.safeNum`。如果发现了 `cur["field"]` 这种裸写访问，**必须**重构为安全访问。
3.  **Action**: 
    - 如果发现旧代码，使用 `sed` 或 `replace_file` 更新代码块。
    - 参考标准: `utils.safeStr(cur, ["字段名", "field_name"])`。

## 2. 🔄 Core Upgrade Workflow (核心升级流)
**目标**: 安全地升级 `scripts/` 下的 JS 模块。

### 步骤:
1.  **Backup**: 在修改前，先读取目标文件内容并暂存。
2.  **Atomic Edit**: 永远不要一次性重写整个文件。使用 `replace_file_content` 针对具体函数进行修改。
3.  **Dependency Check**:
    - 核心逻辑主要集中在 `scripts/pa-core.js` (Monolithic v14.6)。
    - **注意**: `scripts/core/` 目录下的文件目前处于"弃用/参考"状态，不要修改它们，除非你打算重新发起架构重构。
    - 修改 `scripts/pa-core.js` 时要极其小心，因为它包含了所有逻辑。

## 3. 🧹 Data Hygiene (数据卫生清洗)
**目标**: 批量修复 Frontmatter 格式错误。

### 常用脚本 (DataviewJS One-Off):
如果用户需要把所有 `net_profit: null` 改为 `0`：
```javascript
// DO NOT RUN AUTOMATICALLY. PROPOSE TO USER FIRST.
const pages = dv.pages("#PA/Trade");
// ... batch update logic ...
```
**注意**: Agent 不能直接修改文件系统（除非通过 `app.vault` 或者是 tool call）。建议生成脚本让用户在控制台运行，或者使用 `multi_replace_file` 谨慎操作。

## 4. 📝 Post-Maintenance
- 更新 `memory/system_evolution.md`，记录本次维护遇到的新情况。
- 更新 `scripts/pa-config.js` 里的版本号。
