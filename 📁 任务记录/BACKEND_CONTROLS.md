# 🎮 AB Console 控制方式大全

## 唯一的启动方式: 完整后端

**重要**: AB Console 只提供完整后端方案，所有功能都依赖 Docker 运行。

---

## 启动方式

### 方式 1: 双击图标 ⭐最推荐

| 平台 | 文件 | 功能 |
|------|------|------|
| macOS | `📁 启动工具/🚀 启动 AB Console.command` | 启动 Web + Backend |
| Windows | `📁 启动工具/🚀 启动 AB Console.bat` | 启动 Web + Backend |
| macOS | `📁 启动工具/🛑 停止 AB Console.command` | 停止所有服务 |
| Windows | `📁 启动工具/🛑 停止 AB Console.bat` | 停止所有服务 |

### 方式 2: Obsidian 插件

1. 打开 Obsidian → AB Console 插件 → **Backend Tab**
2. 点击 **"🚀 启动后端"** 按钮
3. 等待状态变为 "🟢 运行中"

### 方式 3: 终端

```bash
# 启动所有服务
cd ~/Desktop/Obsidian/Al-brooks-PA
./📁\ 启动工具/start-all.sh

# 停止服务
./📁\ 启动工具/stop-all.sh
```

---

## 系统要求

**必须满足以下要求才能运行 AB Console**:

1. **Docker Desktop** - 必需，用于运行后端服务
2. **Node.js 18+** - 用于 Web Dashboard (可选，插件可独立运行)

**不支持**: 无 Docker 的简化方案

---

## 服务架构

启动后会运行以下 Docker 容器:

| 服务 | 端口 | 说明 |
|------|------|------|
| timescaledb | 5434 | PostgreSQL 时序数据库 |
| api-gateway | 8088 | API 网关 + Obsidian 同步 |
| data-service | - | 实时数据采集 |
| trading-service | - | 技术指标计算 |
| signal-service | - | 交易信号检测 |
| telegram-service | - | Telegram Bot |
| ai-service | - | AI 分析服务 |

---

## Docker 故障处理

如果 Docker 无法启动，**必须修复 Docker**，没有其他替代方案。

### 修复步骤

1. **重启 Docker Desktop**
   ```bash
   # macOS
   killall Docker
   sleep 10
   open /Applications/Docker.app
   ```

2. **重置 Docker Desktop** (如果重启无效)
   - Docker Desktop → Settings → Troubleshoot → "Clean / Purge data"

3. **重新安装 Docker Desktop** (如果重置无效)
   - 从官网下载最新版: https://www.docker.com/products/docker-desktop

---

## 访问地址

| 服务 | URL |
|------|-----|
| Web Dashboard | http://localhost:3000 |
| API Gateway | http://localhost:8088 |
| API 文档 | http://localhost:8088/docs |
| Health Check | http://localhost:8088/health |

---

## 故障排查

### Docker 错误

```bash
# 检查 Docker 状态
docker info

# 检查容器状态
cd "AB Console-Backend"
docker compose ps

# 查看日志
docker compose logs -f
```

### 端口冲突

```bash
# 检查端口占用
lsof -i :8088
lsof -i :3000

# 结束占用进程
kill -9 <PID>
```

### 连接问题

1. 确认后端运行: `curl http://localhost:8088/health`
2. 检查 Obsidian 插件设置中的 URL
3. 刷新 Web Dashboard 页面

---

## 为什么只有完整后端？

为了保证所有功能一致性和用户体验:

- ✅ 所有功能都可用 (数据、指标、信号、AI)
- ✅ 避免功能缺失导致的困惑
- ✅ 统一的架构和维护
- ✅ 避免"临时方案变永久"

如果 Docker 有问题，**请修复 Docker**，而不是寻找替代方案。
