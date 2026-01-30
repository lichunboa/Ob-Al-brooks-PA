# AB Console - 后端集成说明

> 更新于 2026-01-31

## 架构

```
Obsidian (al-brooks-console 插件)
    ↕ HTTP API
AB Console-Backend/services-preview/api-service (端口 8088)
    ↕
┌──────────────┬──────────────┬──────────────┐
│ data-service │trading-service│signal-service│
│  (数据采集)   │  (指标计算)   │  (信号检测)   │
└──────────────┴──────────────┴──────────────┘
    ↕                ↕               ↕
  SQLite           SQLite          SQLite
```

## Obsidian 插件 → 后端

Obsidian 控制台插件 (`al-brooks-console`) 通过 HTTP 调用后端 API：

- **后端服务 Tab** — 启动/停止后端、查看状态
- **交易中心** — 查询 K 线、指标、信号
- **数据管理** — 同步策略和交易记录
- **复盘分析** — 获取 AI 分析结果

### API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /api/futures/ohlc/history` | K 线历史 |
| `GET /api/v1/obsidian/sync/status` | Obsidian 同步状态 |
| `POST /api/v1/obsidian/sync/strategies` | 同步策略 |
| `POST /api/v1/obsidian/sync/trades` | 同步交易记录 |

### 配置

Obsidian 插件中的后端地址默认为 `http://localhost:8088`，可在控制台「设置」中修改。

## 启动流程

插件点击「启动后端」按钮时，执行：

```
📁 启动工具/🚀 一键启动.command
```

该脚本依次启动：
1. API Service (端口 8088)
2. data-service (WebSocket 数据采集)
3. trading-service (指标计算)
4. signal-service (信号检测)
5. Web Dashboard (端口 3000)

## 文件路径

| 组件 | 路径 |
|------|------|
| Obsidian 插件源码 | `AB Console-Obsidian/.obsidian/plugins/al-brooks-console/src/` |
| 后端 Tab | `src/views/tabs/BackendTab.tsx` |
| API 服务 | `AB Console-Backend/services-preview/api-service/src/` |
| 启动脚本 | `📁 启动工具/🚀 一键启动.command` |
| 后端配置 | `AB Console-Backend/config/.env` |
