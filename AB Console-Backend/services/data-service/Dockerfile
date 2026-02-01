FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY src/ ./src/

# 环境变量
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

# 启动命令 - 运行 WebSocket 采集器
CMD ["python3", "-m", "collectors.ws"]
