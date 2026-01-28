# 🦁 Al Brooks 交易员控制台 - AI Agent 操作手册

> 本文档面向 AI 编码 Agent，以可执行指令的视角编写，约束与指导 Agent 行为。
> 项目语言：中文（主要）、English（代码注释）

---

## 1. 项目概述 (Project Overview)

本项目是一个基于 **Al Brooks 价格行为方法论** 的交易员工作空间，包含三个核心组件：

### 1.1 Obsidian 知识库 (Knowledge Vault)
- **路径**: 项目根目录
- **用途**: 交易笔记、策略卡片、概念学习、每日复盘
- **主要目录**:
  - `Notes 笔记/` - 价格行为学习笔记 (360+ 知识点)
  - `Daily/Trades/` - 每日交易记录
  - `策略仓库 (Strategy Repository)/` - 策略卡片
  - `Categories 分类/` - 概念知识分类
  - `Templates/` - 笔记模板和属性预设

### 1.2 Al Brooks Console 插件 (Obsidian Plugin)
- **路径**: `.obsidian/plugins/al-brooks-console/`
- **用途**: 原生 Obsidian 插件，替代旧版 DataviewJS 脚本
- **技术栈**: TypeScript 4.7.4 + React 18.2 + esbuild
- **版本**: 1.7.0

### 1.3 TradeCat 后端服务 (Backend Services)
- **路径**: `backend/tradecat-core/`
- **用途**: 量化交易数据分析平台（克隆自 TradeCat 项目）
- **技术栈**: Python 3.12 + TimescaleDB + Docker
- **服务**: 数据采集、指标计算、信号检测、Telegram Bot

---

## 2. 目录结构 (Project Structure)

```
Al-brooks-PA/                               # Obsidian Vault 根目录
│
├── .obsidian/
│   ├── plugins/
│   │   └── al-brooks-console/              # 原生插件 (TypeScript/React)
│   │       ├── src/                        # 源代码
│   │       │   ├── core/                   # 核心业务逻辑 (46 模块)
│   │       │   ├── views/                  # UI 视图层 (Dashboard, Tabs)
│   │       │   ├── ui/                     # UI 基础组件
│   │       │   ├── hooks/                  # React Hooks
│   │       │   ├── integrations/           # 第三方插件集成
│   │       │   ├── platforms/obsidian/     # Obsidian 平台适配
│   │       │   └── main.ts                 # 插件入口
│   │       ├── package.json                # npm 配置
│   │       ├── tsconfig.json               # TypeScript 配置
│   │       ├── esbuild.config.mjs          # 构建配置
│   │       ├── main.js                     # 编译产物 (不要直接修改)
│   │       └── main.css                    # 样式产物
│   └── ...                                 # 其他 Obsidian 配置
│
├── backend/tradecat-core/                   # 量化后端服务 (Python)
│   ├── services/                            # 稳定版微服务 (5个)
│   │   ├── data-service/                    # 数据采集服务
│   │   ├── trading-service/                 # 指标计算服务
│   │   ├── telegram-service/                # Telegram Bot
│   │   ├── signal-service/                  # 信号检测服务
│   │   └── ai-service/                      # AI 分析服务
│   ├── services-preview/                    # 预览版服务
│   ├── libs/                                # 共享库
│   ├── scripts/                             # 运维脚本
│   ├── config/                              # 配置文件
│   └── docker-compose.yml                   # Docker 编排
│
├── scripts/                                 # 旧版 DataviewJS 脚本 (v5.0)
│   ├── pa-core.js                           # 核心数据引擎
│   ├── pa-view-*.js                         # 各视图脚本
│   └── pa-utils.js                          # 工具函数
│
├── Templates/                               # Obsidian 模板
│   ├── 单笔交易模版 (Trade Note).md         # 交易笔记模板
│   ├── 每日复盘模版 (Daily Journal).md      # 日复盘模板
│   ├── 属性值预设.md                        # 枚举值定义
│   └── PA标签体系 (Tag System).md          # 标签体系
│
├── Daily/                                   # 每日交易日志
│   ├── Trades/                              # 交易记录
│   └── SPX/                                 # 标普交易记录
│
├── 策略仓库 (Strategy Repository)/          # 策略卡片
├── Notes 笔记/                              # 学习笔记
├── Categories 分类/                         # 概念分类
└── AGENTS.md                                # 本文件
```

---

## 3. 技术栈 (Technology Stack)

