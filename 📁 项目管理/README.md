# AB Console - 项目管理

Al Brooks 价格行为交易系统 — 集 Obsidian 知识管理、后端数据服务、Web Dashboard 于一体。

## 项目结构

```
Al-brooks-PA/
├── AB Console-Obsidian/       Obsidian 知识库 (可独立运行)
│   ├── Categories 分类/       Al Brooks 课程笔记
│   ├── Tags/                  标签体系
│   ├── Templates/             模板
│   ├── .obsidian/plugins/     插件 (含交易控制台)
│   └── ...
│
├── AB Console-Backend/        后端服务 + Web Dashboard
│   ├── services/              核心服务 (data/trading/signal/ai/telegram)
│   ├── services-preview/      预览服务 (api-service 等)
│   ├── web/                   Web Dashboard (Next.js)
│   ├── libs/                  共享库 + SQLite 数据库
│   ├── scripts/               管理脚本
│   ├── config/                配置文件 (.env)
│   └── docs/                  后端文档
│
├── 📁 启动工具/               一键启动/停止脚本
├── 📁 任务记录/               历史任务记录
├── 📁 开发文档/               开发文档
├── 📁 项目管理/               本目录
├── docs/                      项目级文档
└── AGENTS.md                  AI Agent 操作手册
```

## 快速开始

### 1. 仅使用 Obsidian (学习模式)

直接用 Obsidian 打开 `AB Console-Obsidian/` 即可。
内置交易控制台插件提供策略管理、复盘分析、间隔复习等功能。

### 2. 启动后端 (增强模式)

```bash
bash "📁 启动工具/🚀 一键启动.command"
```

启动后提供：
- **API Service** (8088) — 数据查询接口
- **data-service** — Binance 实时数据采集
- **trading-service** — 38 个技术指标计算
- **signal-service** — 127 条交易信号检测
- **Web Dashboard** (3000) — 实时交易界面

### 3. 停止服务

```bash
bash "📁 启动工具/🛑 一键停止.command"
```

## 访问地址

| 服务 | 地址 |
|------|------|
| Web Dashboard | http://localhost:3000 |
| API 文档 | http://localhost:8088/docs |
| API 健康检查 | http://localhost:8088/health |
