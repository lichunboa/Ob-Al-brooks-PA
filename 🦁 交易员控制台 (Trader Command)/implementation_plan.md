# 架构重构与深度优化计划 (Architecture Refactor & Optimization Plan)

## 0. 目标描述 (Goal Description)
将目前臃肿的 `Dashboard.tsx` (6500+行) 拆解为可维护的组件结构，同时在视觉和交互上进行深度打磨，打造"精致"、"流畅"的 Glassmorphism 交易台体验。

## 1. 现状分析 (Current Status Analysis)
- **代码质量**: `Dashboard.tsx` 包含了所有 Tab 的视图、数据获取、计算逻辑和样式，导致维护极其困难。变量作用域混乱（如之前的 `activePage` 回归错误），Risk 极高。
- **视觉体验**: 虽然完成了 Glass 风格迁移，但界面显得"静止"。缺乏悬停反馈、过渡动画和精致的空状态引导。
- **功能完备性**: 部分筛选器和搜索框仅有 UI，逻辑未实装。

## 2. 深度优化方案 (Optimization Roadmap)

### A. 代码架构重构 (Components & Hooks)
采用 **"View-Model" 分离模式**。
- **Views**: 将每个 Tab 拆分为独立文件 (`TradingHub`, `Analytics`, `Learn`, `Manage`)。
- **Hooks**: 将数据计算逻辑抽离自定义 Hooks (`useTradeData`, `useStrategyMetrics`)。

### B. 视觉与体验打磨 (Visual & UX Polish)
- **微交互 (Micro-interactions)**: 为卡片增加呼吸感（Hover Scale）、按钮增加弹性反馈。
- **沉浸感**: 优化背景模糊度，减少视觉噪点。
- **引导性**: 重设计 "空状态" (Empty States)，引导用户操作而非单纯显示 "No Data"。

### C. 功能补全 (Functional Enhancements)
- **Manage Tab**: 实装 "Schema Issues" 的分类过滤。
- **Learn Tab**: 实装策略筛选（按胜率、按周期）。

---

## 3. 详细执行任务列表 (Detailed Execution Checklist)

用户将全程陪同验证，**每一步完成后需进行确认**。

### 阶段一：视图组件拆分 (Phase 1: View Component Extraction)
*目标：物理拆分文件，确保 `dashboardPrimitives` 和样式引用正常，界面 1:1 还原。*

- [ ] **1.1 基础建设 (Infrastructure)**
    - [ ] 创建目录 `src/views/tabs/`。
    - [ ] 确认公共组件引用路径。

- [ ] **1.2 拆分 Manage Tab (管理模块)** `[Safe Start]`
    - [ ] 创建 `src/views/tabs/ManageTab.tsx`。
    - [ ] 定义 `ManageTabProps` 接口（明确数据依赖：`schemaIssues`, `healthScore`, `enumPresets` 等）。
    - [ ] 移动 `Manage` 相关的渲染代码。
    - [ ] 在 `Dashboard.tsx` 中引入并替换。
    - [ ] **验证**: 检查 Tab 切换是否正常，数据是否显示。

- [ ] **1.3 拆分 Learn Tab (学习模块)**
    - [ ] 创建 `src/views/tabs/LearnTab.tsx`。
    - [ ] 定义 `LearnTabProps` (依赖：`strategies`, `marketCycle`, `playbookPerf` 等)。
    - [ ] 移动代码并修复 `GlassCard` 嵌套结构。
    - [ ] **验证**: 检查策略列表推荐逻辑。

- [ ] **1.4 拆分 Analytics Tab (数据中心)** `[Complex]`
    - [ ] 创建 `src/views/tabs/AnalyticsTab.tsx`。
    - [ ] 移动大量图表组件（Account, Market, Mistakes, Lab）。
    - [ ] 确保 `Recharts` 引用正常。
    - [ ] **验证**: 检查图表交互和渲染。

- [ ] **1.5 拆分 Trading Hub (交易中心)** `[Core]`
    - [ ] 创建 `src/views/tabs/TradingHubTab.tsx`。
    - [ ] 移动 KPI 卡片、交易列表、新建按钮逻辑。
    - [ ] **验证**: 确保核心交易功能无 Regression。

### 阶段二：逻辑抽离 (Phase 2: Logic/Hooks Extraction)
*目标：瘦身 `Dashboard.tsx`，使其只负责路由和全局状态。*

- [ ] **2.1 创建 Hooks**
    - [ ] 建立 `src/hooks/useDashboardData.ts`。
- [ ] **2.2 移动数据逻辑**
    - [ ] 将 `useEffect` 加载逻辑移入 Hook。
    - [ ] 将计算属性（`dailyStats`, `winRates`）移入 Hook 或独立工具函数。

### 阶段三：视觉与交互打磨 (Phase 3: Visual & UX Polish)
*目标：注入灵魂。*

- [ ] **3.1 动画增强**
    - [ ] 为 `GlassCard` 添加 `transition: all 0.2s` 和 `:hover` 效果。
- [ ] **3.2 空状态美化**
    - [ ] 设计通用的 `<EmptyState />` Glass 组件。
- [ ] **3.3 功能实装**
    - [ ] 完善策略筛选器逻辑。

## 4. 验证计划 (Verification Plan)
- **编译检查**: 每次拆分后运行 `npm run build`。
- **视觉检查**: 确保拆分后的组件与原版像素级一致（Pixel Perfect）。
- **功能检查**: 点击交互、数据加载无异常。
