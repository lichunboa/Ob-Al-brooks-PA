FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建日志和运行目录
RUN mkdir -p logs run

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=postgresql://postgres:postgres@timescaledb:5432/market_data
ENV SQLITE_DB_PATH=/app/data/signals.db

# 创建数据目录和冷却目录
RUN mkdir -p /app/data /app/libs/database/services/signal-service

# 暴露端口（如果有API）
EXPOSE 8080

# 启动命令
CMD ["python", "-m", "src", "--all"]
