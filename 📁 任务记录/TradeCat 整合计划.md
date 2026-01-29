# TradeCat → AB Console 整合计划

## 目标
将 TradeCat 后端完全整合到 AB Console 项目，成为官方后端。

## 整合策略：逐步替换

### Step 1: 品牌替换（立即）
- ✅ 已完成：README、文档中的 TradeCat → AB Console
- 📝 待完成：代码中的 TradeCat 引用

### Step 2: API 适配（本周）
当前 AB Console Web/Obsidian 期望的 API：
```
GET  /api/v1/candles/{symbol}     ✅ 官方已有
GET  /api/v1/indicators/{symbol}  ✅ 官方已有
GET  /api/v1/signals              ✅ 官方已有
GET  /api/v1/sync/status          ❌ 需要添加
POST /api/v1/strategies/sync      ❌ 需要添加
```

**方案**：在官方 api-service 中添加 Obsidian 同步端点

### Step 3: 功能扩展（下周）
新增 AB Console 专属功能：
- 策略卡片管理 API
- 交易记录 API  
- Al Brooks 形态识别
- 学习计划追踪

### Step 4: 架构优化（长期）
- 简化微服务架构
- 优化数据库设计
- 添加更多数据源（美股、A股）

## 文件映射

| TradeCat 路径 | AB Console 路径 | 状态 |
|--------------|-----------------|------|
| `services/data-service` | `AB Console-Backend/services/data` | ✅ 保留 |
| `services/trading-service` | `AB Console-Backend/services/indicators` | ✅ 保留 |
| `services/signal-service` | `AB Console-Backend/services/signals` | ✅ 保留 |
| `services-preview/api-service` | `AB Console-Backend/services/api` | 📝 需要添加 Obsidian 端点 |
| - | `AB Console-Backend/services/sync` | 📝 新增 Obsidian 同步服务 |

## 开发流程

1. **维护独立分支**：`feature/ab-console-backend`
2. **定期同步上游**：从 TradeCat 官方拉取更新
3. **渐进式修改**：每次只改一个服务，确保稳定
4. **完整测试**：每次修改后验证 Web + Obsidian 都能正常工作

## 最终目标

```
AB Console-Backend/          # 完全属于我们的后端
├── services/
│   ├── api/                 # API 网关（基于 TradeCat + 我们的定制）
│   ├── data/                # 数据采集（基于 TradeCat）
│   ├── indicators/          # 指标计算（基于 TradeCat）
│   ├── signals/             # 信号检测（基于 TradeCat + Al Brooks）
│   ├── sync/                # Obsidian 同步（完全自建）
│   └── ai/                  # AI 分析（基于 TradeCat）
├── docker-compose.yml       # 一键启动
└── README.md                # AB Console 品牌
```
