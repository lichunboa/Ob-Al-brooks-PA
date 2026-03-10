# vis-service Dockerfile
# 可视化服务 - 生成交易复盘图、K线图等
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（matplotlib 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY services-preview/vis-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制 libs 目录（共享库）
COPY libs/ /app/libs/

# 复制源代码
COPY services-preview/vis-service/src/ /app/src/

# 设置 PYTHONPATH
ENV PYTHONPATH=/app/src:/app/libs

# 设置 matplotlib 非交互模式
ENV MPLBACKEND=Agg

# 暴露端口
EXPOSE 8084

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8084/health')"

# 启动命令
CMD ["python", "-m", "src"]
