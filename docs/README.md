# 🦁 AB Console 交易员控制台 - 文档中心

> 项目文档总入口

---

## 📁 文档结构

```
docs/
├── architecture/          # 架构设计文档
│   ├── 架构分析-三分离方案.md
│   ├── 策略同步方案.md
│   ├── 迁移计划-详细执行方案.md
│   └── 迁移进度.md
├── obsidian/              # Obsidian 插件文档
│   ├── README.md
│   └── API.md
├── web/                   # Web Dashboard 文档
│   ├── README.md
│   ├── 开发指南.md
│   └── 部署指南.md
├── backend/               # 后端服务文档
│   ├── README.md
│   ├── API文档.md
│   └── 数据源配置.md
└── README.md              # 本文档
```

---

## 🏗️ 项目架构

### 三分离架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Obsidian      │     │  Web Dashboard  │     │    Backend      │
│   (知识管理)     │◄────┤   (实时交易)     │◄────┤   (数据服务)     │
│                 │     │                 │     │                 │
│ • 交易笔记      │     │ • K线图表        │     │ • Binance API   │
│ • 复盘分析      │     │ • 市场扫描       │     │ • 策略计算       │
│ • 策略卡片      │     │ • 信号监控       │     │ • 数据存储       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                         │                       │
        └─────────────────────────┴───────────────────────┘
                                  │
                         数据流向: HTTP API / WebSocket
```

---

## 🚀 快速开始

### 1. 启动后端服务

```bash
cd backend/tradecat-core/services/websocket-service
python3 simple_server.py

# 服务运行在 http://localhost:8088
# API 文档: docs/backend/API文档.md
```

### 2. 启动 Web Dashboard

```bash
cd tradecat-dashboard
npm run dev

# 访问 http://localhost:3000
```

### 3. 使用 Obsidian 插件

```bash
# 在 Obsidian 中打开本项目
# 启用 al-brooks-console 插件
```

---

## 📊 当前状态

| 组件 | 状态 | 版本 | 说明 |
|------|------|------|------|
| Obsidian 插件 | 🟡 稳定 | v1.7.0 | 知识管理功能完整 |
| Web Dashboard | 🟡 开发中 | v0.1.0 | 基础功能可用，待完善 |
| 后端服务 | 🟢 运行中 | v2.0.0 | Binance 数据源已接入 |

---

## 📖 详细文档

### 架构设计
- [三分离架构方案](./architecture/架构分析-三分离方案.md)
- [策略同步方案](./architecture/策略同步方案.md)
- [迁移计划](./architecture/迁移计划-详细执行方案.md)
- [当前进度](./architecture/迁移进度.md)

### 开发文档
- [Obsidian 插件开发](./obsidian/README.md)
- [Web Dashboard 开发](./web/README.md)
- [后端服务开发](./backend/README.md)

---

## 🔧 技术栈

| 组件 | 技术栈 |
|------|--------|
| **Obsidian 插件** | TypeScript, React, Obsidian API |
| **Web Dashboard** | Next.js 14, React, Tailwind CSS, Lightweight Charts |
| **后端服务** | Python, FastAPI (简化版), Binance API |
| **数据源** | Binance REST API |

---

## 📞 支持

- 问题反馈: 在 GitHub Issues 中提交
- 文档更新: 修改对应目录下的 .md 文件

---

*最后更新: 2026-01-29*
