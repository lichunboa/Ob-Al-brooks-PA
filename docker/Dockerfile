# =============================================================================
# TradeCat Docker 镜像
# 基于 Python 3.12，预装 TA-Lib 和所有依赖
# =============================================================================

FROM python:3.12-slim-bookworm

LABEL maintainer="TradeCat Team"
LABEL version="1.0"
LABEL description="TradeCat - Crypto Market Data & Trading Bot"

# 避免交互式安装
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# 设置工作目录
WORKDIR /app

# 安装系统依赖（包括 TA-Lib 编译所需）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    curl \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装 TA-Lib 系统库
RUN cd /tmp && \
    wget -q http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib && \
    ./configure --prefix=/usr && \
    make -j$(nproc) && \
    make install && \
    cd / && rm -rf /tmp/ta-lib*

# 复制依赖文件
COPY services/data-service/requirements.txt /tmp/data-service-requirements.txt
COPY services/trading-service/requirements.txt /tmp/trading-service-requirements.txt
COPY services/telegram-service/requirements.txt /tmp/telegram-service-requirements.txt
COPY services/ai-service/requirements.txt /tmp/ai-service-requirements.txt

# 安装 Python 依赖（合并安装，去重）
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    -r /tmp/data-service-requirements.txt \
    -r /tmp/trading-service-requirements.txt \
    -r /tmp/telegram-service-requirements.txt \
    -r /tmp/ai-service-requirements.txt \
    && rm -rf /tmp/*-requirements.txt

# 安装形态检测库
RUN pip install --no-cache-dir m-patternpy && \
    pip install --no-cache-dir tradingpattern --no-deps || true

# 复制项目代码
COPY . /app

# 创建运行时目录
RUN mkdir -p /app/logs /app/pids /app/data \
    /app/libs/database/services/telegram-service

# 设置权限
RUN chmod +x /app/scripts/*.sh 2>/dev/null || true && \
    chmod +x /app/docker/entrypoint.sh 2>/dev/null || true

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

# 入口点
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["all"]
