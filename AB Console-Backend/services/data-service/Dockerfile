FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖
COPY services/data-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY services/data-service/src/ ./src/

# 复制公共库
COPY libs/common/ ./common/

# 环境变量
ENV PYTHONPATH=/app/src:/app
ENV PYTHONUNBUFFERED=1

# 健康检查端口
EXPOSE 8081

# 启动命令 - 运行所有采集器
CMD ["python", "-m", "src", "--all", "--health-port", "8081"]
