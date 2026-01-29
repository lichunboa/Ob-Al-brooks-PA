# 🗺️ 交易员控制台 (Trader Command) 5.0 架构地图

此文件定义了交易员控制台的模块结构与底层代码实现的映射关系。
**智能体指令**: 当你需要修改或分析某个模块时，请查阅此表以直接定位相关文件。

## 核心入口
- **控制台主页 (Dashboard)**: `🦁 交易员控制台 (Trader Command)5.0.md`
- **核心引擎 (Core)**: `scripts/pa-core.js` (负责数据加载、状态管理)

## 🏗️ 模块映射表 (Module Map)

| UI 模块名称 (UI Section) | 功能描述 (Description) | 核心实现脚本 (Script) | 关联视图/组件 |
| :--- | :--- | :--- | :--- |
| **⚔️ 交易中心 (Trading Hub)** | 今日看板、快速行动、状态概览 | `scripts/pa-view-today.js` | `TodayView` |
| **📊 数据中心 (Analytics Hub)** | 账户总览、资金曲线、环境分析、错误归因 | `scripts/pa-view-hub-analytics.js` | `AnalyticsHub` |
| **📚 学习模块 (Memory/Course)** | | | |
| - 记忆库 | 访问 `.serena/memories` 与知识检索 | `scripts/pa-view-memory.js` | `MemoryView` |
| - 课程地图 | 课程结构、学习进度追踪 | `scripts/pa-view-course.js` | `CourseMap` |
| - 策略仓库 | 交易策略手册 (Playbook) | `scripts/pa-view-playbook.js` | `PlaybookView` |
| - 最新复盘 | 图表画廊、视觉复盘 | `scripts/pa-view-gallery.js` | `GalleryView` |
| **📉 管理模块 (Management)** | | | |
| - 数据巡检 | 数据完整性检查、错误修复 | `scripts/pa-view-inspector.js` | `InspectorView` |
| - 数据架构 | 数据库 Schema 定义与验证 | `scripts/pa-view-schema.js` | `SchemaView` |
| - 属性管理 | 元数据、标签、属性管理 | `scripts/pa-view-manager.js` | `PropertyManager` |

## 📂 关键目录结构 (Key Directories)

- `.serena/memories/`: 长期记忆存储（如：策略索引、架构地图）
- `.claude/skills/`: 智能体技能定义（如：analyst, maintainer）
- `scripts/`: DataviewJS 脚本与 React/Preact 组件逻辑
- `Notes 笔记/`: 交易日记与复盘笔记数据源
- `Strategies 策略/`: 策略文档数据源

## 🧠 关联记忆 (Linked Memories)
- **策略概念索引**: `.serena/memories/L_Chunbo_Strategy_Concept_Index.md` (分析市场时必读)