### 3.1 前端插件 (Obsidian Plugin)
| 技术 | 版本 | 用途 |
|------|------|------|
| TypeScript | 4.7.4 | 类型安全 |
| React | 18.2.0 | UI 框架 |
| React DOM | 18.2.0 | DOM 渲染 |
| esbuild | 0.17.3 | 构建工具 |
| Recharts | 3.6.0 | 图表可视化 |
| lightweight-charts | 5.1.0 | K 线图 |
| react-grid-layout | 2.2.2 | 拖拽布局 |
| lucide-react | 0.563.0 | 图标库 |
| Zod | 3.x | 数据验证 |
| Jest | 30.2.0 | 单元测试 |

### 3.2 后端服务 (TradeCat)
| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.12+ | 主要语言 |
| TimescaleDB | PG 16 | 时序数据库 |
| CCXT | 4.x | 交易所 API |
| Cryptofeed | - | WebSocket 数据 |
| pandas | 1.5+ | 数据处理 |
| numpy | 1.22+ | 数值计算 |
| TA-Lib | 0.4+ | 技术指标 |
| FastAPI | - | REST API |
| Docker | - | 容器化部署 |

---

## 4. 构建与开发 (Build & Development)

### 4.1 Obsidian 插件开发

```bash
# 进入插件目录
cd .obsidian/plugins/al-brooks-console

# 安装依赖
npm install

# 开发模式 (监听文件变化，自动编译)
npm run dev

# 生产构建 (含类型检查和编译验证)
npm run build

# 运行测试
npm test
```

**构建产物验证**:
构建脚本 (`scripts/verify-build.sh`) 会检查 `main.js` 是否包含关键代码：
- `ConsoleContent`
- `TradingHubTab`
- `groupedByTicker`
- `ConsoleProvider`

### 4.2 TradeCat 后端开发

```bash
# 进入后端目录
cd backend/tradecat-core

# 初始化所有服务
./scripts/init.sh

# 或初始化单个服务
./scripts/init.sh data-service

# 配置环境变量
cp config/.env.example config/.env
chmod 600 config/.env
# 编辑 config/.env 填写 BOT_TOKEN, DATABASE_URL 等

# 启动核心服务
./scripts/start.sh start
./scripts/start.sh status

# 代码验证
./scripts/verify.sh
```

**Docker 部署**:
```bash
cd backend/tradecat-core
docker-compose up -d
```

---

## 5. 代码风格指南 (Code Style Guidelines)

### 5.1 TypeScript/React (插件)
- **缩进**: 2 空格
- **引号**: 双引号
- **分号**: 必需
- **类型**: 严格类型检查开启
- **组件**: 函数组件 + Hooks
- **注释**: 中英文混合（公共 API 用英文，业务逻辑可用中文）

### 5.2 Python (后端)
- **代码检查**: Ruff (配置见 `pyproject.toml`)
- **行长度**: 120 字符
- **导入排序**: isort 风格
- **类型提示**: 推荐但不强制
- **文档字符串**: Google 风格

---

## 6. 测试策略 (Testing)

### 6.1 插件测试
```bash
cd .obsidian/plugins/al-brooks-console

# 运行所有测试
npm test

# 测试配置在 jest.config.js
# 测试文件位于 src/**/__tests__/**/*.test.ts
```

### 6.2 后端测试
```bash
cd backend/tradecat-core

# 代码检查
make verify
# 或
ruff check src/

# 类型检查
mypy src/
```

---

## 7. 数据标准 (Data Standards)

### 7.1 交易笔记标签
- `#PA/Trade` - 单笔交易笔记
- `#PA/Daily` - 每日复盘笔记
- `#PA/Strategy` - 策略卡片
- `#flashcards` - SRS 学习卡片
- `#task/urgent` - 紧急任务
- `#task/question` - 待解决问题

### 7.2 交易笔记属性 (Frontmatter)
关键字段定义在 `Templates/属性值预设.md`：
- `market_cycle` - 市场周期 (趋势/区间/等)
- `direction` - 交易方向 (Long/Short)
- `strategy_name` - 策略名称
- `execution_quality` - 执行评价
- `patterns_observed` - 观察到的形态

### 7.3 目录规范
- 交易记录: `Daily/Trades/`
- 策略卡片: `策略仓库 (Strategy Repository)/`
- 学习笔记: `Notes 笔记/`
- 模板: `Templates/`

