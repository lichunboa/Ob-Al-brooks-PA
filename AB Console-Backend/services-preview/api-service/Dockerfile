# API Service Dockerfile
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装依赖
COPY services-preview/api-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制 libs 目录（共享库）
COPY libs/ /app/libs/

# 复制 data-service 的 src 目录（共享 adapters）
COPY services/data-service/src/ /app/data_service_src/

# 复制源代码
COPY services-preview/api-service/src/ /app/src/

# 设置 PYTHONPATH
ENV PYTHONPATH=/app/src:/app/libs:/app/data_service_src

# 暴露端口
EXPOSE 8088

# 启动命令
CMD ["python", "-m", "src"]
