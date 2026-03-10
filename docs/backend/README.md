# AB Patrol 后端服务文档

> 更新于 2026-03-10

## 概述

当前后端位于 `AB Patrol-Agent/`，由巡逻运行时、执行服务与多个 sidecar 服务组成。

## 服务架构

```
AB Patrol Runtime / Query Service
        ↓
┌───────────────┬──────────────┬──────────────┬──────────────┐
│execution-serv.│ api-service  │ sync-service │ signal-service│
│    执行桥      │  Web API     │   数据同步    │   信号检测     │
└──────┬────────┴──────┬───────┴──────┬───────┴──────┬───────┘
       ↓               ↓              ↓               ↓
   Runtime JSON     SQLite/HTTP     SQLite/HTTP     SQLite
                                ↓
                            vis-service
```

## 核心服务

| 服务 | 路径 | 说明 |
|------|------|------|
| query-service | `AB Patrol-Agent/services/consumption/query-service/` | 运行态查询服务 |
| execution-service | `AB Patrol-Agent/services/execution-service/` | 持仓、下单、改单、平仓执行桥 |
| api-service | `AB Patrol-Agent/services/api-service/` | FastAPI Web API (端口 8088) |
| sync-service | `AB Patrol-Agent/services/sync-service/` | Obsidian 与业务数据同步 (端口 8089) |
| signal-service | `AB Patrol-Agent/services/signal-service/` | 信号检测与历史 |
| vis-service | `AB Patrol-Agent/services/vis-service/` | 图表渲染与可视化 (端口 8087) |

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

- **SQLite** — 主存储，位于 `AB Patrol-Agent/libs/database/services/`
  - `telegram-service/market_data.db` — 技术指标数据
  - `signal-service/cooldown.db` — 信号冷却状态
  - `signal-service/signal_history.db` — 信号历史
- **运行态 JSON** — 位于 `AB Patrol-Agent/data/pa_trader/`
- **图表文件** — 位于 `AB Patrol-Agent/data/charts/`

## 启动方式

```bash
# 启动 Patrol 后端主线
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh start

# 只启动 Web 所需 sidecar
./scripts/start.sh web-start

# 手动启动 API
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/api-service"
source .venv/bin/activate
uvicorn src.app:app --host 0.0.0.0 --port 8088 --reload
```

## 配置

生产配置: `AB Patrol-Agent/config/.env`
配置模板: `AB Patrol-Agent/config/.env.example`
