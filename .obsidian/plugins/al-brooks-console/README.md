# 🦁 Al Brooks Trader Console

[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7c3aed?logo=obsidian&logoColor=white)](https://obsidian.md/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> **基于 Al Brooks 价格行为方法论的智能交易员控制台**
> 
> 将知识库、交易日志、策略仓库和间隔重复学习整合于一体的 Obsidian 插件。

---

## ✨ 核心功能

### 📊 Trading Hub (交易中心)

实时交易工作台，帮助交易员在交易过程中做出更好的决策。

| 模块 | 功能 |
|------|------|
| **Today KPI** | 显示今日交易统计：总交易、胜率、净利润 |
| **智能预测导航** | 根据市场周期推断状态并提供策略推荐 |
| **智能预警系统** | 整合多数据源的实时警告和学习建议 |
| **进行中交易助手** | 策略匹配、入场/止损填充、信号验证 |
| **情境学习组件** | 根据当前市场状态推荐相关知识卡片 |

### 🧠 Smart Alert Engine (智能预警引擎)

整合项目现有数据结构生成智能交易警告：

```
数据源整合:
┌─────────────────────────────────────────────────────────┐
│  Templates/PA标签体系.md     → 标签警告 (#task/urgent)   │
│  Templates/属性值预设.md     → 执行评价问题统计           │
│  策略仓库 (Strategy Repo)    → 市场周期策略匹配          │
│  #flashcards 学习卡片        → 薄弱点分析                │
│  最近交易记录                → 失败模式检测              │
└─────────────────────────────────────────────────────────┘
```

**警告类型：**
- 🔴 **警告** - 连续亏损、策略失败、执行问题
- 🔵 **学习** - 待复习卡片、薄弱知识点、情境推荐
- 🟢 **策略** - 当前周期推荐策略
- ⚡ **形态** - 高胜率形态识别

### 📈 Analytics (复盘分析)

多维度交易绩效分析：

- **日期范围选择** - 周/月/30天/90天/年/全部/自定义
- **胜负分布** - 按周期/方向/策略细分
- **执行评价分析** - 识别重复性问题
- **形态胜率统计** - 跟踪高胜率形态

### 📚 Learning (学习模块)

与 Spaced Repetition 插件深度集成：

- **Coach Focus** - 优先复习薄弱点
- **随机抽题** - 支持多行问答/填空题/基础卡片
- **情境学习** - 根据当前市场状态推荐相关概念
- **掌握度追踪** - 可视化学习进度

### 📂 Data Management (数据管理)

高效的交易记录管理：

- **交易列表** - 快速查看和编辑
- **属性验证** - 基于 `Templates/属性值预设.md` 的枚举校验
- **批量编辑** - 批量更新多笔交易属性

---

## 🏗️ 技术架构

```
src/
├── core/                    # 核心业务逻辑 (46 模块)
│   ├── contracts.ts         # 数据契约定义
│   ├── memory.ts            # SRS 记忆快照服务
│   ├── market-state-machine.ts   # 市场状态推断引擎
│   ├── smart-alert-engine.ts     # 智能预警引擎
│   ├── action/              # 操作服务 (ActionService)
│   └── ...
├── views/                   # UI 视图层 (64 模块)
│   ├── Dashboard.tsx        # 主控制台
│   ├── tabs/                # 标签页组件
│   └── components/          # 复用组件
├── ui/                      # UI 基础组件
│   └── components/          # GlassPanel, InteractiveButton 等
├── hooks/                   # React Hooks
├── context/                 # Context Providers
└── utils/                   # 工具函数
```

### 核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | UI 框架 |
| Recharts | 3.6.0 | 图表可视化 |
| Zod | 3.x | 数据验证 |
| TypeScript | 4.7.4 | 类型安全 |

---

## 📦 项目结构 (Obsidian Vault)

```
Al-brooks-PA/
├── Categories 分类/         # 概念笔记库 (360+ 知识点)
│   └── Al brooks/价格行为学/
├── Daily/                   # 每日交易日志
│   └── Trades/              # 交易记录
├── 策略仓库/                # 策略卡片
├── Templates/               # 模版和预设
│   ├── PA标签体系.md        # 标签体系定义
│   ├── 属性值预设.md        # 属性枚举定义
│   └── 单笔交易模版.md      # 交易笔记模版
└── .obsidian/plugins/al-brooks-console/
```

---

## 🚀 安装

### 手动安装

1. 下载最新版本的 `main.js`、`styles.css` 和 `manifest.json`
2. 复制到 `.obsidian/plugins/al-brooks-console/` 目录
3. 在 Obsidian 设置 → 第三方插件 → 启用插件

### 开发环境

```bash
# 克隆仓库
cd .obsidian/plugins/al-brooks-console

# 安装依赖
npm install

# 开发模式 (监听文件变化)
npm run dev

# 构建生产版本
npm run build
```

---

## ⚙️ 配置

打开 Obsidian 设置 → Al Brooks Trader Console：

| 设置项 | 描述 | 默认值 |
|--------|------|--------|
| Trade Folder | 交易记录存放目录 | `Daily/Trades` |
| Strategy Folder | 策略仓库目录 | `策略仓库` |
| Templates Folder | 模版目录 | `Templates` |
| Currency Mode | 货币显示模式 | `USD` |

---

## 📋 数据标准

### 标签体系 (PA标签体系.md)

```yaml
系统标签:
  - #PA/Trade: 单笔交易笔记
  - #PA/Daily: 每日复盘笔记
  - #PA/Strategy: 策略卡片
  - #flashcards: SRS 学习卡片

任务标签:
  - #task/urgent: 紧急任务
  - #task/question: 待解决问题
  - #task/verify: 待验证策略
```

### 属性预设 (属性值预设.md)

定义了所有枚举字段的有效值，确保数据一致性：

- `market_cycle` - 市场周期
- `direction` - 交易方向
- `strategy_name` - 策略名称
- `execution_quality` - 执行评价
- `patterns_observed` - 观察到的形态

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

[MIT License](LICENSE)

---

## 🙏 致谢

- [Al Brooks](https://brookstradingcourse.com/) - 价格行为方法论
- [Obsidian](https://obsidian.md/) - 知识管理平台
- [Spaced Repetition Plugin](https://github.com/st3v3nmw/obsidian-spaced-repetition) - SRS 集成

---

<p align="center">
  <b>🦁 让每一笔交易都像考试一样准备充分</b><br>
  <sub>Built with 💜 for Price Action Traders</sub>
</p>
