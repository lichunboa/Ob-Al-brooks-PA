# 🦁 AB Console 交易员控制台

> Al Brooks 价格行为交易系统的完整解决方案

---

## 📁 项目结构

为了优化 Obsidian 性能，项目已重新组织为三个独立文件夹：

```
Al-brooks-PA/
├── AB Console-Obsidian/          # Obsidian Vault（知识管理）
├── AB Console-Web/               # Web Dashboard（实时交易）
├── AB Console-Backend/           # 后端服务（数据服务）
└── docs/                       # 项目文档
```

**注意**: 
- 品牌名：**AB Console** (Al Brooks Console)
- 项目最初名为 TradeCat，后更名。文件夹名保持不变以兼容历史代码。
- 在 Obsidian 中打开 `AB Console-Obsidian` 文件夹作为 Vault。

---

## 🚀 快速开始

### 一键启动

```bash
./start-all.sh    # 启动所有服务
./stop-all.sh     # 停止所有服务
```

### 手动启动

**1. 启动后端服务**

```bash
cd "AB Console-Backend/backend/data-service"
python3 server_full.py   # HTTP API (端口 8088)
python3 ws_server.py     # WebSocket (端口 8090)
```

**2. 启动 Web Dashboard**

```bash
cd "AB Console-Web/tradecat-dashboard"
npm run dev

# 访问 http://localhost:3000
```

**3. 使用 Obsidian**

1. 在 Obsidian 中打开 `AB Console-Obsidian` 文件夹
2. 启用 "Al Brooks Console" 插件

---

## 📊 功能特性

### Web Dashboard
- 📈 K线图表 (Lightweight Charts v5)
- 📡 实时市场数据 (WebSocket)
- 🔍 市场扫描仪
- 🔔 信号监控
- 📋 策略管理 (与 Obsidian 双向同步)
- 📝 交易记录
- ⚙️ 系统设置

### Obsidian Vault
- 📚 策略卡片仓库
- 🗓️ 每日交易日志
- 📊 复盘分析
- 🎯 SRS 学习系统

### 后端服务
- 💹 Binance API 集成
- 📊 实时 K线数据
- 🔄 WebSocket 推送
- 📝 Obsidian 文件同步
- 📈 策略信号计算

---

## 🔗 访问地址

| 服务 | URL | 说明 |
|------|-----|------|
| Web Dashboard | http://localhost:3000 | 主界面 |
| HTTP API | http://localhost:8088 | REST API |
| WebSocket | ws://localhost:8090 | 实时数据 |

---

## 📝 技术栈

**前端**: Next.js 14 + React 18 + TypeScript + Tailwind CSS + Lightweight Charts v5

**后端**: Python 3.12 + HTTP Server + WebSocket + Binance API

**数据存储**: Obsidian Markdown + YAML Frontmatter

---

## 🤝 品牌说明

**AB Console** = **A**l **B**rooks Console

专为 Al Brooks 价格行为方法论设计的交易员工作台。
