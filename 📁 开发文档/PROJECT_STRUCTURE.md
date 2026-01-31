# AB Console - 项目结构说明

> 更新于 2026-01-31，项目重组后的最新结构。

## 架构概览

项目采用**两层架构**：

1. **AB Console-Obsidian** — Obsidian 知识库，可独立运行
2. **AB Console-Backend** — 后端服务集群 + Web Dashboard，启动后为 Obsidian 提供增强功能

```
Al-brooks-PA/
├── AB Console-Obsidian/       # Obsidian Vault (独立运行)
├── AB Console-Backend/        # 后端 + Web (独立运行)
│   ├── services/              # 核心后端服务
│   ├── services-preview/      # 预览版服务
│   ├── web/                   # Web Dashboard (Next.js)
│   ├── libs/                  # 共享库 + 数据库
│   ├── scripts/               # 管理脚本
│   ├── config/                # 配置 (.env)
│   ├── docs/                  # 后端文档
│   ├── Makefile               # 构建工具
│   ├── docker-compose.yml     # Docker 编排 (可选)
│   └── pyproject.toml         # Python 项目配置
├── docs/                      # 项目级文档
├── 📁 启动工具/               # 一键启动脚本
├── 📁 任务记录/               # 历史任务记录
├── 📁 开发文档/               # 本目录
├── 📁 项目管理/               # 项目管理
└── AGENTS.md                  # AI Agent 手册
```

## AB Console-Obsidian

Obsidian 知识库，用于 Al Brooks 价格行为交易学习。

### 核心内容

- `Categories 分类/` — Al Brooks 视频课程笔记、PPT 笔记
- `Tags/` — 价格行为标签体系
- `Templates/` — 策略卡片、交易记录、课程理论模板
- `Daily/` — 每日笔记
- `策略仓库/` — 交易策略集合

### 自定义插件

- **al-brooks-console** — 交易控制台 (交易中心、复盘分析、策略学习、数据管理、后端服务)
- **journalit** — 交易日志管理
- **obsidian-spaced-repetition** — 间隔重复学习

## AB Console-Backend

Python 后端服务集群，提供数据采集、指标计算、信号检测等功能。

### 核心服务 (`services/`)

| 服务 | 说明 | 运行方式 |
|------|------|----------|
| data-service | Binance 期货数据采集 (WebSocket) | 常驻进程 |
| trading-service | 38 个技术指标计算 | 单次运行 |
| signal-service | 127 条交易信号规则检测 | 常驻进程 |
| ai-service | AI 分析 (就绪检查) | 按需调用 |
| telegram-service | Telegram 机器人通知 | 常驻进程 |
| sync-service | Obsidian 数据同步 | 常驻进程 |

### 预览服务 (`services-preview/`)

| 服务 | 端口 | 说明 |
|------|------|------|
| api-service | 8088 | FastAPI 统一 API 网关 |
| markets-service | - | 多市场数据采集 |
| vis-service | - | 数据可视化 |

### Web Dashboard (`web/`)

Next.js 14 + React 18 + Tailwind CSS + Lightweight Charts

- 路径: `AB Console-Backend/web/`
- 端口: 3000
- 启动: `cd "AB Console-Backend/web" && npm run dev`

### 数据存储

- **SQLite** — 指标数据、信号记录 (`libs/database/services/`)
- **TimescaleDB** — K 线历史数据 (可选，Docker)

### 启动方式

```bash
# 一键启动全部
bash "📁 启动工具/🚀 一键启动.command"

# 或手动启动 API
cd "AB Console-Backend/services-preview/api-service"
source .venv/bin/activate
uvicorn src.app:app --port 8088
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 (Obsidian) | TypeScript, React, esbuild |
| 前端 (Web) | Next.js 14, React 18, Tailwind CSS |
| 后端 | Python 3.9+, FastAPI, SQLAlchemy |
| 数据库 | SQLite (主), TimescaleDB (可选) |
| 数据源 | Binance Futures API, WebSocket |
| AI | OpenAI, Anthropic, Google Generative AI |
