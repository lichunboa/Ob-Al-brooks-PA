# AB Console - 启动工具

一键管理所有 AB Console 后端服务。

## 文件说明

| 脚本 | 功能 |
|------|------|
| `🚀 一键启动.command` | 启动全部后端服务 + Web Dashboard |
| `🛑 一键停止.command` | 停止所有服务 |
| `📊 状态检查.command` | 查看服务运行状态 |

## 使用方式

### 方式 1: 在 Obsidian 控制台中

打开控制台 → 后端服务 → 点击「启动后端」按钮

### 方式 2: 终端运行

```bash
# 启动
bash "📁 启动工具/🚀 一键启动.command"

# 停止
bash "📁 启动工具/🛑 一键停止.command"

# 状态
bash "📁 启动工具/📊 状态检查.command"
```

### 方式 3: 双击运行

在 Finder 中双击 `.command` 文件即可。

## 启动的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| API Service | 8088 | REST API 网关 (FastAPI) |
| data-service | - | WebSocket 实时数据采集 |
| trading-service | - | 技术指标计算 (38 个指标) |
| signal-service | - | 交易信号检测 (127 条规则) |
| Web Dashboard | 3000 | Next.js 交易界面 |

## 访问地址

- Web Dashboard: http://localhost:3000
- API 文档: http://localhost:8088/docs
- API 健康检查: http://localhost:8088/health

## 查看日志

```bash
# 数据采集
tail -f "AB Console-Backend/services/data-service/logs/ws.log"

# 指标计算
tail -f "AB Console-Backend/services/trading-service/logs/indicator_run.log"

# 信号检测
tail -f "AB Console-Backend/services/signal-service/logs/signal.log"

# API 服务
tail -f "AB Console-Backend/services-preview/api-service/logs/api.log"

# Web Dashboard
tail -f /tmp/ab-web-dashboard.log
```
