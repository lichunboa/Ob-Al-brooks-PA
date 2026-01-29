# 🦁 AB Console 启动工具

一键管理 AB Console 后端服务。

## 📁 文件说明

| 文件 | 功能 |
|------|------|
| 🚀 一键启动.command | 启动所有服务（API + 数据采集 + 指标计算 + 信号） |
| 🛑 一键停止.command | 停止所有服务 |
| 📊 状态检查.command | 查看所有服务状态 + 交互式操作 |

## 🚀 快速开始

### 1. 启动服务
双击 `🚀 一键启动.command` 启动所有服务。

### 2. 检查状态
双击 `📊 状态检查.command` 查看服务运行状态。

### 3. 停止服务
双击 `🛑 一键停止.command` 停止所有服务。

## 📊 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                        AB Console                            │
├─────────────────────────────────────────────────────────────┤
│  🌐 Web Dashboard (localhost:3000)                          │
│     └── Next.js 前端界面                                     │
├─────────────────────────────────────────────────────────────┤
│  📡 API Service (localhost:8088)                            │
│     ├── REST API 接口                                        │
│     ├── Obsidian 同步                                        │
│     └── K线/指标/信号查询                                    │
├─────────────────────────────────────────────────────────────┤
│  ⚙️  核心服务                                                │
│     ├── data-service    → 实时采集 Binance 数据              │
│     ├── trading-service → 计算技术指标 (RSI/MACD/布林带等)   │
│     └── signal-service  → 检测交易信号 (127条规则)           │
├─────────────────────────────────────────────────────────────┤
│  💾 数据存储                                                 │
│     ├── TimescaleDB (端口 5434) → K线数据                   │
│     └── SQLite → 指标结果 + 交易信号                        │
└─────────────────────────────────────────────────────────────┘
```

## 🌐 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| Web Dashboard | http://localhost:3000/chart | 可视化界面 |
| API 文档 | http://localhost:8088/docs | Swagger 文档 |
| 健康检查 | http://localhost:8088/health | API 状态 |
| Obsidian 同步 | http://localhost:8088/api/v1/obsidian/sync/status | 同步状态 |

## 🔧 故障排查

### API 未响应
```bash
# 重启 API Service
cd "AB Console-Backend/services-preview/api-service"
./scripts/start.sh restart
```

### 数据库连接失败
```bash
# 检查 TimescaleDB
docker exec tradecat-timescaledb pg_isready -U postgres

# 重启数据库
cd "AB Console-Backend"
docker compose restart timescaledb
```

### 查看日志
```bash
# data-service (数据采集)
tail -f "AB Console-Backend/services/data-service/logs/ws.log"

# trading-service (指标计算)
tail -f "AB Console-Backend/services/trading-service/logs/indicator_run.log"

# signal-service (信号检测)
tail -f "AB Console-Backend/services/signal-service/logs/signal.log"

# API Service
tail -f "AB Console-Backend/services-preview/api-service/logs/api.log"
```

## 📋 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| ✅ 实时 K线数据 | 已启用 | BTC/ETH/SOL/BNB 实时更新 |
| ✅ 技术指标 | 已启用 | 38个指标 (RSI/MACD/布林带等) |
| ✅ 交易信号 | 已启用 | 127条规则自动检测 |
| ✅ Obsidian 同步 | 已启用 | 策略/交易记录同步 |
| ✅ Web Dashboard | 已启用 | 可视化界面 |
| ✅ 期货情绪 | 已启用 | 资金费率/持仓/买卖比 |

---

**双击 🚀 一键启动.command 开始使用！** 🎉
