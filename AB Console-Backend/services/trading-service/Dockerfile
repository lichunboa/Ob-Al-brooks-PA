FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖（TA-Lib 需要 C 编译环境）
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    wget \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 安装 TA-Lib C 库
RUN wget -q http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz \
    && tar -xzf ta-lib-0.4.0-src.tar.gz \
    && cd ta-lib/ \
    && ./configure --prefix=/usr \
    && make \
    && make install \
    && cd .. \
    && rm -rf ta-lib ta-lib-0.4.0-src.tar.gz

# 复制依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY src/ ./src/

# 创建数据目录
RUN mkdir -p /app/data /app/logs

# 环境变量
ENV PYTHONPATH=/app/src:/app/libs
ENV PYTHONUNBUFFERED=1

# 数据卷
VOLUME ["/app/data", "/app/logs"]

# 默认启动命令 - 一次性计算模式（Docker 中建议配合 restart 策略循环运行）
CMD ["python3", "-m", "src", "--once"]
