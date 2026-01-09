# =============================================================================
# TradeCat Docker 镜像
# 基于 Python 3.12，预装 TA-Lib 和所有依赖
# 
# 安全特性:
#   - 非 root 用户运行（UID 1000）
#   - 最小化基础镜像
#   - 依赖锁定（优先使用 requirements.lock.txt）
# =============================================================================

FROM python:3.12-slim-bookworm AS builder

# 避免交互式安装
ENV DEBIAN_FRONTEND=noninteractive

# 安装构建依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装 TA-Lib 系统库
RUN cd /tmp && \
    wget -q http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    echo "9ff41efcb1c011a4b3107d95ac2c651f9b1ef0e1  ta-lib-0.4.0-src.tar.gz" | sha1sum -c - && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib && \
    ./configure --prefix=/usr && \
    make -j$(nproc) && \
    make install && \
    cd / && rm -rf /tmp/ta-lib*

# =============================================================================
# 运行时镜像
# =============================================================================
FROM python:3.12-slim-bookworm

LABEL maintainer="TradeCat Team"
LABEL version="1.1"
LABEL description="TradeCat - Crypto Market Data & Trading Bot"

# 从构建阶段复制 TA-Lib
COPY --from=builder /usr/lib/libta_lib* /usr/lib/
COPY --from=builder /usr/include/ta-lib /usr/include/ta-lib

# 安装运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    procps \
    && rm -rf /var/lib/apt/lists/* \
    && ldconfig

# 创建非 root 用户
RUN groupadd -g 1000 tradecat && \
    useradd -u 1000 -g tradecat -m -s /bin/bash tradecat

# 设置工作目录
WORKDIR /app

# 复制依赖文件（优先使用锁定版本）
COPY services/data-service/requirements*.txt /tmp/data-service/
COPY services/trading-service/requirements*.txt /tmp/trading-service/
COPY services/telegram-service/requirements*.txt /tmp/telegram-service/
COPY services/ai-service/requirements*.txt /tmp/ai-service/

# 安装 Python 依赖
# 优先使用 requirements.lock.txt（如果存在），否则使用 requirements.txt
# TODO: 添加 --require-hashes 当 lock 文件包含哈希时
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir --upgrade pip && \
    for svc in data-service trading-service telegram-service ai-service; do \
        if [ -f "/tmp/$svc/requirements.lock.txt" ]; then \
            echo "Installing $svc from lock file"; \
            pip install --no-cache-dir -r "/tmp/$svc/requirements.lock.txt"; \
        elif [ -f "/tmp/$svc/requirements.txt" ]; then \
            echo "Installing $svc from requirements.txt"; \
            pip install --no-cache-dir -r "/tmp/$svc/requirements.txt"; \
        fi; \
    done && \
    rm -rf /tmp/*-service

# 安装形态检测库
RUN pip install --no-cache-dir m-patternpy && \
    pip install --no-cache-dir tradingpattern --no-deps || true

# 复制项目代码
COPY --chown=tradecat:tradecat . /app

# 创建运行时目录并设置权限
RUN mkdir -p /app/logs /app/pids /app/data \
    /app/libs/database/services/telegram-service \
    /app/services/data-service/logs \
    /app/services/trading-service/logs \
    /app/services/telegram-service/logs \
    /app/services/telegram-service/data/cache && \
    chown -R tradecat:tradecat /app

# 设置脚本权限
RUN chmod +x /app/scripts/*.sh 2>/dev/null || true && \
    chmod +x /app/docker/entrypoint.sh 2>/dev/null || true

# 设置环境变量
ENV PYTHONPATH="/app:/app/libs"
ENV PATH="/usr/local/bin:/usr/bin:/bin"

# 切换到非 root 用户
USER tradecat

# 健康检查：验证服务进程存活
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD pgrep -f 'python.*src' > /dev/null || exit 1

# 入口点
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["all"]
