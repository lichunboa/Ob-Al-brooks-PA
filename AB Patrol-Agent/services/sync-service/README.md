# Sync Service - Obsidian 数据同步服务

## 功能

- 从 Obsidian Vault 同步交易记录
- 同步策略卡片
- 提供 REST API 供 Web 端查询
- 支持双向数据流

## API 端点

### 健康检查
```
GET /api/v1/health
```

### 交易记录
```
POST /api/v1/trades/sync          # 同步交易记录
GET  /api/v1/trades/list          # 查询交易记录
GET  /api/v1/trades/stats         # 交易统计
GET  /api/v1/trades/symbols       # 交易品种列表
GET  /api/v1/trades/daily         # 每日交易
```

### 策略管理
```
POST /api/v1/strategies/sync      # 同步策略卡片
GET  /api/v1/strategies/list      # 策略列表
GET  /api/v1/strategies/performance  # 策略表现
GET  /api/v1/strategies/categories   # 策略分类
```

### 同步控制
```
POST /api/v1/sync/obsidian/trades      # 从 Obsidian 同步交易
POST /api/v1/sync/obsidian/strategies  # 从 Obsidian 同步策略
POST /api/v1/sync/obsidian/full        # 完整同步
GET  /api/v1/sync/logs                 # 同步日志
```

## 启动

```bash
cd "AB Patrol-Agent/services/sync-service"
uv venv .venv
uv pip install -r requirements.txt
uv run python -m src
```

或本地开发：
```bash
cd "AB Patrol-Agent/services/sync-service"
uv run --with-requirements requirements.txt python -m src
```

## 配置

环境变量：
- `SYNC_API_HOST` - API 绑定地址 (默认: 0.0.0.0)
- `SYNC_API_PORT` - API 端口 (默认: 8089)
- `SYNC_DATABASE_URL` - 数据库连接字符串
- `SYNC_OBSIDIAN_VAULT_PATH` - Obsidian Vault 路径
