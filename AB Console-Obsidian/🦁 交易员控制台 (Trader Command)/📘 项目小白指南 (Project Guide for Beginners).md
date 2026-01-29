# 📘 项目小白指南 (Project Guide for Beginners)

> 本文档用通俗易懂的语言解释项目结构，帮助非技术人员理解整个系统。

---

## 🎯 一句话概括

这是一个**交易员专用的 Obsidian 插件**，可以：
- 📊 实时查看多个市场的价格（BTC、美股、外汇等）
- 🔍 自动检测 Al Brooks 交易形态（双重底、楔形等）
- 🔔 发现交易机会时提醒你（电脑通知 + 手机推送）
- 📝 一键创建交易笔记，方便复盘

---

## 🏗️ 项目结构图解

```
📁 Al-brooks-PA (整个项目文件夹)
│
├── 📁 .obsidian/plugins/al-brooks-console/     ← 【前端】Obsidian 插件
│   │                                              (你看到的界面)
│   ├── src/
│   │   ├── ui/scanner/       # 市场扫描仪界面
│   │   ├── views/            # 各种标签页
│   │   └── settings.ts       # 设置页面
│   ├── main.js               # 插件入口文件
│   └── manifest.json         # 插件信息
│
├── 📁 backend/tradecat-core/                    ← 【后端】数据处理服务
│   │                                              (在后台运行的程序)
│   ├── services/
│   │   ├── data-service/     # 采集实时价格数据
│   │   ├── trading-service/  # 计算技术指标 (MACD/RSI等)
│   │   ├── signal-service/   # 检测交易信号
│   │   ├── api-gateway/      # 对外提供 API 接口
│   │   └── telegram-service/ # 发送 Telegram 提醒
│   └── docker-compose.yml    # 一键启动所有服务
│
├── 📁 "策略仓库 (Strategy Repository)"/          ← 【策略卡片】
│   └── (各种交易策略的笔记，如双重底、楔形等)
│
├── 📁 Daily/Trades/                            ← 【交易笔记】
│   └── (你每天的交易记录)
│
└── 📁 "🦁 交易员控制台 (Trader Command)"/        ← 【规划文档】
    └── (升级计划、需求文档等)
```

### 通俗解释

| 组件 | 比喻 | 作用 |
|------|------|------|
| **Obsidian 插件** | 手机 App | 你看到的界面，操作的地方 |
| **后端服务** | 云端服务器 | 在后台采集数据、计算指标 |
| **TimescaleDB** | 数据库 | 存储历史价格数据 |
| **Telegram Bot** | 微信机器人 | 给你发消息提醒 |

---

## 🔄 数据流向图解

```
【交易所】                    【后端】                      【插件】
币安/Yahoo  ──────►  data-service  ──────►  api-gateway  ──────►  Obsidian
(价格来源)            (采集数据)            (提供接口)           (显示界面)
                          │
                          ▼
                    TimescaleDB
                    (存储历史数据)
                          │
                          ▼
                    signal-service  ──────►  Telegram  ──────►  你的手机
                    (检测信号)              (发送消息)
```

### 举例说明

你想看 BTC 的价格：
1. **币安交易所** 实时产生价格数据
2. **data-service** 连接到币安，把价格存到数据库
3. **api-gateway** 提供接口：`/api/v1/candles/BTCUSDT`
4. **Obsidian 插件** 调用这个接口，把价格显示在图表上

发现双重底形态时：
1. **signal-service** 扫描数据库，发现符合双重底条件
2. 发送消息给 **telegram-service**
3. **Telegram Bot** 推送消息到你的手机

---

## 💻 技术栈解释

### 前端 (Obsidian 插件)

| 技术 | 用途 | 简单解释 |
|------|------|----------|
| **TypeScript** | 编程语言 | JavaScript 的升级版，更安全 |
| **React** | 界面框架 | 用来画按钮、图表、列表 |
| **Lightweight Charts** | 图表库 | 画 K 线图的专业工具 |
| **IndexedDB** | 本地数据库 | 浏览器里的数据库，存3个月数据 |

### 后端 (TradeCat 服务)