---

## 8. 敏感区域与限制 (Sensitive Areas)

### 8.1 禁止修改
| 路径 | 说明 | 操作限制 |
|------|------|----------|
| `backend/tradecat-core/config/.env` | 生产配置（含密钥） | 只读 |
| `backend/tradecat-core/**/data/` | SQLite 数据文件 | 只读 |
| `.obsidian/plugins/*/data.json` | 插件数据 | 谨慎修改 |
| `Exports/al-brooks-console/snapshot_*.json` | 自动导出的快照 | 禁止修改 |

### 8.2 谨慎操作
- `backend/tradecat-core/` 下的数据库 schema 变更
- `main.js` 和 `main.css` 是编译产物，不要直接修改
- 大范围重构需先与任务需求确认

---

## 9. 常用命令速查 (Quick Reference)

### 9.1 插件开发
| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式监听 |
| `npm run build` | 生产构建 |
| `npm test` | 运行测试 |

### 9.2 后端运维
| 命令 | 说明 |
|------|------|
| `./scripts/init.sh` | 初始化服务 |
| `./scripts/start.sh start` | 启动服务 |
| `./scripts/start.sh status` | 查看状态 |
| `./scripts/verify.sh` | 验证代码 |
| `make help` | 显示帮助 |

### 9.3 Obsidian 命令
| 命令 | 说明 |
|------|------|
| `打开交易员控制台` | 打开插件主视图 |
| `新建交易笔记` | 从模板创建交易笔记 |
| `导出索引快照` | 导出交易数据快照 |

---

## 10. 架构说明 (Architecture Notes)

### 10.1 插件架构
```
src/
├── main.ts                 # 插件入口
├── settings.ts             # 配置定义
├── settings-tab.ts         # 设置界面
├── core/                   # 核心业务逻辑
│   ├── action/             # 操作服务
│   ├── market-state-machine.ts  # 市场状态推断
│   ├── smart-alert-engine.ts    # 智能预警
│   ├── memory.ts           # SRS 记忆服务
│   └── ...
├── views/                  # UI 视图
│   ├── Dashboard.tsx       # 主控制台
│   ├── tabs/               # 标签页
│   └── components/         # 组件
├── ui/components/          # 基础 UI 组件
├── hooks/                  # React Hooks
├── integrations/           # 第三方集成
└── platforms/obsidian/     # Obsidian 适配层
```

### 10.2 数据流向
```
Obsidian Vault (.md 文件)
    ↓
ObsidianTradeIndex / ObsidianStrategyIndex (索引)
    ↓
Dashboard.tsx (React UI)
    ↓
用户交互 / 后端 API
```

### 10.3 后端服务架构
详见 `backend/tradecat-core/AGENTS.md`

---

## 11. 迁移说明 (Migration Notes)

本项目正在从 **DataviewJS 脚本 (v5.0)** 向 **原生 Obsidian 插件** 迁移：

- **旧版**: `scripts/pa-*.js` (DataviewJS，仍然可用)
- **新版**: `.obsidian/plugins/al-brooks-console/` (原生插件，推荐)

迁移原则：
1. 功能一一对应，不删除旧功能
2. UI 布局保持与 v5.0 一致
3. 数据格式保持向后兼容

---

## 12. 外部依赖与集成 (Integrations)

### 12.1 Obsidian 插件集成
- **Dataview** - 数据查询
- **Spaced Repetition** - 间隔重复学习
- **Excalidraw** - 手绘图表
- **Templater** - 模板引擎
- **Make.md** - 文件管理

### 12.2 后端服务集成
- **Binance API** - 加密货币数据
- **Telegram Bot API** - 消息推送
- **Gemini/OpenAI/Claude** - AI 分析

---

## 13. 故障排查 (Troubleshooting)

### 13.1 插件不加载
1. 检查 `main.js` 是否存在
2. 检查 `manifest.json` 版本
3. 查看 Obsidian 开发者控制台 (Ctrl+Shift+I)

### 13.2 后端服务启动失败
1. 检查 `config/.env` 是否存在且权限 600
2. 检查数据库连接
3. 查看日志 `logs/`

### 13.3 构建失败
1. 删除 `node_modules` 重新安装
2. 检查 TypeScript 版本
3. 运行 `./scripts/verify.sh`

---

**文档版本**: 1.0  
**最后更新**: 2026-01-28  
**维护者**: AI Agent Assistant
