# AB Console 项目结构

本项目分为三个独立的部分，分别存放在三个文件夹中：

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

**使用方法**: 
```bash
cd AB Console-Web/tradecat-dashboard
npm run dev
```

### AB Console-Backend/
后端服务（数据服务）
- Python 服务
- Binance API 接入
- 策略计算引擎

**使用方法**:
```bash
cd AB Console-Backend/backend/tradecat-core/services/websocket-service
python3 simple_server.py
```

### docs/
项目文档（仍在根目录）
- 架构设计文档
- 开发指南
- API 文档

## 🚀 快速启动

### 1. 启动后端
```bash
cd AB Console-Backend/backend/tradecat-core/services/websocket-service
python3 simple_server.py
```

### 2. 启动 Web Dashboard
```bash
cd AB Console-Web/tradecat-dashboard
npm run dev
```

### 3. 打开 Obsidian
在 Obsidian 中打开 `AB Console-Obsidian` 文件夹

## 📊 端口

- 后端: http://localhost:8088
- Web: http://localhost:3000
