---
name: trading-console-plugin-maintainer
description: This skill should be used when maintaining, upgrading, or UI-polishing the Obsidian native plugin console (TypeScript/React) at `.obsidian/plugins/al-brooks-console` for the 🦁 AL-Brooks 交易员控制台. It integrates file-based planning, unit testing automation, and safe edit practices to ensure strict regression prevention and UI consistency.
hooks:
  SessionStart:
    - hooks:
        - type: command
          command: "echo '[Maintainer] 🛡️ Protocol Active. Remember: Phase 0 (Context) -> Phase 4 (Verify). Do NOT blind guess.'"
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "echo '[Maintainer] 🛑 Stop! Have you read the Trade Note Template and Price Action logic? (Phase 0)'"
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "echo '[Maintainer] ✅ Edit complete. Now run: npm run build (and npm test if logic changed).'"
---

# 🛠️ Trading Console Plugin Maintainer (Ultimate Edition)

## 📌 目标与核心理念

本 Skill 是维护 `Al-Brooks-Console` 插件的**最高准则**。它不仅仅是代码编辑指南，更是集成了 **Planning (规划)**、**Design (设计)**、**Testing (测试)** 与 **Build (构建)** 的全流程自动化手册。

**核心理念**：
1.  **Context is RAM, Files are Disk**: 复杂任务必须落地到文件 (`task_plan.md`)。
2.  **Tests as Documentation**: 逻辑变更必须伴随自动生成的单元测试。
3.  **UI Consistency**: 严禁“原本能用就行”，必须符合设计系统。
4.  **Build Green**: 任何提交必须通过 `npm run build` 和 `npm test`。

---

## 🚦 何时触发本 Skill

- 🛠️ **常规维护**：修复 Bug、升级依赖、重构代码。
- 🎨 **UI 调整**：优化界面、迁移入口、调整布局。
- ⚡ **新功能开发**：开发新组件（如 Execution Panel, Smart Recommender）。
- 🧪 **测试治理**：补充测试用例、修复 CI 失败。

---

## 📋 统一维护工作流 (Unified Workflow)

所有维护任务**强制**遵循以下五步循环：

### 0️⃣ Phase 0: Domain & Data Context (拒绝“管中窥豹”)
**这是最关键的一步，跳过必死。**

在修改任何代码前，必须建立“笔记-插件-业务”的完整上下文：

1.  **数据源头分析 (Source of Truth)**：
    *   **严禁**只看 `.tsx` 定义的接口。
    *   **必须**读取 `Templates/单笔交易模版 (Trade Note).md`：这是数据的物理形态。
    *   **必须**分析 `src/core/contracts.ts`：这是数据的内存形态。
    *   **必须**确认数据转换逻辑：数据是怎么从 Markdown 变成了 React Props 的？（通常在 `obsidian-trade-index.ts` 或 `Dashboard.tsx`）。

2.  **业务逻辑对齐 (Price Action Domain)**：
    *   如果任务涉及“交易逻辑”（如 Setup, Signal, Exit），**必须**先自我提问并回答：
        *   "这个功能在 Al Brooks 体系里是什么意图？"
        *   "High 1 / Low 2 是怎么定义的？"
        *(如果不懂，必须查阅 `🦁 交易员控制台 (Trader Command)/README.md` 或询问用户，绝对禁止“猜业务”)*

3.  **用户场景模拟**：
    *   不要只把自己当程序员，要把自己当**正在复盘的交易员**。
    *   思考：交易员现在是在看一张静态图，还是在复盘当天的动态行情？主要痛点是“填起来麻烦”还是“找不到数据”？

### 1️⃣ Phase 1: Planning (规划与记忆)
**来源技能**: `planning-with-files`

- **评估复杂度**：
    - **简单任务** (Quick Fix): 直接执行。
    - **复杂任务** (>2文件修改 / 逻辑重构): **必须**启动文件规划。
        1.  在根目录创建/更新 `task_plan.md`：拆解任务步骤。
        2.  创建/更新 `findings.md`：记录调研结果。
        3.  创建/更新 `progress.md`：记录执行流水。
- **读取记忆**：
    - 强制读取 `memory/system_evolution.md`。

### 2️⃣ Phase 2: Design Check (设计检查)
**来源技能**: `ui-design-system`

- **UI 变更前必查**：
    - ❌ **严禁**使用原生 HTML 标签。
    - ✅ **必须**复用 `src/ui/components`。
- **UX 约束**：
    - **Sticky Context**: Dashboard 必须保持对 "Active File" 的粘性引用。

