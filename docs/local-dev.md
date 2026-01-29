# 🖥️ 本地开发指南（无 Docker）

## 关于端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | Web Dashboard | Next.js 前端 |
| 8089 | Sync Service | Python FastAPI 后端 |
| 5434 | PostgreSQL | 数据库（可选 Docker）|

**为什么之前有两个端口（3000 和 3001）？**

之前 3000 端口被旧进程占用，所以临时使用了 3001。现在已清理，统一使用 3000。

## 快速启动（推荐）

```bash
# 一键启动所有服务
./scripts/start-local-dev.sh
```

访问 http://localhost:3000 查看仪表板

## 分别启动

### 1. 数据库（选择一种）

**方案 A: Docker PostgreSQL（简单）**
```bash
docker run -d \
  --name tradecat-db \
  -p 5434:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=tradecat123 \
  -e POSTGRES_DB=tradecat \
  timescale/timescaledb:latest-pg15
```

**方案 B: 本地 PostgreSQL**
```bash
# 使用 Homebrew 安装
brew install postgresql@15
brew services start postgresql@15

# 创建数据库
createdb tradecat
```

### 2. Sync Service（Python）

```bash
cd "AB Console-Backend/services/sync-service"

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m src
```

服务运行在 http://localhost:8089

### 3. Web Dashboard（Next.js）

```bash
cd "AB Console-Web/tradecat-dashboard"

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 环境变量

创建 `AB Console-Backend/services/sync-service/.env`:

```env
# 数据库
DATABASE_URL=postgresql://postgres:tradecat123@localhost:5434/tradecat

# API 配置
API_HOST=0.0.0.0
API_PORT=8089

# 开发模式
LOG_LEVEL=INFO
```

## 数据同步流程

```
Obsidian (笔记)
    ↓ 点击"同步"按钮
Sync Service (:8089) ← Python 解析
    ↓ 存入
PostgreSQL (:5434) ← 数据库
    ↓ 查询展示
Web Dashboard (:3000) ← React/Next.js
```

## 常见问题

**Q: 可以只用 PostgreSQL Docker 吗？**
A: 可以！这是最轻量的方案。数据库用 Docker，其他本地运行：
```bash
# 只启动数据库
docker start tradecat-db 2>/dev/null || docker run -d --name tradecat-db -p 5434:5432 -e POSTGRES_PASSWORD=tradecat123 timescale/timescaledb:latest-pg15

# 然后启动 sync-service 和 web
./scripts/start-local-dev.sh
```

**Q: 端口冲突怎么办？**
```bash
# 查看占用
lsof -i :3000
lsof -i :8089

# 释放端口
kill $(lsof -ti:3000)
kill $(lsof -ti:8089)
```

**Q: 完全不想用 Docker？**
A: 安装本地 PostgreSQL，然后运行：
```bash
# Mac
brew install postgresql@15
brew services start postgresql@15
createdb tradecat

# 修改连接端口为 5432
echo "DATABASE_URL=postgresql://postgres@localhost:5432/tradecat" > "AB Console-Backend/services/sync-service/.env"

# 启动服务
./scripts/start-local-dev.sh
```
