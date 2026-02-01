FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir fastapi uvicorn pydantic

# 复制应用代码
COPY . .

# 创建日志和运行目录
RUN mkdir -p logs run data

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src:/app/libs
ENV DATABASE_URL=postgresql://postgres:postgres@timescaledb:5432/market_data
ENV TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
ENV CLAWDBOT_WEBHOOK=http://host.docker.internal:18789/webhook/albrooks

# 暴露API端口
EXPOSE 8090

# 启动命令
CMD ["python", "-m", "src.bot.app"]
