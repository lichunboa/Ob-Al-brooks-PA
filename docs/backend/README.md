# AB Console - 后端服务文档

> 更新于 2026-01-31

## 概述

后端服务位于 `AB Console-Backend/`，提供数据采集、技术指标计算、交易信号检测、API 网关等功能。

## 服务架构

```
API Service (端口 8088, FastAPI)
    ↓
┌──────────────┬──────────────┬──────────────┐
│ data-service │trading-service│signal-service│
│  数据采集     │  指标计算     │  信号检测     │
└──────┬───────┴──────┬───────┴──────┬───────┘
       ↓              ↓              ↓
    SQLite          SQLite         SQLite
```

## 核心服务

| 服务 | 路径 | 说明 |
|------|------|------|
| api-service | `services-preview/api-service/` | FastAPI 统一 API 网关 (端口 8088) |
| data-service | `services/data-service/` | Binance 期货 WebSocket 数据采集 |
| trading-service | `services/trading-service/` | 38 个技术指标计算 |
| signal-service | `services/signal-service/` | 127 条交易信号规则 |
| ai-service | `services/ai-service/` | AI 分析 (就绪检查) |
| telegram-service | `services/telegram-service/` | Telegram 机器人通知 |
| sync-service | `services/sync-service/` | Obsidian 数据同步 |

## API 端点

基础地址: `http://localhost:8088`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/docs` | Swagger 文档 |
| GET | `/api/futures/ohlc/history` | K 线历史数据 |
| GET | `/api/v1/obsidian/sync/status` | Obsidian 同步状态 |
| POST | `/api/v1/obsidian/sync/strategies` | 同步策略 |
| POST | `/api/v1/obsidian/sync/trades` | 同步交易记录 |

## 数据存储

- **SQLite** — 主存储，位于 `libs/database/services/`
  - `telegram-service/market_data.db` — 技术指标数据
  - `signal-service/cooldown.db` — 信号冷却状态
  - `signal-service/signal_history.db` — 信号历史
- **TimescaleDB** — K 线历史数据 (可选，需 Docker)

## 启动方式

```bash
# 一键启动
bash "📁 启动工具/🚀 一键启动.command"

# 手动启动 API
cd "AB Console-Backend/services-preview/api-service"
source .venv/bin/activate
uvicorn src.app:app --host 0.0.0.0 --port 8088 --reload
```

## 配置

生产配置: `AB Console-Backend/config/.env`
配置模板: `AB Console-Backend/config/.env.example`
