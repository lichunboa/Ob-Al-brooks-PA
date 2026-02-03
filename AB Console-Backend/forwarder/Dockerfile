FROM python:3.11-alpine
WORKDIR /app
# 安装必要依赖
RUN pip install --no-cache-dir requests psycopg-binary psycopg-pool aiohttp
COPY forwarder.py .
CMD ["python", "forwarder.py"]