### 3️⃣ Phase 3: Implementation (安全实施)
**来源技能**: `code-reviewer`

- **修改原则**：
    - **Dashboard.tsx**: 仅作为**数据容器**。
    - **Types.ts**: 修改接口后， Search 全局引用。

### 4️⃣ Phase 4: Verification (处决“盲目自信”)
**来源技能**: `unit-test-generator`

- **3-Strike Protocol (Bug 修复铁律)**：
    - **Attempt 1**: 快速修复。
    - **Attempt 2**: ❌ **严禁直接重试**。如果第一次修复失败（例如用户反馈“没变化”），**必须停止 Blind Coding**。
        - 📌 **必须**编写一个最小复现脚本或详细的 `console.log` 探针。
        - 📌 **必须**先定位到为什么第一次修复无效（是因为缓存？逻辑分支没走到？还是数据源根本就没更新？）。
    - **Attempt 3**: 寻求用户帮助或全面回滚。

- **逻辑变更后**：
    - **自动生成测试**：修改核心逻辑后，**必须**运行 `npm test`。
- **构建门禁**：
    - **强制执行**：`npm run build`。

### 5️⃣ Phase 5: Documentation (文档落地)
**来源技能**: `changelog-writer`

- **更新记录**：
    - `versions.json` & `package.json`: 如果是版本发布。
    - `memory/system_evolution.md`: 记录本次解决的硬核 Bug 或架构决策。
    - `task_plan.md`: 标记任务完成，归档 `findings.md`。

---

## 🧱 关键约束 (Hard Rules)

| 领域 | 规则 | 违规后果 |
| :--- | :--- | :--- |
| **UI** | 严禁原生 `<button>`，必须用 `src/ui/components/Button.tsx` | UI 风格割裂，用户体验下降 |
| **Logic** | 核心逻辑变更必须配套 `npm test` | 引入回归 Bug，破坏核心功能 |
| **Build** | 每次结构性改动后执行 `npm run build` | 提交损坏的代码，CI/CD 失败 |
| **Context** | Dashboard 上下文必须 "Sticky" | 用户切换笔记后丢失交易数据 |
| **Commands** | 第三方插件调用 ID 必须硬编码 (Deterministic) | 依赖模糊搜索导致调用错误命令 |
| **Feature** | **Upgrade Only**. 严禁删除/破坏现有功能 | 导致用户习惯被迫改变，体验降级 |

---

## 🧪 回归测试清单 (Regression Checklist)

每次发布前必须手动核对：

### 1. 交易中心 (Trading Hub)
- [ ] **OpenTradeAssistant**:
    - [ ] 是否正确识别当天的未平仓交易？
    - [ ] 点击推荐策略（如 "Bull Breakout"）是否能填入 `setup` 字段？
- [ ] **DailyActions**:
    - [ ] 勾选复选框后，重启插件，勾选状态是否持久化？
- [ ] **PlanWidget**:
    - [ ] Risk Limit 和 Market Cycle 输入是否保存生效？

### 2. 学习模块 (Course & Coach)
- [ ] **CoachFocus**: "优先复习" 是否触发 SRS 插件？
- [ ] **CourseSuggestion**: 课程进度条是否显示正确？

### 3. 数据中心 (Analytics)
- [ ] **Capital Growth Chart**: 盈亏曲线是否渲染？（检查 Recharts 兼容性）

---

## 📂 Repo 导航图谱

- **根目录**: `.obsidian/plugins/al-brooks-console/`
- **入口**: `main.ts` (插件生命周期)
- **指挥官**: `src/views/Dashboard.tsx` (State, Props, Data Load)
- **布局层**: `src/views/tabs/` (`TradingHubTab`, `AnalyticsTab`)
- **UI 库**: `src/ui/components/` (Button, GlassPanel)
- **业务组件**:
    - 开仓/推荐: `src/views/components/trading/OpenTradeAssistant.tsx`
    - 计划: `src/views/components/plan/PlanWidget.tsx`
- **核心逻辑**: `src/core/` (`action/action-service.ts`, `schema-validator.ts`)
- **测试**: `src/core/**/__tests__/` (Jest tests)

---

## 🧠 Memory & Evolution
> *此部分将在每次维护后动态更新，记录系统的演进脉络*

- **v2.2.2 (2026-01-17)**:
    - **Zod Migration**: `SchemaValidator` 底层迁移至 Zod，解决手写验证维护难问题。
    - **Test Env**: 引入 Jest + ts-jest，建立单元测试基准。
    - **UI Std**: 全局替换原生 `<button>` 为 `<Button>` 组件。
