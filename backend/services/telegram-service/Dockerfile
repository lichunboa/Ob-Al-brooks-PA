FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY services/telegram-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install additional dependencies that might be needed
RUN pip install --no-cache-dir \
    psycopg2-binary \
    python-dotenv \
    sqlalchemy

# Copy libs (shared modules)
COPY libs /app/libs

# Copy ai-service (as submodule for telegram-service)
COPY services/ai-service/src /app/ai-service/src
COPY services/ai-service/requirements.txt /app/ai-service/requirements.txt

# Install ai-service dependencies (including google-generativeai)
RUN pip install --no-cache-dir -r /app/ai-service/requirements.txt

# Copy telegram-service source code
COPY services/telegram-service/src /app/src
COPY services/telegram-service/locales /app/locales
COPY services/telegram-service/messages.mo /app/messages.mo

# Create config directory for .env mounting
RUN mkdir -p /app/config

# Set Python path to include all necessary modules
ENV PYTHONPATH=/app:/app/src:/app/libs

# Run the bot
CMD ["python", "-m", "src"]
