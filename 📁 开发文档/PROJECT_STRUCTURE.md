# AB Console 项目结构

> 🦁 Al Brooks 价格行为交易系统

本项目分为三个独立的部分：

## 📁 文件夹说明

### AB Console-Obsidian/
Obsidian Vault（知识管理部分）
- 交易笔记
- 复盘分析
- 策略卡片
- 模板

**使用方法**: 在 Obsidian 中打开此文件夹作为 Vault

### AB Console-Web/
Web Dashboard（实时交易界面）
- Next.js 14 项目
- K线图表
- 市场扫描
- 信号监控
- 交易记录

**使用方法**: 
```bash
cd "AB Console-Web/tradecat-dashboard"
npm run dev
```

### AB Console-Backend/
后端服务（数据服务）
- Python HTTP API 服务
- WebSocket 实时数据服务
- Binance API 接入
- 策略计算引擎
- Obsidian 双向同步

**使用方法**:
```bash
cd "AB Console-Backend/backend/data-service"
python3 server_full.py
python3 ws_server.py
```

### docs/
项目文档
- 架构设计文档
- API 文档
- 同步架构设计

## 🚀 快速启动

### 一键启动所有服务
```bash
./start-all.sh
```

### 手动启动

**1. 启动后端**
```bash
cd "AB Console-Backend/backend/data-service"
python3 server_full.py      # HTTP API (端口 8088)
python3 ws_server.py         # WebSocket (端口 8090)
```

**2. 启动 Web Dashboard**
```bash
cd "AB Console-Web/tradecat-dashboard"
npm run dev
```

**3. 打开 Obsidian**
在 Obsidian 中打开 `AB Console-Obsidian` 文件夹

## 📊 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Web Dashboard | 3000 | Next.js 前端 |
| HTTP API | 8088 | REST API |
| WebSocket | 8090 | 实时数据推送 |
| WS Health | 8089 | WebSocket 健康检查 |

## 🔗 关键页面

- http://localhost:3000 - 仪表板
- http://localhost:3000/chart - K线图表
- http://localhost:3000/scanner - 市场扫描
- http://localhost:3000/signals - 信号监控
- http://localhost:3000/strategies - 策略管理
- http://localhost:3000/trades - 交易记录

## 📝 品牌说明

**AB Console** (Al Brooks Console) 是本系统的品牌名称。