| 技术 | 用途 | 简单解释 |
|------|------|----------|
| **Python** | 编程语言 | 简单易学，适合数据处理 |
| **FastAPI** | Web 框架 | 提供 API 接口给前端调用 |
| **TimescaleDB** | 时序数据库 | 专门存价格数据的数据库 |
| **WebSocket** | 实时通信 | 服务器主动推送数据到前端 |
| **Docker** | 容器化 | 一键启动所有服务，不用配置环境 |

---

## 📂 重要文件位置

| 文件/文件夹 | 作用 | 什么时候需要改 |
|------------|------|---------------|
| `backend/tradecat-core/config/.env` | 后端配置 | 修改数据库密码、API Token |
| `backend/tradecat-core/docker-compose.yml` | Docker 配置 | 添加新服务、修改端口 |
| `.obsidian/plugins/al-brooks-console/src/settings.ts` | 插件设置 | 添加新的设置选项 |
| `🦁 交易员控制台/📋 全面升级规划书.md` | 开发计划 | 新增需求、调整优先级 |

---

## 🚀 常用命令速查

### 启动后端服务
```bash
# 进入后端目录
cd backend/tradecat-core

# 启动所有服务
./scripts/start.sh start

# 查看状态
./scripts/start.sh status

# 停止服务
./scripts/start.sh stop
```

### 查看数据
```bash
# 检查 BTC 最新价格
curl http://localhost:8088/api/v1/candles/BTCUSDT?limit=1&interval=5m

# 检查后端状态
curl http://localhost:8088/health
```

### Git 操作
```bash
# 切换到开发分支
cd backend/tradecat-core
git checkout feature/market-scanner-v2

# 查看修改
git status

# 提交修改
git add -A
git commit -m "描述这次修改"

# 推送到 GitHub
git push origin-user feature/market-scanner-v2
```

---

## ❓ 常见问题

### Q1: 为什么需要后端？不能直接用 Obsidian 吗？

**答**: Obsidian 插件只能在浏览器环境里运行，无法直接连接交易所获取实时数据。后端服务负责：
- 连接币安/Yahoo 获取实时价格
- 计算复杂的技术指标
- 存储大量历史数据
- 在后台持续监控信号

### Q2: 为什么用 Docker？

**答**: Docker 就像一个"打包好的盒子"，里面包含了程序运行所需的一切（数据库、Python环境、配置等）。你只需要运行一条命令，就能启动所有服务，不用手动安装配置。

### Q3: 什么是 WebSocket？

**答**: 普通的 HTTP 请求是你问服务器要数据，服务器才给你。WebSocket 是服务器有数据时主动推给你，更适合实时价格更新。

### Q4: 为什么数据有时候延迟？

**答**: 可能的原因：
1. **网络问题**: 连接交易所的网络不稳定
2. **服务没启动**: data-service 没有正常运行
3. **数据库问题**: 聚合表没有正确创建

排查方法：看后端日志、`./scripts/start.sh status`

### Q5: 如何添加新的监控品种？

**答**: 
1. **前端**: 在 `MarketScannerComponent.tsx` 的 `DEFAULT_SYMBOLS` 里添加
2. **后端**: 确保 data-service 采集该品种的数据
3. **数据库**: 检查该品种的数据是否正常写入

---

## 📞 寻求帮助

当你遇到问题时，提供以下信息有助于快速定位：

1. **现象**: 发生了什么？（如图表不显示、数据不更新）
2. **操作**: 你做了什么？（如重启电脑、切换周期）
3. **日志**: 后端有什么报错？
   ```bash
   cd backend/tradecat-core
   ./scripts/start.sh status
   cat logs/*/service.log | tail -20
   ```
4. **环境**: Obsidian 版本、插件版本、后端分支

---

## 📚 学习资源

| 主题 | 资源 | 难度 |
|------|------|------|
| Obsidian 插件开发 | 官方文档 | ⭐⭐⭐ |
| React 基础 | React 官方教程 | ⭐⭐ |
| TypeScript 基础 | TypeScript  handbook | ⭐⭐ |
| Docker 入门 | Docker 官方指南 | ⭐ |
| Git 基础 | Git 简明指南 | ⭐ |

---

**最后更新**: 2026-01-28
**维护者**: AI Assistant
