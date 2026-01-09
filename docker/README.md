# TradeCat Docker 部署

一键部署 TradeCat 全栈服务，包含 TimescaleDB 数据库（预装完整 schema）和所有微服务。

## 安全注意事项

> **重要**: 生产环境部署前必须完成以下安全配置

1. **数据库密码**: 必须修改默认密码，通过环境变量设置
2. **配置文件权限**: `config/.env` 必须设置 `chmod 600`
3. **端口暴露**: 数据库端口默认只绑定 `127.0.0.1`，不对外暴露
4. **非 root 运行**: 应用容器以 UID 1000 用户运行

## 快速开始

### 1. 配置环境变量

```bash
# 复制配置模板
cp config/.env.example config/.env

# 设置安全权限（重要！）
chmod 600 config/.env

# 编辑配置（必填：BOT_TOKEN）
vim config/.env
```

### 2. 设置数据库密码（生产环境必须）

```bash
# 方式一：环境变量（推荐）
export POSTGRES_PASSWORD="your_strong_password_here"

# 方式二：在 docker/.env 中设置
echo "POSTGRES_PASSWORD=your_strong_password_here" > docker/.env
```

### 3. 一键启动

```bash
cd docker
docker-compose up -d
```

### 3. 查看状态

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f tradecat
docker-compose logs -f timescaledb
```

### 4. 停止服务

```bash
docker-compose down

# 停止并删除数据（谨慎！）
docker-compose down -v
```

## 目录结构

```
docker/
├── Dockerfile              # TradeCat 主镜像（Python + TA-Lib）
├── docker-compose.yml      # 生产部署配置
├── docker-compose.dev.yml  # 开发模式（代码热重载）
├── entrypoint.sh           # 容器入口脚本
├── README.md               # 本文档
└── timescaledb/            # 数据库初始化脚本
    ├── 001_init.sql        # 表结构
    ├── 002_functions.sql   # 函数和触发器
    ├── 003_continuous_aggregates.sql  # 连续聚合视图
    └── 004_policies.sql    # 压缩和保留策略
```

## 服务说明

| 服务 | 端口 | 说明 |
|:---|:---|:---|
| timescaledb | 5433 | TimescaleDB 数据库 |
| tradecat | - | 主服务（data + trading + telegram） |

## 数据库

Docker 部署会自动：
- 创建 `market_data` schema
- 创建 `candles_1m` 和 `binance_futures_metrics_5m` 表
- 创建 14 个 K线连续聚合视图（3m~1M）
- 创建 5 个指标连续聚合视图
- 配置压缩策略（30天）
- 配置保留策略

### 连接数据库

```bash
# 从宿主机连接
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d market_data

# 从容器内连接
docker exec -it tradecat-db psql -U postgres -d market_data
```

## 开发模式

开发模式会挂载源代码，支持修改后即时生效：

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## 单独启动服务

```bash
# 只启动数据服务
docker run --rm -it --env-file ../config/.env tradecat data

# 只启动交易服务
docker run --rm -it --env-file ../config/.env tradecat trading

# 只启动 Telegram Bot
docker run --rm -it --env-file ../config/.env tradecat telegram

# 进入容器 shell
docker run --rm -it tradecat shell
```

## 数据持久化

数据存储在 Docker volumes 中：

| Volume | 说明 |
|:---|:---|
| `timescaledb_data` | TimescaleDB 数据 |
| `sqlite_data` | SQLite 指标数据 |
| `logs_data` | 日志文件 |

### 备份数据

```bash
# 备份 TimescaleDB
docker exec tradecat-db pg_dump -U postgres market_data > backup.sql

# 备份 volumes
docker run --rm -v tradecat_timescaledb_data:/data -v $(pwd):/backup alpine tar czf /backup/timescaledb_backup.tar.gz /data
```

## 故障排查

### 数据库连接失败

```bash
# 检查数据库容器状态
docker-compose ps timescaledb

# 查看数据库日志
docker-compose logs timescaledb

# 测试连接
docker exec tradecat-db pg_isready -U postgres
```

### 服务启动失败

```bash
# 查看详细日志
docker-compose logs --tail=100 tradecat

# 进入容器调试
docker exec -it tradecat-app /bin/bash
```

### 重建镜像

```bash
# 强制重建
docker-compose build --no-cache
docker-compose up -d
```

## 系统要求

- Docker 20.10+
- Docker Compose 2.0+
- 最小内存: 2GB
- 推荐内存: 4GB+
- 磁盘空间: 10GB+（视数据量而定）
